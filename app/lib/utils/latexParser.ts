import type { PropositionKind, PropositionNode } from "@/app/lib/types/decomposition";

/**
 * Map of LaTeX environment names to PropositionKind.
 * "proof" is handled specially (associated with preceding node).
 */
const ENV_TO_KIND: Record<string, PropositionKind> = {
  definition: "definition",
  defn: "definition",
  deftn: "definition",
  lemma: "lemma",
  lem: "lemma",
  theorem: "theorem",
  thm: "theorem",
  proposition: "proposition",
  prop: "proposition",
  corollary: "corollary",
  cor: "corollary",
  axiom: "axiom",
  ax: "axiom",
};

const ALL_ENV_NAMES = [...Object.keys(ENV_TO_KIND), "proof"];

/** Short prefix per kind for counter-based IDs (e.g. "thm-1"). */
const KIND_PREFIX: Record<PropositionKind, string> = {
  definition: "def",
  lemma: "lem",
  theorem: "thm",
  proposition: "prop",
  corollary: "cor",
  axiom: "ax",
};

/** Human-readable label prefix per kind. */
const KIND_LABEL: Record<PropositionKind, string> = {
  definition: "Definition",
  lemma: "Lemma",
  theorem: "Theorem",
  proposition: "Proposition",
  corollary: "Corollary",
  axiom: "Axiom",
};

type RawBlock = {
  envName: string;
  optionalTitle: string;
  body: string;
  /** Character offset of `\begin{...}` in the source. */
  startOffset: number;
};

/**
 * Returns true if the text contains 2+ recognized LaTeX structural environments.
 * Conservative threshold so partial/informal LaTeX falls through to LLM.
 */
export function isLatexStructured(text: string): boolean {
  const envPattern = new RegExp(
    `\\\\begin\\{(?:${ALL_ENV_NAMES.join("|")})\\}`,
    "g",
  );
  const matches = text.match(envPattern);
  return (matches?.length ?? 0) >= 2;
}

/**
 * Extract all top-level recognized environment blocks from LaTeX source.
 * Handles nesting by tracking depth for each `\begin`/`\end` of the same env name.
 */
function extractBlocks(text: string): RawBlock[] {
  const blocks: RawBlock[] = [];

  // Build a regex that matches \begin{envName} or \end{envName} for recognized envs
  const envAlternation = ALL_ENV_NAMES.join("|");
  const scanner = new RegExp(
    `\\\\(begin|end)\\{(${envAlternation})\\}(\\[([^\\]]*)\\])?`,
    "g",
  );

  // Stack of open environments: { envName, title, bodyStart, startOffset }
  const stack: { envName: string; title: string; bodyStart: number; startOffset: number }[] = [];

  let match: RegExpExecArray | null;
  while ((match = scanner.exec(text)) !== null) {
    const directive = match[1]; // "begin" or "end"
    const envName = match[2];

    if (directive === "begin") {
      const title = match[4] ?? "";
      const bodyStart = match.index + match[0].length;
      stack.push({ envName, title, bodyStart, startOffset: match.index });
    } else {
      // directive === "end"
      // Pop the most recent matching open env
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].envName === envName) {
          const opened = stack.splice(i, 1)[0];
          // Only emit top-level blocks (nothing left on the stack for this env type)
          // Actually, emit all blocks — nesting is rare and we want inner envs too
          blocks.push({
            envName: opened.envName,
            optionalTitle: opened.title,
            body: text.slice(opened.bodyStart, match.index),
            startOffset: opened.startOffset,
          });
          break;
        }
      }
    }
  }

  // Sort by document order
  blocks.sort((a, b) => a.startOffset - b.startOffset);
  return blocks;
}

/** Slugify a LaTeX label key into a valid ID (e.g. "thm:main-result" → "thm-main-result"). */
function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Extract \label{key} from a block body. Returns the first label found, or null. */
function extractLabel(body: string): string | null {
  const m = body.match(/\\label\{([^}]+)\}/);
  return m ? m[1] : null;
}

/** Find all \ref{key} and \eqref{key} references in text. */
function extractRefs(text: string): string[] {
  const refs: string[] = [];
  const pattern = /\\(?:ref|eqref)\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    refs.push(m[1]);
  }
  return refs;
}

/**
 * Parse LaTeX source into PropositionNode[].
 *
 * Extracts theorem-like environments, associates proofs with preceding nodes,
 * resolves \ref/\eqref cross-references into dependsOn edges.
 */
export function parseLatexPropositions(text: string): PropositionNode[] {
  const blocks = extractBlocks(text);

  // Per-kind counters for numbering
  const counters: Record<PropositionKind, number> = {
    definition: 0,
    lemma: 0,
    theorem: 0,
    proposition: 0,
    corollary: 0,
    axiom: 0,
  };

  // First pass: build nodes for theorem-like environments, collect proofs separately
  const nodes: PropositionNode[] = [];
  const proofBlocks: { body: string; index: number }[] = [];
  // label → node ID mapping for cross-reference resolution
  const labelToId: Record<string, string> = {};

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    if (block.envName === "proof") {
      proofBlocks.push({ body: block.body.trim(), index: i });
      continue;
    }

    const kind = ENV_TO_KIND[block.envName];
    if (!kind) continue; // shouldn't happen given our env list, but be safe

    counters[kind]++;
    const num = counters[kind];

    const labelKey = extractLabel(block.body);
    const id = labelKey ? slugify(labelKey) : `${KIND_PREFIX[kind]}-${num}`;

    const titleSuffix = block.optionalTitle ? ` (${block.optionalTitle})` : "";
    const label = `${KIND_LABEL[kind]} ${num}${titleSuffix}`;

    // Strip \label{...} from statement text
    const statement = block.body.replace(/\\label\{[^}]+\}\s*/g, "").trim();

    if (labelKey) {
      labelToId[labelKey] = id;
    }

    nodes.push({
      id,
      label,
      kind,
      statement,
      proofText: "",
      dependsOn: [],
      semiformalProof: "",
      leanCode: "",
      verificationStatus: "unverified",
      verificationErrors: "",
    });
  }

  // Second pass: associate proof blocks with the immediately preceding theorem-like node
  // Strategy: for each proof block, find the last theorem-like block that appears before it
  for (const proof of proofBlocks) {
    // Find the node whose block appears immediately before this proof in document order
    let precedingNode: PropositionNode | null = null;
    for (let i = 0; i < blocks.length; i++) {
      if (i === proof.index) break;
      const block = blocks[i];
      if (block.envName !== "proof" && ENV_TO_KIND[block.envName]) {
        // Find the corresponding node
        const kind = ENV_TO_KIND[block.envName];
        const labelKey = extractLabel(block.body);
        // Reconstruct the ID to find the node
        const candidateId = labelKey ? slugify(labelKey) : null;
        const found = candidateId
          ? nodes.find((n) => n.id === candidateId)
          : null;
        // If no label, use position-based matching: count kind occurrences up to this block
        if (found) {
          precedingNode = found;
        } else {
          // Count how many blocks of this kind appear before (inclusive)
          let count = 0;
          for (let j = 0; j <= i; j++) {
            if (ENV_TO_KIND[blocks[j].envName] === kind) count++;
          }
          const fallbackId = `${KIND_PREFIX[kind!]}-${count}`;
          const fallbackNode = nodes.find((n) => n.id === fallbackId);
          if (fallbackNode) precedingNode = fallbackNode;
        }
      }
    }
    if (precedingNode) {
      precedingNode.proofText = proof.body;
    }
  }

  // Third pass: resolve \ref{} and \eqref{} → dependsOn[]
  for (const node of nodes) {
    const allText = node.statement + "\n" + node.proofText;
    const refs = extractRefs(allText);
    const deps = new Set<string>();
    for (const ref of refs) {
      const targetId = labelToId[ref];
      if (targetId && targetId !== node.id) {
        deps.add(targetId);
      }
    }
    node.dependsOn = Array.from(deps);
  }

  return nodes;
}
