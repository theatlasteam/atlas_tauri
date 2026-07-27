import { createSignal } from "solid-js";

export type Locale = "en" | "ru";

const STORAGE_KEY = "atlas-web-locale";

const dict = {
  en: {
    "nav.features": "Features",
    "nav.download": "Alpha test",
    "nav.source": "Source",
    "nav.github": "GitHub",
    "hero.checking": "Checking for releases…",
    "hero.unavailable": "Latest release unavailable",
    "hero.latest": "Latest release: {tag}",
    "hero.title1": "Chat that stays",
    "hero.title2": "yours.",
    "hero.lede":
      "A modern, end-to-end encrypted chat app. Direct messages, groups, voice and video calls — on Windows, Linux and Android, from one codebase.",
    "hero.loading": "Loading…",
    "hero.downloadFor": "Download for {platform}",
    "hero.seeAll": "See all downloads",
    "hero.github": "View on GitHub",
    "features.title": "What's inside",
    "features.e2ee.title": "End-to-end encrypted",
    "features.e2ee.body":
      "X25519 + HKDF-SHA256 for direct messages. Private keys are generated on device and never leave it.",
    "features.dm.title": "DMs & groups",
    "features.dm.body": "Folders, mute, typing indicators and read receipts — the things you actually use.",
    "features.calls.title": "Voice & video",
    "features.calls.body": "WebRTC calls with TURN relay support, so they connect from behind awkward networks.",
    "features.rich.title": "Rich messages",
    "features.rich.body": "Replies, reactions and attachments — images, voice notes and arbitrary files.",
    "features.theme.title": "Themeable at runtime",
    "features.theme.body": "Light/dark, accent colour, font and wallpaper all switch live. No rebuild, no restart.",
    "features.rust.title": "Tauri + Rust",
    "features.rust.body": "Solid.js front end in a Tauri v2 shell, backed by an Axum/Postgres server over WebSockets.",
    "downloads.title": "Alpha test",
    "downloads.sub": "Early builds, pulled live from the latest GitHub release. Expect rough edges.",
    "downloads.error": "Couldn't reach the GitHub API just now.",
    "downloads.browse": "Browse releases on GitHub instead →",
    "downloads.note":
      "The Android APK is debug-signed and intended for testing — Android will warn you about installing it from outside the Play Store.",
    "downloads.download": "Download",
    "waitlist.cta": "Join the waitlist",
    "waitlist.title": "Join the waitlist",
    "waitlist.body": "Get an email when new alpha builds and features ship.",
    "waitlist.placeholder": "you@example.com",
    "waitlist.join": "Join",
    "waitlist.joining": "Joining…",
    "waitlist.doneTitle": "You're on the list",
    "waitlist.doneBody": "We'll email you when there's something new to try.",
    "source.title": "Build it yourself",
    "source.needBun": "You need",
    "source.and": "and",
    "source.that": "That's it.",
    "footer.license": "Atlas — MIT licensed.",
    "footer.source": "Source on GitHub",
    "footer.built": "Built with Tauri, Solid.js and Rust.",
  },
  ru: {
    "nav.features": "Возможности",
    "nav.download": "Альфа-тест",
    "nav.source": "Исходники",
    "nav.github": "GitHub",
    "hero.checking": "Проверяем релизы…",
    "hero.unavailable": "Релиз недоступен",
    "hero.latest": "Последний релиз: {tag}",
    "hero.title1": "Переписка, которая",
    "hero.title2": "остаётся вашей.",
    "hero.lede":
      "Современный мессенджер со сквозным шифрованием. Личные сообщения, группы, голосовые и видеозвонки — на Windows, Linux и Android из одной кодовой базы.",
    "hero.loading": "Загрузка…",
    "hero.downloadFor": "Скачать для {platform}",
    "hero.seeAll": "Все версии для скачивания",
    "hero.github": "Открыть на GitHub",
    "features.title": "Что внутри",
    "features.e2ee.title": "Сквозное шифрование",
    "features.e2ee.body":
      "X25519 + HKDF-SHA256 для личных сообщений. Приватные ключи создаются на устройстве и никогда его не покидают.",
    "features.dm.title": "Личные и групповые чаты",
    "features.dm.body": "Папки, отключение звука, индикатор набора и статусы прочтения — всё, чем вы реально пользуетесь.",
    "features.calls.title": "Голос и видео",
    "features.calls.body": "Звонки по WebRTC с поддержкой TURN — соединяются даже за сложными сетями.",
    "features.rich.title": "Богатые сообщения",
    "features.rich.body": "Ответы, реакции и вложения — фото, голосовые и любые файлы.",
    "features.theme.title": "Тема в реальном времени",
    "features.theme.body": "Светлая/тёмная тема, акцентный цвет, шрифт и обои — переключаются на лету. Без пересборки.",
    "features.rust.title": "Tauri + Rust",
    "features.rust.body": "Solid.js на клиенте в оболочке Tauri v2, сервер на Axum/Postgres поверх WebSocket.",
    "downloads.title": "Альфа-тест",
    "downloads.sub": "Ранние сборки, данные берутся напрямую из последнего релиза на GitHub. Возможны шероховатости.",
    "downloads.error": "Не удалось связаться с GitHub API.",
    "downloads.browse": "Посмотреть релизы на GitHub →",
    "downloads.note":
      "Android APK подписан debug-ключом и предназначен для тестирования — система предупредит об установке не из Play Store.",
    "downloads.download": "Скачать",
    "waitlist.cta": "Записаться в лист ожидания",
    "waitlist.title": "Лист ожидания",
    "waitlist.body": "Мы напишем вам, когда выйдут новые сборки и функции.",
    "waitlist.placeholder": "you@example.com",
    "waitlist.join": "Записаться",
    "waitlist.joining": "Записываем…",
    "waitlist.doneTitle": "Вы в списке",
    "waitlist.doneBody": "Напишем на почту, когда появится что-то новое.",
    "source.title": "Собрать самостоятельно",
    "source.needBun": "Понадобятся",
    "source.and": "и",
    "source.that": "Это всё.",
    "footer.license": "Atlas — лицензия MIT.",
    "footer.source": "Исходный код на GitHub",
    "footer.built": "Сделано на Tauri, Solid.js и Rust.",
  },
} as const;

export type TranslationKey = keyof (typeof dict)["en"];

function detectLocale(): Locale {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "en" || stored === "ru") return stored;
  return navigator.language.toLowerCase().startsWith("ru") ? "ru" : "en";
}

const [locale, setLocaleSignal] = createSignal<Locale>(detectLocale());
if (typeof document !== "undefined") document.documentElement.lang = locale();

export function setLocale(next: Locale) {
  setLocaleSignal(next);
  localStorage.setItem(STORAGE_KEY, next);
  document.documentElement.lang = next;
}

export { locale };

export function t(key: TranslationKey, vars?: Record<string, string>): string {
  let str: string = dict[locale()][key] ?? dict.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) str = str.replace(`{${k}}`, v);
  }
  return str;
}
