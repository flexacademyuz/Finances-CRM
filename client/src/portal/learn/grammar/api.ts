/** Grammar (sentence building) API client for the student Mini App. Grading is server-side only. */
import { useQuery } from "@tanstack/react-query";
import type {
  GrammarBuildResult,
  GrammarBuildRound,
  GrammarTestResult,
  GrammarTestRound,
  GrammarTopicDetail,
  GrammarTopicsResponse,
} from "@shared/grammar/types";
import type { ApiError } from "../../../lib/api";
import { lapi } from "../api";

export const gKeys = {
  all: ["portal", "learn", "grammar"] as const,
  topics: ["portal", "learn", "grammar", "topics"] as const,
  topic: (slug: string) => ["portal", "learn", "grammar", "topic", slug] as const,
};

export type GrammarTopicRow = GrammarTopicsResponse["topics"][number];

export function useGrammarTopics() {
  return useQuery({
    queryKey: gKeys.topics,
    queryFn: () => lapi<GrammarTopicsResponse>("/grammar/topics"),
    staleTime: 15_000,
    retry: (n, e) => n < 2 && !((e as ApiError).status >= 400 && (e as ApiError).status < 500),
  });
}

export function useGrammarTopic(slug: string) {
  return useQuery({
    queryKey: gKeys.topic(slug),
    queryFn: () => lapi<GrammarTopicDetail>(`/grammar/topics/${encodeURIComponent(slug)}`),
    enabled: !!slug,
    staleTime: 10_000,
    retry: (n, e) => n < 2 && !((e as ApiError).status >= 400 && (e as ApiError).status < 500),
  });
}

export const startBuild = (slug: string) => lapi<GrammarBuildRound>(`/grammar/topics/${encodeURIComponent(slug)}/build`, { method: "POST" });
export const answerBuild = (sessionId: string, index: number, tokens: string[]) =>
  lapi<GrammarBuildResult>(`/grammar/build/${sessionId}/answer`, { method: "POST", body: { index, tokens } });
export const startTest = (slug: string) => lapi<GrammarTestRound>(`/grammar/topics/${encodeURIComponent(slug)}/test`, { method: "POST" });
export const finishTest = (sessionId: string, answers: string[]) =>
  lapi<GrammarTestResult>(`/grammar/test/${sessionId}/finish`, { method: "POST", body: { answers } });

/** "No grammar for you yet" (no level / nothing published) rather than a real failure. */
export function isComingSoon(e: unknown): boolean {
  const err = e as ApiError | null;
  return !!err && (err.status === 404 || err.code === "no_content" || err.code === "no_level");
}

/**
 * Display form of a built sentence: first letter capitalised, a full stop
 * added (or "?" when the Uzbek prompt is a question). Display only — the
 * server grades the raw tokens.
 */
export function displaySentence(tokens: string[], uz: string): string {
  const s = tokens.join(" ").trim();
  if (!s) return s;
  const cap = s.charAt(0).toUpperCase() + s.slice(1);
  if (/[.?!]$/.test(cap)) return cap;
  return cap + (uz.trim().endsWith("?") ? "?" : ".");
}

/** 8.5 → "8.5", 8 → "8". */
export const fmtScore = (n: number) => (Math.round(n * 10) / 10).toString();
