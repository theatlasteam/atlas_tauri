// Browser port of src-tauri/src/e2ee2.rs (scheme "dr-v1") plus the v1
// fingerprint helper. Keys live in IndexedDB via web-secrets; AES-GCM uses
// Web Crypto, X25519/Ed25519/HKDF/HMAC use @noble so this matches the Rust
// desktop client byte-for-byte on the wire.

import { ed25519, x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { webSecretDelete, webSecretGet, webSecretSet } from "./web-secrets";
import type { PrekeyBundle } from "./tauri";

const INFO_SETUP = new TextEncoder().encode("atlas-dr-v1-setup");
const INFO_ROOT = new TextEncoder().encode("atlas-dr-v1-root");
const INFO_CHAIN = new TextEncoder().encode("atlas-dr-v1-chain");
const INFO_V1 = new TextEncoder().encode("atlas-e2ee-v1");
const MAX_SKIPPED = 200;
const IDENTITY_SECRET_KEY = "e2ee2_identity_key";
const SIGNING_SECRET_KEY = "e2ee2_signing_key";
const SPK_SECRET_KEY = "e2ee2_spk_secret";
const SPK_ID_KEY = "e2ee2_spk_id";
const HKDF_SALT = new Uint8Array(32); // Rust Hkdf::new(None, …) → HashLen zeros

function b64encode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function random32(): Uint8Array {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return b;
}

function hkdf32(ikm: Uint8Array, info: Uint8Array, len: number): Uint8Array {
  return hkdf(sha256, ikm, HKDF_SALT, info, len);
}

function hmacSha(key: Uint8Array, msg: Uint8Array): Uint8Array {
  return hmac(sha256, key, msg);
}

function x25519Pub(secret: Uint8Array): Uint8Array {
  return x25519.getPublicKey(secret);
}

function dh(secret: Uint8Array, peer: Uint8Array): Uint8Array {
  return x25519.getSharedSecret(secret, peer);
}

async function loadOrMakeX25519(key: string): Promise<Uint8Array> {
  const existing = await webSecretGet(key);
  if (existing) {
    const bytes = b64decode(existing);
    if (bytes.length !== 32) throw new Error("key corrupt");
    return bytes;
  }
  const secret = random32();
  await webSecretSet(key, b64encode(secret));
  return secret;
}

async function loadOrMakeSigning(): Promise<Uint8Array> {
  const existing = await webSecretGet(SIGNING_SECRET_KEY);
  if (existing) {
    const bytes = b64decode(existing);
    if (bytes.length !== 32) throw new Error("signing key corrupt");
    return bytes;
  }
  const seed = random32();
  await webSecretSet(SIGNING_SECRET_KEY, b64encode(seed));
  return seed;
}

function parsePub(b64: string): Uint8Array {
  const bytes = b64decode(b64);
  if (bytes.length !== 32) throw new Error("public key must be 32 bytes");
  return bytes;
}

function x3dhSecret(dh1: Uint8Array, dh2: Uint8Array, dh3: Uint8Array, dh4?: Uint8Array): Uint8Array {
  const ikm = dh4 ? concat(dh1, dh2, dh3, dh4) : concat(dh1, dh2, dh3);
  return hkdf32(ikm, INFO_SETUP, 32);
}

function dhRatchet(root: Uint8Array, dhOut: Uint8Array): [Uint8Array, Uint8Array] {
  const out = hkdf32(concat(root, dhOut), INFO_ROOT, 64);
  return [out.slice(0, 32), out.slice(32, 64)];
}

function chainStep(chain: Uint8Array): [Uint8Array, Uint8Array] {
  const next = hmacSha(chain, new Uint8Array([0x01]));
  const mk = hkdf32(concat(next, INFO_CHAIN), INFO_CHAIN, 32);
  return [next, mk];
}

interface RatchetSession {
  root_key: number[];
  send_ratchet_secret: number[] | null;
  send_ratchet_pub: number[] | null;
  recv_ratchet_pub: number[] | null;
  send_chain: number[] | null;
  recv_chain: number[] | null;
  send_n: number;
  recv_n: number;
  prev_chain_len: number;
  skipped: Array<[string, number, number[]]>;
  peer_identity: number[];
}

interface MsgHeader {
  rk: string;
  n: number;
  pn: number;
  ik?: string | null;
  sk?: string | null;
  ek?: string | null;
  spkId?: number | null;
  opk?: string | null;
}

const sessionCache = new Map<string, RatchetSession>();
const locks = new Map<string, Promise<void>>();

async function withPeerLock<T>(peer: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(peer) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const next = prev.then(() => gate);
  locks.set(peer, next);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(peer) === next) locks.delete(peer);
  }
}

function sessionsKey(peer: string): string {
  return `e2ee2_session_${peer}`;
}

async function loadSession(peer: string): Promise<RatchetSession | null> {
  const cached = sessionCache.get(peer);
  if (cached) return cached;
  const b64 = await webSecretGet(sessionsKey(peer));
  if (!b64) return null;
  const s = JSON.parse(new TextDecoder().decode(b64decode(b64))) as RatchetSession;
  sessionCache.set(peer, s);
  return s;
}

async function storeSession(peer: string, s: RatchetSession): Promise<void> {
  sessionCache.set(peer, s);
  const bytes = new TextEncoder().encode(JSON.stringify(s));
  await webSecretSet(sessionsKey(peer), b64encode(bytes));
}

async function aesGcmEncrypt(mk: Uint8Array, aad: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", mk, "AES-GCM", false, ["encrypt"]);
  const nonce = new Uint8Array(12);
  crypto.getRandomValues(nonce);
  const params: AesGcmParams = { name: "AES-GCM", iv: nonce };
  if (aad.length) params.additionalData = aad;
  const ct = new Uint8Array(await crypto.subtle.encrypt(params, key, plaintext));
  return concat(nonce, ct);
}

async function aesGcmDecrypt(mk: Uint8Array, aad: Uint8Array, body: Uint8Array): Promise<Uint8Array> {
  if (body.length < 12 + 16) throw new Error("body too short");
  const nonce = body.slice(0, 12);
  const ct = body.slice(12);
  const key = await crypto.subtle.importKey("raw", mk, "AES-GCM", false, ["decrypt"]);
  const params: AesGcmParams = { name: "AES-GCM", iv: nonce };
  if (aad.length) params.additionalData = aad;
  return new Uint8Array(await crypto.subtle.decrypt(params, key, ct));
}

function toArr(u: Uint8Array): number[] {
  return Array.from(u);
}
function fromArr(a: number[] | null | undefined): Uint8Array | null {
  return a ? new Uint8Array(a) : null;
}

export async function webE2ee2Bundle(): Promise<PrekeyBundle> {
  const identity = await loadOrMakeX25519(IDENTITY_SECRET_KEY);
  const signing = await loadOrMakeSigning();
  const spk = await loadOrMakeX25519(SPK_SECRET_KEY);
  const spkPub = x25519Pub(spk);
  const sig = ed25519.sign(spkPub, signing);
  const spkIdRaw = await webSecretGet(SPK_ID_KEY);
  const signedPrekeyId = spkIdRaw ? Number.parseInt(spkIdRaw, 10) || 1 : 1;
  return {
    identityKey: b64encode(x25519Pub(identity)),
    signingKey: b64encode(ed25519.getPublicKey(signing)),
    signedPrekey: b64encode(spkPub),
    signedPrekeyId,
    signedPrekeySig: b64encode(sig),
  };
}

export async function webE2ee2NewPrekeys(count: number): Promise<string[]> {
  const n = Math.min(count, 100);
  const pubs: string[] = [];
  for (let i = 0; i < n; i++) {
    const secret = random32();
    const pubB64 = b64encode(x25519Pub(secret));
    await webSecretSet(`e2ee2_opk_${pubB64}`, b64encode(secret));
    pubs.push(pubB64);
  }
  return pubs;
}

export async function webE2ee2StartSession(
  peer: string,
  bundle: PrekeyBundle,
  oneTimePrekey: string | null,
): Promise<void> {
  await withPeerLock(peer, async () => {
    const myIk = await loadOrMakeX25519(IDENTITY_SECRET_KEY);
    const mySk = await loadOrMakeSigning();
    const peerIk = parsePub(bundle.identityKey);
    const peerSpk = parsePub(bundle.signedPrekey);
    const vk = parsePub(bundle.signingKey);
    const sig = b64decode(bundle.signedPrekeySig);
    if (!ed25519.verify(sig, peerSpk, vk)) {
      throw new Error("signed prekey signature invalid");
    }
    const ek = random32();
    const ekPub = x25519Pub(ek);
    const dh1 = dh(myIk, peerSpk);
    const dh2 = dh(ek, peerIk);
    const dh3 = dh(ek, peerSpk);
    const dh4 = oneTimePrekey ? dh(ek, parsePub(oneTimePrekey)) : undefined;
    const sk = x3dhSecret(dh1, dh2, dh3, dh4);
    const ratchet = random32();
    const ratchetPub = x25519Pub(ratchet);
    const [root, sendChain] = dhRatchet(sk, dh(ratchet, peerSpk));
    const session: RatchetSession = {
      root_key: toArr(root),
      send_ratchet_secret: toArr(ratchet),
      send_ratchet_pub: toArr(ratchetPub),
      recv_ratchet_pub: toArr(peerSpk),
      send_chain: toArr(sendChain),
      recv_chain: null,
      send_n: 0,
      recv_n: 0,
      prev_chain_len: 0,
      skipped: [],
      peer_identity: toArr(peerIk),
    };
    await storeSession(peer, session);
    await webSecretSet(
      `e2ee2_x3dh_${peer}`,
      JSON.stringify({
        ik: b64encode(x25519Pub(myIk)),
        sk: b64encode(ed25519.getPublicKey(mySk)),
        ek: b64encode(ekPub),
        spkId: bundle.signedPrekeyId,
        opk: oneTimePrekey,
      }),
    );
  });
}

async function acceptSession(header: MsgHeader): Promise<RatchetSession> {
  if (!header.ik || !header.ek) throw new Error("missing ik/ek");
  const peerIk = parsePub(header.ik);
  const peerEk = parsePub(header.ek);
  const myIk = await loadOrMakeX25519(IDENTITY_SECRET_KEY);
  const mySpk = await loadOrMakeX25519(SPK_SECRET_KEY);
  const dh1 = dh(mySpk, peerIk);
  const dh2 = dh(myIk, peerEk);
  const dh3 = dh(mySpk, peerEk);
  let dh4: Uint8Array | undefined;
  if (header.opk) {
    const raw = await webSecretGet(`e2ee2_opk_${header.opk}`);
    if (!raw) throw new Error("unknown one-time prekey");
    const opk = b64decode(raw);
    dh4 = dh(opk, peerEk);
    await webSecretDelete(`e2ee2_opk_${header.opk}`);
  }
  const sk = x3dhSecret(dh1, dh2, dh3, dh4);
  const peerRk = parsePub(header.rk);
  const [root, recvChain] = dhRatchet(sk, dh(mySpk, peerRk));
  return {
    root_key: toArr(root),
    send_ratchet_secret: null,
    send_ratchet_pub: null,
    recv_ratchet_pub: toArr(peerRk),
    send_chain: null,
    recv_chain: toArr(recvChain),
    send_n: 0,
    recv_n: 0,
    prev_chain_len: 0,
    skipped: [],
    peer_identity: toArr(peerIk),
  };
}

export async function webE2ee2Encrypt(peer: string, plaintext: string): Promise<string> {
  return withPeerLock(peer, async () => {
    const s = await loadSession(peer);
    if (!s?.send_chain || !s.send_ratchet_pub) throw new Error("no session for peer");
    const header: MsgHeader = {
      rk: b64encode(fromArr(s.send_ratchet_pub)!),
      n: s.send_n,
      pn: s.prev_chain_len,
      ik: null,
      sk: null,
      ek: null,
      spkId: null,
      opk: null,
    };
    if (!s.recv_chain) {
      const raw = await webSecretGet(`e2ee2_x3dh_${peer}`);
      if (raw) {
        try {
          const v = JSON.parse(raw) as Record<string, unknown>;
          if (typeof v.ik === "string") header.ik = v.ik;
          if (typeof v.sk === "string") header.sk = v.sk;
          if (typeof v.ek === "string") header.ek = v.ek;
          if (typeof v.spkId === "number") header.spkId = v.spkId;
          if (typeof v.opk === "string") header.opk = v.opk;
        } catch {
          /* ignore */
        }
      }
    }
    const headerBytes = new TextEncoder().encode(JSON.stringify(header));
    const [nextChain, mk] = chainStep(fromArr(s.send_chain)!);
    const ct = await aesGcmEncrypt(mk, headerBytes, new TextEncoder().encode(plaintext));
    s.send_chain = toArr(nextChain);
    s.send_n += 1;
    await storeSession(peer, s);
    return b64encode(concat(headerBytes, ct));
  });
}

export async function webE2ee2Decrypt(peer: string, body: string): Promise<string> {
  return withPeerLock(peer, async () => {
    const bytes = b64decode(body);
    const brace = bytes.indexOf(0x7d);
    if (brace < 0) throw new Error("no header");
    const headerBytes = bytes.slice(0, brace + 1);
    const ct = bytes.slice(brace + 1);
    const header = JSON.parse(new TextDecoder().decode(headerBytes)) as MsgHeader;
    let s = await loadSession(peer);
    if (!s) s = await acceptSession(header);
    const rkB64 = header.rk;
    const skipIdx = s.skipped.findIndex(([k, n]) => k === rkB64 && n === header.n);
    if (skipIdx >= 0) {
      const mk = new Uint8Array(s.skipped[skipIdx]![2]);
      s.skipped.splice(skipIdx, 1);
      await storeSession(peer, s);
      const pt = await aesGcmDecrypt(mk, headerBytes, ct);
      return new TextDecoder().decode(pt);
    }
    const recvPubB64 = s.recv_ratchet_pub ? b64encode(fromArr(s.recv_ratchet_pub)!) : null;
    if (rkB64 !== recvPubB64) {
      if (s.recv_chain && s.recv_ratchet_pub) {
        let chain = fromArr(s.recv_chain)!;
        const oldRk = rkB64;
        for (let n = s.recv_n; n < header.pn; n++) {
          const [next, mk] = chainStep(chain);
          chain = next;
          s.skipped.push([oldRk, n, toArr(mk)]);
          while (s.skipped.length > MAX_SKIPPED) s.skipped.shift();
        }
      }
      const peerRk = parsePub(rkB64);
      const myRatchet = random32();
      const myRatchetPub = x25519Pub(myRatchet);
      const mySpk = await loadOrMakeX25519(SPK_SECRET_KEY);
      const [root, recvChain] = dhRatchet(fromArr(s.root_key)!, dh(mySpk, peerRk));
      const [root2, sendChain] = dhRatchet(root, dh(myRatchet, peerRk));
      s.root_key = toArr(root2);
      s.recv_chain = toArr(recvChain);
      s.send_chain = toArr(sendChain);
      s.send_ratchet_secret = toArr(myRatchet);
      s.send_ratchet_pub = toArr(myRatchetPub);
      s.recv_ratchet_pub = toArr(peerRk);
      s.prev_chain_len = s.send_n;
      s.send_n = 0;
      s.recv_n = 0;
      await webSecretDelete(`e2ee2_x3dh_${peer}`);
    }
    let chain = fromArr(s.recv_chain);
    if (!chain) throw new Error("no receiving chain");
    if (header.n < s.recv_n) throw new Error("message too old");
    for (let n = s.recv_n; n < header.n; n++) {
      const [next, mk] = chainStep(chain);
      chain = next;
      s.skipped.push([rkB64, n, toArr(mk)]);
      while (s.skipped.length > MAX_SKIPPED) s.skipped.shift();
    }
    const [nextChain, mk] = chainStep(chain);
    s.recv_chain = toArr(nextChain);
    s.recv_n = header.n + 1;
    await storeSession(peer, s);
    const pt = await aesGcmDecrypt(mk, headerBytes, ct);
    return new TextDecoder().decode(pt);
  });
}

export async function webE2ee2HasSession(peer: string): Promise<boolean> {
  return (await loadSession(peer)) !== null;
}

export async function webE2eeFingerprint(publicKey: string): Promise<string> {
  const key = parsePub(publicKey);
  const digest = sha256(key);
  const hex = Array.from(digest.slice(0, 10))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.match(/.{1,5}/g)?.join(" ") ?? hex;
}

export async function webE2ee2Fingerprint(bundle: PrekeyBundle): Promise<string> {
  return webE2eeFingerprint(bundle.identityKey);
}

export async function webE2eePublicKey(): Promise<string> {
  const secret = await loadOrMakeX25519("e2ee_identity_key");
  return b64encode(x25519Pub(secret));
}

export async function webE2eeSeal(peerPublicKey: string, plaintext: string): Promise<string> {
  const secret = await loadOrMakeX25519("e2ee_identity_key");
  const peer = parsePub(peerPublicKey);
  const shared = dh(secret, peer);
  const myPub = x25519Pub(secret);
  const lo = compareBytes(myPub, peer) <= 0 ? myPub : peer;
  const hi = compareBytes(myPub, peer) <= 0 ? peer : myPub;
  const key = hkdf32(shared, concat(INFO_V1, lo, hi), 32);
  return b64encode(await aesGcmEncrypt(key, new Uint8Array(0), new TextEncoder().encode(plaintext)));
}

export async function webE2eeOpen(peerPublicKey: string, body: string): Promise<string> {
  const secret = await loadOrMakeX25519("e2ee_identity_key");
  const peer = parsePub(peerPublicKey);
  const shared = dh(secret, peer);
  const myPub = x25519Pub(secret);
  const lo = compareBytes(myPub, peer) <= 0 ? myPub : peer;
  const hi = compareBytes(myPub, peer) <= 0 ? peer : myPub;
  const key = hkdf32(shared, concat(INFO_V1, lo, hi), 32);
  const pt = await aesGcmDecrypt(key, new Uint8Array(0), b64decode(body));
  return new TextDecoder().decode(pt);
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i]! !== b[i]!) return a[i]! - b[i]!;
  }
  return a.length - b.length;
}
