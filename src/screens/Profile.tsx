import { createSignal, For, Show } from "solid-js";
import { api } from "../data/api";
import { session } from "../store/session";
import Avatar from "../components/Avatar";
import { Skeleton } from "../components/Skeleton";
import { CameraIcon, CheckIcon, EditIcon, SignOutIcon, SpinnerIcon, TrashIcon } from "../icons";
import type { User } from "../data/types";

/** Fallback-avatar swatches — same hex values as the accent palette, kept
 * independent since your avatar color and your app theme are different
 * choices (e.g. you might use a red theme but a blue avatar). */
const AVATAR_COLORS = [
  { hex: "#c9772e", name: "Amber" },
  { hex: "#2f8f6e", name: "Emerald" },
  { hex: "#7b5ec9", name: "Violet" },
  { hex: "#c9436f", name: "Rose" },
  { hex: "#4a6b7c", name: "Slate" },
  { hex: "#2f6fc9", name: "Blue" },
  { hex: "#1f8f8a", name: "Teal" },
  { hex: "#d9603f", name: "Terracotta" },
  { hex: "#4550b8", name: "Indigo" },
  { hex: "#9c4fa0", name: "Plum" },
];

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
      setPhotoError("Please pick an image file.");
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
      setPhotoError("Couldn't upload that photo — try again.");
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
      Cancel
      </button>
    }
    >
    <h1 class="font-heading text-2xl font-bold">Profile</h1>
    </Show>

    <Show when={editing()}>
    <h1 class="absolute left-1/2 -translate-x-1/2 font-heading text-[1.05rem] font-bold">Edit profile</h1>
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
        Save
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
    Edit
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
      {/* Avatar + halo */}
      <div class="relative mt-2">
      <div
      class="absolute inset-0 -z-10 rounded-full opacity-25 blur-xl"
      style={{ "background-color": editing() ? draft().avatarColor : u().avatarColor }}
      />
      <Avatar color={u().avatarColor} initial={u().avatarInitial} size={92} userId={u().id} hasPhoto={u().hasAvatar} />

      <Show when={uploadingPhoto()}>
      <div class="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
      <SpinnerIcon size={22} class="animate-spin text-white" />
      </div>
      </Show>

      <button
      type="button"
      onClick={pickPhoto}
      disabled={uploadingPhoto()}
      aria-label="Change photo"
      class="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-bg bg-accent text-accent-ink shadow-sm active:scale-90 disabled:opacity-60"
      >
      <CameraIcon size={15} />
      </button>
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

      <Show when={u().hasAvatar}>
      <button
      type="button"
      onClick={() => void removePhoto()}
      disabled={uploadingPhoto()}
      class="-mt-1 flex items-center gap-1 text-xs font-medium text-danger/80 active:opacity-60 disabled:opacity-40"
      >
      <TrashIcon size={12} />
      Remove photo
      </button>
      </Show>

      <Show when={photoError()}>
      <p class="rounded-lg bg-danger/10 px-3 py-1.5 text-xs text-danger">{photoError()}</p>
      </Show>

      <Show
      when={!editing()}
      fallback={
        <form id="profile-edit-form" onSubmit={save} class="mt-3 flex w-full flex-col gap-5">
        <div class="overflow-hidden rounded-2xl border border-border bg-surface">
        <Field label="Name">
        <input
        value={draft().name}
        onInput={(e) => setDraft((d) => ({ ...d, name: e.currentTarget.value }))}
        placeholder="Your name"
        class="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-subtle"
        />
        </Field>
        <Field label="Status">
        <input
        value={draft().status}
        onInput={(e) => setDraft((d) => ({ ...d, status: e.currentTarget.value }))}
        placeholder="Available"
        class="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-subtle"
        />
        </Field>
        <Field label="Bio" align="start">
        <textarea
        rows="3"
        value={draft().bio}
        onInput={(e) => setDraft((d) => ({ ...d, bio: e.currentTarget.value }))}
        placeholder="Tell people a little about yourself"
        class="w-full resize-none bg-transparent text-sm text-ink outline-none placeholder:text-ink-subtle"
        />
        </Field>
        </div>

        <div class="rounded-2xl border border-border bg-surface p-4">
        <h3 class="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Avatar color</h3>
        <p class="mt-0.5 text-xs text-ink-subtle">Used when you don't have a photo.</p>
        <div class="flex flex-wrap gap-3 pt-3">
        <For each={AVATAR_COLORS}>
        {(color) => {
          const active = () => draft().avatarColor === color.hex;
          return (
            <button
            type="button"
            aria-label={color.name}
            onClick={() => setDraft((d) => ({ ...d, avatarColor: color.hex }))}
            class="relative flex h-9 w-9 items-center justify-center rounded-full active:scale-90"
            style={{ "background-color": color.hex }}
            >
            <Show when={active()}>
            <span class="absolute inset-0 rounded-full ring-2 ring-ink ring-offset-2 ring-offset-surface" />
            <CheckIcon size={15} class="text-white drop-shadow" />
            </Show>
            </button>
          );
        }}
        </For>
        </div>
        </div>
        </form>
      }
      >
      <div class="mt-1 text-center">
      <h2 class="text-xl font-bold text-ink">{u().name}</h2>
      <p class="text-sm text-ink-subtle">@{u().handle}</p>
      <Show when={u().status}>
      <span class="mt-2 inline-flex items-center rounded-pill bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
      {u().status}
      </span>
      </Show>
      </div>

      <div class="mt-6 w-full overflow-hidden rounded-2xl border border-border bg-surface">
      <div class="p-4">
      <h3 class="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-subtle">Bio</h3>
      <p class="text-sm text-ink" classList={{ "italic text-ink-subtle": !u().bio }}>
      {u().bio || "No bio yet."}
      </p>
      </div>
      <div class="border-t border-border p-4">
      <h3 class="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-subtle">Handle</h3>
      <p class="text-sm text-ink">@{u().handle}</p>
      </div>
      </div>

      <button
      type="button"
      onClick={() => void session.logout()}
      class="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-surface py-3 text-sm font-semibold text-danger active:scale-[0.98]"
      >
      <SignOutIcon size={17} />
      Sign out
      </button>
      </Show>
      </div>
    )}
    </Show>
    </div>
  );
}

function Field(props: { label: string; align?: "start" | "center"; children: any }) {
  return (
    <div
    class="flex gap-3 border-b border-border px-4 py-3 last:border-b-0"
    classList={{ "items-start": props.align === "start", "items-center": props.align !== "start" }}
    >
    <span
    class="w-16 shrink-0 text-xs font-semibold uppercase tracking-wide text-ink-subtle"
    classList={{ "pt-1": props.align === "start" }}
    >
    {props.label}
    </span>
    {props.children}
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
