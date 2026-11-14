import { runInNewContext } from 'node:vm';
import { jest, describe, expect, test } from '@jest/globals';

import { WHY_EVALUATION_CORPUS } from '@/evaluation/why-corpus.js';
import {
  evaluateJevConfidence,
  evaluateWhySelections,
} from '@/evaluation/why-evaluation.js';
import type { WhyEvaluationCase } from '@/evaluation/why-evaluation.js';
import { evaluateEngineWithRepeatedRuns } from '@/evaluation/run-why-evaluation.js';
import type { WhyExtractor } from '@/types/why-extractor.js';

const CASES: WhyEvaluationCase[] = [
  {
    id: 'positive',
    item: {
      prNumber: 1,
      title: 'Fix lookup',
      itemText: 'Fix lookup',
      sectionTitle: 'Fixed',
      trustScore: 9,
      trustBucket: 'high',
      requiresHighConfidence: false,
      candidates: [
        'The lookup must use the merged pull request to avoid stale data.',
      ],
    },
    expectedSelectedCandidateIndex: 0,
  },
  {
    id: 'negative',
    item: {
      prNumber: 2,
      title: 'Refactor lookup',
      itemText: 'Refactor lookup',
      sectionTitle: 'Changed',
      trustScore: 7,
      trustBucket: 'medium',
      requiresHighConfidence: false,
      candidates: ['Move lookup code into a shared module.'],
    },
    expectedSelectedCandidateIndex: null,
  },
];

describe('evaluateWhySelections', () => {
  test('keeps every corpus label tied to one valid candidate', () => {
    const prNumbers = new Set<number>();
    for (const evaluationCase of WHY_EVALUATION_CORPUS) {
      expect(prNumbers.has(evaluationCase.item.prNumber)).toBe(false);
      prNumbers.add(evaluationCase.item.prNumber);
      if (evaluationCase.expectedSelectedCandidateIndex !== null) {
        expect(
          evaluationCase.item.candidates[
            evaluationCase.expectedSelectedCandidateIndex
          ],
        ).toBeDefined();
      }
      for (const candidateIndex of evaluationCase.acceptableCandidateIndexes ??
        []) {
        expect(evaluationCase.item.candidates[candidateIndex]).toBeDefined();
      }
    }
  });

  test('reports acceptance and exact candidate-preservation metrics', () => {
    const metrics = evaluateWhySelections(CASES, [
      {
        prNumber: 1,
        why: 'The lookup must use the merged pull request to avoid stale data.',
        confidence: 'high',
      },
      {
        prNumber: 2,
        why: 'Move lookup code into a shared module.',
        confidence: 'medium',
      },
      { prNumber: 3, why: 'Unexpected', confidence: 'low' },
    ]);

    expect(metrics).toEqual({
      caseCount: 2,
      expectedSelections: 1,
      predictedSelections: 3,
      truePositives: 1,
      falsePositives: 2,
      falseNegatives: 0,
      precision: 1 / 3,
      recall: 1,
      f1: 0.5,
      decisionTruePositives: 1,
      decisionPrecision: 1 / 3,
      decisionRecall: 1,
      decisionF1: 0.5,
      exactCandidatePreservations: 1,
      exactCandidatePreservationRate: 1,
      unexpectedSelections: 1,
      duplicateSelections: 0,
      wrongCandidateSelections: 0,
      unanchoredSelections: 0,
      wrongChangeAcceptances: 0,
      wrongChangeRejections: 0,
      wrongChangeAcceptanceRate: null,
      missingReasonRejections: 0,
      missingReasonRejectionRate: null,
      outcomes: [
        {
          id: 'positive',
          prNumber: 1,
          familyId: undefined,
          counterfactualRole: undefined,
          expectedSelectedCandidateIndex: 0,
          selected: true,
          selectedCandidateIndex: 0,
          preservesExpectedCandidate: true,
          isWrongCandidate: false,
          isUnanchored: false,
        },
        {
          id: 'negative',
          prNumber: 2,
          familyId: undefined,
          counterfactualRole: undefined,
          expectedSelectedCandidateIndex: null,
          selected: true,
          selectedCandidateIndex: 0,
          preservesExpectedCandidate: false,
          isWrongCandidate: true,
          isUnanchored: false,
        },
      ],
    });
  });

  test('counts duplicate output for a corpus PR as a false positive', () => {
    const metrics = evaluateWhySelections(CASES, [
      {
        prNumber: 1,
        why: 'The lookup must use the merged pull request to avoid stale data.',
        confidence: 'high',
      },
      { prNumber: 1, why: 'Duplicate output', confidence: 'low' },
    ]);

    expect(metrics).toEqual(
      expect.objectContaining({
        predictedSelections: 2,
        truePositives: 1,
        falsePositives: 1,
        duplicateSelections: 1,
        precision: 0.5,
      }),
    );
  });

  test('reports Jev probability calibration proxies and threshold trade-offs', () => {
    const metrics = evaluateJevConfidence(CASES, [
      {
        prNumber: 1,
        questionType: 'noul',
        selectedOption: 'candidate_0',
        selectedCandidateIndex: 0,
        selectionProbability: 0.9,
        mappedConfidence: 'high',
        candidateProbabilities: [
          { candidateIndex: 0, probability: 0.9, relevanceProbability: 0.9 },
        ],
      },
      {
        prNumber: 2,
        questionType: 'noul',
        selectedOption: 'candidate_0',
        selectedCandidateIndex: 0,
        selectionProbability: 0.7,
        mappedConfidence: 'medium',
        candidateProbabilities: [
          { candidateIndex: 0, probability: 0.7, relevanceProbability: 0.7 },
        ],
      },
    ]);

    expect(metrics.brierScore).toBeCloseTo(0.25);
    expect({ ...metrics, brierScore: 0.25 }).toEqual({
      candidateCount: 2,
      brierScore: 0.25,
      meanPositiveProbability: 0.9,
      meanNegativeProbability: 0.7,
      thresholds: [
        {
          threshold: 0.5,
          truePositives: 1,
          falsePositives: 1,
          falseNegatives: 0,
          precision: 0.5,
          recall: 1,
          f1: 2 / 3,
        },
        {
          threshold: 0.6,
          truePositives: 1,
          falsePositives: 1,
          falseNegatives: 0,
          precision: 0.5,
          recall: 1,
          f1: 2 / 3,
        },
        {
          threshold: 0.8,
          truePositives: 1,
          falsePositives: 0,
          falseNegatives: 0,
          precision: 1,
          recall: 1,
          f1: 1,
        },
      ],
    });
  });

  test('counts an invalid highest-probability candidate as both an incorrect selection and a miss', () => {
    const metrics = evaluateJevConfidence(
      [
        {
          id: 'wrong-candidate',
          item: {
            ...CASES[0]?.item,
            candidates: [
              'The lookup must use the merged pull request to avoid stale data.',
              'This explicit reason applies to another change.',
            ],
          },
          expectedSelectedCandidateIndex: 0,
        },
      ],
      [
        {
          prNumber: 1,
          questionType: 'noul',
          selectedOption: 'candidate_1',
          selectedCandidateIndex: 1,
          selectionProbability: 0.9,
          mappedConfidence: 'high',
          candidateProbabilities: [
            {
              candidateIndex: 0,
              probability: 0.65,
              relevanceProbability: 0.65,
            },
            { candidateIndex: 1, probability: 0.9, relevanceProbability: 0.9 },
          ],
        },
      ],
    );

    expect(metrics.thresholds[0]).toEqual({
      threshold: 0.5,
      truePositives: 0,
      falsePositives: 1,
      falseNegatives: 1,
      precision: 0,
      recall: 0,
      f1: null,
    });
  });

  test('treats the primary and additional acceptable candidate indexes as labels', () => {
    const multiCandidateCase: WhyEvaluationCase = {
      id: 'multiple-valid-candidates',
      item: {
        ...CASES[0]?.item,
        candidates: [
          'The lookup must use the merged pull request to avoid stale data.',
          'The release reference prevents stale lookup data.',
        ],
      },
      expectedSelectedCandidateIndex: 0,
      acceptableCandidateIndexes: [1],
    };
    const metrics = evaluateJevConfidence(
      [multiCandidateCase],
      [
        {
          prNumber: 1,
          questionType: 'noul',
          selectedOption: 'candidate_1',
          selectedCandidateIndex: 1,
          selectionProbability: 0.9,
          mappedConfidence: 'high',
          candidateProbabilities: [
            { candidateIndex: 0, probability: 0.4, relevanceProbability: 0.4 },
            { candidateIndex: 1, probability: 0.9, relevanceProbability: 0.9 },
          ],
        },
      ],
    );

    expect(metrics.brierScore).toBeCloseTo(0.185);
    expect(metrics.meanPositiveProbability).toBeCloseTo(0.65);
    expect(metrics.thresholds[0]).toEqual(
      expect.objectContaining({ truePositives: 1, falsePositives: 0 }),
    );
  });

  test('discriminates selecting an explicitly wrong candidate as a false positive and miss (#237)', () => {
    const wrongCandidateCase: WhyEvaluationCase = {
      id: 'pr-10-wrong-candidate',
      item: {
        prNumber: 10,
        title: 'Fix issue',
        itemText: 'Fix issue',
        sectionTitle: 'Fixed',
        trustScore: 9,
        trustBucket: 'high',
        requiresHighConfidence: false,
        candidates: [
          'Correct rationale for fixing the bug.',
          'Unrelated rationale belonging to another change.',
        ],
      },
      expectedSelectedCandidateIndex: 0,
    };

    const metrics = evaluateWhySelections(
      [wrongCandidateCase],
      [
        {
          prNumber: 10,
          why: 'Unrelated rationale belonging to another change.',
          confidence: 'high',
        },
      ],
    );

    expect(metrics.truePositives).toBe(0);
    expect(metrics.falsePositives).toBe(1);
    expect(metrics.falseNegatives).toBe(1);
    expect(metrics.wrongCandidateSelections).toBe(1);
    expect(metrics.exactCandidatePreservations).toBe(0);
    expect(metrics.precision).toBe(0);
    expect(metrics.recall).toBe(0);
    expect(metrics.f1).toBeNull();
    expect(metrics.outcomes[0]).toEqual(
      expect.objectContaining({
        prNumber: 10,
        selected: true,
        selectedCandidateIndex: 1,
        preservesExpectedCandidate: false,
        isWrongCandidate: true,
        isUnanchored: false,
      }),
    );
  });

  test('does not count unanchored or incorrect paraphrase as confirmed TP by default and separates decision metrics (#237)', () => {
    const caseItem: WhyEvaluationCase = {
      id: 'pr-20-paraphrased',
      item: {
        prNumber: 20,
        title: 'Enhance cache performance',
        itemText: 'Enhance cache performance',
        sectionTitle: 'Changed',
        trustScore: 9,
        trustBucket: 'high',
        requiresHighConfidence: false,
        candidates: [
          'The cache prevents expensive recalculation on every request.',
        ],
      },
      expectedSelectedCandidateIndex: 0,
    };

    // Unanchored note paraphrasing an unrelated rationale (e.g. authentication security instead of caching)
    const incorrectParaphraseOutput = [
      {
        prNumber: 20,
        why: 'Improves authentication security by rotating session tokens.',
        confidence: 'high' as const,
      },
    ];

    // Default (strict): unverified unanchored prose must NOT inflate evidence precision
    const strictMetrics = evaluateWhySelections(
      [caseItem],
      incorrectParaphraseOutput,
    );
    expect(strictMetrics.truePositives).toBe(0);
    expect(strictMetrics.falsePositives).toBe(1);
    expect(strictMetrics.falseNegatives).toBe(1);
    expect(strictMetrics.precision).toBe(0);
    expect(strictMetrics.recall).toBe(0);
    expect(strictMetrics.exactCandidatePreservations).toBe(0);
    expect(strictMetrics.unanchoredSelections).toBe(1);
    expect(strictMetrics.decisionTruePositives).toBe(1);
    expect(strictMetrics.decisionPrecision).toBe(1);
    expect(strictMetrics.outcomes[0]?.isUnanchored).toBe(true);
    expect(strictMetrics.outcomes[0]?.isWrongCandidate).toBe(false);

    // Explicit opt-in for paraphrased evidence
    const permissiveMetrics = evaluateWhySelections(
      [caseItem],
      incorrectParaphraseOutput,
      { allowParaphrasedEvidence: true },
    );
    expect(permissiveMetrics.truePositives).toBe(1);
    expect(permissiveMetrics.falsePositives).toBe(0);
    expect(permissiveMetrics.falseNegatives).toBe(0);
    expect(permissiveMetrics.precision).toBe(1);
    expect(permissiveMetrics.exactCandidatePreservations).toBe(0);
    expect(permissiveMetrics.unanchoredSelections).toBe(1);
  });

  test('counts incorrectly accepted missing-reason cases as false positives with 0% rejection rate (#237)', () => {
    const missingReasonCase: WhyEvaluationCase = {
      id: 'cf-missing-reason-accepted',
      familyId: 'family-missing',
      counterfactualRole: 'missing-reason',
      item: {
        prNumber: 105,
        title: 'Refactor helper module',
        itemText: 'Refactor helper module',
        sectionTitle: 'Changed',
        trustScore: 7,
        trustBucket: 'medium',
        requiresHighConfidence: false,
        candidates: ['Extract shared helper into src/utils/format.ts.'],
      },
      expectedSelectedCandidateIndex: null,
    };

    const metrics = evaluateWhySelections(
      [missingReasonCase],
      [
        {
          prNumber: 105,
          why: 'Extract shared helper into src/utils/format.ts.',
          confidence: 'medium',
        },
      ],
    );

    expect(metrics.falsePositives).toBe(1);
    expect(metrics.missingReasonRejections).toBe(0);
    expect(metrics.missingReasonRejectionRate).toBe(0);
  });

  test('tracks counterfactual rejection metrics and returns null when denominators are zero (#237)', () => {
    const counterfactualCases: WhyEvaluationCase[] = [
      {
        id: 'cf-anchor-positive',
        familyId: 'family-1',
        counterfactualRole: 'anchor-positive',
        item: {
          prNumber: 101,
          title: 'Add feature',
          itemText: 'Add feature',
          sectionTitle: 'Added',
          trustScore: 9,
          trustBucket: 'high',
          requiresHighConfidence: false,
          candidates: ['Explicit valid rationale.'],
        },
        expectedSelectedCandidateIndex: 0,
      },
      {
        id: 'cf-unrelated-accepted',
        familyId: 'family-1',
        counterfactualRole: 'unrelated-rationale',
        item: {
          prNumber: 102,
          title: 'Add feature',
          itemText: 'Add feature',
          sectionTitle: 'Added',
          trustScore: 9,
          trustBucket: 'high',
          requiresHighConfidence: false,
          candidates: ['Unrelated rationale from another component.'],
        },
        expectedSelectedCandidateIndex: null,
      },
      {
        id: 'cf-unrelated-rejected',
        familyId: 'family-2',
        counterfactualRole: 'unrelated-rationale',
        item: {
          prNumber: 103,
          title: 'Fix issue',
          itemText: 'Fix issue',
          sectionTitle: 'Fixed',
          trustScore: 9,
          trustBucket: 'high',
          requiresHighConfidence: false,
          candidates: ['Another unrelated rationale.'],
        },
        expectedSelectedCandidateIndex: null,
      },
      {
        id: 'cf-missing-reason-rejected',
        familyId: 'family-1',
        counterfactualRole: 'missing-reason',
        item: {
          prNumber: 104,
          title: 'Add feature',
          itemText: 'Add feature',
          sectionTitle: 'Added',
          trustScore: 7,
          trustBucket: 'medium',
          requiresHighConfidence: false,
          candidates: ['Update function signature and export interface.'],
        },
        expectedSelectedCandidateIndex: null,
      },
    ];

    // Predictions: accepts 101 (correct TP) and 102 (wrong-change FP), correctly rejects 103 and 104
    const metrics = evaluateWhySelections(counterfactualCases, [
      { prNumber: 101, why: 'Explicit valid rationale.', confidence: 'high' },
      {
        prNumber: 102,
        why: 'Unrelated rationale from another component.',
        confidence: 'high',
      },
    ]);

    expect(metrics.wrongChangeAcceptances).toBe(1);
    expect(metrics.wrongChangeRejections).toBe(1);
    expect(metrics.wrongChangeAcceptanceRate).toBe(0.5); // 1 / 2 = 50%
    expect(metrics.missingReasonRejections).toBe(1);
    expect(metrics.missingReasonRejectionRate).toBe(1.0); // 1 / 1 = 100%

    // Verify null rate when relevant cases are 0
    const baselineCasesOnly: WhyEvaluationCase[] = [
      {
        id: 'baseline-positive',
        item: {
          prNumber: 201,
          title: 'Title',
          itemText: 'Title',
          sectionTitle: 'Added',
          trustScore: 9,
          trustBucket: 'high',
          requiresHighConfidence: false,
          candidates: ['Rationale'],
        },
        expectedSelectedCandidateIndex: 0,
      },
    ];
    const baselineMetrics = evaluateWhySelections(baselineCasesOnly, [
      { prNumber: 201, why: 'Rationale', confidence: 'high' },
    ]);
    expect(baselineMetrics.wrongChangeAcceptanceRate).toBeNull();
    expect(baselineMetrics.missingReasonRejectionRate).toBeNull();
  });
});

describe('evaluateEngineWithRepeatedRuns', () => {
  test.each([
    [new Error('native failure'), 'native failure'],
    [runInNewContext('new Error("realm failure")'), 'realm failure'],
    ['string failure', 'string failure'],
    [null, 'null'],
    [undefined, 'undefined'],
    [{ message: 'plain object' }, '[object Object]'],
  ])('records a failed run for thrown %p', async (error, expectedMessage) => {
    const extractor: WhyExtractor = {
      name: 'test-extractor',
      async extractWhyNotes() {
        throw error;
      },
    };

    const report = await evaluateEngineWithRepeatedRuns(
      'test-engine',
      'test-model',
      true,
      extractor,
      { language: 'en', whyLabel: 'Why', items: [] },
      0,
      1,
    );

    expect(report).toMatchObject({
      status: 'failed',
      failureCount: 1,
      successCount: 0,
      error: expectedMessage,
      runs: [{ status: 'failed', error: expectedMessage }],
    });
  });

  test('skips evaluation when hasApiKey is false', async () => {
    const mockExtractor: WhyExtractor = {
      name: 'test-extractor',
      extractWhyNotes: jest.fn<WhyExtractor['extractWhyNotes']>(),
    };
    const report = await evaluateEngineWithRepeatedRuns(
      'test-engine',
      'test-model',
      false,
      mockExtractor,
      { language: 'en', whyLabel: 'Why', items: [] },
      100,
      3,
    );
    expect(report.status).toBe('skipped');
    expect(report.runsCount).toBe(0);
    expect(report.error).toBe('API key is not configured');
    expect(mockExtractor.extractWhyNotes).not.toHaveBeenCalled();
  });

  test('runs multiple iterations and records aggregated latency and model metadata', async () => {
    const mockExtractor: WhyExtractor = {
      name: 'test-extractor',
      lastServedModel: 'test-model-served',
      lastWhyExtractionUsage: { inputTokens: 10, outputTokens: 5 },
      lastWhyExtractionDiagnostics: { retries: 0, throttled: false },
      extractWhyNotes: jest
        .fn<WhyExtractor['extractWhyNotes']>()
        .mockResolvedValue({
          items: [],
        }),
    };
    const report = await evaluateEngineWithRepeatedRuns(
      'test-engine',
      'test-model-requested',
      true,
      mockExtractor,
      { language: 'en', whyLabel: 'Why', items: [] },
      100,
      2,
    );
    expect(report.status).toBe('completed');
    expect(report.runsCount).toBe(2);
    expect(report.successCount).toBe(2);
    expect(report.failureCount).toBe(0);
    expect(report.runs).toHaveLength(2);
    expect(report.runs?.[0]?.status).toBe('completed');
    expect(report.runs?.[0]?.servedModel).toBe('test-model-served');
    expect(report.requestedModel).toBe('test-model-requested');
    expect(report.servedModel).toBe('test-model-served');
    expect(report.latency).toBeDefined();
    expect(mockExtractor.extractWhyNotes).toHaveBeenCalledTimes(2);
  });
});
