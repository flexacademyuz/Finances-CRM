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
