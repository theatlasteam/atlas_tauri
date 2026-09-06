/* tslint:disable */
/* eslint-disable */

export function e2ee2_bundle(): string;

export function e2ee2_decrypt(peer: string, body: string): string;

export function e2ee2_encrypt(peer: string, plaintext: string): string;

export function e2ee2_fingerprint(bundle_json: string): string;

export function e2ee2_has_session(peer: string): boolean;

export function e2ee2_new_prekeys(count: number): string;

export function e2ee2_start_session(peer: string, bundle_json: string, one_time_prekey?: string | null): void;

export function e2ee_fingerprint(public_key: string): string;

export function e2ee_open(peer_public_key: string, body: string): string;

export function e2ee_public_key(): string;

export function e2ee_seal(peer_public_key: string, plaintext: string): string;

export function start(): void;

export function store_dump(): string;

export function store_hydrate(json: string): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly e2ee2_bundle: () => [number, number, number, number];
    readonly e2ee2_decrypt: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly e2ee2_encrypt: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly e2ee2_fingerprint: (a: number, b: number) => [number, number, number, number];
    readonly e2ee2_has_session: (a: number, b: number) => [number, number, number];
    readonly e2ee2_new_prekeys: (a: number) => [number, number, number, number];
    readonly e2ee2_start_session: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly e2ee_fingerprint: (a: number, b: number) => [number, number, number, number];
    readonly e2ee_open: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly e2ee_public_key: () => [number, number, number, number];
    readonly e2ee_seal: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly store_dump: () => [number, number];
    readonly store_hydrate: (a: number, b: number) => void;
    readonly start: () => void;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
