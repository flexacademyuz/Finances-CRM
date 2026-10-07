/** Every grammar topic shipped with the app, all levels. */
import type { GrammarTopicContent } from "@shared/grammar/types";
import { A1_PILOT_TOPICS } from "./a1-pilot";
import { A1_PART2_TOPICS } from "./a1-part2";
import { A1_PART3_TOPICS } from "./a1-part3";
import { A1_PART4_TOPICS } from "./a1-part4";
import { A2_PART1_TOPICS } from "./a2-part1";
import { A2_PART2_TOPICS } from "./a2-part2";
import { A2_PART3_TOPICS } from "./a2-part3";
import { A2_PART4_TOPICS } from "./a2-part4";

export const GRAMMAR_TOPICS: GrammarTopicContent[] = [
  ...A1_PILOT_TOPICS,
  ...A1_PART2_TOPICS,
  ...A1_PART3_TOPICS,
  ...A1_PART4_TOPICS,
  ...A2_PART1_TOPICS,
  ...A2_PART2_TOPICS,
  ...A2_PART3_TOPICS,
  ...A2_PART4_TOPICS,
];

/** Bump after editing content so the boot import re-syncs (staff edits are kept). */
export const GRAMMAR_CONTENT_VERSION = 2;
