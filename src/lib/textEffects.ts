export const FX_KINDS = ["scale", "wave", "bounce", "shake", "rise"] as const;
export type FxKind = (typeof FX_KINDS)[number];

const OPEN = (kind: FxKind) => `{{fx:${kind}}}`;
const CLOSE = "{{/fx}}";
const WHOLE = /^\{\{fx:(scale|wave|bounce|shake|rise)\}\}([\s\S]*)\{\{\/fx\}\}$/;

export function unwrapFx(text: string): string {
  const m = text.trim().match(WHOLE);
  return m ? m[2]! : text;
}

export function wrapFx(text: string, kind: FxKind): string {
  const inner = unwrapFx(text);
  return `${OPEN(kind)}${inner}${CLOSE}`;
}

export function parseFx(text: string): { kind: FxKind | null; body: string } {
  const m = text.trim().match(WHOLE);
  if (m) return { kind: m[1] as FxKind, body: m[2] ?? "" };
  return { kind: null, body: text };
}

export function graphemes(text: string): string[] {
  const Seg = (
    Intl as unknown as {
      Segmenter: new (
        l: string | undefined,
        o: { granularity: string },
      ) => { segment: (s: string) => Iterable<{ segment: string }> };
    }
  ).Segmenter;
  if (typeof Seg === "function") {
    return [...new Seg(undefined, { granularity: "grapheme" }).segment(text)].map((s) => s.segment);
  }
  return [...text];
}
