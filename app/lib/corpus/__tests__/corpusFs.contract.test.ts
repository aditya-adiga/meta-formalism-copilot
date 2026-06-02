/** Runs the shared CorpusFS contract against the in-memory fake (DD-009 S1).
 *  The OPFS adapter is held to the same suite out-of-CI (Playwright); jsdom has
 *  no OPFS so the real adapter cannot run here. */

import { defineCorpusFsContract } from "./corpusFsContract";
import { createInMemoryCorpusFs } from "./inMemoryCorpusFs";

defineCorpusFsContract("in-memory fake", () => createInMemoryCorpusFs());
