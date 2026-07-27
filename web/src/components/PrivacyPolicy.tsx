import { Show } from "solid-js";
import { ArrowLeft } from "phosphor-solid-js";
import { locale } from "../lib/i18n";

// Legal text lives here rather than in the shared i18n dict — it's long,
// one-off, and easier to review as a contiguous document per language than
// scattered across hundreds of short dict entries.
//
// The site's operator (Ahmed, 12) can't be the responsible party for
// personal-data processing under Russian law at that age — this names his
// father instead, per that conversation.
const OPERATOR_RU = "Шайхилов Джамбулат Юсупович";

export default function PrivacyPolicy() {
  return (
    <div class="min-h-screen bg-bg px-6 py-12 text-ink">
      <div class="mx-auto max-w-2xl">
        <a href="/" class="mb-8 inline-flex items-center gap-2 text-sm text-ink-muted hover:text-ink">
          <ArrowLeft size={16} weight="bold" />
          <Show when={locale() === "ru"} fallback="Back to Atlas">
            На главную
          </Show>
        </a>

        <Show when={locale() === "ru"} fallback={<PrivacyPolicyEn />}>
          <PrivacyPolicyRu />
        </Show>
      </div>
    </div>
  );
}

function PrivacyPolicyRu() {
  return (
    <article class="prose-policy">
      <h1 class="font-heading text-3xl font-bold">Политика обработки персональных данных</h1>
      <p class="mt-1 text-sm text-ink-subtle">
        Последнее обновление: 27 июля 2026 г. Действует в отношении сайта atlasmsg.app и приложения
        Atlas.
      </p>

      <div class="my-6 rounded-2xl border border-border bg-surface p-4 text-sm">
        <strong>Оператор персональных данных:</strong> {OPERATOR_RU}
        <br />
        <strong>Контакт по вопросам персональных данных:</strong>{" "}
        <a href="mailto:privacy@atlasmsg.app" class="text-accent underline">
          privacy@atlasmsg.app
        </a>
      </div>

      <h2>1. Общие положения</h2>
      <p>
        Настоящая Политика составлена в соответствии с требованиями Федерального закона от 27.07.2006
        № 152-ФЗ «О персональных данных» и определяет порядок обработки персональных данных
        пользователей сайта atlasmsg.app и приложения Atlas (мессенджер, далее — «Сервис»), а также
        меры по обеспечению безопасности этих данных.
      </p>
      <p>
        Используя Сервис, вы соглашаетесь с условиями настоящей Политики. Если вы не согласны с
        условиями — не используйте Сервис.
      </p>

      <h2>2. Какие данные мы собираем</h2>
      <p>Мы собираем только те данные, которые нужны для работы Сервиса:</p>
      <ul>
        <li>
          <strong>Список ожидания (waitlist)</strong> — адрес электронной почты, который вы указываете
          на сайте, чтобы получить уведомление о новых альфа-сборках.
        </li>
        <li>
          <strong>Учётная запись</strong> — логин (handle), отображаемое имя, пароль (хранится
          исключительно в виде необратимого хеша Argon2, в открытом виде нигде не сохраняется), а
          также необязательные поля профиля: статус, описание («о себе»), цвет и фотография аватара.
        </li>
        <li>
          <strong>Сообщения.</strong> Личные сообщения (DM) шифруются end-to-end (X25519 +
          HKDF-SHA256) прямо на вашем устройстве — сервер получает и хранит только шифротекст и не
          может прочитать содержимое переписки. Сообщения в группах в текущей версии{" "}
          <strong>не</strong> шифруются end-to-end и хранятся на сервере в виде текста, необходимого
          для доставки и поиска. Вложения (изображения, голосовые сообщения, файлы) хранятся на
          сервере в виде, аналогичном шифрованию соответствующего сообщения.
        </li>
        <li>
          <strong>Технические и служебные данные</strong> — токен push-уведомлений устройства (для
          Android), сведения об активных сессиях (для входа в аккаунт на нескольких устройствах),
          статус «в сети» / время последнего визита (если не отключено в настройках приватности).
        </li>
        <li>
          <strong>Локальные настройки устройства</strong> — тема, язык интерфейса, акцентный цвет и
          похожие настройки хранятся только в локальном хранилище вашего браузера или приложения и не
          передаются на сервер.
        </li>
      </ul>
      <p>Мы не используем сторонние аналитические сервисы и рекламные cookie на сайте atlasmsg.app.</p>

      <h2>3. Цели обработки персональных данных</h2>
      <ul>
        <li>Регистрация и аутентификация учётной записи в Сервисе;</li>
        <li>обеспечение обмена сообщениями и вызовами между пользователями;</li>
        <li>уведомление о новых сборках и функциях (для адресов из списка ожидания и push-токенов);</li>
        <li>обеспечение безопасности и предотвращение злоупотреблений (например, блокировка пользователей);</li>
        <li>обратная связь по запросам, связанным с обработкой персональных данных.</li>
      </ul>

      <h2>4. Правовые основания обработки</h2>
      <p>
        Обработка осуществляется на основании вашего согласия, выраженного через регистрацию в
        Сервисе или добровольное указание e-mail в форме списка ожидания (ст. 6 152-ФЗ), а также в
        целях исполнения соглашения о предоставлении доступа к функциям Сервиса.
      </p>

      <h2>5. Хранение и передача данных</h2>
      <p>
        Персональные данные обрабатываются и хранятся на серверах, размещённых у хостинг-провайдера
        Amvera (Российская Федерация). Мы не передаём ваши персональные данные третьим лицам, за
        исключением случаев, предусмотренных законодательством РФ, либо технических субподрядчиков,
        необходимых для работы Сервиса (например, сервис push-уведомлений Firebase Cloud Messaging —
        только регистрационный токен устройства, без содержимого сообщений).
      </p>
      <p>
        Данные хранятся до тех пор, пока учётная запись активна, либо до вашего запроса на удаление.
        Адрес из списка ожидания хранится до отправки уведомления о запуске либо до вашего запроса на
        удаление.
      </p>

      <h2>6. Ваши права</h2>
      <p>В соответствии со 152-ФЗ вы имеете право:</p>
      <ul>
        <li>получить информацию о том, какие ваши персональные данные обрабатываются;</li>
        <li>потребовать исправления неточных данных (доступно самостоятельно в настройках профиля);</li>
        <li>отозвать согласие на обработку и потребовать удаления учётной записи и данных;</li>
        <li>потребовать удаления адреса электронной почты из списка ожидания.</li>
      </ul>
      <p>
        Для реализации этих прав напишите на{" "}
        <a href="mailto:privacy@atlasmsg.app" class="text-accent underline">
          privacy@atlasmsg.app
        </a>
        . Мы отвечаем на такие запросы в течение 30 дней.
      </p>

      <h2>7. Меры защиты данных</h2>
      <ul>
        <li>Пароли хранятся в виде хешей Argon2, а не в открытом виде;</li>
        <li>личные сообщения шифруются end-to-end и недоступны серверу в открытом виде;</li>
        <li>соединение с сервером осуществляется по защищённому протоколу (TLS);</li>
        <li>доступ к административным функциям (например, снятие/выдача верификации) ограничен отдельной учётной записью.</li>
      </ul>

      <h2>8. Изменения политики</h2>
      <p>
        Мы можем обновлять эту Политику — актуальная версия всегда доступна по адресу{" "}
        <code>atlasmsg.app/privacy</code>. При существенных изменениях будет обновлена дата в начале
        документа.
      </p>

      <h2>9. Контакты</h2>
      <p>
        По всем вопросам, связанным с обработкой персональных данных, обращайтесь по адресу{" "}
        <a href="mailto:privacy@atlasmsg.app" class="text-accent underline">
          privacy@atlasmsg.app
        </a>
        .
      </p>
    </article>
  );
}

function PrivacyPolicyEn() {
  return (
    <article class="prose-policy">
      <h1 class="font-heading text-3xl font-bold">Privacy Policy</h1>
      <p class="mt-1 text-sm text-ink-subtle">
        Last updated: July 27, 2026. Applies to atlasmsg.app and the Atlas app.
      </p>

      <div class="my-6 rounded-2xl border border-border bg-surface p-4 text-sm">
        <strong>Data controller:</strong> {OPERATOR_RU}
        <br />
        <strong>Contact for privacy requests:</strong>{" "}
        <a href="mailto:privacy@atlasmsg.app" class="text-accent underline">
          privacy@atlasmsg.app
        </a>
      </div>

      <h2>1. Overview</h2>
      <p>
        This policy describes how Atlas ("the Service") — the atlasmsg.app website and the Atlas
        messenger app — collects, uses, and protects your personal data, in line with Russian Federal
        Law No. 152-FZ "On Personal Data" (the Service is operated from, and its data is stored in,
        Russia).
      </p>

      <h2>2. What we collect</h2>
      <ul>
        <li>
          <strong>Waitlist</strong> — the email address you submit on the site to be notified about
          new alpha builds.
        </li>
        <li>
          <strong>Account</strong> — your handle, display name, password (stored only as an
          irreversible Argon2 hash, never in plain text), and optional profile fields: status, bio,
          avatar color/photo.
        </li>
        <li>
          <strong>Messages.</strong> Direct messages are end-to-end encrypted (X25519 + HKDF-SHA256)
          on your device — the server only ever holds ciphertext it can't read. Group messages are{" "}
          <strong>not</strong> end-to-end encrypted in the current version; they're stored server-side
          as plain text so they can be delivered and searched. Attachments (images, voice notes,
          files) are stored with the same encryption treatment as the message they belong to.
        </li>
        <li>
          <strong>Technical data</strong> — push notification device tokens (Android), active session
          records (for multi-device sign-in), online status / last-seen time (unless you disable this
          in privacy settings).
        </li>
        <li>
          <strong>Local device settings</strong> — theme, interface language, accent color, and
          similar preferences live only in your browser's or app's local storage and are never sent
          to the server.
        </li>
      </ul>
      <p>We don't use third-party analytics or advertising cookies on atlasmsg.app.</p>

      <h2>3. Why we process this data</h2>
      <ul>
        <li>Account registration and authentication;</li>
        <li>enabling messaging and calls between users;</li>
        <li>notifying you about new builds and features (waitlist emails, push tokens);</li>
        <li>security and abuse prevention (e.g. blocking users);</li>
        <li>responding to privacy-related requests.</li>
      </ul>

      <h2>4. Storage and transfer</h2>
      <p>
        Data is processed and stored on servers hosted by Amvera (Russian Federation). We don't share
        your personal data with third parties except where required by Russian law, or with technical
        subprocessors necessary to run the Service (e.g. Firebase Cloud Messaging for push delivery —
        only the device's registration token, never message content).
      </p>
      <p>
        Data is retained while your account is active, or until you request deletion. A waitlist
        email is retained until the launch notification is sent, or until you request removal.
      </p>

      <h2>5. Your rights</h2>
      <ul>
        <li>Find out what personal data of yours is being processed;</li>
        <li>correct inaccurate data (available directly in profile settings);</li>
        <li>withdraw consent and request deletion of your account and data;</li>
        <li>request removal of your email from the waitlist.</li>
      </ul>
      <p>
        To exercise these rights, email{" "}
        <a href="mailto:privacy@atlasmsg.app" class="text-accent underline">
          privacy@atlasmsg.app
        </a>
        . We respond to such requests within 30 days.
      </p>

      <h2>6. Security measures</h2>
      <ul>
        <li>Passwords are stored as Argon2 hashes, never in plain text;</li>
        <li>direct messages are end-to-end encrypted and unreadable by the server;</li>
        <li>connections to the server use TLS;</li>
        <li>administrative actions (e.g. granting/removing verification) are restricted to a separate account.</li>
      </ul>

      <h2>7. Changes to this policy</h2>
      <p>
        We may update this policy — the current version always lives at{" "}
        <code>atlasmsg.app/privacy</code>. Meaningful changes update the date at the top of this page.
      </p>

      <h2>8. Contact</h2>
      <p>
        For anything related to personal data processing, reach us at{" "}
        <a href="mailto:privacy@atlasmsg.app" class="text-accent underline">
          privacy@atlasmsg.app
        </a>
        .
      </p>
    </article>
  );
}
