/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{tsx,ts,jsx,js}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: "var(--color-bg)",
        surface: "var(--color-surface)",
        "surface-raised": "var(--color-surface-raised)",
        border: "var(--color-border)",
        ink: "var(--color-ink)",
        "ink-muted": "var(--color-ink-muted)",
        "ink-subtle": "var(--color-ink-subtle)",
        accent: {
          DEFAULT: "var(--color-accent)",
          soft: "var(--color-accent-soft)",
          ink: "var(--color-accent-ink)",
        },
      },
      fontFamily: {
        sans: "var(--font-sans)",
        heading: "var(--font-heading)",
        script: "var(--font-script)",
      },
      borderRadius: {
        pill: "999px",
      },
      boxShadow: {
        floating: "0 8px 30px -6px rgba(0,0,0,0.35), 0 2px 8px -2px rgba(0,0,0,0.25)",
      },
    },
  },
  plugins: [],
};
