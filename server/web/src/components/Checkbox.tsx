/** Shared animated checkbox — the same style as the waitlist consent toggle:
 *  a peer input + an SVG checkmark that draws in via stroke-dashoffset. */
export default function Checkbox(props: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  class?: string;
}) {
  return (
    <span
      class={`relative inline-flex h-[18px] w-[18px] shrink-0 transition-transform duration-150 active:scale-90${props.class ? ` ${props.class}` : ""}`}
    >
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.currentTarget.checked)}
        class="peer absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-md border border-[#2a241c] bg-[#1a1712] outline-none transition-[background-color,border-color] duration-150 checked:border-[#c9772e] checked:bg-[#c9772e] focus-visible:ring-2 focus-visible:ring-[#c9772e]/40"
      />
      <svg
        viewBox="0 0 16 16"
        class="pointer-events-none absolute inset-0 h-full w-full p-[3px] text-white peer-checked:[&_path]:[stroke-dashoffset:0]"
        fill="none"
      >
        <path
          d="M3 8.2L6.5 11.7L13 4.3"
          pathLength="1"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="[stroke-dasharray:1] [stroke-dashoffset:1] transition-[stroke-dashoffset] duration-300 ease-out"
        />
      </svg>
    </span>
  );
}
