/**
 * Pure learning logic: vocabulary import normalization, spaced repetition,
 * exercise generation/grading, answer normalization and streaks.
 */
import { describe, it, expect } from "vitest";
import { buildBeginner900, DUPLICATES, ERRATA, STAGE_SIZE } from "../server/learning/content/beginner-900";
import { applyReview, EMPTY_PROGRESS, MASTERED_BOX, masteryLevel, wordStatus, BOX_INTERVALS_MS, isDue } from "@shared/learning/srs";
import {
  buildExerciseSet,
  generateCloze,
  generateMatching,
  generateQuestion,
  gradeAnswer,
  pickDistractors,
  sameSentence,
  sentenceWords,
  seededRng,
  toPublic,
  type VocabLite,
} from "@shared/learning/exercises";
import { answerMatches, displayWord, exampleFitsWord, meaningsOverlap, normalizeAnswer, senses } from "@shared/learning/text";
import { BASE_EXERCISE_TYPES, EXERCISE_TYPES, isLearningLevel, levelLabel, levelRank, resolveVocabSettings } from "@shared/learning/types";
import { EXERCISE_PROFILES, exerciseProfile, typeDeck } from "@shared/learning/difficulty";
import { buildElementaryA2, NEW_SENSES } from "../server/learning/content/elementary-a2";
import { buildPreIntermediateB1 } from "../server/learning/content/pre-intermediate-b1";
import { buildIntermediateB1Plus } from "../server/learning/content/intermediate-b1plus";
import { buildUpperIntermediateB2 } from "../server/learning/content/upper-intermediate-b2";
import { periodStart, publicName, rankRows, ratingPoints } from "@shared/leaderboard";
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

describe("elementary (A2) content", () => {
  const a2 = buildElementaryA2();
  const a1Words = new Set(items.map((i) => i.word.toLowerCase()));

  it("yields 1200 items in 12 stages of 100, all with a valid example", () => {
    expect(a2.report).toMatchObject({ items: 1200, stages: 12, droppedOverlap: [], duplicatesDropped: [], badExamples: [] });
    for (const it of a2.items) expect(exampleFitsWord(it.example, it.word), it.word).toBe(true);
  });

  it("repeats a beginner word only when it teaches a listed new meaning", () => {
    for (const it of a2.items) {
      if (a1Words.has(it.word.toLowerCase())) expect(NEW_SENSES.has(it.word.toLowerCase()), it.word).toBe(true);
    }
  });

  it("has stable, unique source refs (safe to re-import)", () => {
    expect(new Set(a2.items.map((i) => i.sourceRef)).size).toBe(1200);
    expect(buildElementaryA2().items.map((i) => i.sourceRef)).toEqual(a2.items.map((i) => i.sourceRef));
  });
});

describe("elementary additions + pre-intermediate (B1) content", () => {
  const a2 = buildElementaryA2();
  const b1 = buildPreIntermediateB1();

  it("appending 500 words kept the first 700 exactly where they were", () => {
    // v1 ended with "decorate" at position 700; v2 words start at 701 (stage 8).
    expect(a2.items[699]).toMatchObject({ word: "decorate", position: 700, stage: 7 });
    expect(a2.items[700]).toMatchObject({ position: 701, stage: 8 });
    expect(a2.items[0].sourceRef).toBe("elementary-a2#good");
  });

  it("B1 has 1200 items in 12 stages of 100 with valid examples", () => {
    expect(b1.report).toMatchObject({ items: 1200, stages: 12, droppedOverlap: [], duplicatesDropped: [], badExamples: [] });
    const perStage = new Map<number, number>();
    for (const it of b1.items) perStage.set(it.stage, (perStage.get(it.stage) ?? 0) + 1);
    expect([...perStage.values()]).toEqual(Array(12).fill(100));
    expect(new Set(b1.items.map((i) => i.sourceRef)).size).toBe(1200);
  });

  it("no word repeats across Beginner, Elementary and Pre-Intermediate", () => {
    const a1Words = new Set(items.map((i) => i.word.toLowerCase()));
    const a2Words = new Set(a2.items.map((i) => i.word.toLowerCase()));
    for (const it of b1.items) {
      const w = it.word.toLowerCase();
      expect(a1Words.has(w) || a2Words.has(w), it.word).toBe(false);
    }
    // The 500 new A2 words don't repeat the beginner list either.
    for (const it of a2.items.slice(700)) expect(a1Words.has(it.word.toLowerCase()), it.word).toBe(false);
  });

  it("every new word yields every exercise type, and each grades its own answer as correct", () => {
    for (const set of [{ items: a2.items.slice(700) , pool: a2.items }, { items: b1.items, pool: b1.items }]) {
      const lite = (i: (typeof set.pool)[number]) => ({ id: i.sourceRef, word: i.word, translation: i.translation, partOfSpeech: i.partOfSpeech, example: i.example });
      const full = set.pool.map(lite);
      let seed = 1;
      for (const it of set.items) {
        const stagePool = set.pool.filter((x) => x.stage === it.stage).map(lite);
        for (const type of BASE_EXERCISE_TYPES) {
          const ctx = { stagePool, fullPool: full, rng: seededRng(seed++) };
          const q = type === "matching" ? generateMatching([lite(it)], ctx) : generateQuestion(type, lite(it), ctx);
          expect(q, `${it.word} / ${type}`).not.toBeNull();
          expect(gradeAnswer(q!, q!.answer).correct, `${it.word} / ${type}`).toBe(true);
        }
      }
    }
  }, 60_000);
});

describe("intermediate (B1+) and upper-intermediate (B2) content", () => {
  const sets = {
    "B1+": buildIntermediateB1Plus(),
    B2: buildUpperIntermediateB2(),
  };

  it("each has 1500 items in 15 stages of 100 with valid examples", () => {
    for (const [level, set] of Object.entries(sets)) {
      expect(set.report, level).toMatchObject({ items: 1500, stages: 15, droppedOverlap: [], duplicatesDropped: [], badExamples: [] });
      const perStage = new Map<number, number>();
      for (const it of set.items) perStage.set(it.stage, (perStage.get(it.stage) ?? 0) + 1);
      expect([...perStage.values()], level).toEqual(Array(15).fill(100));
      expect(new Set(set.items.map((i) => i.sourceRef)).size, level).toBe(1500);
      for (const it of set.items) {
        expect(it.partOfSpeech, `${level} ${it.word}`).toBeTruthy();
        expect(it.phonetic, `${level} ${it.word}`).toMatch(/^\/.+\/$/);
      }
    }
  });

  it("no word repeats across all five levels", () => {
    // A1 lists two homonyms twice (stop, may); A2's first 700 words predate the rule.
    const seen = new Map<string, string>(items.map((i) => [i.word.toLowerCase(), "A1"]));
    const all: [string, { word: string }[]][] = [
      ["A2", buildElementaryA2().items.slice(700)],
      ["B1", buildPreIntermediateB1().items],
      ["B1+", sets["B1+"].items],
      ["B2", sets.B2.items],
    ];
    for (const [level, list] of all) {
      for (const it of list) {
        const w = it.word.toLowerCase();
        expect(seen.get(w), `${level} ${it.word}`).toBeUndefined();
        seen.set(w, level);
      }
    }
  });

  it("every word yields every type at its own level, and each grades its own answer as correct", () => {
    let seed = 1;
    for (const [level, set] of Object.entries(sets)) {
      const profile = exerciseProfile(level);
      const lite = (i: (typeof set.items)[number]) => ({ id: i.sourceRef, word: i.word, translation: i.translation, partOfSpeech: i.partOfSpeech, example: i.example });
      const byStage = new Map<number, VocabLite[]>();
      for (const it of set.items) byStage.set(it.stage, [...(byStage.get(it.stage) ?? []), lite(it)]);
      let wordOrders = 0;
      for (const it of set.items) {
        for (const type of EXERCISE_TYPES) {
          // The stage plus its neighbour is plenty of distractors and keeps this test fast.
          const near = [...byStage.get(it.stage)!, ...(byStage.get(it.stage + 1) ?? byStage.get(it.stage - 1)!)];
          const ctx = { stagePool: byStage.get(it.stage)!, fullPool: near, rng: seededRng(seed++), profile };
          const q = generateQuestion(type, lite(it), ctx);
          if (type === "word_order" && !q) continue; // only sentences of 4…max words
          if (type === "word_order") wordOrders++;
          expect(q, `${level} ${it.word} / ${type}`).not.toBeNull();
          expect(gradeAnswer(q!, q!.answer).correct, `${level} ${it.word} / ${type}`).toBe(true);
        }
      }
      // Most example sentences are short enough to build.
      expect(wordOrders, level).toBeGreaterThan(1200);
    }
  }, 120_000);
});

describe("exercise difficulty by level", () => {
  const b2 = buildUpperIntermediateB2().items.map((i) => ({ id: i.sourceRef, word: i.word, translation: i.translation, partOfSpeech: i.partOfSpeech, example: i.example }));
  const stage = b2.slice(0, 100);
  const ctxAt = (level: string, seed = 1) => ({ stagePool: stage, fullPool: b2, rng: seededRng(seed), profile: exerciseProfile(level) });

  it("maps levels to tiers; Beginner keeps the original eight types, once each", () => {
    expect(exerciseProfile("A1")).toBe(EXERCISE_PROFILES[1]);
    expect(exerciseProfile(null)).toBe(EXERCISE_PROFILES[1]);
    expect(exerciseProfile("B1+").tier).toBe(4);
    expect(exerciseProfile("C1").tier).toBe(5);
    expect(typeDeck(EXERCISE_PROFILES[1])).toEqual([...BASE_EXERCISE_TYPES]);
    const b2deck = typeDeck(EXERCISE_PROFILES[5]);
    expect(b2deck).not.toContain("en_uz");
    expect(b2deck).not.toContain("recognition");
    expect(b2deck.filter((t) => t === "gap").length).toBeGreaterThan(b2deck.filter((t) => t === "meaning").length);
  });

  it("higher levels get more options and same-part-of-speech wrong options", () => {
    const target = stage.find((v) => v.partOfSpeech === "adj")!;
    for (let seed = 1; seed <= 20; seed++) {
      const a1 = generateQuestion("uz_en", target, ctxAt("A1", seed))!;
      const top = generateQuestion("uz_en", target, ctxAt("B2", seed))!;
      expect(a1.options).toHaveLength(4);
      expect(top.options).toHaveLength(6);
      expect(generateQuestion("recognition", target, ctxAt("B2", seed))!.options).toHaveLength(8);
      // All wrong options share the target's part of speech (the stage has plenty).
      const posOf = new Map(b2.map((v) => [v.word.toLowerCase(), v.partOfSpeech]));
      for (const o of top.options!) expect(posOf.get(o.toLowerCase())).toBe("adj");
    }
  });

  it("typing hints shrink and meaning hints hide as the level rises", () => {
    const target = stage.find((v) => v.word === "meticulous")!;
    expect(generateQuestion("gap", target, ctxAt("A1"))!.hint).toEqual({ first: "m", length: 10 });
    const mid = generateQuestion("gap", target, ctxAt("B1+"))!;
    expect(mid.hint).toEqual({ length: 10 });
    expect(mid.hintOnDemand).toBe(true);
    const top = generateQuestion("gap", target, ctxAt("B2"))!;
    expect(top.hint).toBeUndefined();
    expect(generateQuestion("spelling", target, ctxAt("B2"))!.hint).toEqual({ first: "m" });
    expect(generateQuestion("sentence", target, ctxAt("A1"))!.hintOnDemand).toBeUndefined();
  });

  it("word order: shuffled tiles of the example, graded word by word", () => {
    expect(sentenceWords("She is {meticulous} about checking every detail.")).toEqual({
      words: ["she", "is", "meticulous", "about", "checking", "every", "detail"],
      suffix: ".",
    });
    expect(sentenceWords("I'm {fed up} with this rain.").words[0]).toBe("I'm");
    const target = stage.find((v) => v.word === "meticulous")!;
    const q = generateQuestion("word_order", target, ctxAt("B2"))!;
    expect([...q.tiles!].sort()).toEqual(sentenceWords(target.example).words.sort());
    expect(q.tiles!.join(" ")).not.toBe(q.answer);
    expect(gradeAnswer(q, "She is METICULOUS about checking every detail.").correct).toBe(true);
    expect(gradeAnswer(q, "is she meticulous about checking every detail").correct).toBe(false);
    expect(gradeAnswer(q, 3).correct).toBe(false);
    expect(gradeAnswer(q, q.answer).correctAnswer).toBe("she is meticulous about checking every detail.");
    expect(sameSentence("a b", "a b c")).toBe(false);
    // Off for Beginner.
    expect(generateQuestion("word_order", target, ctxAt("A1"))).toBeNull();
  });

  it("cloze: sentences with gaps and a bank with extra words, graded per gap", () => {
    expect(generateCloze(stage.slice(0, 5), ctxAt("A2"))).toBeNull();
    const q = generateCloze(stage.slice(0, 5), ctxAt("B2"))!;
    expect(q.left).toHaveLength(5);
    expect(q.right).toHaveLength(7);
    expect(q.hints).toHaveLength(5);
    expect(new Set(q.right).size).toBe(7);
    for (const s of q.left!) expect(s).toContain("___");
    const key = q.answer as number[];
    expect(new Set(key).size).toBe(5);
    expect(gradeAnswer(q, key)).toMatchObject({ correct: true });
    const g = gradeAnswer(q, [key[1], key[0], ...key.slice(2)]);
    expect(g.correct).toBe(false);
    expect(g.perItem.filter((p) => p.correct)).toHaveLength(3);
    const pub = toPublic(q, 0) as Record<string, unknown>;
    expect(pub.answer).toBeUndefined();
  });

  it("a Beginner set is unchanged; an Upper-Intermediate set leans on producing words", () => {
    const counts = new Map<string, number>();
    for (let seed = 1; seed <= 20; seed++) {
      for (const q of buildExerciseSet({ targets: stage.slice(0, 30), ctx: ctxAt("B2", seed), count: 10 })) {
        counts.set(q.type, (counts.get(q.type) ?? 0) + 1);
      }
    }
    expect(counts.get("en_uz")).toBeUndefined();
    expect(counts.get("recognition")).toBeUndefined();
    expect(counts.get("cloze")).toBeGreaterThan(0);
    expect(counts.get("word_order")).toBeGreaterThan(0);
    const typed = (counts.get("gap") ?? 0) + (counts.get("spelling") ?? 0);
    expect(typed).toBeGreaterThan((counts.get("meaning") ?? 0) + (counts.get("uz_en") ?? 0));
  });
});

describe("course levels", () => {
  it("labels levels in both languages", () => {
    expect(levelLabel("A1")).toBe("Beginner · A1");
    expect(levelLabel("A2", "uz")).toBe("Elementar · A2");
    expect(levelLabel("B1")).toBe("Pre-Intermediate · B1");
    expect(levelLabel("B1+")).toBe("Intermediate · B1+");
    expect(levelRank("B1")).toBeLessThan(levelRank("B1+"));
    expect(levelLabel(null)).toBe("");
    expect(levelRank("A1")).toBeLessThan(levelRank("A2"));
    expect(isLearningLevel("B1")).toBe(true);
    expect(isLearningLevel("Z9")).toBe(false);
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
    for (const type of BASE_EXERCISE_TYPES) {
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

describe("leaderboard rules", () => {
  it("turns activity into rating points", () => {
    expect(ratingPoints({ xp: 257, present: 3, partial: 1, scorePercentSum: 175, scoreCount: 2 })).toEqual({
      practice: 25,
      attendance: 35,
      results: 88,
      total: 148,
    });
    expect(ratingPoints({ xp: 0, present: 0, partial: 0, scorePercentSum: 0, scoreCount: 0 }).total).toBe(0);
  });

  it("periods start on Monday / the 1st (Tashkent dates)", () => {
    expect(periodStart("week", "2026-10-01")).toBe("2026-09-28"); // Thursday → Monday
    expect(periodStart("week", "2026-09-28")).toBe("2026-09-28"); // Monday itself
    expect(periodStart("week", "2026-10-04")).toBe("2026-09-28"); // Sunday
    expect(periodStart("month", "2026-10-17")).toBe("2026-10-01");
    expect(periodStart("all", "2026-10-17")).toBeNull();
  });

  it("ties share a rank (1, 2, 2, 4) and list alphabetically", () => {
    const r = rankRows([
      { name: "Zafar", total: 50 },
      { name: "Aziza", total: 80 },
      { name: "Bobur", total: 50 },
      { name: "Dilnoza", total: 10 },
    ]);
    expect(r.map((x) => `${x.rank}:${x.name}`)).toEqual(["1:Aziza", "2:Bobur", "2:Zafar", "4:Dilnoza"]);
  });

  it("shows other students by surname + initial", () => {
    expect(publicName("Rahimova Aziza Karimovna")).toBe("Rahimova A.");
    expect(publicName("Ali")).toBe("Ali");
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
