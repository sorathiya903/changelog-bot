import type {
  WhyCounterfactualRole,
  WhyExtractionItem,
  WhyExtractionResult,
  WhySelectionDiagnostic,
} from '@/types/why.js';
import { JEV_EVALUATION_THRESHOLDS } from '@/constants/jev.js';
import { combinedWhyCandidateProbability } from '@/utils/why-candidate-probability.js';

export type { WhyCounterfactualRole };

// Array#indexOf uses this sentinel when generated text has no source candidate.
const SOURCE_CANDIDATE_NOT_FOUND_INDEX = -1;

/** One labeled candidate set used to compare WHY extractors. */
export type WhyEvaluationCase = {
  /** Stable identifier for this labeled example. */
  id: string;
  /** Pull request from which the example was taken, when applicable. */
  sourcePullRequest?: number;
  /** Identifier linking variants of the same source change family. */
  familyId?: string;
  /** Specific counterfactual role played by this variant. */
  counterfactualRole?: WhyCounterfactualRole;
  /** Candidate material supplied to every evaluated extractor. */
  item: WhyExtractionItem;
  /** Expected accepted candidate index, or null when no WHY note is valid. */
  expectedSelectedCandidateIndex: number | null;
  /** Additional candidate indexes that are also valid WHY evidence for this case. */
  acceptableCandidateIndexes?: readonly number[];
};

/** Configuration options for scoring extractor predictions against corpus cases. */
export type WhyEvaluationOptions = {
  /**
   * Whether to count unanchored notes (prose not matching any candidate) on positive
   * cases as confirmed evidence true positives. Defaults to false so unverified prose
   * does not inflate evidence-grounded precision; unanchored decisions remain tracked
   * in `unanchoredSelections` and decision-level metrics.
   */
  allowParaphrasedEvidence?: boolean;
};

/** Precision, recall, and source-selection metrics for one extractor run. */
export type WhyEvaluationMetrics = {
  /** Number of labeled PR candidate sets. */
  caseCount: number;
  /** Number of cases that should produce a WHY note. */
  expectedSelections: number;
  /** Number of WHY notes returned by the extractor for corpus cases. */
  predictedSelections: number;
  /**
   * Evidence-grounded true positives: positive cases whose returned note preserves an
   * expected source candidate (or unanchored prose when `allowParaphrasedEvidence` is true).
   */
  truePositives: number;
  /** Incorrectly accepted cases, including wrong candidates and unverified prose when strict. */
  falsePositives: number;
  /** Expected positive cases that did not achieve an evidence-grounded true positive. */
  falseNegatives: number;
  /**
   * Evidence-grounded precision: fraction of returned notes that are confirmed true positives.
   * Unanchored notes on positive cases do not count as confirmed TPs by default.
   */
  precision: number | null;
  /**
   * Evidence-grounded recall: fraction of labeled positive cases that achieved a confirmed
   * true positive (matching an expected candidate by default).
   */
  recall: number | null;
  /** Harmonic mean of evidence-grounded precision and recall. */
  f1: number | null;
  /**
   * Decision-level true positives: positive cases that received a non-wrong-candidate note
   * (including unanchored prose), separating selection decision from verbatim evidence grounding.
   */
  decisionTruePositives: number;
  /** Decision-level precision across all returned notes (counting unanchored positive notes). */
  decisionPrecision: number | null;
  /** Decision-level recall across labeled positive cases (counting unanchored positive notes). */
  decisionRecall: number | null;
  /** Harmonic mean of decisionPrecision and decisionRecall. */
  decisionF1: number | null;
  /** Positive cases whose returned text preserves the expected source candidate. */
  exactCandidatePreservations: number;
  /** Source-candidate preservation rate among labeled positive cases. */
  exactCandidatePreservationRate: number | null;
  /** Returned notes whose PR number is not part of the corpus. */
  unexpectedSelections: number;
  /** Additional returned notes for corpus PRs that already have a selection. */
  duplicateSelections: number;
  /** Returned notes on positive cases that selected an explicitly incorrect source candidate. */
  wrongCandidateSelections: number;
  /** Returned notes that did not match any candidate from the source item. */
  unanchoredSelections: number;
  /** Cases with unrelated rationale incorrectly accepted by the extractor. */
  wrongChangeAcceptances: number;
  /** Cases with unrelated rationale correctly rejected by the extractor. */
  wrongChangeRejections: number;
  /** Fraction of unrelated-rationale cases accepted (null when denominator is zero). */
  wrongChangeAcceptanceRate: number | null;
  /** Cases lacking a valid rationale correctly rejected by the extractor. */
  missingReasonRejections: number;
  /** Fraction of missing-reason cases correctly rejected (null when denominator is zero). */
  missingReasonRejectionRate: number | null;
  /** Per-case decisions used to diagnose metric changes. */
  outcomes: WhyEvaluationOutcome[];
};

/** Expected and observed result for one labeled PR candidate set. */
export type WhyEvaluationOutcome = {
  /** Stable corpus case identifier. */
  id: string;
  /** PR number supplied to the extractor. */
  prNumber: number;
  /** Identifier linking variants of the same source change family. */
  familyId?: string;
  /** Specific counterfactual role played by this variant. */
  counterfactualRole?: WhyCounterfactualRole;
  /** Labeled candidate index, or null when no candidate should be selected. */
  expectedSelectedCandidateIndex: number | null;
  /** Whether the extractor returned a WHY note for this PR. */
  selected: boolean;
  /** Index of an exactly preserved source candidate, when one was returned. */
  selectedCandidateIndex: number | null;
  /** Whether the returned note preserves the expected source candidate. */
  preservesExpectedCandidate: boolean;
  /** Whether the returned note matched an explicitly incorrect source candidate. */
  isWrongCandidate: boolean;
  /** Whether the returned note did not match any candidate from the source item. */
  isUnanchored: boolean;
};

/** Selection quality after applying one candidate probability threshold. */
export type WhyThresholdMetrics = {
  /** Probability required to accept a candidate. */
  threshold: number;
  /** Correctly accepted PR candidate sets with an allowed source candidate. */
  truePositives: number;
  /** Incorrectly accepted PR candidate sets. */
  falsePositives: number;
  /** Positive PR candidate sets omitted at this threshold. */
  falseNegatives: number;
  /** Fraction of accepted candidate sets that should be accepted. */
  precision: number | null;
  /** Fraction of positive candidate sets accepted at this threshold. */
  recall: number | null;
  /** Harmonic mean of precision and recall. */
  f1: number | null;
};

/** Candidate-probability quality and threshold trade-offs for a Jev run. */
export type JevConfidenceMetrics = {
  /** Number of labeled source candidates evaluated by Jev. */
  candidateCount: number;
  /** Mean squared error between combined probability and candidate labels. */
  brierScore: number | null;
  /** Mean combined probability for accepted source candidates. */
  meanPositiveProbability: number | null;
  /** Mean combined probability for rejected source candidates. */
  meanNegativeProbability: number | null;
  /** Acceptance metrics at the experimental probability thresholds. */
  thresholds: WhyThresholdMetrics[];
};

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function f1Score(
  precision: number | null,
  recall: number | null,
): number | null {
  if (precision === null || recall === null || precision + recall === 0) {
    return null;
  }
  return (2 * precision * recall) / (precision + recall);
}

function expectedCandidateIndexes(
  evaluationCase: WhyEvaluationCase,
): readonly number[] {
  return Array.from(
    new Set([
      ...(evaluationCase.expectedSelectedCandidateIndex === null
        ? []
        : [evaluationCase.expectedSelectedCandidateIndex]),
      ...(evaluationCase.acceptableCandidateIndexes ?? []),
    ]),
  );
}

function sourceCandidateIndex(
  candidates: readonly string[],
  why: string,
): number | undefined {
  const candidateIndex = candidates.indexOf(why);
  return candidateIndex === SOURCE_CANDIDATE_NOT_FOUND_INDEX
    ? undefined
    : candidateIndex;
}

type CandidateProbability =
  WhySelectionDiagnostic['candidateProbabilities'][number];

function highestProbabilityCandidate(
  candidates: readonly CandidateProbability[],
): CandidateProbability | undefined {
  return candidates.reduce<CandidateProbability | undefined>(
    (best, candidate) => {
      if (!best) return candidate;
      return combinedWhyCandidateProbability(candidate) >
        combinedWhyCandidateProbability(best)
        ? candidate
        : best;
    },
    undefined,
  );
}

function thresholdMetrics(
  cases: readonly WhyEvaluationCase[],
  diagnosticsByPrNumber: ReadonlyMap<number, WhySelectionDiagnostic>,
  threshold: number,
): WhyThresholdMetrics {
  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  for (const evaluationCase of cases) {
    const diagnostic = diagnosticsByPrNumber.get(evaluationCase.item.prNumber);
    if (!diagnostic) {
      throw new Error(
        `Jev confidence evaluation is missing diagnostics for PR #${evaluationCase.item.prNumber}`,
      );
    }
    const expectedIndexes = expectedCandidateIndexes(evaluationCase);
    const expectedSelection = expectedIndexes.length > 0;
    const selectedCandidate = highestProbabilityCandidate(
      diagnostic.candidateProbabilities,
    );
    const selected =
      selectedCandidate !== undefined &&
      combinedWhyCandidateProbability(selectedCandidate) >= threshold;
    const selectedExpectedCandidate =
      selected &&
      selectedCandidate !== undefined &&
      expectedIndexes.includes(selectedCandidate.candidateIndex);
    if (selectedExpectedCandidate) truePositives += 1;
    if (selected && !selectedExpectedCandidate) falsePositives += 1;
    if (expectedSelection && !selectedExpectedCandidate) falseNegatives += 1;
  }
  const precision = ratio(truePositives, truePositives + falsePositives);
  const recall = ratio(truePositives, truePositives + falseNegatives);
  return {
    threshold,
    truePositives,
    falsePositives,
    falseNegatives,
    precision,
    recall,
    f1: f1Score(precision, recall),
  };
}

/**
 * Score extractor output against corpus labels without interpreting generated prose.
 * @param cases Labeled candidate sets sent to the extractor.
 * @param output Returned WHY notes.
 * @param options Optional evaluation parameters (e.g. unanchored prose scoring).
 * @returns Acceptance, exact-source-selection, and counterfactual rejection metrics.
 */
export function evaluateWhySelections(
  cases: readonly WhyEvaluationCase[],
  output: readonly WhyExtractionResult[],
  options?: WhyEvaluationOptions,
): WhyEvaluationMetrics {
  // WHY: Default to strict evidence-grounded scoring so unanchored prose (which cannot be
  // verified without semantic interpretation) does not inflate confirmed true positives.
  const allowParaphrasedEvidence = options?.allowParaphrasedEvidence ?? false;

  const casesByPrNumber = new Map<number, WhyEvaluationCase>();
  for (const evaluationCase of cases) {
    if (casesByPrNumber.has(evaluationCase.item.prNumber)) {
      throw new Error(
        `WHY evaluation corpus contains duplicate PR #${evaluationCase.item.prNumber}`,
      );
    }
    casesByPrNumber.set(evaluationCase.item.prNumber, evaluationCase);
  }

  const outputByPrNumber = new Map<number, WhyExtractionResult>();
  let unexpectedSelections = 0;
  let duplicateSelections = 0;
  for (const note of output) {
    if (!casesByPrNumber.has(note.prNumber)) {
      unexpectedSelections += 1;
      continue;
    }
    if (outputByPrNumber.has(note.prNumber)) {
      duplicateSelections += 1;
      continue;
    }
    outputByPrNumber.set(note.prNumber, note);
  }

  let expectedSelections = 0;
  let predictedSelections = 0;
  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  let decisionTruePositives = 0;
  let exactCandidatePreservations = 0;
  let wrongCandidateSelections = 0;
  let unanchoredSelections = 0;
  let wrongChangeAcceptances = 0;
  let wrongChangeRejections = 0;
  let missingReasonRejections = 0;
  let totalMissingReasonCases = 0;
  const outcomes: WhyEvaluationOutcome[] = [];

  for (const evaluationCase of cases) {
    const expectedIndex = evaluationCase.expectedSelectedCandidateIndex;
    const expectedIndexes = expectedCandidateIndexes(evaluationCase);
    const expectedSelection = expectedIndexes.length > 0;
    const predicted = outputByPrNumber.get(evaluationCase.item.prNumber);
    const predictedSelection = predicted !== undefined;
    const selectedCandidateIndex = predicted
      ? sourceCandidateIndex(evaluationCase.item.candidates, predicted.why)
      : undefined;
    const preservesExpectedCandidate =
      selectedCandidateIndex !== undefined &&
      expectedIndexes.includes(selectedCandidateIndex);

    // WHY: A note that matches a candidate from the source item but does not match any
    // acceptable candidate index is an explicitly wrong candidate choice.
    const isWrongCandidate =
      predictedSelection &&
      selectedCandidateIndex !== undefined &&
      !expectedIndexes.includes(selectedCandidateIndex);

    // WHY: A note that does not match any candidate from the source item is unanchored.
    // Generative models may paraphrase evidence, but purely extractive engines should not emit unanchored text.
    const isUnanchored =
      predictedSelection && selectedCandidateIndex === undefined;

    if (isUnanchored) {
      unanchoredSelections += 1;
    }

    outcomes.push({
      id: evaluationCase.id,
      prNumber: evaluationCase.item.prNumber,
      familyId: evaluationCase.familyId,
      counterfactualRole: evaluationCase.counterfactualRole,
      expectedSelectedCandidateIndex: expectedIndex,
      selected: predictedSelection,
      selectedCandidateIndex: selectedCandidateIndex ?? null,
      preservesExpectedCandidate,
      isWrongCandidate,
      isUnanchored,
    });

    if (expectedSelection) expectedSelections += 1;
    if (predictedSelection) predictedSelections += 1;

    if (evaluationCase.counterfactualRole === 'missing-reason') {
      totalMissingReasonCases += 1;
    }

    if (expectedSelection && predictedSelection) {
      if (isWrongCandidate) {
        // WHY: Selecting an explicitly wrong candidate is both a false assertion of that candidate
        // and a failure to select the expected candidate.
        falsePositives += 1;
        falseNegatives += 1;
        wrongCandidateSelections += 1;
      } else if (isUnanchored) {
        decisionTruePositives += 1;
        if (allowParaphrasedEvidence) {
          truePositives += 1;
        } else {
          falsePositives += 1;
          falseNegatives += 1;
        }
      } else {
        truePositives += 1;
        decisionTruePositives += 1;
        if (preservesExpectedCandidate) {
          exactCandidatePreservations += 1;
        }
      }
      continue;
    }

    if (expectedSelection) {
      falseNegatives += 1;
      continue;
    }

    if (predictedSelection) {
      falsePositives += 1;
      if (evaluationCase.counterfactualRole === 'unrelated-rationale') {
        wrongChangeAcceptances += 1;
      }
      continue;
    }

    // Case had expectedSelection === false and predictedSelection === false: correct rejection.
    if (evaluationCase.counterfactualRole === 'unrelated-rationale') {
      wrongChangeRejections += 1;
    } else if (evaluationCase.counterfactualRole === 'missing-reason') {
      missingReasonRejections += 1;
    }
  }

  // WHY: Notes for unknown PRs or duplicate notes for a known PR have no unique
  // positive corpus outcome, so both must reduce precision.
  predictedSelections += unexpectedSelections + duplicateSelections;
  falsePositives += unexpectedSelections + duplicateSelections;

  const precision = ratio(truePositives, predictedSelections);
  const recall = ratio(truePositives, expectedSelections);
  const f1 = f1Score(precision, recall);

  const decisionPrecision = ratio(decisionTruePositives, predictedSelections);
  const decisionRecall = ratio(decisionTruePositives, expectedSelections);
  const decisionF1 = f1Score(decisionPrecision, decisionRecall);

  const totalUnrelatedCases = wrongChangeAcceptances + wrongChangeRejections;
  const wrongChangeAcceptanceRate = ratio(
    wrongChangeAcceptances,
    totalUnrelatedCases,
  );
  const missingReasonRejectionRate = ratio(
    missingReasonRejections,
    totalMissingReasonCases,
  );

  return {
    caseCount: cases.length,
    expectedSelections,
    predictedSelections,
    truePositives,
    falsePositives,
    falseNegatives,
    precision,
    recall,
    f1,
    decisionTruePositives,
    decisionPrecision,
    decisionRecall,
    decisionF1,
    exactCandidatePreservations,
    exactCandidatePreservationRate: ratio(
      exactCandidatePreservations,
      expectedSelections,
    ),
    unexpectedSelections,
    duplicateSelections,
    wrongCandidateSelections,
    unanchoredSelections,
    wrongChangeAcceptances,
    wrongChangeRejections,
    wrongChangeAcceptanceRate,
    missingReasonRejections,
    missingReasonRejectionRate,
    outcomes,
  };
}

/**
 * Evaluate Jev's raw candidate probabilities independently of the active threshold.
 * @param cases Labeled candidate sets sent to Jev.
 * @param diagnostics Jev decision diagnostics returned for the same candidate sets.
 * @param thresholds Optional probability thresholds to evaluate (defaults to JEV_EVALUATION_THRESHOLDS).
 * @returns Probability calibration proxy and acceptance trade-offs.
 */
export function evaluateJevConfidence(
  cases: readonly WhyEvaluationCase[],
  diagnostics: readonly WhySelectionDiagnostic[],
  thresholds: readonly number[] = JEV_EVALUATION_THRESHOLDS,
): JevConfidenceMetrics {
  const diagnosticsByPrNumber = new Map<number, WhySelectionDiagnostic>();
  for (const diagnostic of diagnostics) {
    diagnosticsByPrNumber.set(diagnostic.prNumber, diagnostic);
  }

  const positiveProbabilities: number[] = [];
  const negativeProbabilities: number[] = [];
  let squaredErrorSum = 0;
  let candidateCount = 0;
  for (const evaluationCase of cases) {
    const diagnostic = diagnosticsByPrNumber.get(evaluationCase.item.prNumber);
    if (!diagnostic) {
      throw new Error(
        `Jev confidence evaluation is missing diagnostics for PR #${evaluationCase.item.prNumber}`,
      );
    }
    const expectedIndexes = expectedCandidateIndexes(evaluationCase);
    for (const candidate of diagnostic.candidateProbabilities) {
      const probability = combinedWhyCandidateProbability(candidate);
      const isExpectedCandidate = expectedIndexes.includes(
        candidate.candidateIndex,
      );
      squaredErrorSum += (probability - Number(isExpectedCandidate)) ** 2;
      candidateCount += 1;
      if (isExpectedCandidate) positiveProbabilities.push(probability);
      else negativeProbabilities.push(probability);
    }
  }

  const mean = (values: readonly number[]): number | null =>
    values.length === 0
      ? null
      : values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    candidateCount,
    brierScore: ratio(squaredErrorSum, candidateCount),
    meanPositiveProbability: mean(positiveProbabilities),
    meanNegativeProbability: mean(negativeProbabilities),
    thresholds: thresholds.map((threshold) =>
      thresholdMetrics(cases, diagnosticsByPrNumber, threshold),
    ),
  };
}
