import { createSignal } from "solid-js";

export type Locale = "en" | "ru";

const STORAGE_KEY = "atlas-web-locale";

const dict = {
  en: {
    "nav.features": "Features",
    "nav.download": "Alpha test",
    "nav.source": "Source",
    "nav.github": "GitHub",
    "nav.plugins": "Plugins",
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
    "hero.waitlistCount": "{count} people already on the list",
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
    "waitlist.consentPrefix": "I agree to the processing of my email address as described in the",
    "waitlist.consentLink": "Privacy Policy",
    "source.title": "Build it yourself",
    "source.needBun": "You need",
    "source.and": "and",
    "source.that": "That's it.",
    "footer.license": "Atlas — MIT licensed.",
    "footer.source": "Source on GitHub",
    "footer.built": "Built with Tauri, Solid.js and Rust.",
    "footer.privacy": "Privacy Policy",

    "pluginsEditor.title": "Developer panel",
    "pluginsEditor.newTitle": "New plugin",
    "pluginsEditor.editTitle": "Edit plugin",
    "pluginsEditor.sub":
      "Publish and manage your plugins here — they're tied to your Atlas account and installed from the app.",
    "pluginsEditor.new": "New plugin",
    "pluginsEditor.back": "All plugins",
    "pluginsEditor.backHome": "Back to atlas",
    "pluginsEditor.loading": "Loading plugin…",
    "pluginsEditor.loadError": "Couldn't load this plugin.",
    "pluginsEditor.files": "Files",
    "pluginsEditor.newFile": "New file",
    "pluginsEditor.deleteFile": "Delete {name}",
    "pluginsEditor.fileExists": "{name} already exists.",
    "pluginsEditor.invalidFileName":
      "Invalid file name — use letters, digits, -, _, . and folders separated by /, with an extension like .tsx, .ts, .js or .json.",
    "pluginsEditor.lines": "lines",
    "pluginsEditor.unsaved": "Unsaved changes",
    "pluginsEditor.filesCount": "files",
    "pluginsEditor.save": "Save",
    "pluginsEditor.saving": "Saving…",
    "pluginsEditor.saved": "Saved.",
    "pluginsEditor.saveError": "Couldn't save plugin.",
    "pluginsEditor.delete": "Delete",
    "pluginsEditor.deleteConfirm": "Delete this plugin? The app will stop offering it for install.",
    "pluginsEditor.deleteError": "Couldn't delete plugin.",
    "pluginsEditor.listError": "Couldn't load plugins.",
    "pluginsEditor.emptyTitle": "No plugins yet",
    "pluginsEditor.emptySub": "Publish the first plugin with “New plugin”.",
    "pluginsEditor.downloads": "installs",
    "pluginsEditor.edit": "Edit",
    "pluginsEditor.published": "published",
    "pluginsEditor.docs": "Docs",
    "pluginsEditor.fileMenu": "File",
    "pluginsEditor.projectSettings": "Project settings",
    "pluginsEditor.settingsClose": "Close settings",
    "pluginsEditor.settingsIcon": "Plugin icon",
    "pluginsEditor.settingsUploadIcon": "Upload image",
    "pluginsEditor.settingsManifest": "Manifest",
    "pluginsEditor.settingsId": "Plugin id",
    "pluginsEditor.settingsIdHint": "Keys the install — can't change after publishing.",
    "pluginsEditor.settingsName": "Name",
    "pluginsEditor.settingsVersion": "Version",
    "pluginsEditor.settingsMain": "Entry file",
    "pluginsEditor.settingsDescription": "Description",
    "pluginsEditor.settingsIconPath": "Icon file path",
    "pluginsEditor.settingsPermissions": "Permissions",
    "pluginsEditor.settingsCancel": "Cancel",
    "pluginsEditor.settingsApply": "Apply",
    "pluginsEditor.settingsApplied": "Settings applied to the workspace.",
    "pluginsEditor.mcp": "MCP",
    "pluginsEditor.mcpTitle": "MCP — AI plugin development",
    "pluginsEditor.mcpBody": "Connect an AI assistant to this endpoint to develop plugins against your account. Read tools are public; create/update/delete need the session token below.",
    "pluginsEditor.mcpEndpoint": "Endpoint",
    "pluginsEditor.mcpToken": "Session token",
    "pluginsEditor.mcpReveal": "Show token",
    "pluginsEditor.mcpTokenWarn": "Anyone with this token can create, edit and delete your plugins. Keep it private and don't paste it into untrusted chats.",
    "pluginsEditor.mcpConnect": "Connect",
    "pluginsEditor.mcpTools": "Tools",
    "pluginsEditor.mcpCopy": "Copy",
    "pluginsEditor.tool.list": "Browse the store",
    "pluginsEditor.tool.get": "Fetch a plugin and its files",
    "pluginsEditor.tool.validate": "Validate a workspace",
    "pluginsEditor.tool.create": "Publish a new plugin",
    "pluginsEditor.tool.update": "Edit a published plugin",
    "pluginsEditor.tool.delete": "Delete a plugin",
    "pluginsEditor.tool.docs": "Read the SDK reference",
    "pluginsEditor.perm.commands": "Commands you can run",
    "pluginsEditor.perm.messages.read": "Read incoming messages",
    "pluginsEditor.perm.messages.send": "Rewrite, block, send messages",
    "pluginsEditor.perm.chats.read": "Read your chats",
    "pluginsEditor.perm.users.read": "Read your account, search users",
    "pluginsEditor.perm.navigation": "Navigate, open chats and profiles",
    "pluginsEditor.perm.notifications": "OS notifications and toasts",
    "pluginsEditor.perm.storage": "Scoped storage",
    "pluginsEditor.perm.api": "Call the Atlas API",
    "pluginsEditor.perm.events": "Subscribe to app events",
    "pluginsEditor.perm.ui": "Replace app UI (nav, dialogs)",
    "pluginsEditor.docsTitle": "Plugin API documentation",
    "pluginsEditor.docsClose": "Close documentation",
    "pluginsEditor.docsOverview": "Overview",
    "pluginsEditor.docsOverviewBody":
      "A plugin is a folder of files: a manifest.json plus JavaScript. The runtime evaluates the entry file and expects an activate(ctx) export. It may also export deactivate(ctx) to run when the plugin is disabled.",
    "pluginsEditor.docsManifest": "manifest.json",
    "pluginsEditor.docsManifestBody":
      "The manifest holds the plugin's id, name, version, description, entry point and permissions. The id keys the install and cannot change after publish. Authorship comes from your Atlas account — there's no author field.",
    "pluginsEditor.docsPermissions": "Permissions",
    "pluginsEditor.docsPermissionsBody":
      "Each capability is gated by a permission string declared in the manifest. Omitting permissions grants the legacy default (commands, messages.read, messages.send, storage, api). Denied capabilities throw at call time, so your plugin can degrade gracefully.",
    "pluginsEditor.docsApi": "Commands & the plugin API",
    "pluginsEditor.docsApiBody":
      "Everything you need arrives in activate(ctx). You can also use the top-level atlas object for one-liners without an activate export.",
    "pluginsEditor.docsHooks": "Message hooks",
    "pluginsEditor.docsHooksBody":
      "beforeSend rewrites or vetoes outgoing messages; onMessage observes incoming ones. Return a string to replace the outgoing text, or null to block the message entirely.",
    "pluginsEditor.docsSend": "Sending messages",
    "pluginsEditor.docsSendBody":
      "ctx.sendMessage goes through the app's own pipeline — beforeSend hooks run, DMs are E2EE-sealed, rows are optimistic — so plugins can't bypass encryption or hooks. ctx.onSent observes messages that actually made it out.",
    "pluginsEditor.docsData": "Data & navigation",
    "pluginsEditor.docsDataBody":
      "ctx.me, ctx.getChat, ctx.getUser and ctx.searchUsers give read-only access to live state and the server. ctx.navigate, ctx.openChat and ctx.openUser move the app around.",
    "pluginsEditor.docsNotify": "Notifications",
    "pluginsEditor.docsNotifyBody":
      "ctx.notify raises an OS notification (respecting permission) and ctx.toast shows an in-app pill.",
    "pluginsEditor.docsStorage": "Storage & API",
    "pluginsEditor.docsStorageBody":
      "ctx.storage is a key-value store scoped to your plugin that survives restarts (strings or JSON). ctx.api is an HTTP client rooted at the Atlas API with the auth token already attached.",
    "pluginsEditor.docsEvents": "Events",
    "pluginsEditor.docsEventsBody":
      "ctx.events.on subscribes to app events — appVisible, appHidden, chatOpened, chatClosed — and returns an unsubscribe function.",
    "pluginsEditor.docsUi": "UI slots",
    "pluginsEditor.docsUiBody":
      "With the ui permission you can replace app chrome with your own Solid components: ctx.ui.mount('nav.bottom', …) swaps the bottom nav bar, 'nav.side' the desktop rail. Components get { navigate, pathname }. .tsx files compile on the fly and can import solid-js and atlas/ui.",
    "pluginsEditor.docsTrust":
      "Plugins run with full access to the app they're installed in. Only install plugins you trust.",

    "pluginsAuth.title": "Sign in to the developer panel",
    "pluginsAuth.sub":
      "Your plugins are tied to your Atlas account. Sign in or create an account to write, publish and manage them.",
    "pluginsAuth.signIn": "Sign in",
    "pluginsAuth.create": "Create account",
    "pluginsAuth.handle": "Handle (login)",
    "pluginsAuth.name": "Display name",
    "pluginsAuth.password": "Password",
    "pluginsAuth.signInButton": "Sign in",
    "pluginsAuth.createButton": "Create account",
    "pluginsAuth.signingIn": "Working…",
    "pluginsAuth.noAccount": "New to Atlas? Create an account above.",
    "pluginsAuth.haveAccount": "Already have an account? Sign in.",
    "pluginsAuth.generic": "Something went wrong. Please try again.",
    "pluginsAuth.logout": "Sign out",
  },
  ru: {
    "nav.features": "Возможности",
    "nav.download": "Альфа-тест",
    "nav.source": "Исходники",
    "nav.github": "GitHub",
    "nav.plugins": "Плагины",
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
    "hero.waitlistCount": "{count} человек уже в списке ожидания",
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
    "waitlist.cta": "Записаться в список ожидания",
    "waitlist.title": "Список ожидания",
    "waitlist.body": "Мы напишем вам, когда выйдут новые сборки и функции.",
    "waitlist.placeholder": "you@example.com",
    "waitlist.join": "Записаться",
    "waitlist.joining": "Записываем…",
    "waitlist.doneTitle": "Вы в списке",
    "waitlist.doneBody": "Напишем на почту, когда появится что-то новое.",
    "waitlist.consentPrefix": "Я согласен на обработку моего адреса электронной почты в соответствии с",
    "waitlist.consentLink": "Политикой конфиденциальности",
    "source.title": "Собрать самостоятельно",
    "source.needBun": "Понадобятся",
    "source.and": "и",
    "source.that": "Это всё.",
    "footer.license": "Atlas — лицензия MIT.",
    "footer.source": "Исходный код на GitHub",
    "footer.built": "Сделано на Tauri, Solid.js и Rust.",
    "footer.privacy": "Политика конфиденциальности",

    "pluginsEditor.title": "Панель разработчика",
    "pluginsEditor.newTitle": "Новый плагин",
    "pluginsEditor.editTitle": "Редактирование плагина",
    "pluginsEditor.sub":
      "Публикуйте и управляйте своими плагинами — они привязаны к вашему аккаунту Atlas и устанавливаются из приложения.",
    "pluginsEditor.new": "Новый плагин",
    "pluginsEditor.back": "Все плагины",
    "pluginsEditor.backHome": "Назад к Atlas",
    "pluginsEditor.loading": "Загрузка плагина…",
    "pluginsEditor.loadError": "Не удалось загрузить плагин.",
    "pluginsEditor.files": "Файлы",
    "pluginsEditor.newFile": "Новый файл",
    "pluginsEditor.deleteFile": "Удалить {name}",
    "pluginsEditor.fileExists": "{name} уже существует.",
    "pluginsEditor.invalidFileName":
      "Недопустимое имя файла — используйте буквы, цифры, -, _, . и папки через /, с расширением вида .tsx, .ts, .js или .json.",
    "pluginsEditor.lines": "строк",
    "pluginsEditor.unsaved": "Есть несохранённые изменения",
    "pluginsEditor.filesCount": "файлов",
    "pluginsEditor.save": "Сохранить",
    "pluginsEditor.saving": "Сохраняем…",
    "pluginsEditor.saved": "Сохранено.",
    "pluginsEditor.saveError": "Не удалось сохранить плагин.",
    "pluginsEditor.delete": "Удалить",
    "pluginsEditor.deleteConfirm": "Удалить плагин? Приложение перестанет предлагать его к установке.",
    "pluginsEditor.deleteError": "Не удалось удалить плагин.",
    "pluginsEditor.listError": "Не удалось загрузить плагины.",
    "pluginsEditor.emptyTitle": "Плагинов пока нет",
    "pluginsEditor.emptySub": "Опубликуйте первый плагин кнопкой «Новый плагин».",
    "pluginsEditor.downloads": "установок",
    "pluginsEditor.edit": "Изменить",
    "pluginsEditor.published": "опубликовано",
    "pluginsEditor.docs": "Документация",
    "pluginsEditor.fileMenu": "Файл",
    "pluginsEditor.projectSettings": "Настройки проекта",
    "pluginsEditor.settingsClose": "Закрыть настройки",
    "pluginsEditor.settingsIcon": "Иконка плагина",
    "pluginsEditor.settingsUploadIcon": "Загрузить изображение",
    "pluginsEditor.settingsManifest": "Манифест",
    "pluginsEditor.settingsId": "ID плагина",
    "pluginsEditor.settingsIdHint": "Служит ключом установки — после публикации изменить нельзя.",
    "pluginsEditor.settingsName": "Название",
    "pluginsEditor.settingsVersion": "Версия",
    "pluginsEditor.settingsMain": "Входной файл",
    "pluginsEditor.settingsDescription": "Описание",
    "pluginsEditor.settingsIconPath": "Путь к файлу иконки",
    "pluginsEditor.settingsPermissions": "Права доступа",
    "pluginsEditor.settingsCancel": "Отмена",
    "pluginsEditor.settingsApply": "Применить",
    "pluginsEditor.settingsApplied": "Настройки применены к рабочей области.",
    "pluginsEditor.mcp": "MCP",
    "pluginsEditor.mcpTitle": "MCP — разработка плагинов ИИ",
    "pluginsEditor.mcpBody": "Подключите ИИ-ассистента к этой конечной точке, чтобы разрабатывать плагины от вашего имени. Инструменты чтения открыты; create/update/delete требуют токен сеанса ниже.",
    "pluginsEditor.mcpEndpoint": "Конечная точка",
    "pluginsEditor.mcpToken": "Токен сеанса",
    "pluginsEditor.mcpReveal": "Показать токен",
    "pluginsEditor.mcpTokenWarn": "Любой, у кого есть этот токен, может создавать, изменять и удалять ваши плагины. Не передавайте его в непроверенные чаты.",
    "pluginsEditor.mcpConnect": "Подключение",
    "pluginsEditor.mcpTools": "Инструменты",
    "pluginsEditor.mcpCopy": "Копировать",
    "pluginsEditor.tool.list": "Просмотр магазина",
    "pluginsEditor.tool.get": "Получить плагин и его файлы",
    "pluginsEditor.tool.validate": "Проверить рабочую область",
    "pluginsEditor.tool.create": "Опубликовать новый плагин",
    "pluginsEditor.tool.update": "Изменить опубликованный плагин",
    "pluginsEditor.tool.delete": "Удалить плагин",
    "pluginsEditor.tool.docs": "Прочитать справочник SDK",
    "pluginsEditor.perm.commands": "Команды, которые можно запускать",
    "pluginsEditor.perm.messages.read": "Читать входящие сообщения",
    "pluginsEditor.perm.messages.send": "Переписывать, блокировать, отправлять",
    "pluginsEditor.perm.chats.read": "Читать ваши чаты",
    "pluginsEditor.perm.users.read": "Читать аккаунт, искать пользователей",
    "pluginsEditor.perm.navigation": "Навигация, открытие чатов и профилей",
    "pluginsEditor.perm.notifications": "Системные уведомления и плашки",
    "pluginsEditor.perm.storage": "Локальное хранилище",
    "pluginsEditor.perm.api": "Вызовы API Atlas",
    "pluginsEditor.perm.events": "Подписка на события приложения",
    "pluginsEditor.perm.ui": "Замена интерфейса (навигация, диалоги)",
    "pluginsEditor.docsTitle": "Документация API плагинов",
    "pluginsEditor.docsClose": "Закрыть документацию",
    "pluginsEditor.docsOverview": "Обзор",
    "pluginsEditor.docsOverviewBody":
      "Плагин — это набор файлов: manifest.json и JavaScript-код. Среда исполнения выполняет входной файл и ожидает экспорт activate(ctx). Можно также экспортировать deactivate(ctx), который выполняется при отключении плагина.",
    "pluginsEditor.docsManifest": "manifest.json",
    "pluginsEditor.docsManifestBody":
      "Манифест хранит id, название, версию, описание, точку входа и права доступа плагина. Id служит ключом установки и не может измениться после публикации. Авторство определяется вашим аккаунтом Atlas — поля author в манифесте нет.",
    "pluginsEditor.docsPermissions": "Права доступа",
    "pluginsEditor.docsPermissionsBody":
      "Каждая возможность ограничена правом, объявленным в манифесте. Если permissions не указаны, выдаётся устаревший набор по умолчанию (commands, messages.read, messages.send, storage, api). Отсутствующее право вызывает ошибку в момент вызова, так что плагин может корректно деградировать.",
    "pluginsEditor.docsApi": "Команды и API плагина",
    "pluginsEditor.docsApiBody":
      "Всё необходимое приходит в activate(ctx). Для однострочников без экспорта activate доступен и глобальный объект atlas.",
    "pluginsEditor.docsHooks": "Хуки сообщений",
    "pluginsEditor.docsHooksBody":
      "beforeSend переписывает или блокирует исходящие сообщения; onMessage наблюдает за входящими. Верните строку, чтобы заменить текст исходящего сообщения, или null, чтобы заблокировать его.",
    "pluginsEditor.docsSend": "Отправка сообщений",
    "pluginsEditor.docsSendBody":
      "ctx.sendMessage идёт через собственный конвейер приложения — хуки beforeSend выполняются, личные сообщения зашифровываются, строки оптимистичны — так что плагин не может обойти шифрование или хуки. ctx.onSent наблюдает за реально отправленными сообщениями.",
    "pluginsEditor.docsData": "Данные и навигация",
    "pluginsEditor.docsDataBody":
      "ctx.me, ctx.getChat, ctx.getUser и ctx.searchUsers дают доступ только на чтение к живому состоянию и серверу. ctx.navigate, ctx.openChat и ctx.openUser перемещают по приложению.",
    "pluginsEditor.docsNotify": "Уведомления",
    "pluginsEditor.docsNotifyBody":
      "ctx.notify показывает системное уведомление (с учётом разрешений), а ctx.toast — всплывающую плашку в приложении.",
    "pluginsEditor.docsStorage": "Хранилище и API",
    "pluginsEditor.docsStorageBody":
      "ctx.storage — хранилище ключ-значение, привязанное к плагину и переживающее перезапуск (строки или JSON). ctx.api — HTTP-клиент на базе API Atlas с уже прикреплённым токеном авторизации.",
    "pluginsEditor.docsEvents": "События",
    "pluginsEditor.docsEventsBody":
      "ctx.events.on подписывается на события приложения — appVisible, appHidden, chatOpened, chatClosed — и возвращает функцию отписки.",
    "pluginsEditor.docsUi": "UI-слоты",
    "pluginsEditor.docsUiBody":
      "С правом ui можно заменять интерфейс приложения своими Solid-компонентами: ctx.ui.mount('nav.bottom', …) заменяет нижнюю панель навигации, 'nav.side' — боковую панель. Компоненты получают { navigate, pathname }. Файлы .tsx компилируются на лету и могут импортировать solid-js и atlas/ui.",
    "pluginsEditor.docsTrust":
      "Плагины выполняются с полным доступом к приложению, в которое установлены. Устанавливайте только те, которым доверяете.",

    "pluginsAuth.title": "Вход в панель разработчика",
    "pluginsAuth.sub":
      "Ваши плагины привязаны к аккаунту Atlas. Войдите или создайте аккаунт, чтобы писать, публиковать и управлять ими.",
    "pluginsAuth.signIn": "Войти",
    "pluginsAuth.create": "Создать аккаунт",
    "pluginsAuth.handle": "Логин (handle)",
    "pluginsAuth.name": "Имя",
    "pluginsAuth.password": "Пароль",
    "pluginsAuth.signInButton": "Войти",
    "pluginsAuth.createButton": "Создать аккаунт",
    "pluginsAuth.signingIn": "Работаем…",
    "pluginsAuth.noAccount": "Новичок в Atlas? Создайте аккаунт.",
    "pluginsAuth.haveAccount": "Уже есть аккаунт? Войдите.",
    "pluginsAuth.generic": "Что-то пошло не так. Попробуйте ещё раз.",
    "pluginsAuth.logout": "Выйти",
  },
} as const;

export type TranslationKey = keyof (typeof dict)["en"];

// The locale is primarily determined by the URL (/ru, /en) so that each
// route renders deterministically for search-engine crawlers regardless of
// any stored preference — that's the whole point of having separate routes.
// Only the bare "/" (aliased to /ru) falls back to a stored preference or
// the browser's language, since it has no locale of its own in the path.
function detectLocale(): Locale {
  if (typeof window !== "undefined") {
    const path = window.location.pathname;
    if (path === "/en" || path.startsWith("/en/")) return "en";
    if (path === "/ru" || path.startsWith("/ru/")) return "ru";
    if (path === "/") {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "en" || stored === "ru") return stored;
      return navigator.language.toLowerCase().startsWith("ru") ? "ru" : "en";
    }
  }
  return "ru";
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
