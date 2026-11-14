import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

import {
  JEV_CALIBRATION_SWEEP_THRESHOLDS,
  JEV_EVALUATION_THRESHOLDS,
} from '@/constants/jev.js';
import {
  loadWhyEvaluationCorpus,
  WHY_EVALUATION_CORPUS,
} from '@/evaluation/why-corpus.js';
import { evaluateJevConfidence } from '@/evaluation/why-evaluation.js';
import type { WhySelectionDiagnostic } from '@/types/why.js';

describe('WHY Evaluation Corpus Calibration (#205)', () => {
  test('loads 70 benchmark cases (50 baseline + 20 counterfactual variants) from tests/fixtures/why-corpus.json', () => {
    const fixturePath = path.resolve(
      process.cwd(),
      'tests/fixtures/why-corpus.json',
    );
    expect(fs.existsSync(fixturePath)).toBe(true);

    const corpus = loadWhyEvaluationCorpus(fixturePath);
    expect(corpus).toHaveLength(70);
    expect(WHY_EVALUATION_CORPUS).toHaveLength(70);
  });

  test('enforces unique IDs and unique PR numbers across all cases', () => {
    const seenIds = new Set<string>();
    const seenPrNumbers = new Set<number>();

    for (const evaluationCase of WHY_EVALUATION_CORPUS) {
      expect(seenIds.has(evaluationCase.id)).toBe(false);
      seenIds.add(evaluationCase.id);

      expect(seenPrNumbers.has(evaluationCase.item.prNumber)).toBe(false);
      seenPrNumbers.add(evaluationCase.item.prNumber);
    }
  });

  test('keeps ground truth labels strictly threshold-independent', () => {
    for (const evaluationCase of WHY_EVALUATION_CORPUS) {
      // Ground truth indicates only candidate selection index, not probability threshold
      const index = evaluationCase.expectedSelectedCandidateIndex;
      if (index !== null) {
        expect(typeof index).toBe('number');
        expect(index).toBeGreaterThanOrEqual(0);
        expect(evaluationCase.item.candidates[index]).toBeDefined();
      }

      for (const acceptableIndex of evaluationCase.acceptableCandidateIndexes ??
        []) {
        expect(evaluationCase.item.candidates[acceptableIndex]).toBeDefined();
      }
    }
  });

  test('covers all four required benchmark categories', () => {
    const positiveCases = WHY_EVALUATION_CORPUS.filter(
      (c) => c.expectedSelectedCandidateIndex !== null,
    );
    const negativeCases = WHY_EVALUATION_CORPUS.filter(
      (c) => c.expectedSelectedCandidateIndex === null,
    );

    // 1. Explicit Rationale (Positives)
    expect(positiveCases.length).toBeGreaterThanOrEqual(15);

    // 2. Implementation-Only (Negatives)
    const implementationOnlyCases = negativeCases.filter((c) =>
      c.id.includes('implementation'),
    );
    expect(implementationOnlyCases.length).toBeGreaterThanOrEqual(10);

    // 3. Template & Noise (Negatives)
    const noiseCases = negativeCases.filter(
      (c) =>
        c.id.includes('noise') ||
        c.id.includes('template') ||
        c.id.includes('stacktrace'),
    );
    expect(noiseCases.length).toBeGreaterThanOrEqual(5);

    // 4. Multilingual (Japanese PRs - both positive and negative)
    const japaneseCases = WHY_EVALUATION_CORPUS.filter(
      (c) =>
        c.id.includes('japanese') ||
        /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(c.item.title),
    );
    expect(japaneseCases.length).toBeGreaterThanOrEqual(8);

    const japanesePositives = japaneseCases.filter(
      (c) => c.expectedSelectedCandidateIndex !== null,
    );
    const japaneseNegatives = japaneseCases.filter(
      (c) => c.expectedSelectedCandidateIndex === null,
    );
    expect(japanesePositives.length).toBeGreaterThanOrEqual(4);
    expect(japaneseNegatives.length).toBeGreaterThanOrEqual(4);
  });

  test('supports fine-grained threshold sweeps during Jev confidence evaluation', () => {
    // Generate synthetic mock diagnostics for all 50 cases to test calibration sweep
    const mockDiagnostics: WhySelectionDiagnostic[] = WHY_EVALUATION_CORPUS.map(
      (c) => {
        const isPositive = c.expectedSelectedCandidateIndex !== null;
        return {
          prNumber: c.item.prNumber,
          questionType: 'choice',
          selectedOption: isPositive ? 'candidate_0' : 'none',
          selectionProbability: isPositive ? 0.85 : 0.2,
          mappedConfidence: isPositive ? 'high' : 'low',
          candidateProbabilities: c.item.candidates.map(
            (_candidate, candidateIndex) => ({
              candidateIndex,
              probability:
                isPositive &&
                candidateIndex === c.expectedSelectedCandidateIndex
                  ? 0.85
                  : 0.2,
              relevanceProbability:
                isPositive &&
                candidateIndex === c.expectedSelectedCandidateIndex
                  ? 0.9
                  : 0.3,
            }),
          ),
        };
      },
    );

    // Default thresholds (0.5, 0.6, 0.8)
    const defaultMetrics = evaluateJevConfidence(
      WHY_EVALUATION_CORPUS,
      mockDiagnostics,
    );
    expect(defaultMetrics.thresholds).toHaveLength(
      JEV_EVALUATION_THRESHOLDS.length,
    );

    // Fine-grained calibration sweep (0.40 through 0.90)
    const sweepMetrics = evaluateJevConfidence(
      WHY_EVALUATION_CORPUS,
      mockDiagnostics,
      JEV_CALIBRATION_SWEEP_THRESHOLDS,
    );
    expect(sweepMetrics.thresholds).toHaveLength(
      JEV_CALIBRATION_SWEEP_THRESHOLDS.length,
    );

    // Verify monotonic non-increasing recall trend across increasing thresholds
    let previousRecall = 1;
    for (const thresholdMetric of sweepMetrics.thresholds) {
      if (thresholdMetric.precision !== null) {
        expect(thresholdMetric.precision).toBeGreaterThanOrEqual(0);
        expect(thresholdMetric.precision).toBeLessThanOrEqual(1);
      }
      if (thresholdMetric.recall !== null) {
        expect(thresholdMetric.recall).toBeGreaterThanOrEqual(0);
        expect(thresholdMetric.recall).toBeLessThanOrEqual(1);
        expect(thresholdMetric.recall).toBeLessThanOrEqual(previousRecall);
        previousRecall = thresholdMetric.recall;
      }
    }
  });

  test('throws an explicit error when a custom fixture path cannot be loaded', () => {
    expect(() => loadWhyEvaluationCorpus('/non/existent/path.json')).toThrow(
      /Failed to load WHY evaluation corpus/,
    );
  });
});

describe('Counterfactual WHY Case Families (#237)', () => {
  test('organizes 10 balanced counterfactual families (30 cases) with fixed change context and unique PR numbers', () => {
    const familyCases = WHY_EVALUATION_CORPUS.filter(
      (evaluationCase) => evaluationCase.familyId !== undefined,
    );
    expect(familyCases).toHaveLength(30);

    const families = new Map<string, typeof familyCases>();
    for (const evaluationCase of familyCases) {
      const familyId = evaluationCase.familyId!;
      const group = families.get(familyId) ?? [];
      group.push(evaluationCase);
      families.set(familyId, group);
    }

    expect(families.size).toBe(10);

    for (const [familyId, group] of families.entries()) {
      expect(group.length).toBeGreaterThanOrEqual(3);

      const anchors = group.filter(
        (evaluationCase) =>
          evaluationCase.counterfactualRole === 'anchor-positive',
      );
      const unrelated = group.filter(
        (evaluationCase) =>
          evaluationCase.counterfactualRole === 'unrelated-rationale',
      );
      const missingReason = group.filter(
        (evaluationCase) =>
          evaluationCase.counterfactualRole === 'missing-reason',
      );

      expect(anchors).toHaveLength(1);
      expect(unrelated.length).toBeGreaterThanOrEqual(1);
      expect(missingReason.length).toBeGreaterThanOrEqual(1);

      const anchor = anchors[0]!;
      expect(anchor.expectedSelectedCandidateIndex).not.toBeNull();

      for (const negativeVariant of [...unrelated, ...missingReason]) {
        expect(negativeVariant.expectedSelectedCandidateIndex).toBeNull();
        // Keep the change/title and non-rationale inputs fixed while varying only the rationale
        expect(negativeVariant.item.title).toBe(anchor.item.title);
        expect(negativeVariant.item.itemText).toBe(anchor.item.itemText);
        expect(negativeVariant.item.sectionTitle).toBe(
          anchor.item.sectionTitle,
        );
        expect(negativeVariant.item.trustScore).toBe(anchor.item.trustScore);
        expect(negativeVariant.item.trustBucket).toBe(anchor.item.trustBucket);
        expect(negativeVariant.item.requiresHighConfidence).toBe(
          anchor.item.requiresHighConfidence,
        );
        expect(negativeVariant.item.candidates).toHaveLength(
          anchor.item.candidates.length,
        );
        expect(negativeVariant.familyId).toBe(familyId);
      }
    }
  });
});
