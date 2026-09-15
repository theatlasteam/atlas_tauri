import { Show } from "solid-js";

/**
 * The Mind asset — a soft blob with two eyes, drawn once and coloured per
 * Mind. It's SVG rather than an emoji or an initial-square because a Mind is
 * meant to read as *a creature you're sharing a room with*, not a chat
 * participant: two eyes looking at you is the cheapest way to get there.
 *
 * The shape came from the design asset (481×357); the two eye circles are
 * punched out of it. Colour is passed in as a gradient so each Mind keeps its
 * own identity wherever it shows up — list, room header, transcript.
 */
export default function MindOrb(props: {
  color: string;
  colorEnd?: string;
  size?: number;
  /** Blinks/looks away — used while a reply is being written. */
  thinking?: boolean;
  class?: string;
}) {
  const size = () => props.size ?? 40;
  const end = () => props.colorEnd ?? props.color;

  return (
    <svg
      width={size()}
      height={size()}
      viewBox="0 0 481 357"
      fill="none"
      aria-hidden="true"
      class={`shrink-0${props.class ? ` ${props.class}` : ""}`}
      style={{ width: `${size()}px`, height: `${size()}px` }}
    >
      <defs>
        <linearGradient
          id={`mind-${props.color.replace(/[^a-z0-9]/gi, "")}-${props.colorEnd?.replace(/[^a-z0-9]/gi, "") ?? "x"}`}
          x1="231"
          y1="0"
          x2="231"
          y2="357"
          gradientUnits="userSpaceOnUse"
        >
          <stop stop-color={props.color} />
          <stop offset="1" stop-color={end()} />
        </linearGradient>
      </defs>
      <path
        d="M334 0C368.932 0 397.712 26.3406 401.562 60.2432C403.186 60.0823 404.833 60 406.5 60C433.838 60 456 82.1619 456 109.5C456 121.768 451.534 132.991 444.144 141.64C465.542 148.638 481 168.764 481 192.5C481 219.545 460.933 241.902 434.876 245.495C437.76 250.486 439.873 256.036 441.021 262.016C446.539 290.743 427.724 318.504 398.997 324.021C382.613 327.168 366.544 322.4 354.735 312.393C346.182 338.302 321.775 357 293 357C264.794 357 240.785 339.034 231.79 313.921C220.015 332.594 199.207 345 175.5 345C145.735 345 120.537 325.444 112.054 298.479C105.626 300.758 98.7083 302 91.5 302C57.5345 302 30 274.466 30 240.5C30 232.264 31.6185 224.406 34.5557 217.227C14.053 206.834 0 185.559 0 161C0 135.741 14.8655 113.953 36.3252 103.909C35.4574 99.7422 35 95.4245 35 91C35 56.2061 63.2061 28 98 28C98.6984 28 99.394 28.0116 100.087 28.0342C100.722 28.0112 101.36 28 102 28C115.382 28 127.582 33.0566 136.798 41.3613C139.213 43.2517 141.487 45.3145 143.601 47.5312C157.745 25.5548 182.423 11 210.5 11C235.27 11 257.393 22.3294 271.974 40.0879C282.626 16.4525 306.392 0 334 0Z"
        fill={`url(#mind-${props.color.replace(/[^a-z0-9]/gi, "")}-${props.colorEnd?.replace(/[^a-z0-9]/gi, "") ?? "x"})`}
      />
      {/* Eyes: plain circles, scaled down while "thinking" so the Mind reads as
          mid-thought rather than just frozen. */}
      <g
        style={{
          transform: props.thinking ? "scale(1, 0.25)" : "scale(1, 1)",
          "transform-origin": "240px 178px",
          transition: "transform 220ms ease",
        }}
      >
        <circle cx="151.5" cy="178.5" r="52.5" fill="white" />
        <circle cx="327.796" cy="178.5" r="52.5" fill="white" />
      </g>
      <Show when={!props.thinking}>
        {/* Pupils — a touch of life, and they give the asset a reading direction. */}
        <circle cx="160" cy="184" r="20" fill="#1a1410" opacity="0.62" />
        <circle cx="336" cy="184" r="20" fill="#1a1410" opacity="0.62" />
        <circle cx="168" cy="176" r="7" fill="white" opacity="0.9" />
        <circle cx="344" cy="176" r="7" fill="white" opacity="0.9" />
      </Show>
    </svg>
  );
}
