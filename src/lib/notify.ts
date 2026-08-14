// Desktop/web notifications for incoming messages.
//
// The Notifications settings screen has always offered an on/off switch and a
// choice of four sounds; until now neither did anything on desktop, where no
// notification was ever raised and no sound was ever played. (Android has its
// own path: the server pushes to FCM for devices with no live socket.) This
// module is what those controls actually drive.
//
// The sounds are synthesised rather than shipped as audio files: four short
// tones are a few lines of WebAudio, and generating them keeps the bundle free
// of binary assets that have to be licensed, cached and version-controlled.

import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { preferences } from "../store/preferences";
import { isTauri, isMobilePlatform } from "./platform";

/**
 * Desktop only (Windows/Linux — macOS too, though untested here): real OS
 * notifications via the Tauri plugin (Action Center / freedesktop), not the
 * web Notification API, which WebKitGTK on Linux implements inconsistently
 * across distros. Android has its own path (server -> FCM); this plugin adds
 * nothing there and the permission model differs, so it's desktop-only.
 */
const useNativeNotifications = isTauri() && !isMobilePlatform();

/** Envelope of each built-in sound: [frequency Hz, start s, duration s]. */
const SOUND_TONES: Record<string, Array<[number, number, number]>> = {
  // Two rising notes, a fifth apart — the classic message ping.
  chime: [
    [880, 0, 0.12],
    [1318.5, 0.1, 0.18],
  ],
  // Same note twice, short and flat: noticeable without being musical.
  pulse: [
    [520, 0, 0.07],
    [520, 0.12, 0.07],
  ],
  // A single soft note.
  note: [[660, 0, 0.22]],
  // Falling octave, like something landing.
  drop: [
    [988, 0, 0.09],
    [494, 0.07, 0.16],
  ],
};

let audioContext: AudioContext | null = null;

/**
 * Play the chosen notification sound.
 *
 * Browsers refuse to start an AudioContext before a user gesture, and by the
 * time a message arrives the user has certainly clicked something, so the
 * context is created lazily on first use and reused afterwards.
 */
export function playNotificationSound(soundId: string) {
  const tones = SOUND_TONES[soundId];
  if (!tones) return; // "none", or a sound id from a newer build
  try {
    audioContext ??= new AudioContext();
    const ctx = audioContext;
    if (ctx.state === "suspended") void ctx.resume();
    for (const [frequency, offset, duration] of tones) {
      const start = ctx.currentTime + offset;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      // A bare oscillator clicks at both ends; a short ramp in and an
      // exponential tail out is what makes it read as a chime.
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
    }
  } catch {
    // No audio output, or an autoplay policy we can't satisfy. A missing
    // sound must never cost the user the notification itself.
  }
}

/** Ask for permission once, at sign-in, rather than mid-conversation. */
export function requestNotificationPermission() {
  if (useNativeNotifications) {
    void isPermissionGranted().then((granted) => {
      if (!granted) void requestPermission();
    });
    return;
  }
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "default") void Notification.requestPermission();
}

export interface IncomingNotification {
  title: string;
  body: string;
  /** Chat id — used to collapse repeat alerts from one conversation. */
  tag: string;
  onClick?: () => void;
}

/**
 * Raise a notification for a message that arrived while the app wasn't being
 * looked at.
 *
 * Deliberately silent when the document is visible: the message is already on
 * screen, and an alert for something the user is watching arrive is noise.
 */
export function notifyIncoming(notification: IncomingNotification) {
  if (!preferences.notificationsEnabled) return;
  if (typeof document !== "undefined" && document.visibilityState === "visible") return;

  playNotificationSound(preferences.notificationSound);

  if (useNativeNotifications) {
    // Fire-and-forget: clicking a native Action Center / freedesktop toast
    // already raises the app window by default OS behavior, which covers
    // the common case. It won't jump to the specific chat the way the web
    // path's onClick does — wiring that up needs the plugin's action-channel
    // API, a bigger addition than this pass; falls back to "just open the
    // app" rather than nothing.
    void isPermissionGranted().then((granted) => {
      if (!granted) return;
      sendNotification({ title: notification.title, body: notification.body });
    });
    return;
  }

  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    // No `icon`: the logo is a bundled asset whose built URL is hashed, and a
    // hardcoded path would 404 in a packaged build. The OS falls back to the
    // app icon, which is the right picture anyway.
    const shown = new Notification(notification.title, {
      body: notification.body,
      tag: notification.tag,
    });
    shown.onclick = () => {
      window.focus();
      notification.onClick?.();
      shown.close();
    };
  } catch {
    // Some webviews expose Notification but throw on construction; the sound
    // above has already done the useful part.
  }
}

/**
 * A notification raised by a plugin (ctx.notify). Unlike incoming-message
 * notifications, it shows regardless of document visibility — plugins opt in
 * explicitly, so "didn't see it because I was in another tab" is exactly the
 * case they're solving. Still respects the permission model.
 */
export function sendPluginNotification(title: string, body: string) {
  if (useNativeNotifications) {
    void isPermissionGranted().then((granted) => {
      if (!granted) return;
      sendNotification({ title, body });
    });
    return;
  }
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    const shown = new Notification(title, { body });
    shown.onclick = () => {
      window.focus();
      shown.close();
    };
  } catch {
    /* webview without working Notification — skip */
  }
}
