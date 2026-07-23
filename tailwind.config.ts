import type { Config } from "tailwindcss";

/**
 * V2 design system (Change 3): deep-indigo primary with emerald/amber/rose/sky/
 * violet accents. Core surface tokens are driven by CSS variables (see
 * client/src/index.css) so a light/dark variant can be swapped at the root.
 */
export default {
  content: ["./client/index.html", "./client/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Surface tokens (CSS-variable driven; retain tg-* aliases so existing
        // markup re-skins automatically).
        tg: {
          bg: "var(--bg)",
          "secondary-bg": "var(--surface)",
          text: "var(--text)",
          hint: "var(--text-muted)",
          link: "var(--primary)",
          button: "var(--primary)",
          "button-text": "#ffffff",
        },
        bg: "var(--bg)",
        surface: "var(--surface)",
        border: "var(--border)",
        text: "var(--text)",
        muted: "var(--text-muted)",
        primary: {
          DEFAULT: "#16b3b1",
          light: "#5fd4d2",
          dark: "#0d8a88",
        },
        accent: { DEFAULT: "#2fbf71", light: "#123227" },
        warning: { DEFAULT: "#e0a53b", light: "#3a2f16" },
        danger: { DEFAULT: "#e0603b", light: "#3a1c14" },
        freeze: { DEFAULT: "#3aa0d6", light: "#12293a" },
        discount: { DEFAULT: "#9a7be0", light: "#241d3a" },
        sidebar: {
          bg: "#0a0f15",
          text: "#8b9aac",
          active: "#16b3b1",
        },
        status: {
          paid: "#2fbf71",
          awaiting: "#e0a53b",
          overdue: "#e0603b",
          frozen: "#3aa0d6",
          discount: "#9a7be0",
          notdue: "#7d8b9d",
        },
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "SF Mono", "Menlo", "Consolas", "monospace"],
      },
      borderRadius: {
        card: "10px",
        btn: "7px",
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)",
        "card-hover": "0 4px 12px rgba(0,0,0,0.10), 0 2px 4px rgba(0,0,0,0.05)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.95)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
      },
      animation: {
        "fade-in": "fade-in 150ms ease-out",
        "scale-in": "scale-in 200ms ease-out",
        "slide-up": "slide-up 200ms ease-out",
        "pulse-soft": "pulse-soft 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
