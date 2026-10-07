/** Grammar content shipped with the app (server/learning/grammar/content). */
import { describe, it, expect } from "vitest";
import { GRAMMAR_TOPICS } from "../server/learning/grammar/content/index";
import { validateTopics } from "@shared/grammar/validate";
import { canonicalWords, gradeTyped } from "@shared/grammar/grade";

describe("grammar content", () => {
  it("passes every content check", () => {
    const problems = validateTopics(GRAMMAR_TOPICS);
    expect(problems, problems.join("\n")).toEqual([]);
  });

  it("has the 21 A1 (Beginner) topics in the agreed order", () => {
    const a1 = GRAMMAR_TOPICS.filter((t) => t.level === "A1").sort((a, b) => a.position - b.position);
    expect(a1.map((t) => t.slug)).toEqual([
      "a1-to-be",
      "a1-have-got",
      "a1-can",
      "a1-possessives",
      "a1-pronouns",
      "a1-there-is-are",
      "a1-present-simple",
      "a1-present-continuous",
      "a1-modals",
      "a1-infinitive-gerund",
      "a1-past-simple",
      "a1-prepositions",
      "a1-future-simple",
      "a1-question-words",
      "a1-linkers",
      "a1-present-perfect",
      "a1-plurals-countables",
      "a1-some-any",
      "a1-articles",
      "a1-adjectives-adverbs",
      "a1-adjective-degrees",
    ]);
  });

  it("has the 20 A2 (Elementary) topics in the agreed order", () => {
    const a2 = GRAMMAR_TOPICS.filter((t) => t.level === "A2").sort((a, b) => a.position - b.position);
    expect(a2.map((t) => t.slug)).toEqual([
      "a2-past-continuous",
      "a2-past-simple-vs-continuous",
      "a2-present-perfect-for-since",
      "a2-present-perfect-vs-past-simple",
      "a2-used-to",
      "a2-going-to",
      "a2-present-continuous-future",
      "a2-will-vs-going-to",
      "a2-could-able-to",
      "a2-might-may",
      "a2-quantifiers",
      "a2-too-enough",
      "a2-zero-conditional",
      "a2-first-conditional",
      "a2-reflexive-pronouns",
      "a2-passive",
      "a2-relative-clauses",
      "a2-subject-object-questions",
      "a2-so-neither",
      "a2-verb-patterns",
    ]);
  });

  it("gives each topic >= 30 build and >= 20 test items", () => {
    for (const t of GRAMMAR_TOPICS) {
      expect(t.build.length, t.slug).toBeGreaterThanOrEqual(30);
      expect(t.test.length, t.slug).toBeGreaterThanOrEqual(20);
    }
  });

  it("grades every test item's model answer as fully correct", () => {
    for (const t of GRAMMAR_TOPICS)
      for (const it of t.test) expect(gradeTyped(it, it.en).score, `${t.slug}: ${it.en}`).toBe(1);
  });

  it("never repeats a build sentence in the test pool", () => {
    for (const t of GRAMMAR_TOPICS) {
      const built = new Set(t.build.flatMap((b) => [b.en, ...(b.alt ?? [])]).map((x) => canonicalWords(x).join(" ")));
      for (const it of t.test) expect(built.has(canonicalWords(it.en).join(" ")), `${t.slug}: ${it.en}`).toBe(false);
    }
  });
});
