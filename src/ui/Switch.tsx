export default function Switch(props: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      onClick={() => props.onChange(!props.checked)}
      class="relative flex h-[44px] w-[68px] shrink-0 items-center"
      data-checked={props.checked ? "" : undefined}
    >
      <span
        class="relative block h-[28px] w-[64px] rounded-full transition-colors duration-200 ease-out"
        classList={{ "bg-accent": props.checked, "bg-border": !props.checked }}
      >
        <span
          class="absolute left-[2px] top-[2px] h-[24px] w-[38px] rounded-full bg-ink shadow-sm transition-transform duration-200 ease-out"
          classList={{ "translate-x-[22px]": props.checked }}
        />
      </span>
    </button>
  );
}
