import type { Config } from "tailwindcss";

/**
 * Colors are driven by Telegram theme params exposed as CSS variables
 * (see client/src/lib/telegram.ts). This keeps the Mini App visually
 * consistent with the user's Telegram light/dark theme.
 */
export default {
  content: ["./client/index.html", "./client/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        tg: {
          bg: "var(--tg-bg)",
          "secondary-bg": "var(--tg-secondary-bg)",
          text: "var(--tg-text)",
          hint: "var(--tg-hint)",
          link: "var(--tg-link)",
          button: "var(--tg-button)",
          "button-text": "var(--tg-button-text)",
        },
        status: {
          paid: "#16a34a",
          awaiting: "#d97706",
          overdue: "#dc2626",
        },
      },
      borderRadius: {
        card: "14px",
      },
    },
  },
  plugins: [],
} satisfies Config;
