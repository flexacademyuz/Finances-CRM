/** Grammar sentence-building grading rules (shared/grammar/grade.ts). */
import { describe, it, expect } from "vitest";
import { bubblesFor, gradeBuild, gradeTyped, sentenceWords, canonicalWords } from "@shared/grammar/grade";
import { validateTopic } from "@shared/grammar/validate";

const item = { uz: "Burchakda do'kon bor.", en: "There is a shop on the corner.", traps: ["are"] };

describe("bubbles", () => {
  it("are the sentence words plus traps, first word lower-cased, shuffled stably", () => {
    const b = bubblesFor(item, 42);
    expect([...b].sort()).toEqual(["a", "are", "corner", "is", "on", "shop", "the", "there"].sort());
    expect(bubblesFor(item, 42)).toEqual(b);
  });
  it("keep I and names capitalised", () => {
    expect(bubblesFor({ en: "I am a student.", traps: ["is"] }, 1)).toContain("I");
    expect(bubblesFor({ en: "Ali is my brother.", traps: ["are"] }, 1)).toContain("Ali");
  });
  it("drop end punctuation but keep contractions whole", () => {
    expect(sentenceWords("She isn't at home.")).toEqual(["She", "isn't", "at", "home"]);
  });
});

describe("gradeBuild", () => {
  it("accepts the model order, ignoring case", () => {
    expect(gradeBuild(item, ["there", "is", "a", "shop", "on", "the", "corner"])).toBe(true);
  });
  it("rejects a trap or wrong order", () => {
    expect(gradeBuild(item, ["there", "are", "a", "shop", "on", "the", "corner"])).toBe(false);
    expect(gradeBuild(item, ["is", "there", "a", "shop", "on", "the", "corner"])).toBe(false);
  });
  it("accepts alternatives", () => {
    const it2 = { en: "I went to school yesterday.", alt: ["Yesterday I went to school."], traps: ["go"] };
    expect(gradeBuild(it2, ["yesterday", "I", "went", "to", "school"])).toBe(true);
  });
});

describe("gradeTyped", () => {
  const he = { en: "He is a teacher.", alt: ["He's a teacher."] };
  it("ignores capitals, punctuation, spaces and contractions", () => {
    expect(gradeTyped(he, "he is a teacher").score).toBe(1);
    expect(gradeTyped(he, "  He's   a teacher!! ").score).toBe(1);
    expect(gradeTyped({ en: "She doesn't like tea." }, "she does not like tea").score).toBe(1);
    expect(gradeTyped({ en: "I can't swim." }, "I cannot swim").score).toBe(1);
    expect(gradeTyped({ en: "I'm from Tashkent." }, "I am from tashkent").score).toBe(1);
  });
  it("gives half credit for a small slip in a content word", () => {
    expect(gradeTyped(he, "He is a techer.").score).toBe(0.5);
  });
  it("never forgives a wrong grammar word", () => {
    expect(gradeTyped({ en: "She has a cat." }, "She have a cat.").score).toBe(0);
    expect(gradeTyped(he, "He are a teacher.").score).toBe(0);
    expect(gradeTyped(he, "He is an teacher.").score).toBe(0);
  });
  it("rejects missing words, extra words and wrong order", () => {
    expect(gradeTyped(he, "He a teacher.").score).toBe(0);
    expect(gradeTyped(he, "Is he a teacher?").score).toBe(0);
    expect(gradeTyped(he, "").score).toBe(0);
  });
  it("reads 's got as has got, so 'is got' stays wrong", () => {
    const g = { en: "She has got a cat.", alt: ["She's got a cat."] };
    expect(gradeTyped(g, "She's got a cat").score).toBe(1);
    expect(gradeTyped(g, "she has got a cat").score).toBe(1);
    expect(gradeTyped(g, "She is got a cat.").score).toBe(0);
  });
  it("normalises curly apostrophes", () => {
    expect(canonicalWords("It’s here")).toEqual(["it", "is", "here"]);
  });
});

describe("validateTopic", () => {
  it("flags a trap that is already in the sentence", () => {
    const t = {
      slug: "x", level: "A1", position: 1, title: { en: "X", uz: "X" },
      explanation: { uz: "u", pattern: "p", examples: [{ en: "a", uz: "b" }, { en: "c", uz: "d" }] },
      build: [{ uz: "u", en: "There is a cat.", traps: ["is"] }], test: [],
    };
    expect(validateTopic(t).some((e) => e.includes('trap "is" is already'))).toBe(true);
  });
});
