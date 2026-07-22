/**
 * Thin wrapper over the Telegram WebApp SDK (loaded from telegram-web-app.js).
 * Exposes initData for auth, applies the theme to CSS variables, and provides
 * haptic/back-button helpers. Falls back gracefully when opened outside
 * Telegram (e.g. a browser during development).
 */

type ThemeParams = Record<string, string>;

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { user?: { id: number; first_name?: string; language_code?: string } };
  colorScheme: "light" | "dark";
  themeParams: ThemeParams;
  ready(): void;
  expand(): void;
  onEvent(event: string, cb: () => void): void;
  HapticFeedback?: {
    impactOccurred(style: string): void;
    notificationOccurred(type: string): void;
  };
  BackButton?: { show(): void; hide(): void; onClick(cb: () => void): void };
  MainButton?: unknown;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export const tg = (): TelegramWebApp | undefined => window.Telegram?.WebApp;

/**
 * The V2 design system uses a fixed indigo brand palette rather than Telegram's
 * per-client theme colors, so we only mirror the light/dark *scheme* onto the
 * root (our tokens in index.css handle the actual colors).
 */
function applyTheme() {
  const scheme = tg()?.colorScheme;
  if (scheme) document.documentElement.dataset.theme = scheme;
}

export function initTelegram() {
  const app = tg();
  if (app) {
    app.ready();
    app.expand();
    applyTheme();
    app.onEvent("themeChanged", applyTheme);
  }
}

/** Raw initData string sent to the API for hash verification. */
export function getInitData(): string {
  return tg()?.initData ?? "";
}

export function detectLocale(): "en" | "uz" {
  const code = tg()?.initDataUnsafe?.user?.language_code ?? navigator.language;
  return code?.startsWith("uz") ? "uz" : "en";
}

export function haptic(type: "light" | "success" | "error" = "light") {
  const h = tg()?.HapticFeedback;
  if (!h) return;
  if (type === "success") h.notificationOccurred("success");
  else if (type === "error") h.notificationOccurred("error");
  else h.impactOccurred("light");
}
