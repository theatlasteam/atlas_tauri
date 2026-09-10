import { TextField, TextArea, AVATAR_GRADIENTS, avatarGradientCss, Menu, Dialog } from "@atlas/ui";
import { createSignal, For, Show } from "solid-js";
import { api } from "../data/api";
import { session } from "../store/session";
import Avatar from "../components/Avatar";
import EmojiPicker from "../components/EmojiPicker";
import VerifiedBadge from "../components/VerifiedBadge";
import { Skeleton } from "../components/Skeleton";
import { CheckIcon, EditIcon, ImageIcon, PaletteIcon, SignOutIcon, SmileyIcon, SpinnerIcon, TrashIcon } from "../icons";
import type { User } from "../data/types";
import { t } from "../lib/i18n";

const AVATAR_COLORS = AVATAR_GRADIENTS.map((g, i) => ({
  hex: g.from,
  label: String(i + 1),
}));

export default function Profile() {
  const user = session.user;
  const [editing, setEditing] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [draft, setDraft] = createSignal<Pick<User, "name" | "status" | "bio" | "avatarColor">>({
    name: "",
    status: "",
    bio: "",
    avatarColor: "",
  });
  const [uploadingPhoto, setUploadingPhoto] = createSignal(false);
  const [photoError, setPhotoError] = createSignal<string | null>(null);
  const [emojiOpen, setEmojiOpen] = createSignal(false);
  const [bgOpen, setBgOpen] = createSignal(false);
  let fileInput: HTMLInputElement | undefined;

  const startEditing = () => {
    const current = user();
    if (!current) return;
    setDraft({ name: current.name, status: current.status, bio: current.bio, avatarColor: current.avatarColor });
    setPhotoError(null);
    setEditing(true);
  };

  const save = async (e: Event) => {
    e.preventDefault();
    setSaving(true);
    try {
      await session.updateProfile(draft());
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const pickPhoto = () => fileInput?.click();

  const uploadPhoto = async (file: File) => {
    setPhotoError(null);
    if (!file.type.startsWith("image/")) {
      setPhotoError(t("profile.pickImageError"));
      return;
    }
    setUploadingPhoto(true);
    try {
      const dims = await imageDims(file).catch(() => null);
      const attachment = await api.uploadAttachment(file, {
        kind: "image",
        filename: file.name,
        mime: file.type,
        width: dims?.width,
        height: dims?.height,
      });
      await session.setAvatar(attachment.id);
    } catch {
      setPhotoError(t("profile.uploadError"));
    } finally {
      setUploadingPhoto(false);
      if (fileInput) fileInput.value = "";
    }
  };

  const removePhoto = async () => {
    setUploadingPhoto(true);
    try {
      await session.removeAvatar();
    } finally {
      setUploadingPhoto(false);
    }
  };

  const applyEmoji = async (glyph: string) => {
    if (!glyph) return;
    setPhotoError(null);
    setUploadingPhoto(true);
    try {
      if (user()?.hasAvatar) await session.removeAvatar();
      await session.updateProfile({ avatarInitial: glyph });
      setEmojiOpen(false);
    } catch {
      setPhotoError(t("profile.uploadError"));
    } finally {
      setUploadingPhoto(false);
    }
  };

  return (
    <div class="h-full overflow-y-auto pb-28">
    <header class="flex items-center justify-between border-b border-border bg-appbar px-5 pb-3 pt-[max(var(--safe-top),1.5rem)]">
    <Show
    when={!editing()}
    fallback={
      <button
      type="button"
      onClick={() => setEditing(false)}
      class="min-h-11 rounded-pill px-2 text-[0.95rem] font-medium text-ink-muted active:opacity-60"
      >
      {t("profile.cancel")}
      </button>
    }
    >
    <h1 class="font-heading text-2xl font-bold">{t("profile.title")}</h1>
    </Show>

    <Show when={editing()}>
    <h1 class="absolute left-1/2 -translate-x-1/2 font-heading text-[1.05rem] font-bold">{t("profile.editTitle")}</h1>
    </Show>

    <Show
    when={!editing() && user()}
    fallback={
      <Show when={editing()}>
      <button
      type="button"
      form="profile-edit-form"
        disabled={saving() || !draft().name.trim()}
        class="min-h-11 rounded-pill px-2 text-[0.95rem] font-semibold text-accent active:opacity-60 disabled:opacity-40"
        >
        <Show when={!saving()} fallback={<SpinnerIcon size={16} class="animate-spin" />}>
        {t("profile.save")}
        </Show>
        </button>
        </Show>
    }
    >
    <button
    type="button"
    onClick={startEditing}
    class="flex min-h-11 items-center gap-1.5 rounded-pill border border-border px-3 py-1.5 text-sm font-medium text-ink-muted transition-[background-color,color,transform] duration-150 hover:bg-surface hover:text-ink active:scale-95"
    >
    <EditIcon size={15} />
    {t("profile.edit")}
    </button>
    </Show>
    </header>

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
      {/* Avatar + halo — tap for emoji / photo */}
      <div class="relative mt-2">
      <div
      class="absolute inset-0 -z-10 rounded-full opacity-25 blur-xl"
      style={{ background: avatarGradientCss(editing() ? draft().avatarColor : u().avatarColor, u().avatarInitial) }}
      />
      <Menu
        trigger={
          <button
            type="button"
            disabled={uploadingPhoto()}
            aria-label={t("profile.changePhotoAria")}
            class="rounded-full outline-none ring-offset-2 ring-offset-bg transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent active:scale-95 disabled:opacity-60"
          >
            <Avatar color={editing() ? draft().avatarColor : u().avatarColor} initial={u().avatarInitial} size={92} userId={u().id} hasPhoto={u().hasAvatar} />
          </button>
        }
        items={[
          {
            id: "emoji",
            label: t("profile.avatarEmoji"),
            icon: <SmileyIcon size={16} />,
            onSelect: () => setEmojiOpen(true),
          },
          {
            id: "bg",
            label: t("profile.avatarBg"),
            icon: <PaletteIcon size={16} />,
            onSelect: () => setBgOpen(true),
          },
          {
            id: "photo",
            label: t("profile.avatarImage"),
            icon: <ImageIcon size={16} />,
            onSelect: pickPhoto,
          },
          ...(u().hasAvatar
            ? [
                {
                  id: "remove",
                  label: t("profile.removePhoto"),
                  icon: <TrashIcon size={16} />,
                  danger: true,
                  onSelect: () => void removePhoto(),
                },
              ]
            : []),
        ]}
      />

      <Show when={uploadingPhoto()}>
      <div class="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
      <SpinnerIcon size={22} class="animate-spin text-white" />
      </div>
      </Show>

      <input
      ref={fileInput}
      type="file"
      accept="image/*"
      class="hidden"
      onChange={(e) => {
        const file = e.currentTarget.files?.[0];
        if (file) void uploadPhoto(file);
      }}
      />
      </div>

      <Dialog
        open={emojiOpen()}
        onOpenChange={setEmojiOpen}
        title={t("profile.emojiTitle")}
        description={t("profile.emojiHint")}
      >
        <EmojiPicker onPick={(e) => void applyEmoji(e)} />
      </Dialog>

      <Dialog
        open={bgOpen()}
        onOpenChange={setBgOpen}
        title={t("profile.avatarBg")}
        description={t("profile.avatarColorDesc")}
      >
        <div class="flex flex-wrap gap-3">
          <For each={AVATAR_COLORS}>
            {(color) => {
              const active = () => u().avatarColor === color.hex;
              return (
                <button
                  type="button"
                  aria-label={`${t("profile.avatarBg")} ${color.label}`}
                  class="relative flex h-12 w-12 items-center justify-center rounded-full active:scale-90"
                  style={{ background: avatarGradientCss(color.hex) }}
                  onClick={() => {
                    void session.updateProfile({ avatarColor: color.hex });
                    setBgOpen(false);
                  }}
                >
                  <Show when={active()}>
                    <span class="absolute inset-0 rounded-full ring-2 ring-ink ring-offset-2 ring-offset-surface-raised" />
                    <CheckIcon size={16} class="text-white drop-shadow" />
                  </Show>
                </button>
              );
            }}
          </For>
        </div>
      </Dialog>

      <Show when={photoError()}>
      <p class="rounded-lg bg-danger/10 px-3 py-1.5 text-xs text-danger">{photoError()}</p>
      </Show>

      <Show
      when={!editing()}
      fallback={
        <form id="profile-edit-form" onSubmit={save} class="mt-3 flex w-full flex-col gap-5">
        <div class="flex flex-col gap-4 rounded-2xl border border-border bg-surface-raised p-4">
          <TextField label={t("profile.name")} value={draft().name} onInput={(e) => setDraft((d) => ({ ...d, name: e.currentTarget.value }))} placeholder={t("profile.namePlaceholder")} />
          <TextField label={t("profile.status")} value={draft().status} onInput={(e) => setDraft((d) => ({ ...d, status: e.currentTarget.value }))} placeholder={t("profile.statusPlaceholder")} />
          <TextArea label={t("profile.bio")} rows={3} value={draft().bio} onInput={(e) => setDraft((d) => ({ ...d, bio: e.currentTarget.value }))} placeholder={t("profile.bioPlaceholder")} />
        </div>
        </form>
      }
      >
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
      <h3 class="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-subtle">{t("profile.bio")}</h3>
      <p class="text-sm text-ink" classList={{ "italic text-ink-subtle": !u().bio }}>
      {u().bio || t("profile.noBio")}
      </p>
      </div>
      <div class="border-t border-border p-4">
      <h3 class="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-subtle">{t("profile.handle")}</h3>
      <p class="text-sm text-ink">@{u().handle}</p>
      </div>
      </div>

      <button
      type="button"
      onClick={() => void session.logout()}
      class="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-surface py-3 text-sm font-semibold text-danger active:scale-[0.98]"
      >
      <SignOutIcon size={17} />
      {t("profile.signOut")}
      </button>
      </Show>
      </div>
    )}
    </Show>
    </div>
  );
}

function imageDims(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = reject;
    img.src = url;
  });
}
