/**
 * Counts the time the student actually uses the app and reports it every
 * ~30 s. Time only accrues while the page is visible AND there was input in
 * the last 2 minutes (an app left open on the table doesn't count). The server
 * caps every report by real elapsed time, so this is a best-effort client.
 */
import { useEffect } from "react";
import { papi } from "../api";

const IDLE_MS = 120_000;
const FLUSH_MS = 30_000;

export function useAppTime(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let last = Date.now();
    let lastInput = Date.now();
    let pending = 0;

    const onInput = () => {
      lastInput = Date.now();
    };
    const tick = () => {
      const now = Date.now();
      if (document.visibilityState === "visible" && now - lastInput < IDLE_MS) pending += (now - last) / 1000;
      last = now;
    };
    const flush = () => {
      tick();
      const s = Math.min(60, Math.floor(pending));
      if (s < 5) return;
      pending -= s;
      papi("/learn/ping", { method: "POST", body: { seconds: s } }).catch(() => {
        /* offline or preview: drop it */
      });
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
      else {
        last = Date.now();
        lastInput = Date.now();
      }
    };

    const opts = { passive: true } as const;
    window.addEventListener("pointerdown", onInput, opts);
    window.addEventListener("keydown", onInput, opts);
    window.addEventListener("scroll", onInput, opts);
    window.addEventListener("touchmove", onInput, opts);
    document.addEventListener("visibilitychange", onVisibility);
    const timer = setInterval(flush, FLUSH_MS);
    return () => {
      flush();
      clearInterval(timer);
      window.removeEventListener("pointerdown", onInput);
      window.removeEventListener("keydown", onInput);
      window.removeEventListener("scroll", onInput);
      window.removeEventListener("touchmove", onInput);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled]);
}

/** "1 h 25 min" / "12 min" / "< 1 min" (uz: "1 soat 25 daq"). */
export function fmtDuration(seconds: number, l: "en" | "uz"): string {
  const m = Math.floor(seconds / 60);
  if (m < 1) return l === "uz" ? "< 1 daq" : "< 1 min";
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const H = l === "uz" ? "soat" : "h";
  const M = l === "uz" ? "daq" : "min";
  return h ? (mm ? `${h} ${H} ${mm} ${M}` : `${h} ${H}`) : `${mm} ${M}`;
}
