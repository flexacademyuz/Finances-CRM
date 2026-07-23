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
          DEFAULT: "#4F46E5",
          light: "#818CF8",
          dark: "#3730A3",
        },
        accent: { DEFAULT: "#10B981", light: "#D1FAE5" },
        warning: { DEFAULT: "#F59E0B", light: "#FEF3C7" },
        danger: { DEFAULT: "#F43F5E", light: "#FFE4E6" },
        freeze: { DEFAULT: "#0EA5E9", light: "#E0F2FE" },
        discount: { DEFAULT: "#8B5CF6", light: "#EDE9FE" },
        sidebar: {
          bg: "#1E1B4B",
          text: "#C7D2FE",
          active: "#4F46E5",
        },
        status: {
          paid: "#16a34a",
          awaiting: "#d97706",
          overdue: "#e11d48",
          frozen: "#0ea5e9",
          discount: "#8b5cf6",
          notdue: "#64748b",
        },
      },
      borderRadius: {
        card: "12px",
        btn: "8px",
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
