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
        dark: "#23303d",
        // Zoho Honolulu Blue — the single brand color (buttons, links, active nav).
        primary: {
          DEFAULT: "#0974b0",
          hover: "#075e8c",
          dark: "#075e8c",
          light: "#4ea3d4",
          soft: "#e6f1f8",
        },
        // Accent is a neutral slate (not a competing hue) so the blue leads.
        accent: { DEFAULT: "#6b7684", light: "#f1f3f5" },
        // Semantic states map to Zoho's other three brand hues.
        warning: { DEFAULT: "#c98a00", light: "#fdf3d7" }, // from Zoho vivid yellow, darkened for legibility
        danger: { DEFAULT: "#ce2232", light: "#fbe3e6" }, // Zoho amaranth red
        // Zoho's palette has no violet/sky, so frozen=neutral gray, discount=blue info.
        freeze: { DEFAULT: "#6b7684", light: "#eef0f2" },
        discount: { DEFAULT: "#0974b0", light: "#e6f1f8" },
        sidebar: {
          bg: "#ffffff",
          text: "#6b7684",
          icon: "#6b7684",
          active: "#0974b0",
        },
        status: {
          paid: "#219e4a", // Zoho sea green
          awaiting: "#c98a00",
          overdue: "#ce2232",
          frozen: "#6b7684",
          discount: "#0974b0",
          notdue: "#6b7684",
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
