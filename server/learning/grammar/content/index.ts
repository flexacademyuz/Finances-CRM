/** Every grammar topic shipped with the app, all levels. */
import type { GrammarTopicContent } from "@shared/grammar/types";
import { A1_PILOT_TOPICS } from "./a1-pilot";

export const GRAMMAR_TOPICS: GrammarTopicContent[] = [...A1_PILOT_TOPICS];

/** Bump after editing content so the boot import re-syncs (staff edits are kept). */
export const GRAMMAR_CONTENT_VERSION = 1;
