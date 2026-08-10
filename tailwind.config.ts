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
        dark: "#1a2338",
        // Vivid blue — the lead brand color (buttons via gradient, links, active nav).
        primary: {
          DEFAULT: "#3457f5",
          hover: "#2440d4",
          dark: "#2440d4",
          light: "#7d97fb",
          soft: "#ebeffe",
        },
        // Violet — the Figma design's secondary accent (donut charts, highlights).
        violet: { DEFAULT: "#7b5cf5", soft: "#f0ecfe" },
        // Accent is a neutral slate (not a competing hue) so the brand hues lead.
        accent: { DEFAULT: "#7a8699", light: "#f1f4f9" },
        // Semantic states.
        warning: { DEFAULT: "#d18700", light: "#fdf1d6" },
        danger: { DEFAULT: "#e23744", light: "#fce4e6" },
        // Frozen = neutral gray, discount = violet accent.
        freeze: { DEFAULT: "#7a8699", light: "#eef1f6" },
        discount: { DEFAULT: "#7b5cf5", light: "#f0ecfe" },
        sidebar: {
          bg: "#ffffff",
          text: "#7a8699",
          icon: "#7a8699",
          active: "#3457f5",
        },
        status: {
          paid: "#12b76a",
          awaiting: "#d18700",
          overdue: "#e23744",
          frozen: "#7a8699",
          discount: "#7b5cf5",
          notdue: "#7a8699",
        },
      },
      backgroundImage: {
        brand: "var(--brand-gradient)",
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "SF Mono", "Menlo", "Consolas", "monospace"],
      },
      borderRadius: {
        card: "16px",
        btn: "10px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,0.04), 0 4px 16px rgba(16,24,40,0.05)",
        "card-hover": "0 6px 24px rgba(16,24,40,0.10), 0 2px 6px rgba(16,24,40,0.05)",
        brand: "0 8px 24px rgba(52,87,245,0.28)",
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
