/**
 * Pure learning logic: vocabulary import normalization, spaced repetition,
 * exercise generation/grading, answer normalization and streaks.
 */
import { describe, it, expect } from "vitest";
import { buildBeginner900, DUPLICATES, ERRATA, STAGE_SIZE } from "../server/learning/content/beginner-900";
import { applyReview, EMPTY_PROGRESS, MASTERED_BOX, masteryLevel, wordStatus, BOX_INTERVALS_MS, isDue } from "@shared/learning/srs";
import {
  buildExerciseSet,
  generateMatching,
  generateQuestion,
  gradeAnswer,
  pickDistractors,
  seededRng,
  toPublic,
  type VocabLite,
} from "@shared/learning/exercises";
import { answerMatches, displayWord, exampleFitsWord, meaningsOverlap, normalizeAnswer, senses } from "@shared/learning/text";
import { EXERCISE_TYPES, resolveVocabSettings } from "@shared/learning/types";
import { achievementsFor, currentStreak, longestStreak } from "@shared/learning/gamification";

const { items, report } = buildBeginner900();

describe("beginner-900 import normalization", () => {
  it("reports the source discrepancies instead of hiding them", () => {
    expect(report.sourceRows).toBe(899);
    expect(report.numberingGaps).toEqual([838]);
    expect(report.duplicatesDropped.map((d) => d.no)).toEqual([798, 799, 801]);
    expect(report.homonymsKept.map((h) => h.word).sort()).toEqual(["may", "stop"]);
    expect(report.missingEnrichment).toEqual([]);
  });

  it("yields 896 unique items in 9 stages of 100 (last stage 96)", () => {
    expect(items).toHaveLength(896);
    expect(report.stages).toBe(9);
    const perStage = new Map<number, number>();
    for (const it of items) perStage.set(it.stage, (perStage.get(it.stage) ?? 0) + 1);
    expect([...perStage.values()]).toEqual([100, 100, 100, 100, 100, 100, 100, 100, 96]);
    expect(items[0]).toMatchObject({ position: 1, stage: 1, word: "I" });
    expect(items[STAGE_SIZE]).toMatchObject({ position: 101, stage: 2 });
  });

  it("has no duplicate word+meaning and a stable source ref per item", () => {
    const pairs = new Set(items.map((i) => `${i.word.toLowerCase()}|${i.translation.toLowerCase()}`));
    expect(pairs.size).toBe(items.length);
    expect(new Set(items.map((i) => i.sourceRef)).size).toBe(items.length);
    for (const no of Object.keys(DUPLICATES)) expect(items.find((i) => i.sourceNo === Number(no))).toBeUndefined();
  });

  it("applies only the listed errata, and notes them", () => {
    expect(items.find((i) => i.sourceNo === 683)).toMatchObject({ word: "Price", note: ERRATA[683].note });
    expect(items.find((i) => i.sourceNo === 301)).toMatchObject({ word: "Live", translation: "yashamoq" });
    // Everything else is verbatim.
    expect(items.find((i) => i.sourceNo === 2)).toMatchObject({ word: "You", translation: "sen, siz" });
    expect(items.find((i) => i.sourceNo === 384)).toMatchObject({ word: "Afternoon", translation: "tushlik" });
  });

  it("every example sentence marks its own headword as the gap", () => {
    for (const it of items) expect(exampleFitsWord(it.example, it.word), `#${it.sourceNo} ${it.word}`).toBe(true);
  });

  it("is deterministic (same input → identical output)", () => {
    expect(buildBeginner900().items).toEqual(items);
  });
});

describe("spaced repetition", () => {
  const t0 = new Date("2026-10-01T10:00:00Z");

  it("a new word the learner knows jumps to box 2 (1 day)", () => {
    const p = applyReview(EMPTY_PROGRESS, true, t0);
    expect(p.box).toBe(2);
    expect(p.nextReviewAt!.getTime() - t0.getTime()).toBe(BOX_INTERVALS_MS[2]);
    expect(wordStatus(p)).toBe("learning");
  });

  it("a miss drops to box 1 and comes back in 10 minutes", () => {
    const known = applyReview(EMPTY_PROGRESS, true, t0);
    const missed = applyReview(known, false, new Date(t0.getTime() + 2 * 86_400_000));
    expect(missed.box).toBe(1);
    expect(missed.streak).toBe(0);
    expect(missed.incorrectCount).toBe(1);
    expect(missed.nextReviewAt!.getTime() - missed.lastReviewedAt!.getTime()).toBe(10 * 60_000);
    expect(wordStatus(missed)).toBe("need_practice");
    expect(masteryLevel(missed)).toBeLessThanOrEqual(10);
  });

  it("correct answers before the word is due don't fake long-term memory", () => {
    let p = applyReview(EMPTY_PROGRESS, true, t0); // box 2, due tomorrow
    for (let i = 1; i <= 5; i++) p = applyReview(p, true, new Date(t0.getTime() + i * 60_000));
    expect(p.box).toBe(2);
    expect(p.correctCount).toBe(6);
    expect(p.nextReviewAt!.getTime()).toBe(t0.getTime() + BOX_INTERVALS_MS[2]);
  });

  it("reaches MASTERED only through spaced, due reviews", () => {
    let now = t0.getTime();
    let p = applyReview(EMPTY_PROGRESS, true, new Date(now));
    while (p.box < MASTERED_BOX) {
      now = p.nextReviewAt!.getTime();
      expect(isDue(p, new Date(now))).toBe(true);
      p = applyReview(p, true, new Date(now));
    }
    expect(wordStatus(p)).toBe("mastered");
    expect(p.masteredAt).not.toBeNull();
    expect(now - t0.getTime()).toBeGreaterThanOrEqual(4 * 86_400_000);
  });

  it("status buckets", () => {
    expect(wordStatus(null)).toBe("new");
    expect(wordStatus({ box: 0, lastResult: null })).toBe("new");
    expect(wordStatus({ box: 5, lastResult: false })).toBe("need_practice");
    expect(wordStatus({ box: MASTERED_BOX, lastResult: true })).toBe("mastered");
  });
});

describe("text helpers", () => {
  it("normalizes typed answers reasonably", () => {
    expect(answerMatches("Apple", "apple")).toBe(true);
    expect(answerMatches("  APPLE ", "Apple")).toBe(true);
    expect(answerMatches("ice cream", "Ice-cream")).toBe(true);
    expect(answerMatches("cafe", "Café")).toBe(true);
    expect(answerMatches("goodbye", "Good bye")).toBe(true);
    expect(answerMatches("aple", "apple")).toBe(false);
    expect(answerMatches("", "apple")).toBe(false);
    expect(normalizeAnswer("T-shirt")).toBe("tshirt");
  });

  it("parses meanings and detects overlapping ones", () => {
    expect(senses("sen, siz")).toEqual(["sen", "siz"]);
    expect(senses("uy (bino)")).toEqual(["uy"]);
    expect(meaningsOverlap("gapirmoq", "gapirmoq")).toBe(true);
    expect(meaningsOverlap("qari, eski", "eski")).toBe(true);
    expect(meaningsOverlap("olma", "nok")).toBe(false);
    expect(meaningsOverlap("o‘rik", "o'rik")).toBe(true);
  });

  it("shows headwords in natural case", () => {
    expect(displayWord("Apple", "I eat an {apple} every day.")).toBe("apple");
    expect(displayWord("I", "{I} am a student.")).toBe("I");
    expect(displayWord("TV", "We watch {TV} in the evening.")).toBe("TV");
    expect(displayWord("Monday", "School starts on {Monday}.")).toBe("Monday");
    expect(displayWord("Wednesday", "{Wednesday} is in the middle of the week.")).toBe("Wednesday");
    expect(displayWord("Russia", "Moscow is in {Russia}.")).toBe("Russia");
    expect(displayWord("May", "{May} I come in?", "modal")).toBe("may");
    expect(displayWord("May", "My birthday is in {May}.", "n")).toBe("May");
  });
});

describe("exercise generation", () => {
  const all: VocabLite[] = items.map((i, k) => ({
    id: `id-${k}`,
    word: i.word,
    translation: i.translation,
    partOfSpeech: i.partOfSpeech,
    example: i.example,
  }));
  const stage1 = all.slice(0, 100);
  const ctx = (seed = 1) => ({ stagePool: stage1, fullPool: all, rng: seededRng(seed) });

  it("generates every exercise type from the same vocabulary rows", () => {
    const apple = stage1.find((v) => v.word === "Apple")!;
    for (const type of EXERCISE_TYPES) {
      const q = type === "matching" ? generateMatching([apple], ctx()) : generateQuestion(type, apple, ctx());
      expect(q, type).not.toBeNull();
      expect(q!.type).toBe(type);
    }
  });

  it("choice questions have exactly one correct option and no confusable distractors", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const target = stage1[seed * 3];
      for (const type of ["en_uz", "uz_en", "meaning", "recognition", "sentence"] as const) {
        const q = generateQuestion(type, target, ctx(seed));
        if (!q) continue;
        const opts = q.options!;
        expect(new Set(opts).size).toBe(opts.length);
        const answer = q.answer as number;
        expect(answer).toBeGreaterThanOrEqual(0);
        if (type === "en_uz" || type === "meaning") expect(opts[answer]).toBe(target.translation);
        for (const [i, o] of opts.entries()) if (i !== answer && (type === "en_uz" || type === "meaning")) expect(meaningsOverlap(o, target.translation)).toBe(false);
      }
    }
  });

  it("never offers speak as a wrong option for talk (same Uzbek meaning)", () => {
    const talk = all.find((v) => v.word === "Talk")!;
    const speak = all.find((v) => v.word === "Speak")!;
    for (let seed = 1; seed <= 50; seed++) {
      const d = pickDistractors(talk, [speak, ...all.slice(0, 20)], 3, seededRng(seed), (v) => v.id === speak.id);
      expect(d.map((x) => x.id)).not.toContain(speak.id);
    }
  });

  it("sentence gaps blank the word and give its meaning as a hint", () => {
    const go = all.find((v) => v.word === "Go")!;
    const q = generateQuestion("sentence", go, ctx())!;
    expect(q.prompt).toBe("I ___ to school every day.");
    expect(q.hintMeaning).toBe("bormoq");
    expect(q.options![q.answer as number]).toBe("go");
  });

  it("a set mixes types and never leaks answers to the client", () => {
    const set = buildExerciseSet({ targets: stage1.slice(0, 20), ctx: ctx(7), count: 10 });
    expect(set).toHaveLength(10);
    expect(new Set(set.map((q) => q.type)).size).toBeGreaterThanOrEqual(5);
    for (const [i, q] of set.entries()) {
      const pub = toPublic(q, i) as Record<string, unknown>;
      expect(pub.answer).toBeUndefined();
      expect(pub.accept).toBeUndefined();
    }
  });
});

describe("grading", () => {
  const ctx = { stagePool: [], fullPool: [] as VocabLite[], rng: seededRng(3) };
  const words: VocabLite[] = [
    { id: "a", word: "Apple", translation: "olma", partOfSpeech: "n", example: "I eat an {apple} every day." },
    { id: "b", word: "Pear", translation: "nok", partOfSpeech: "n", example: "This {pear} is sweet." },
    { id: "c", word: "Book", translation: "kitob", partOfSpeech: "n", example: "I am reading a good {book}." },
    { id: "d", word: "Speak", translation: "gapirmoq", partOfSpeech: "v", example: "Do you {speak} English?" },
    { id: "e", word: "Talk", translation: "gapirmoq", partOfSpeech: "v", example: "Can we {talk} after class?" },
  ];
  ctx.fullPool = words;

  it("choice: right index is correct, anything else wrong", () => {
    const q = generateQuestion("en_uz", words[0], { ...ctx, stagePool: words, rng: seededRng(1) })!;
    expect(gradeAnswer(q, q.answer).correct).toBe(true);
    expect(gradeAnswer(q, ((q.answer as number) + 1) % 4).correct).toBe(false);
    expect(gradeAnswer(q, "junk").correct).toBe(false);
  });

  it("spelling: case-insensitive, synonyms with the same meaning accepted", () => {
    const q = generateQuestion("spelling", words[3], ctx)!;
    expect(q.hint).toEqual({ first: "S", length: 5 });
    expect(gradeAnswer(q, "SPEAK").correct).toBe(true);
    expect(gradeAnswer(q, "talk").correct).toBe(true);
    expect(gradeAnswer(q, "spek").correct).toBe(false);
  });

  it("matching grades each pair separately", () => {
    const q = generateMatching(words.slice(0, 3), { ...ctx, stagePool: words.slice(0, 3) })!;
    const key = q.answer as number[];
    expect(gradeAnswer(q, key).correct).toBe(true);
    const swapped = [key[1], key[0], ...key.slice(2)];
    const g = gradeAnswer(q, swapped);
    expect(g.correct).toBe(false);
    expect(g.perItem.filter((p) => p.correct)).toHaveLength(q.itemIds.length - 2);
  });
});

describe("gamification & settings", () => {
  it("streak counts consecutive days and survives until the day ends", () => {
    expect(currentStreak(["2026-10-01", "2026-10-02", "2026-10-03"], "2026-10-03")).toBe(3);
    expect(currentStreak(["2026-10-01", "2026-10-02"], "2026-10-03")).toBe(2);
    expect(currentStreak(["2026-10-01"], "2026-10-03")).toBe(0);
    expect(longestStreak(["2026-09-01", "2026-09-02", "2026-09-05"])).toBe(2);
  });

  it("awards badges by thresholds", () => {
    expect(achievementsFor({ reviewed: 1, mastered: 0, streak: 0 })).toEqual(["first_steps"]);
    expect(achievementsFor({ reviewed: 120, mastered: 100, streak: 7 })).toEqual(
      expect.arrayContaining(["words_50", "words_100", "streak_3", "streak_7"]),
    );
  });

  it("settings are clamped and defaulted", () => {
    expect(resolveVocabSettings({ completionThreshold: 5, dailyNewWords: "15" })).toMatchObject({
      completionThreshold: 1,
      dailyNewWords: 15,
      dailyReviewWords: 20,
    });
  });
});
