import { A } from "@solidjs/router";
import { BackIcon } from "../icons";

export default function BackHeader(props: { title: string; back?: string }) {
  return (
    <header class="mb-4 flex shrink-0 items-center gap-2 border-b border-border bg-appbar px-3 pb-3 pt-[max(var(--safe-top),1.5rem)]">
      <A
        href={props.back ?? "/settings"}
        class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted transition-[background-color,color,transform] duration-150 hover:bg-surface hover:text-ink active:scale-95 active:bg-surface"
      >
        <BackIcon size={22} />
      </A>
      <h1 class="font-heading text-xl font-bold">{props.title}</h1>
    </header>
  );
}
