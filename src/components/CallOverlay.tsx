import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { calls } from "../store/calls";
import Avatar from "./Avatar";
import {
  MicIcon,
  MicSlashIcon,
  PhoneIcon,
  PhoneSlashIcon,
  SpeakerIcon,
  VideoIcon,
  VideoSlashIcon,
} from "../icons";
import { Menu, MenuItem } from "../ui/Menu";
import { t, type TranslationKey } from "../lib/i18n";

function formatTimer(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const END_REASON_KEYS: Record<string, TranslationKey> = {
  timeout: "callOverlay.reasonTimeout",
  busy: "callOverlay.reasonBusy",
  offline: "callOverlay.reasonOffline",
  not_allowed: "callOverlay.reasonNotAllowed",
  declined: "callOverlay.reasonDeclined",
  declined_local: "callOverlay.reasonDeclined",
  hangup: "callOverlay.reasonHangup",
  hangup_local: "callOverlay.reasonHangup",
  peer_disconnected: "callOverlay.reasonPeerDisconnected",
  answered_elsewhere: "callOverlay.reasonAnsweredElsewhere",
  mic_denied: "callOverlay.reasonMicDenied",
  setup_failed: "callOverlay.reasonSetupFailed",
  canceled: "callOverlay.reasonCanceled",
};

/**
 * Full-screen overlay covering ringing (in/out), the in-call surface (audio
 * avatar view or remote video with local picture-in-picture), and a transient
 * end-state flash. Mounted once in Shell so it survives route changes.
 */
export default function CallOverlay() {
  const state = calls.state;
  const [timer, setTimer] = createSignal(0);
  const [speakerOpen, setSpeakerOpen] = createSignal(false);
  const [outputs, setOutputs] = createSignal<MediaDeviceInfo[]>([]);
  let speakerBtn: HTMLButtonElement | undefined;
  let remoteVideo: HTMLVideoElement | undefined;
  let localVideo: HTMLVideoElement | undefined;
  let remoteAudio: HTMLAudioElement | undefined;

  const visible = () => state.callId !== null;
  const inCall = () => state.status === "active" || state.status === "reconnecting";

  // Tick the call timer.
  createEffect(() => {
    if (!inCall()) return;
    const interval = setInterval(() => setTimer(calls.durationSecs()), 500);
    onCleanup(() => clearInterval(interval));
  });

  // Bind media streams to the elements whenever they exist.
  createEffect(() => {
    if (!visible()) return;
    calls.bindStreams((local, remote) => {
      if (localVideo && localVideo.srcObject !== local) localVideo.srcObject = local;
      if (remoteVideo && remoteVideo.srcObject !== remote) remoteVideo.srcObject = remote;
      if (remoteAudio && remoteAudio.srcObject !== remote) remoteAudio.srcObject = remote;
    });
    onCleanup(() => calls.bindStreams(null));
  });

  const openSpeakerMenu = async () => {
    const devices = await calls.outputDevices();
    setOutputs(devices);
    if (devices.length > 0) setSpeakerOpen(true);
  };

  const setOutput = async (deviceId: string) => {
    setSpeakerOpen(false);
    const el = remoteAudio ?? remoteVideo;
    // setSinkId: desktop Chromium/WebView2 only; hidden elsewhere.
    await (el as any)?.setSinkId?.(deviceId).catch(() => {});
  };

  const controlBtn =
    "flex h-14 w-14 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur active:scale-95";

  return (
    <Portal>
      <Show when={visible()}>
        <div class="fixed inset-0 z-[70] flex flex-col bg-[#14120f] text-white">
          {/* Remote video fills the surface on video calls */}
          <Show when={state.media === "video"}>
            <video
              ref={remoteVideo}
              autoplay
              playsinline
              class="absolute inset-0 h-full w-full object-cover"
              classList={{ "opacity-0": !state.hasRemoteStream || !inCall() }}
            />
            <video
              ref={localVideo}
              autoplay
              playsinline
              muted
              class="absolute right-4 top-[max(var(--safe-top),1rem)] z-10 w-28 rounded-2xl border border-white/20 shadow-floating"
              classList={{ "opacity-0": state.cameraOff }}
            />
          </Show>
          <Show when={state.media === "audio"}>
            <audio ref={remoteAudio} autoplay />
          </Show>

          {/* Center identity block (hidden behind full-bleed video once live) */}
          <div
            class="relative z-10 flex flex-1 flex-col items-center justify-center gap-4 px-6"
            classList={{ "opacity-0": state.media === "video" && state.hasRemoteStream && inCall() }}
          >
            <Show when={state.peer}>
              {(peer) => (
                <>
                  <Avatar
                    color={peer().avatarColor}
                    initial={peer().avatarInitial}
                    size={96}
                    userId={peer().id}
                    hasPhoto={peer().hasAvatar}
                  />
                  <div class="text-center">
                    <h2 class="text-2xl font-bold">{peer().name}</h2>
                    <p class="mt-1 text-sm text-white/70">
                      {state.status === "ringing" && state.direction === "out" && t("callOverlay.ringing")}
                      {state.status === "ringing" && state.direction === "in" &&
                        (state.media === "video" ? t("callOverlay.incomingVideoCall") : t("callOverlay.incomingCall"))}
                      {state.status === "connecting" && t("callOverlay.connecting")}
                      {state.status === "active" && formatTimer(timer())}
                      {state.status === "reconnecting" && t("callOverlay.reconnecting")}
                      {state.status === "ended" &&
                        t(END_REASON_KEYS[state.endReason ?? ""] ?? "callOverlay.reasonHangup")}
                    </p>
                  </div>
                </>
              )}
            </Show>
          </div>

          {/* In-call floating timer for video calls */}
          <Show when={state.media === "video" && state.hasRemoteStream && inCall()}>
            <div class="absolute left-1/2 top-[max(var(--safe-top),1rem)] z-10 -translate-x-1/2 rounded-pill bg-black/40 px-3 py-1 text-sm backdrop-blur">
              {state.status === "reconnecting" ? t("callOverlay.reconnecting") : formatTimer(timer())}
            </div>
          </Show>

          {/* Controls */}
          <div class="relative z-10 flex items-center justify-center gap-4 pb-[max(var(--safe-bottom),2rem)] pt-4">
            <Show
              when={state.status === "ringing" && state.direction === "in"}
              fallback={
                <Show when={state.status !== "ended"}>
                  <button type="button" onClick={calls.toggleMute} class={controlBtn} aria-label={t("callOverlay.toggleMicAria")}>
                    <Show when={state.muted} fallback={<MicIcon size={22} />}>
                      <MicSlashIcon size={22} />
                    </Show>
                  </button>
                  <Show when={state.media === "video"}>
                    <button type="button" onClick={calls.toggleCamera} class={controlBtn} aria-label={t("callOverlay.toggleCameraAria")}>
                      <Show when={state.cameraOff} fallback={<VideoIcon size={22} />}>
                        <VideoSlashIcon size={22} />
                      </Show>
                    </button>
                  </Show>
                  <button
                    ref={speakerBtn}
                    type="button"
                    onClick={openSpeakerMenu}
                    class={controlBtn}
                    aria-label={t("callOverlay.audioOutputAria")}
                  >
                    <SpeakerIcon size={22} />
                  </button>
                  <button
                    type="button"
                    onClick={calls.hangUp}
                    class="flex h-16 w-16 items-center justify-center rounded-full bg-danger text-white active:scale-95"
                    aria-label={t("callOverlay.endCallAria")}
                  >
                    <PhoneSlashIcon size={26} />
                  </button>
                </Show>
              }
            >
              <button
                type="button"
                onClick={calls.decline}
                class="flex h-16 w-16 items-center justify-center rounded-full bg-danger text-white active:scale-95"
                aria-label={t("callOverlay.declineAria")}
              >
                <PhoneSlashIcon size={26} />
              </button>
              <button
                type="button"
                onClick={calls.accept}
                class="flex h-16 w-16 items-center justify-center rounded-full bg-[#2f8f6e] text-white active:scale-95"
                aria-label={t("callOverlay.acceptAria")}
              >
                <PhoneIcon size={26} />
              </button>
            </Show>
          </div>

          <Menu open={speakerOpen()} onOpenChange={setSpeakerOpen} anchorRef={() => speakerBtn} placement="top-start">
            {outputs().map((device) => (
              <MenuItem onSelect={() => setOutput(device.deviceId)}>
                {device.label || t("callOverlay.audioOutputFallback")}
              </MenuItem>
            ))}
          </Menu>
        </div>
      </Show>
    </Portal>
  );
}
