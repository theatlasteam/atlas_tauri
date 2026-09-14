import { Show } from "solid-js";
import { ArrowLeft } from "phosphor-solid-js";
import { locale } from "../lib/i18n";

const OPERATOR_RU = "Шайхилов Джамбулат Юсупович";

export default function TermsOfService() {
  return (
    <div class="min-h-screen bg-bg px-6 py-12 text-ink">
      <div class="mx-auto max-w-2xl">
        <a href="/" class="mb-8 inline-flex items-center gap-2 text-sm text-ink-muted hover:text-ink">
          <ArrowLeft size={16} weight="bold" />
          <Show when={locale() === "ru"} fallback="Back to Atlas">
            На главную
          </Show>
        </a>
        <Show when={locale() === "ru"} fallback={<TermsEn />}>
          <TermsRu />
        </Show>
      </div>
    </div>
  );
}

function TermsRu() {
  return (
    <article class="prose-policy">
      <h1 class="font-heading text-3xl font-bold">Условия использования</h1>
      <p class="mt-1 text-sm text-ink-subtle">
        Последнее обновление: 14 сентября 2026 г. Действует в отношении сайта atlasmsg.app и приложения Atlas.
      </p>
      <div class="my-6 rounded-2xl border border-border bg-surface p-4 text-sm">
        <strong>Оператор сервиса:</strong> {OPERATOR_RU}
        <br />
        <strong>Контакт:</strong>{" "}
        <a href="mailto:privacy@atlasmsg.app" class="text-accent underline">
          privacy@atlasmsg.app
        </a>
      </div>

      <h2>1. Принятие условий</h2>
      <p>
        Регистрируясь или пользуясь Atlas, вы принимаете эти Условия и{" "}
        <a href="/privacy" class="text-accent underline">
          Политику конфиденциальности
        </a>
        . Если вы не согласны, не используйте Сервис. Atlas находится в публичной бете: функции могут меняться, ломаться или исчезать.
      </p>

      <h2>2. Аккаунт</h2>
      <ul>
        <li>Вы отвечаете за сохранность пароля и сессий на своих устройствах.</li>
        <li>Один человек не должен выдавать себя за другого и не должен массово создавать аккаунты для обхода ограничений.</li>
        <li>Мы можем ограничить или удалить аккаунт при нарушении этих Условий или закона.</li>
      </ul>

      <h2>3. Сообщения и шифрование</h2>
      <p>
        Личные переписки между людьми шифруются по протоколу Olm на устройстве. Групповые чаты используют Megolm, когда шифрование доступно. Сервер в этих случаях хранит шифротекст и не может прочитать содержимое.
      </p>
      <p>
        Сообщения ботам, часть постов каналов и служебные рассылки могут храниться на сервере открытым текстом, потому что бот или канал должен их обрабатывать. Не отправляйте туда то, что должно остаться только у вас.
      </p>

      <h2>4. Compass, боты, плагины и Spaces</h2>
      <p>
        Compass передаёт ваш запрос стороннему провайдеру инференса, чтобы получить ответ. Не отправляйте Compass данные, которые нельзя показывать третьей стороне.
      </p>
      <p>
        Боты, плагины и Atlas Spaces (встроенные HTML-миниприложения) могут быть созданы не нами. Они работают в ограниченных песочницах, но вы используете их на свой риск. Мы не ручаемся за чужой код.
      </p>

      <h2>5. Допустимое использование</h2>
      <p>Запрещено использовать Atlas для:</p>
      <ul>
        <li>нарушения закона;</li>
        <li>вредоносного ПО, атак на инфраструктуру или обхода защиты;</li>
        <li>спама, массового сбора аккаунтов или вмешательства в работу Сервиса;</li>
        <li>публикации контента, который вы не имеете права распространять.</li>
      </ul>

      <h2>6. Звонки</h2>
      <p>
        Сигнализация звонка идёт через наши серверы. Медиа обычно передаётся между устройствами. Качество зависит от сети. Мы не гарантируем непрерывность звонков в бете.
      </p>

      <h2>7. Интеллектуальная собственность</h2>
      <p>
        Клиент Atlas распространяется по лицензии MIT (см. репозиторий). Товарный знак, имя Atlas и оформление сервиса остаются за оператором. Ваш контент остаётся вашим. Вы даёте нам лицензию, необходимую только для доставки этого контента в Сервисе.
      </p>

      <h2>8. Отказ от гарантий</h2>
      <p>
        Сервис предоставляется «как есть». Мы не обещаем бесперебойную работу, сохранность каждого сообщения или пригодность для критичных задач. В пределах, допускаемых законом, ответственность ограничена.
      </p>

      <h2>9. Изменения и прекращение</h2>
      <p>
        Мы можем менять Условия. Актуальная версия всегда на <code>atlasmsg.app/terms</code>. Дата в начале страницы обновляется при существенных правках. Вы можете перестать пользоваться Сервисом в любой момент. Мы можем приостановить доступ при нарушении Условий.
      </p>

      <h2>10. Право</h2>
      <p>К этим Условиям применяется право Российской Федерации, если иное не требуется императивными нормами.</p>
    </article>
  );
}

function TermsEn() {
  return (
    <article class="prose-policy">
      <h1 class="font-heading text-3xl font-bold">Terms of Service</h1>
      <p class="mt-1 text-sm text-ink-subtle">
        Last updated: 14 September 2026. Applies to atlasmsg.app and the Atlas app.
      </p>
      <div class="my-6 rounded-2xl border border-border bg-surface p-4 text-sm">
        <strong>Service operator:</strong> {OPERATOR_RU}
        <br />
        <strong>Contact:</strong>{" "}
        <a href="mailto:privacy@atlasmsg.app" class="text-accent underline">
          privacy@atlasmsg.app
        </a>
      </div>

      <h2>1. Acceptance</h2>
      <p>
        By creating an account or using Atlas you agree to these Terms and the{" "}
        <a href="/privacy" class="text-accent underline">
          Privacy Policy
        </a>
        . If you do not agree, do not use the Service. Atlas is in public beta. Features can change, break, or go away.
      </p>

      <h2>2. Accounts</h2>
      <ul>
        <li>You are responsible for your password and the sessions on your devices.</li>
        <li>Do not impersonate others or create bulk accounts to dodge limits.</li>
        <li>We may limit or delete an account that breaks these Terms or the law.</li>
      </ul>

      <h2>3. Messages and encryption</h2>
      <p>
        Direct chats between people are encrypted on-device with Olm. Group chats use Megolm when encryption is available. In those cases the server stores ciphertext and cannot read the contents.
      </p>
      <p>
        Messages to bots, some channel posts, and service broadcasts may be stored as plain text so the bot or channel can operate. Do not send those surfaces anything that must stay only on your device.
      </p>

      <h2>4. Compass, bots, plugins, and Spaces</h2>
      <p>
        Compass sends your prompt to a third-party inference provider to produce a reply. Do not send Compass anything you would not show a third party.
      </p>
      <p>
        Bots, plugins, and Atlas Spaces (sandboxed HTML mini-apps) may be built by other people. They run in limited sandboxes, but you use them at your own risk. We do not vouch for third-party code.
      </p>

      <h2>5. Acceptable use</h2>
      <p>You may not use Atlas to:</p>
      <ul>
        <li>break the law;</li>
        <li>distribute malware, attack infrastructure, or bypass security;</li>
        <li>spam, harvest accounts, or disrupt the Service;</li>
        <li>post content you do not have the right to share.</li>
      </ul>

      <h2>6. Calls</h2>
      <p>
        Call signaling goes through our servers. Media is usually sent between devices. Quality depends on the network. We do not guarantee uninterrupted calls during beta.
      </p>

      <h2>7. Intellectual property</h2>
      <p>
        The Atlas client is released under the MIT license (see the repository). The Atlas name and product look remain with the operator. Your content stays yours. You grant us only the license needed to deliver that content through the Service.
      </p>

      <h2>8. Disclaimer</h2>
      <p>
        The Service is provided as is. We do not promise uninterrupted uptime, that every message is retained, or fitness for critical work. Liability is limited to the extent the law allows.
      </p>

      <h2>9. Changes and termination</h2>
      <p>
        We may change these Terms. The current version always lives at <code>atlasmsg.app/terms</code>. Meaningful edits update the date at the top. You may stop using the Service at any time. We may suspend access if you break these Terms.
      </p>

      <h2>10. Law</h2>
      <p>These Terms are governed by the laws of the Russian Federation, except where mandatory rules say otherwise.</p>
    </article>
  );
}
