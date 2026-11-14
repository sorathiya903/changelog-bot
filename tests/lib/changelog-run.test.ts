import { describe, expect, jest, test } from '@jest/globals';
import {
  executeChangelogRun,
  type ChangelogRunDependencies,
} from '@/lib/changelog-run.js';
import { buildReleaseDraft } from '@/utils/release-draft.js';
import { runWhyExtraction } from '@/lib/why-extraction.js';
import { validateReleaseResult } from '@/utils/release-validation.js';
import {
  createChangelogRunDeps,
  createMockAppConfig,
  createMockCliOptions,
  createMockLlmOutput,
  createMockProvider,
  createMockReleasePlan,
  resolvedCustomization,
  unresolvedCustomization,
} from '../fixtures/changelog-run.js';

const cli = createMockCliOptions();
const appConfig = createMockAppConfig();
const provider = createMockProvider();

describe('executeChangelogRun', () => {
  test('uses current branch PR metadata for HEAD releases', async () => {
    const log = jest.fn<(message: string) => void>();
    const branchPullRequest = {
      number: 138,
      title: 'feat: add opt-in WHY extraction',
      author: 'nyaomaru',
      url: 'https://github.com/nyaomaru/changelog-bot/pull/138',
    };
    const buildChangelogLlmOutput = jest.fn<
      ChangelogRunDependencies['buildChangelogLlmOutput']
    >(async () => ({
      llm: {
        new_section_markdown: 'generated section',
        pr_title: 'docs(changelog): test',
        pr_body: 'body',
      },
      aiUsed: false,
      fallbackReasons: [],
    }));
    const deps = createChangelogRunDeps({
      resolveReleasePlan: jest.fn(() =>
        createMockReleasePlan({
          releaseRef: 'HEAD',
          version: '1.2.3',
          prevRef: 'v1.2.2',
          date: '2026-06-20',
        }),
      ),
      commitsInRange: jest.fn(() => [
        { sha: 'abcdef1234567890', subject: 'feat: add WHY extraction' },
      ]),
      currentBranch: jest.fn(() => 'feature/why-extraction'),
      fetchPullRequestsForBranch: jest.fn(async () => [branchPullRequest]),
      buildPrMapBySha: jest.fn(() => ({ abcdef1234567890: [138] })),
      buildTitleToPr: jest.fn(() => ({ 'add WHY extraction': 138 })),
      buildChangelogLlmOutput,
      runWhyExtraction: jest.fn<ChangelogRunDependencies['runWhyExtraction']>(
        async (params) => ({
          llm: params.llm,
          diagnostics: {
            enabled: true,
            engine: 'llm',
            selectionDiagnostics: [],
            aiUsed: false,
            targetsFound: 0,
            prBodiesFetched: 0,
            skippedBeforeFetch: 0,
            skippedLowTrust: 0,
            notesRendered: 0,
            fallbackReasons: [],
          },
        }),
      ),
    });

    await executeChangelogRun({
      cli: { ...cli, releaseTag: 'HEAD', language: 'en' },
      appConfig,
      log,
      deps,
    });

    expect(deps.mapCommitsToPrs).not.toHaveBeenCalled();
    expect(buildChangelogLlmOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        pullRequestsBySha: {
          abcdef1234567890: [branchPullRequest],
        },
      }),
    );
  });

  test('dry-run orchestrates changelog generation without writing or creating a PR', async () => {
    const log = jest.fn<(message: string) => void>();
    const deps = createChangelogRunDeps({
      providerFactory: jest.fn(() => provider),
      gitMergedPRs: jest.fn(() => 'merged prs'),
      commitsInRange: jest.fn(() => [
        { sha: 'abcdef1234567890', subject: 'feat: add CLI dry run' },
      ]),
      resolveCustomInstructionsWithDiagnostics: jest.fn(
        () => resolvedCustomization,
      ),
      buildPrMapBySha: jest.fn(() => ({ abcdef1234567890: [123] })),
      buildTitleToPr: jest.fn(() => ({ 'add CLI dry run': 123 })),
    });

    await executeChangelogRun({ cli, appConfig, log, deps });

    expect(deps.fetchReleaseBody).not.toHaveBeenCalled();
    expect(deps.mapCommitsToPrs).toHaveBeenCalledWith(
      'octo',
      'repo',
      ['abcdef1234567890'],
      undefined,
      'https://api.github.com',
    );
    expect(deps.writeChangelog).not.toHaveBeenCalled();
    expect(deps.createPR).not.toHaveBeenCalled();
    expect(deps.buildChangelogLlmOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        releaseBody: 'release notes from cli',
        language: 'ja',
        customInstructions: 'combined instructions',
        prs: 'merged prs',
        existingChangelog: 'existing changelog',
        provider,
        noAi: false,
        requireProvider: false,
        failOnLlmError: false,
      }),
    );
    expect(log).toHaveBeenNthCalledWith(1, '==== DRY RUN (no PR) ====');
    expect(log).toHaveBeenNthCalledWith(
      2,
      [
        'Provider: openai',
        'Model: mock-openai',
        'AI used: false',
        'Fallback reasons: none',
        'Prompt customization: requested=true, applied=false, sources=inline+file, chars=21/16000, encoding=utf8',
        'Prompt customization file: loaded (.github/changelog-instructions.md)',
        'Prompt customization reason: not applied because provider API key is missing',
        'Metadata lookups: total=1, successful=1, degraded=0',
        'Metadata fallback reasons: none',
      ].join('\n'),
    );
    expect(log).toHaveBeenNthCalledWith(3, '');
    expect(log).toHaveBeenNthCalledWith(4, 'updated changelog');
  });

  test('dry-run can print provider diagnostics as JSON report', async () => {
    const log = jest.fn<(message: string) => void>();
    const deps = createChangelogRunDeps({
      gitMergedPRs: jest.fn(() => 'merged prs'),
      buildChangelogLlmOutput: jest.fn<
        ChangelogRunDependencies['buildChangelogLlmOutput']
      >(async () => ({
        llm: createMockLlmOutput(),
        aiUsed: false,
        fallbackReasons: ['AI disabled by --no-ai'],
      })),
    });

    await executeChangelogRun({
      cli: { ...cli, dryRunJsonReport: true, noAi: true },
      appConfig,
      log,
      deps,
    });

    expect(JSON.parse(log.mock.calls[1][0])).toEqual({
      provider: 'openai',
      model: 'mock-openai',
      aiUsed: false,
      fallbackReasons: ['AI disabled by --no-ai'],
      promptCustomization: {
        ...unresolvedCustomization.diagnostics,
        applied: false,
        reason: 'not requested',
      },
      metadata: {
        totalLookups: 0,
        successfulLookups: 0,
        degradedLookups: 0,
        failureCounts: {
          'not-found': 0,
          'rate-limited': 0,
          unauthenticated: 0,
          'invalid-response': 0,
          'network-error': 0,
        },
        fallbackReasons: [],
      },
    });
  });

  test('dry-run reports when there are no changes in the release range', async () => {
    const log = jest.fn<(message: string) => void>();
    const deps = createChangelogRunDeps({
      buildChangelogLlmOutput: jest.fn<
        ChangelogRunDependencies['buildChangelogLlmOutput']
      >(async () => ({
        llm: createMockLlmOutput({ new_section_markdown: '' }),
        aiUsed: false,
        fallbackReasons: [],
        outcome: {
          kind: 'no-changes',
          version: '1.2.3',
          date: '2026-05-23',
          excludedChanges: [],
        },
      })),
      finalizeChangelogUpdate: jest.fn<
        ChangelogRunDependencies['finalizeChangelogUpdate']
      >(() => ({
        llm: createMockLlmOutput(),
        updated: 'existing changelog',
      })),
    });

    await executeChangelogRun({
      cli: { ...cli, dryRun: true },
      appConfig,
      log,
      deps,
    });

    expect(deps.writeChangelog).not.toHaveBeenCalled();
    expect(deps.createPR).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('==== DRY RUN (no PR) ====');
    expect(log).toHaveBeenCalledWith(
      'No changes found in release range (v1.2.3)',
    );
  });

  test('dry-run with dryRunJsonReport outputs JSON report including outcome for empty release', async () => {
    const log = jest.fn<(message: string) => void>();
    const deps = createChangelogRunDeps({
      buildChangelogLlmOutput: jest.fn<
        ChangelogRunDependencies['buildChangelogLlmOutput']
      >(async () => ({
        llm: createMockLlmOutput({ new_section_markdown: '' }),
        aiUsed: false,
        fallbackReasons: [],
        outcome: {
          kind: 'no-changes',
          version: '1.2.3',
          date: '2026-05-23',
          excludedChanges: [],
        },
      })),
      finalizeChangelogUpdate: jest.fn<
        ChangelogRunDependencies['finalizeChangelogUpdate']
      >(() => ({
        llm: createMockLlmOutput(),
        updated: 'existing changelog',
      })),
    });

    await executeChangelogRun({
      cli: { ...cli, dryRun: true, dryRunJsonReport: true },
      appConfig,
      log,
      deps,
    });

    expect(deps.writeChangelog).not.toHaveBeenCalled();
    expect(deps.createPR).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('==== DRY RUN (no PR) ====');

    const jsonLogCall = log.mock.calls.find((call) => {
      try {
        const parsed = JSON.parse(call[0]);
        return parsed && typeof parsed === 'object' && 'outcome' in parsed;
      } catch {
        return false;
      }
    });

    expect(jsonLogCall).toBeDefined();
    const parsedReport = JSON.parse(jsonLogCall![0]);
    expect(parsedReport.outcome).toEqual({
      kind: 'no-changes',
      version: '1.2.3',
      date: '2026-05-23',
      excludedChanges: [],
    });
    // Ensure markdown text wasn't output
    expect(log).not.toHaveBeenCalledWith('existing changelog');
    expect(log).not.toHaveBeenCalledWith(
      'No changes found in release range (v1.2.3)',
    );
  });

  test('normal mode skips writing changelog and PR creation for empty releases', async () => {
    const log = jest.fn<(message: string) => void>();
    const deps = createChangelogRunDeps({
      resolveRunCredentials: jest.fn(async () => ({
        token: 'mock-token',
        hasProviderKey: false,
      })),
      buildChangelogLlmOutput: jest.fn<
        ChangelogRunDependencies['buildChangelogLlmOutput']
      >(async () => ({
        llm: createMockLlmOutput({ new_section_markdown: '' }),
        aiUsed: false,
        fallbackReasons: [],
        outcome: {
          kind: 'no-changes',
          version: '1.2.3',
          date: '2026-05-23',
          excludedChanges: [],
        },
      })),
      finalizeChangelogUpdate: jest.fn<
        ChangelogRunDependencies['finalizeChangelogUpdate']
      >(() => ({
        llm: createMockLlmOutput(),
        updated: 'existing changelog',
      })),
    });

    await executeChangelogRun({
      cli: { ...cli, dryRun: false },
      appConfig,
      log,
      deps,
    });

    expect(deps.ensureGithubTokenRequired).not.toHaveBeenCalled();
    expect(deps.writeChangelog).not.toHaveBeenCalled();
    expect(deps.createPR).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      'No changes found for release v1.2.3; skipping PR creation.',
    );
  });

  test('multi-change PR range generates categorized sub-changes, attaches distinct WHY notes, and passes validateReleaseResult', async () => {
    // 1. Build draft from a release range containing a multi-change PR
    const commitList = [
      { sha: 'sha1', subject: 'feat: add OAuth login provider' },
      { sha: 'sha2', subject: 'fix: resolve race condition in token refresh' },
    ];
    const pullRequestsBySha = {
      sha1: [
        {
          number: 42,
          title: 'feat: auth and session handling',
          author: 'alice',
          url: 'https://github.com/octo/repo/pull/42',
        },
      ],
      sha2: [
        {
          number: 42,
          title: 'feat: auth and session handling',
          author: 'alice',
          url: 'https://github.com/octo/repo/pull/42',
        },
      ],
    };

    const draft = buildReleaseDraft({
      version: '1.3.0',
      date: '2026-10-19',
      commitList,
      pullRequestsBySha,
      owner: 'octo',
      repo: 'repo',
    });

    // Sub-changes discovered and classified deterministically
    expect(draft.changes).toHaveLength(2);
    expect(draft.changes[0].id).toBe('pr:42:c1');
    expect(draft.changes[0].title).toBe('add OAuth login provider');
    expect(draft.assignments['pr:42:c1']).toBe('Added');

    expect(draft.changes[1].id).toBe('pr:42:c2');
    expect(draft.changes[1].title).toBe(
      'resolve race condition in token refresh',
    );
    expect(draft.assignments['pr:42:c2']).toBe('Fixed');

    // Source commits properly recorded in excludedChanges
    expect(draft.excludedChanges).toHaveLength(2);
    expect(draft.excludedChanges[0].change.id).toBe('commit:sha1');
    expect(draft.excludedChanges[0].reason).toBe('collapsed-into-pr');
    expect(draft.excludedChanges[1].change.id).toBe('commit:sha2');
    expect(draft.excludedChanges[1].reason).toBe('collapsed-into-pr');

    // Pre-transform ledger accounting satisfies validateReleaseResult
    const initialOutcome = validateReleaseResult(draft);
    expect(initialOutcome.kind).toBe('release');

    // 2. Run WHY extraction to enrich sub-changes with distinct rationale
    const selectedProvider: typeof provider = {
      ...provider,
      extractWhyNotes: jest.fn(async () => ({
        items: [
          {
            prNumber: 42,
            changeId: 'pr:42:c1',
            why: 'Enables single sign-on across enterprise identity providers.',
            confidence: 'high' as const,
          },
          {
            prNumber: 42,
            changeId: 'pr:42:c2',
            why: 'Prevents intermittent session drops during concurrent token refreshes.',
            confidence: 'high' as const,
          },
        ],
      })),
    };

    const fetchPRDetails = jest.fn(async () => ({
      status: 'success' as const,
      data: {
        number: 42,
        title: 'feat: auth and session handling',
        body: [
          '## Why',
          '',
          'Because OAuth enables single sign-on across enterprise identity providers, and token refresh locking is needed to prevent intermittent session drops during concurrent refreshes.',
        ].join('\n'),
        author: 'alice',
        url: 'https://github.com/octo/repo/pull/42',
      },
    }));

    const whyResult = await runWhyExtraction({
      cli: {
        ...cli,
        why: true,
        whyLabel: 'Why',
      },
      llm: {
        new_section_markdown: '',
        pr_title: 'docs(changelog): 1.3.0',
        pr_body: 'Generated changelog.',
      },
      draft,
      changelogAiUsed: true,
      provider: selectedProvider,
      hasProviderKey: true,
      owner: 'octo',
      repo: 'repo',
      token: 'token',
      githubApiBase: 'https://api.github.com',
      fetchPRDetails,
    });

    // Single PR fetch performed
    expect(fetchPRDetails).toHaveBeenCalledTimes(1);

    // Each sub-change receives its distinct WHY note
    expect(draft.changes[0].why).toBe(
      'Enables single sign-on across enterprise identity providers.',
    );
    expect(draft.changes[1].why).toBe(
      'Prevents intermittent session drops during concurrent token refreshes.',
    );

    // Both sections rendered with their respective sub-change bullets and notes
    expect(whyResult.llm.new_section_markdown).toContain('### Added');
    expect(whyResult.llm.new_section_markdown).toContain(
      '- add OAuth login provider by @alice in [#42](https://github.com/octo/repo/pull/42)',
    );
    expect(whyResult.llm.new_section_markdown).toContain(
      '  - Why: Enables single sign-on across enterprise identity providers.',
    );

    expect(whyResult.llm.new_section_markdown).toContain('### Fixed');
    expect(whyResult.llm.new_section_markdown).toContain(
      '- resolve race condition in token refresh by @alice in [#42](https://github.com/octo/repo/pull/42)',
    );
    expect(whyResult.llm.new_section_markdown).toContain(
      '  - Why: Prevents intermittent session drops during concurrent token refreshes.',
    );

    // Fully validated ReleaseResult after WHY enrichment
    const finalOutcome = validateReleaseResult(draft);
    expect(finalOutcome.kind).toBe('release');
  });

  test('dry-run JSON report with WHY enabled merges metadata into top-level and keeps why clean', async () => {
    const log = jest.fn<(message: string) => void>();
    const whyMetadataDiagnostics = {
      totalLookups: 2,
      successfulLookups: 1,
      degradedLookups: 1,
      failureCounts: {
        'not-found': 0,
        'rate-limited': 1,
        unauthenticated: 0,
        'invalid-response': 0,
        'network-error': 0,
      },
      fallbackReasons: ['Skipped PR #42: GitHub API rate limit reached'],
    };

    const deps = createChangelogRunDeps({
      resolveReleasePlan: jest.fn(() =>
        createMockReleasePlan({ date: '2026-06-20' }),
      ),
      resolveRunCredentials: jest.fn(async () => ({
        token: undefined,
        hasProviderKey: true,
      })),
      buildChangelogLlmOutput: jest.fn(async () => ({
        llm: createMockLlmOutput(),
        aiUsed: true,
        fallbackReasons: [],
      })),
      runWhyExtraction: jest.fn(async (params) => ({
        llm: params.llm,
        diagnostics: {
          enabled: true,
          engine: 'llm',
          selectionDiagnostics: [],
          aiUsed: false,
          targetsFound: 1,
          prBodiesFetched: 1,
          skippedBeforeFetch: 0,
          skippedLowTrust: 0,
          notesRendered: 0,
          fallbackReasons: [],
        },
        metadataDiagnostics: whyMetadataDiagnostics,
      })),
    });

    await executeChangelogRun({
      cli: { ...cli, dryRunJsonReport: true, why: true },
      appConfig,
      log,
      deps,
    });

    const parsed = JSON.parse(log.mock.calls[1][0]);
    expect(parsed.why).toBeDefined();
    expect(parsed.why.metadataDiagnostics).toBeUndefined();
    expect(parsed.metadata).toEqual(
      expect.objectContaining({
        totalLookups: 2,
        successfulLookups: 1,
        degradedLookups: 1,
        failureCounts: expect.objectContaining({
          'rate-limited': 1,
        }),
        fallbackReasons: ['Skipped PR #42: GitHub API rate limit reached'],
      }),
    );
  });

  test('dry-run for HEAD release skips release body lookup and avoids false degraded 404', async () => {
    const log = jest.fn<(message: string) => void>();
    const fetchReleaseBody = jest.fn(async () => '');
    const deps = createChangelogRunDeps({
      resolveReleasePlan: jest.fn(() =>
        createMockReleasePlan({
          releaseRef: 'HEAD',
          version: '1.2.3',
          prevRef: 'v1.2.2',
          date: '2026-06-20',
        }),
      ),
      fetchReleaseBody,
    });

    await executeChangelogRun({
      cli: { ...cli, releaseTag: 'HEAD', dryRunJsonReport: true },
      appConfig,
      log,
      deps,
    });

    const parsed = JSON.parse(log.mock.calls[1][0]);
    expect(fetchReleaseBody).not.toHaveBeenCalled();
    expect(parsed.metadata.degradedLookups).toBe(0);
    expect(parsed.metadata.failureCounts['not-found']).toBe(0);
    expect(parsed.metadata.fallbackReasons).toEqual([]);
  });

  test('delivers file destination by updating changelog file without creating PR', async () => {
    const log = jest.fn<(message: string) => void>();
    const deps = createChangelogRunDeps({
      resolveReleasePlan: jest.fn(() =>
        createMockReleasePlan({ date: '2026-06-20' }),
      ),
      commitsInRange: jest.fn(() => [
        { sha: 'abcdef1', subject: 'feat: new feature' },
      ]),
      prepareExistingChangelog: jest.fn(() => '# Changelog'),
      buildChangelogLlmOutput: jest.fn(async () => ({
        llm: createMockLlmOutput(),
        aiUsed: false,
        fallbackReasons: [],
        outcome: {
          kind: 'release',
          result: {
            version: '1.2.3',
            date: '2026-06-20',
            changes: [],
            assignments: {},
            excludedChanges: [],
            sourceChanges: [],
          },
        },
      })),
      finalizeChangelogUpdate: jest.fn((params) => ({
        llm: params.llm,
        updated: '# Changelog\n\n## 1.2.3\n- feat: new feature',
      })),
    });

    await executeChangelogRun({
      cli: { ...cli, dryRun: false, output: 'file' },
      appConfig,
      log,
      deps,
    });

    expect(deps.ensureGithubTokenRequired).not.toHaveBeenCalled();
    expect(deps.writeChangelog).toHaveBeenCalledWith(
      'CHANGELOG.md',
      '# Changelog\n\n## 1.2.3\n- feat: new feature',
    );
    expect(deps.createPR).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('Updated CHANGELOG.md for release v1.2.3');
  });

  test('delivers stdout destination by writing section markdown without file or git mutations', async () => {
    const log = jest.fn<(message: string) => void>();
    const writeStdout = jest.fn();
    const deps = createChangelogRunDeps({
      resolveReleasePlan: jest.fn(() =>
        createMockReleasePlan({ date: '2026-06-20' }),
      ),
      commitsInRange: jest.fn(() => [
        { sha: 'abcdef1', subject: 'feat: new feature' },
      ]),
      prepareExistingChangelog: jest.fn(() => '# Changelog'),
      buildChangelogLlmOutput: jest.fn(async () => ({
        llm: createMockLlmOutput({
          new_section_markdown: '## 1.2.3\n- feat: new feature',
        }),
        aiUsed: false,
        fallbackReasons: [],
        outcome: {
          kind: 'release',
          result: {
            version: '1.2.3',
            date: '2026-06-20',
            changes: [],
            assignments: {},
            excludedChanges: [],
            sourceChanges: [],
          },
        },
      })),
      finalizeChangelogUpdate: jest.fn((params) => ({
        llm: params.llm,
        updated: '# Changelog\n\n## 1.2.3\n- feat: new feature',
      })),
      writeStdout,
    });

    await executeChangelogRun({
      cli: { ...cli, dryRun: false, output: 'stdout' },
      appConfig,
      log,
      deps,
    });

    expect(deps.ensureGithubTokenRequired).not.toHaveBeenCalled();
    expect(deps.writeChangelog).not.toHaveBeenCalled();
    expect(deps.createPR).not.toHaveBeenCalled();
    expect(writeStdout).toHaveBeenCalledWith('## 1.2.3\n- feat: new feature');
    expect(log).not.toHaveBeenCalled();
  });

  test('delivers stdout destination with real finalization including compare links and full changelog', async () => {
    const log = jest.fn<(message: string) => void>();
    const writeStdout = jest.fn();
    const existingChangelog = [
      '# Changelog',
      '',
      '## [1.2.2] - 2026-06-01',
      '- chore: previous work',
      '',
      '[1.2.2]: https://github.com/octo/repo/compare/v1.2.1...v1.2.2',
    ].join('\n');

    const deps = createChangelogRunDeps(
      {
        resolveReleasePlan: jest.fn(() =>
          createMockReleasePlan({ date: '2026-06-20' }),
        ),
        commitsInRange: jest.fn(() => [
          { sha: 'abcdef1', subject: 'feat: new feature' },
        ]),
        prepareExistingChangelog: jest.fn(() => existingChangelog),
        buildChangelogLlmOutput: jest.fn(async () => ({
          llm: createMockLlmOutput({
            new_section_markdown: '## 1.2.3\n- feat: new feature',
            insert_after_anchor: '# Changelog\n\n',
          }),
          aiUsed: false,
          fallbackReasons: [],
          outcome: {
            kind: 'release',
            result: {
              version: '1.2.3',
              date: '2026-06-20',
              changes: [],
              assignments: {},
              excludedChanges: [],
              sourceChanges: [],
            },
          },
        })),
        writeStdout,
      },
      { useRealFinalization: true },
    );

    await executeChangelogRun({
      cli: { ...cli, dryRun: false, output: 'stdout' },
      appConfig,
      log,
      deps,
    });

    expect(deps.ensureGithubTokenRequired).not.toHaveBeenCalled();
    expect(deps.writeChangelog).not.toHaveBeenCalled();
    expect(deps.createPR).not.toHaveBeenCalled();
    expect(writeStdout).toHaveBeenCalledTimes(1);
    const stdoutOutput = writeStdout.mock.calls[0][0];
    expect(stdoutOutput).toContain('## 1.2.3');
    expect(stdoutOutput).toContain('- feat: new feature');
    expect(stdoutOutput).toContain(
      '[v1.2.3]: https://github.com/octo/repo/compare/v1.2.2...v1.2.3',
    );
    expect(stdoutOutput).toContain(
      '**Full Changelog**: https://github.com/octo/repo/compare/v1.2.2...v1.2.3',
    );
    expect(log).not.toHaveBeenCalled();
  });
});
