/** Pure functions for overlap and subsumption detection.
 *
 * These operate on the scored paper data from Phase 2 and OpenAlex
 * reference lists to build a containment graph between review papers
 * and individual studies in the same evidence slot. */

import type {
  SubsumptionRelation,
  PaperOverlapStatus,
  EvidenceOverlapRequest,
} from "@/app/lib/types/evidence";
import { REVIEW_STUDY_TYPES } from "@/app/lib/types/evidence";

type OverlapPaper = EvidenceOverlapRequest["papers"][number];

/** Partition papers into reviews (meta-analysis, systematic-review) and studies. */
export function partitionPapers(papers: OverlapPaper[]): {
  reviews: OverlapPaper[];
  studies: OverlapPaper[];
} {
  const reviews: OverlapPaper[] = [];
  const studies: OverlapPaper[] = [];
  for (const p of papers) {
    const studyType = p.reliability?.studyType;
    if (studyType && (REVIEW_STUDY_TYPES as readonly string[]).includes(studyType)) {
      reviews.push(p);
    } else {
      studies.push(p);
    }
  }
  return { reviews, studies };
}

/** Build subsumption relations from OpenAlex reference lists.
 *
 *  @param reviews — review papers from the result set
 *  @param studies — individual study papers from the result set
 *  @param refsMap — map of review openAlexId → list of referenced work IDs
 *  @returns relations where a study appears in a review's reference list */
export function buildRelationsFromRefs(
  reviews: OverlapPaper[],
  studies: OverlapPaper[],
  refsMap: Map<string, string[]>,
): SubsumptionRelation[] {
  const relations: SubsumptionRelation[] = [];
  const studyIdSet = new Set(studies.map((s) => s.openAlexId));

  for (const review of reviews) {
    const refs = refsMap.get(review.openAlexId);
    if (!refs) continue;

    // OpenAlex referenced_works are full URLs; study IDs may also be full URLs
    const refsSet = new Set(refs);

    for (const studyId of studyIdSet) {
      if (refsSet.has(studyId)) {
        relations.push({
          reviewId: review.openAlexId,
          studyId,
          detectionMethod: "citation-graph",
          confidence: 1.0,
        });
      }
    }
  }
  return relations;
}

/** Identify study-review pairs not yet matched by citation graph,
 *  where the study was published in the same year or before the review
 *  and both have abstracts (so LLM can compare them). */
export function findUnmatchedPairs(
  reviews: OverlapPaper[],
  studies: OverlapPaper[],
  existingRelations: SubsumptionRelation[],
): Array<{ review: OverlapPaper; study: OverlapPaper }> {
  const matchedPairs = new Set(
    existingRelations.map((r) => `${r.reviewId}::${r.studyId}`),
  );

  const pairs: Array<{ review: OverlapPaper; study: OverlapPaper }> = [];
  for (const review of reviews) {
    for (const study of studies) {
      const pairKey = `${review.openAlexId}::${study.openAlexId}`;
      if (matchedPairs.has(pairKey)) continue;

      // Only consider LLM fallback if study predates or matches review year
      if (study.year != null && review.year != null && study.year > review.year) {
        continue;
      }

      // Both must have abstracts for LLM comparison
      if (!study.abstract || !review.abstract) continue;

      pairs.push({ review, study });
    }
  }
  return pairs;
}

/** Derive per-paper overlap status from the full set of relations.
 *
 *  - Papers with review study types get "review"
 *  - Studies that appear in any relation as the studyId get "subsumed"
 *  - Remaining studies get "novel"
 *  - If there are no reviews at all, every paper gets "no-reviews" */
export function derivePaperStatus(
  papers: OverlapPaper[],
  relations: SubsumptionRelation[],
): Record<string, PaperOverlapStatus> {
  const { reviews } = partitionPapers(papers);

  if (reviews.length === 0) {
    const status: Record<string, PaperOverlapStatus> = {};
    for (const p of papers) {
      status[p.openAlexId] = "no-reviews";
    }
    return status;
  }

  const reviewIds = new Set(reviews.map((r) => r.openAlexId));
  const subsumedIds = new Set(relations.map((r) => r.studyId));

  const status: Record<string, PaperOverlapStatus> = {};
  for (const p of papers) {
    if (reviewIds.has(p.openAlexId)) {
      status[p.openAlexId] = "review";
    } else if (subsumedIds.has(p.openAlexId)) {
      status[p.openAlexId] = "subsumed";
    } else {
      status[p.openAlexId] = "novel";
    }
  }
  return status;
}
