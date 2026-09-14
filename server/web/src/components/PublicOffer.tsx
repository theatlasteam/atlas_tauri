import { Show } from "solid-js";
import { ArrowLeft } from "phosphor-solid-js";
import { locale } from "../lib/i18n";

const OPERATOR_RU = "Шайхилов Джамбулат Юсупович";

export default function PublicOffer() {
  return (
    <div class="min-h-screen bg-bg px-6 py-12 text-ink">
      <div class="mx-auto max-w-2xl">
        <a href="/" class="mb-8 inline-flex items-center gap-2 text-sm text-ink-muted hover:text-ink">
          <ArrowLeft size={16} weight="bold" />
          <Show when={locale() === "ru"} fallback="Back to Atlas">
            На главную
          </Show>
        </a>
        <Show when={locale() === "ru"} fallback={<OfferEn />}>
          <OfferRu />
        </Show>
      </div>
    </div>
  );
}

function OfferRu() {
  return (
    <article class="prose-policy">
      <h1 class="font-heading text-3xl font-bold">Публичная оферта</h1>
      <p class="mt-1 text-sm text-ink-subtle">
        Последнее обновление: 14 сентября 2026 г. Оферта на использование сайта atlasmsg.app и приложения Atlas.
      </p>
      <div class="my-6 rounded-2xl border border-border bg-surface p-4 text-sm">
        <strong>Оферент:</strong> {OPERATOR_RU}
        <br />
        <strong>Контакт:</strong>{" "}
        <a href="mailto:privacy@atlasmsg.app" class="text-accent underline">
          privacy@atlasmsg.app
        </a>
      </div>

      <h2>1. Общие положения</h2>
      <p>
        Настоящий документ является публичной офертой в смысле ст. 437 Гражданского кодекса РФ. Регистрация в Atlas, вход в аккаунт или иное использование Сервиса считаются акцептом оферты (ст. 438 ГК РФ).
      </p>
      <p>
        Вместе с офертой действуют{" "}
        <a href="/terms" class="text-accent underline">
          Условия использования
        </a>{" "}
        и{" "}
        <a href="/privacy" class="text-accent underline">
          Политика конфиденциальности
        </a>
        .
      </p>

      <h2>2. Предмет</h2>
      <p>
        Оферент предоставляет безвозмездный доступ к мессенджеру Atlas в режиме публичной беты: обмен сообщениями, звонки, Compass и связанные функции, насколько они доступны в текущей сборке. Состав функций может меняться без отдельного уведомления каждого пользователя.
      </p>

      <h2>3. Акцепт</h2>
      <p>Акцептом является любое из следующих действий:</p>
      <ul>
        <li>создание аккаунта;</li>
        <li>вход в существующий аккаунт;</li>
        <li>установка или запуск приложения Atlas;</li>
        <li>отправка адреса электронной почты через форму списка ожидания.</li>
      </ul>

      <h2>4. Безвозмездность</h2>
      <p>
        Пользование Сервисом в бете не требует оплаты. Платные тарифы в этой оферте не предлагаются. Если они появятся, условия будут опубликованы отдельно.
      </p>

      <h2>5. Обязанности сторон</h2>
      <p>Оферент обеспечивает работу Сервиса в пределах разумных технических возможностей беты и не обещает круглосуточную доступность.</p>
      <p>Пользователь обязан соблюдать Условия использования, не нарушать закон и не вмешиваться в работу инфраструктуры.</p>

      <h2>6. Персональные данные</h2>
      <p>
        Обработка персональных данных описывается в Политике конфиденциальности. Акцепт оферты включает согласие на обработку в объёме, указанном в политике.
      </p>

      <h2>7. Ответственность</h2>
      <p>
        Сервис предоставляется «как есть». Оферент не отвечает за сбои сети, потерю сообщений, действия других пользователей, ботов, плагинов и Spaces, а также за работу стороннего ИИ-провайдера Compass. Убытки возмещаются только в случаях, прямо предусмотренных императивными нормами закона.
      </p>

      <h2>8. Срок и расторжение</h2>
      <p>
        Оферта действует бессрочно, пока опубликована на <code>atlasmsg.app/oferta</code>. Пользователь может прекратить использование в любой момент. Оферент может отозвать оферту или ограничить доступ при нарушении условий.
      </p>

      <h2>9. Изменения</h2>
      <p>
        Новая редакция публикуется по тому же адресу и заменяет предыдущую с даты в начале документа. Продолжение использования после публикации считается акцептом новой редакции.
      </p>
    </article>
  );
}

function OfferEn() {
  return (
    <article class="prose-policy">
      <h1 class="font-heading text-3xl font-bold">Public offer</h1>
      <p class="mt-1 text-sm text-ink-subtle">
        Last updated: 14 September 2026. Offer to use atlasmsg.app and the Atlas app.
      </p>
      <div class="my-6 rounded-2xl border border-border bg-surface p-4 text-sm">
        <strong>Offeror:</strong> {OPERATOR_RU}
        <br />
        <strong>Contact:</strong>{" "}
        <a href="mailto:privacy@atlasmsg.app" class="text-accent underline">
          privacy@atlasmsg.app
        </a>
      </div>

      <h2>1. Status</h2>
      <p>
        This document is a public offer under Article 437 of the Civil Code of the Russian Federation. Creating an Atlas account, signing in, or otherwise using the Service is acceptance under Article 438.
      </p>
      <p>
        This offer is read together with the{" "}
        <a href="/terms" class="text-accent underline">
          Terms of Service
        </a>{" "}
        and the{" "}
        <a href="/privacy" class="text-accent underline">
          Privacy Policy
        </a>
        .
      </p>

      <h2>2. Subject</h2>
      <p>
        The offeror grants free access to the Atlas messenger in public beta: messaging, calls, Compass, and related features as available in the current build. Features may change without a personal notice to each user.
      </p>

      <h2>3. Acceptance</h2>
      <p>Any of the following is acceptance:</p>
      <ul>
        <li>creating an account;</li>
        <li>signing in;</li>
        <li>installing or launching the Atlas app;</li>
        <li>submitting an email through the waitlist form.</li>
      </ul>

      <h2>4. Price</h2>
      <p>
        Beta use is free. This offer does not sell paid plans. If paid plans appear, they will be published separately.
      </p>

      <h2>5. Duties</h2>
      <p>The offeror runs the Service with reasonable care for a beta and does not promise uninterrupted uptime.</p>
      <p>You must follow the Terms of Service, the law, and must not interfere with the infrastructure.</p>

      <h2>6. Personal data</h2>
      <p>
        Personal data is handled as described in the Privacy Policy. Accepting this offer includes consent to that processing.
      </p>

      <h2>7. Liability</h2>
      <p>
        The Service is provided as is. The offeror is not liable for network failures, lost messages, other users, bots, plugins, Spaces, or the third-party Compass inference provider, except where mandatory law says otherwise.
      </p>

      <h2>8. Term</h2>
      <p>
        The offer stays in force while it is published at <code>atlasmsg.app/oferta</code>. You may stop using the Service at any time. The offeror may withdraw the offer or limit access if you break the terms.
      </p>

      <h2>9. Changes</h2>
      <p>
        A new edition is published at the same URL and replaces the previous one from the date at the top. Continued use after publication is acceptance of the new edition.
      </p>
    </article>
  );
}
