import { createResource, createSignal, Show } from "solid-js";
import { useParams } from "@solidjs/router";
import { api } from "../data/api";
import { blocksStore } from "../store/blocks";
import { session } from "../store/session";
import Avatar from "../components/Avatar";
import Appbar from "../components/Appbar";
import Dialog from "../ui/Dialog";
import { Skeleton } from "../components/Skeleton";
import { ProhibitIcon, SpinnerIcon, VerifiedIcon } from "../icons";
import VerifiedBadge from "../components/VerifiedBadge";
import { t } from "../lib/i18n";

/** Read-only view of another user's profile, reached by tapping a DM's
 * appbar. Own profile is a separate screen (Profile.tsx) with edit affordances. */
export default function UserProfile() {
  const params = useParams<{ id: string }>();
  const [user, { mutate: mutateUser }] = createResource(() => params.id, api.getUser);
  const [confirmOpen, setConfirmOpen] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [verifyBusy, setVerifyBusy] = createSignal(false);

  const isMe = () => params.id === session.user()?.id;
  const blocked = () => blocksStore.isBlocked(params.id);
  // Verified badge grant/revoke is restricted server-side to the "atlas"
  // account — this only controls whether the toggle is *shown*, the real
  // authorization check happens in server/src/routes/users.rs::require_atlas.
  const canManageVerified = () => session.user()?.handle === "atlas" && !isMe();

  const toggleVerified = async () => {
    const current = user();
    if (!current) return;
    setVerifyBusy(true);
    try {
      const updated = await api.setVerified(params.id, !current.verified);
      mutateUser(updated);
    } finally {
      setVerifyBusy(false);
    }
  };

  blocksStore.refresh().catch(() => {});

  const confirmBlock = async () => {
    setBusy(true);
    try {
      await blocksStore.block(params.id);
      setConfirmOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const unblock = async () => {
    setBusy(true);
    try {
      await blocksStore.unblock(params.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="h-full overflow-y-auto pb-28">
      <Appbar title={t("userProfile.title")} back="/settings" sticky />

      <Show
        when={user()}
        fallback={
          <div class="flex flex-col items-center gap-3 px-5 pt-4">
            <Skeleton class="h-[92px] w-[92px] rounded-full" />
            <Skeleton class="h-5 w-32" />
            <Skeleton class="h-3.5 w-20" />
          </div>
        }
      >
        {(u) => (
          <div class="flex flex-col items-center gap-3 px-5 pt-2">
            <div class="relative mt-2">
              <div
                class="absolute inset-0 -z-10 rounded-full opacity-25 blur-xl"
                style={{ "background-color": u().avatarColor }}
              />
              <Avatar color={u().avatarColor} initial={u().avatarInitial} size={92} userId={u().id} hasPhoto={u().hasAvatar} />
            </div>

            <div class="mt-1 text-center">
              <h2 class="flex items-center justify-center gap-1.5 text-xl font-bold text-ink">
                <span class="min-w-0 truncate">{u().name}</span>
                <Show when={u().verified}>
                  <VerifiedBadge size={18} name={u().name} />
                </Show>
              </h2>
              <p class="text-sm text-ink-subtle">@{u().handle}</p>
              <Show when={u().status}>
                <span class="mt-2 inline-flex items-center rounded-pill bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
                  {u().status}
                </span>
              </Show>
            </div>

            <div class="mt-6 w-full overflow-hidden rounded-2xl border border-border bg-surface">
              <div class="p-4">
                <h3 class="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-subtle">{t("userProfile.bio")}</h3>
                <p class="text-sm text-ink" classList={{ "italic text-ink-subtle": !u().bio }}>
                  {u().bio || t("userProfile.noBio")}
                </p>
              </div>
              <div class="border-t border-border p-4">
                <h3 class="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-subtle">{t("userProfile.handle")}</h3>
                <p class="text-sm text-ink">@{u().handle}</p>
              </div>
            </div>

            <div class="mt-5 flex w-full flex-col gap-2">
              <Show when={canManageVerified()}>
                <button
                  type="button"
                  onClick={() => void toggleVerified()}
                  disabled={verifyBusy()}
                  class="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-surface py-3 text-sm font-semibold text-accent active:scale-[0.98] disabled:opacity-50"
                >
                  <Show when={!verifyBusy()} fallback={<SpinnerIcon size={17} class="animate-spin" />}>
                    <VerifiedIcon size={17} />
                    {u().verified ? t("userProfile.removeVerification") : t("userProfile.verifyAccount")}
                  </Show>
                </button>
              </Show>

              <Show when={!isMe()}>
                <button
                  type="button"
                  onClick={() => (blocked() ? void unblock() : setConfirmOpen(true))}
                  disabled={busy()}
                  class="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-surface py-3 text-sm font-semibold text-danger active:scale-[0.98] disabled:opacity-50"
                >
                  <Show when={!busy()} fallback={<SpinnerIcon size={17} class="animate-spin" />}>
                    <ProhibitIcon size={17} />
                    {blocked() ? t("userProfile.unblockUser") : t("userProfile.blockUser")}
                  </Show>
                </button>
              </Show>
            </div>
          </div>
        )}
      </Show>

      <Dialog open={confirmOpen()} onOpenChange={setConfirmOpen} title={t("userProfile.blockTitle")}>
        <p class="mb-5 text-sm text-ink-subtle">
          {t("userProfile.blockBody", { name: user()?.name ?? t("userProfile.blockBodyFallback") })}
        </p>
        <div class="flex gap-2">
          <button
            type="button"
            onClick={() => setConfirmOpen(false)}
            class="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium text-ink active:scale-[0.98]"
          >
            {t("userProfile.cancel")}
          </button>
          <button
            type="button"
            onClick={() => void confirmBlock()}
            disabled={busy()}
            class="flex-1 rounded-xl bg-danger py-2.5 text-sm font-semibold text-white active:scale-[0.98] disabled:opacity-50"
          >
            <Show when={!busy()} fallback={<SpinnerIcon size={16} class="mx-auto animate-spin" />}>
              {t("userProfile.block")}
            </Show>
          </button>
        </div>
      </Dialog>
    </div>
  );
}
