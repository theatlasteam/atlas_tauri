---
name: atlas-spaces
description: >
  How Compass generates shareable Atlas Spaces — sandboxed HTML mini-apps
  shown in a webview. Use when adding Space generation, changing Space UI
  rules, or teaching the model to emit ```space fences.
---

# Atlas Spaces

A **Space** is one self-contained HTML document Compass generates. Atlas stores
it, opens it in a sandboxed iframe (`allow-scripts`, no `allow-same-origin`),
and shares it at `/s/{id}`.

## When Compass should make one

The user asked for a mini-app, game, calculator, timer, mood board, landing
page, widget, or any *interactive UI*. Not for a normal text answer.

## Output format

Short intro in the conversation language, then **exactly one** fence:

````
```space title="Pomodoro"
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Pomodoro</title>
  <style>/* inline */</style>
</head>
<body>
  …
  <script>/* inline */</script>
</body>
</html>
```
````

## UI rules (match Atlas)

- **Tokens:** light `#f7f5f1` bg, `#ffffff` surface, `#201c16` ink, `#6b6459` muted, accent `#c9772e`. Honor `prefers-color-scheme: dark` (`#131110` bg, `#eee` ink).
- **Shape:** pills (`border-radius: 999px` on buttons), cards `16–24px`, 8px gaps, generous padding.
- **Type:** `ui-rounded, system-ui, sans-serif`. Comfortable body size (~16px).
- **Touch:** min 44×44px controls. Layout at 360px wide. No horizontal scroll.
- **Self-contained:** inline CSS/JS only. No CDN scripts, no Google Fonts CSS, no iframes, no `fetch` to random APIs, no cookies.
- **Images:** `data:` or `https` only.
The iframe is the security boundary. Do not try to reach the parent page.
