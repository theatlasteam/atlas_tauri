import { createSignal, For, Show } from "solid-js";
import { Menu, MenuItem } from "./Menu";
import { CheckIcon, ChevronDownIcon } from "../icons";

export interface PickerOption {
  value: string;
  label: string;
}

/** A pill-shaped select trigger backed by Menu — swap-in replacement for a native <select>. */
export default function Picker(props: { value: string; onChange: (value: string) => void; options: PickerOption[] }) {
  const [open, setOpen] = createSignal(false);
  let triggerRef: HTMLButtonElement | undefined;

  const selectedLabel = () => props.options.find((o) => o.value === props.value)?.label ?? "";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        class="flex min-h-11 min-w-28 items-center justify-between gap-2 rounded-pill border border-border bg-surface px-3.5 py-1.5 text-sm text-ink active:scale-95"
      >
        <span>{selectedLabel()}</span>
        <ChevronDownIcon size={16} class="text-ink-subtle" />
      </button>
      <Menu open={open()} onOpenChange={setOpen} anchorRef={() => triggerRef} placement="bottom-end">
        <For each={props.options}>
          {(option) => (
            <MenuItem
              onSelect={() => {
                props.onChange(option.value);
                setOpen(false);
              }}
            >
              <span>{option.label}</span>
              <Show when={option.value === props.value}>
                <CheckIcon size={16} class="text-accent" />
              </Show>
            </MenuItem>
          )}
        </For>
      </Menu>
    </>
  );
}
