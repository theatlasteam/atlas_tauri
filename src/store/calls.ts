// WebRTC call manager. Signaling rides the app WebSocket (see server
// ws/calls.rs); media is peer-to-peer DTLS-SRTP, optionally relayed by TURN.
//
// Resilience model for flaky networks:
//  * WS blip mid-call: media keeps flowing P2P; on socket reconnect we send
//    call_resume so the server re-binds signaling instead of ending the call.
//  * ICE "disconnected": usually transient (radio handoff) — show
//    "reconnecting", wait for auto-recovery.
//  * ICE "failed": the ORIGINAL CALLER performs an ICE restart (new offer via
//    the same call_id; the server relays it as renegotiation). Only one side
//    restarting avoids offer glare entirely.
//  * Ring timeout, busy, offline are surfaced as transient end states.

import { createRoot } from "solid-js";
import { createStore } from "solid-js/store";
import { api } from "../data/api";
import { onResync, onServerEvent, wsSend } from "../data/socket";
import type { UserDto } from "../data/generated";

export type CallStatus = "ringing" | "connecting" | "active" | "reconnecting" | "ended";
export type CallMedia = "audio" | "video";

export interface CallPeer {
  id: string;
  name: string;
  avatarColor: string;
  avatarInitial: string;
  hasAvatar?: boolean;
}

interface CallUiState {
  callId: string | null;
  peer: CallPeer | null;
  media: CallMedia;
  direction: "in" | "out";
  status: CallStatus;
  /** Reason shown on the transient "ended" screen. */
  endReason: string | null;
  startedAt: number | null;
  muted: boolean;
  cameraOff: boolean;
  hasRemoteStream: boolean;
}

const idle: CallUiState = {
  callId: null,
  peer: null,
  media: "audio",
  direction: "out",
  status: "ended",
  endReason: null,
  startedAt: null,
  muted: false,
  cameraOff: false,
  hasRemoteStream: false,
};

function createCallsStore() {
  const [state, setState] = createStore<CallUiState>({ ...idle, callId: null });

  let pc: RTCPeerConnection | null = null;
  let localStream: MediaStream | null = null;
  let remoteStream: MediaStream | null = null;
  /** Incoming offer waiting for the user to accept. */
  let pendingOffer: { callId: string; sdp: string; media: CallMedia; from: UserDto } | null = null;
  /** ICE candidates that arrived before the remote description was set. */
  let queuedCandidates: RTCIceCandidateInit[] = [];
  let endTimer: ReturnType<typeof setTimeout> | null = null;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;

  // Media elements bind to these via callbacks the UI registers.
  let onStreams: ((local: MediaStream | null, remote: MediaStream | null) => void) | null = null;
  const bindStreams = (cb: typeof onStreams) => {
    onStreams = cb;
    cb?.(localStream, remoteStream);
  };

  const active = () => state.callId !== null && state.status !== "ended";

  async function getMedia(media: CallMedia): Promise<MediaStream> {
    // Permission prompts surface here on every platform (WebView2 native
    // prompt, WKWebView -> Info.plist strings, Android runtime permission).
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: media === "video" ? { facingMode: "user", width: { ideal: 1280 } } : false,
    });
  }

  async function newPeerConnection(callId: string): Promise<RTCPeerConnection> {
    const { iceServers } = await api.iceServers();
    const conn = new RTCPeerConnection({ iceServers: iceServers as RTCIceServer[] });

    conn.onicecandidate = (e) => {
      if (e.candidate) {
        wsSend({ type: "call_ice", call_id: callId, candidate: e.candidate.toJSON() as never });
      }
    };
    conn.ontrack = (e) => {
      remoteStream = e.streams[0] ?? new MediaStream([e.track]);
      setState("hasRemoteStream", true);
      onStreams?.(localStream, remoteStream);
    };
    conn.onconnectionstatechange = () => {
      if (!pc || pc !== conn) return;
      switch (conn.connectionState) {
        case "connected":
          if (restartTimer) {
            clearTimeout(restartTimer);
            restartTimer = null;
          }
          setState({ status: "active", startedAt: state.startedAt ?? Date.now() });
          break;
        case "disconnected":
          setState("status", "reconnecting");
          scheduleIceRestart(callId, 4000);
          break;
        case "failed":
          setState("status", "reconnecting");
          scheduleIceRestart(callId, 0);
          break;
      }
    };
    return conn;
  }

  /** Only the original caller restarts ICE (see module docs). */
  function scheduleIceRestart(callId: string, delayMs: number) {
    if (state.direction !== "out" || restartTimer) return;
    restartTimer = setTimeout(async () => {
      restartTimer = null;
      if (!pc || state.callId !== callId || state.status === "ended") return;
      if (pc.connectionState === "connected") return;
      try {
        const offer = await pc.createOffer({ iceRestart: true });
        await pc.setLocalDescription(offer);
        wsSend({
          type: "call_offer",
          call_id: callId,
          to_user_id: state.peer!.id,
          sdp: offer.sdp!,
          media: state.media,
        });
        // If it still isn't up in 10s, try again (server relays each restart).
        scheduleIceRestart(callId, 10_000);
      } catch (e) {
        console.warn("[atlas] ICE restart failed:", e);
      }
    }, delayMs);
  }

  function cleanup(endReason: string | null) {
    if (endTimer) clearTimeout(endTimer);
    if (restartTimer) clearTimeout(restartTimer);
    restartTimer = null;
    pc?.close();
    pc = null;
    localStream?.getTracks().forEach((t) => t.stop());
    localStream = null;
    remoteStream = null;
    pendingOffer = null;
    queuedCandidates = [];
    onStreams?.(null, null);
    // Keep callId/peer/media/direction so the "call ended" flash still shows
    // who you were talking to and why — spreading the full `idle` state here
    // (which has peer: null) used to blank the whole overlay to a black
    // rectangle for the entire 2s flash, on every teardown path.
    setState({
      status: "ended",
      endReason,
      muted: false,
      cameraOff: false,
      hasRemoteStream: false,
      startedAt: null,
    });
    endTimer = setTimeout(() => {
      setState({ ...idle });
      endTimer = null;
    }, 2000);
  }

  async function applyRemoteDescription(desc: RTCSessionDescriptionInit) {
    if (!pc) return;
    await pc.setRemoteDescription(desc);
    for (const candidate of queuedCandidates) {
      await pc.addIceCandidate(candidate).catch(() => {});
    }
    queuedCandidates = [];
  }

  // ---------- public actions ----------

  const startCall = async (peer: CallPeer, media: CallMedia) => {
    if (active()) return;
    const callId = crypto.randomUUID();
    setState({
      callId,
      peer,
      media,
      direction: "out",
      status: "connecting",
      endReason: null,
      startedAt: null,
      muted: false,
      cameraOff: false,
      hasRemoteStream: false,
    });
    try {
      localStream = await getMedia(media);
    } catch {
      cleanup("mic_denied");
      return;
    }
    try {
      pc = await newPeerConnection(callId);
      localStream.getTracks().forEach((t) => pc!.addTrack(t, localStream!));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      setState("status", "ringing");
      wsSend({ type: "call_offer", call_id: callId, to_user_id: peer.id, sdp: offer.sdp!, media });
      onStreams?.(localStream, null);
    } catch (e) {
      console.warn("[atlas] call setup failed:", e);
      cleanup("setup_failed");
    }
  };

  const accept = async () => {
    const offer = pendingOffer;
    if (!offer) return;
    pendingOffer = null;
    setState("status", "connecting");
    try {
      localStream = await getMedia(offer.media);
    } catch {
      wsSend({ type: "call_end", call_id: offer.callId, reason: "mic_denied" });
      cleanup("mic_denied");
      return;
    }
    try {
      pc = await newPeerConnection(offer.callId);
      localStream.getTracks().forEach((t) => pc!.addTrack(t, localStream!));
      await applyRemoteDescription({ type: "offer", sdp: offer.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      wsSend({ type: "call_answer", call_id: offer.callId, sdp: answer.sdp! });
      setState({ status: "active", startedAt: Date.now() });
      onStreams?.(localStream, remoteStream);
    } catch (e) {
      console.warn("[atlas] answer failed:", e);
      wsSend({ type: "call_end", call_id: offer.callId, reason: "setup_failed" });
      cleanup("setup_failed");
    }
  };

  const decline = () => {
    if (pendingOffer) {
      wsSend({ type: "call_end", call_id: pendingOffer.callId, reason: "declined" });
    }
    cleanup("declined_local");
  };

  const hangUp = () => {
    if (state.callId) {
      wsSend({ type: "call_end", call_id: state.callId, reason: "hangup" });
    }
    cleanup("hangup_local");
  };

  const toggleMute = () => {
    const next = !state.muted;
    localStream?.getAudioTracks().forEach((t) => (t.enabled = !next));
    setState("muted", next);
  };

  const toggleCamera = () => {
    const next = !state.cameraOff;
    localStream?.getVideoTracks().forEach((t) => (t.enabled = !next));
    setState("cameraOff", next);
  };

  /** Audio output devices, when the platform lets us pick (desktop Chromium). */
  const outputDevices = async (): Promise<MediaDeviceInfo[]> => {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "audiooutput");
  };

  // ---------- server events ----------

  onServerEvent((event) => {
    switch (event.type) {
      case "call_offer": {
        // Renegotiation (ICE restart) for the call we're already in.
        if (active() && event.call_id === state.callId && pc) {
          void (async () => {
            try {
              await applyRemoteDescription({ type: "offer", sdp: event.sdp });
              const answer = await pc!.createAnswer();
              await pc!.setLocalDescription(answer);
              wsSend({ type: "call_answer", call_id: event.call_id, sdp: answer.sdp! });
            } catch (e) {
              console.warn("[atlas] renegotiation failed:", e);
            }
          })();
          return;
        }
        // Busy: one call at a time client-side; the server also guards this.
        if (active() || pendingOffer) {
          wsSend({ type: "call_end", call_id: event.call_id, reason: "busy" });
          return;
        }
        pendingOffer = {
          callId: event.call_id,
          sdp: event.sdp,
          media: event.media === "video" ? "video" : "audio",
          from: event.from,
        };
        setState({
          callId: event.call_id,
          peer: {
            id: event.from.id,
            name: event.from.name,
            avatarColor: event.from.avatarColor,
            avatarInitial: event.from.avatarInitial,
            hasAvatar: event.from.hasAvatar,
          },
          media: event.media === "video" ? "video" : "audio",
          direction: "in",
          status: "ringing",
          endReason: null,
          startedAt: null,
          muted: false,
          cameraOff: false,
          hasRemoteStream: false,
        });
        break;
      }
      case "call_answer": {
        if (event.call_id !== state.callId || !pc) return;
        void applyRemoteDescription({ type: "answer", sdp: event.sdp }).then(() => {
          if (state.status !== "active") {
            setState({ status: "active", startedAt: state.startedAt ?? Date.now() });
          }
        });
        break;
      }
      case "call_ice": {
        if (event.call_id !== state.callId) return;
        const candidate = event.candidate as RTCIceCandidateInit;
        if (pc?.remoteDescription) {
          void pc.addIceCandidate(candidate).catch(() => {});
        } else {
          queuedCandidates.push(candidate);
        }
        break;
      }
      case "call_end": {
        if (event.call_id !== state.callId) return;
        cleanup(event.reason);
        break;
      }
      case "call_unavailable": {
        if (event.call_id !== state.callId) return;
        cleanup(event.reason);
        break;
      }
    }
  });

  // After a socket reconnect, re-bind an in-flight call to the new connection.
  onResync(() => {
    if (state.callId && (state.status === "active" || state.status === "reconnecting")) {
      wsSend({ type: "call_resume", call_id: state.callId });
    }
  });

  const durationSecs = () => (state.startedAt ? Math.floor((Date.now() - state.startedAt) / 1000) : 0);

  return {
    state,
    active,
    startCall,
    accept,
    decline,
    hangUp,
    toggleMute,
    toggleCamera,
    outputDevices,
    bindStreams,
    durationSecs,
  };
}

export const calls = createRoot(createCallsStore);
