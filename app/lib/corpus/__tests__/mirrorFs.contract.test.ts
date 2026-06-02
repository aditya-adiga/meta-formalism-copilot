/** Runs the shared CorpusFS contract against the mirror composite over two
 *  in-memory fakes (DD-009 S2, test-strategy G20). A mirror IS a CorpusFS, so the
 *  store can bind to it through the existing seam — this proves substitutability
 *  (the contract's sorted-readdir + null-on-missing postconditions hold under the
 *  union/fallthrough read path). The contract only writes/reads through the
 *  composite, so the async-mirror enqueue resolves on real timers here. */

import { defineCorpusFsContract } from "./corpusFsContract";
import { createMirrorCorpusFs } from "../mirrorFs";
import { createInMemoryCorpusFs } from "./inMemoryCorpusFs";

defineCorpusFsContract("mirror (two in-memory)", () =>
  createMirrorCorpusFs({
    primary: createInMemoryCorpusFs(),
    mirror: createInMemoryCorpusFs(),
    // Zero backoff so the contract's mirror writes settle promptly on real timers.
    backoffMs: [0, 0, 0],
  }),
);
