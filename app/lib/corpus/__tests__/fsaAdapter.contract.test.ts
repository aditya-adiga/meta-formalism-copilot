/** Runs the shared CorpusFS contract against the FSA adapter over a fake
 *  FileSystemDirectoryHandle (DD-009 S2). jsdom has no real FSA, so the adapter's
 *  success path cannot run here against a real folder — the fake handle holds the
 *  adapter to the SAME contract as the in-memory fake and OPFS (substitutability).
 *  The real-folder flow is an out-of-CI smoke (docs/spikes/corpus-fsa-smoke.md). */

import { defineCorpusFsContract } from "./corpusFsContract";
import { createFsaCorpusFs } from "../fsaAdapter";
import { makeFakeFsaHandle } from "./fakeFsaHandle";

defineCorpusFsContract("fsa adapter (fake handle)", () => createFsaCorpusFs(makeFakeFsaHandle()));
