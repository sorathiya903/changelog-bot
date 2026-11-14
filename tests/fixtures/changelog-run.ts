import { jest } from '@jest/globals';
import type { ChangelogRunDependencies } from '@/lib/changelog-run.js';
import { deliverChangelog } from '@/lib/delivery.js';
import { PROVIDER_OPENAI } from '@/constants/provider.js';
import type { CliOptions } from '@/schema/cli.js';
import type { AppConfig } from '@/types/config.js';
import type { LLMOutput } from '@/types/llm.js';
import type { Provider } from '@/types/provider.js';
import type { CustomInstructionsResolution } from '@/lib/customization.js';
import type { ReleasePlan } from '@/lib/release-context.js';

/** Options for assembling mock changelog run dependencies. */
export type ChangelogRunFixtureOptions = {
  /**
   * When true, omits mock `finalizeChangelogUpdate` so orchestration uses
   * the real production finalizer (e.g. for compare-link formatting integration).
   */
  useRealFinalization?: boolean;
};

/**
 * Creates default CLI options for changelog orchestration tests.
 * @param overrides Specific CLI option fields to override.
 * @returns Fully populated CliOptions object.
 */
export function createMockCliOptions(
  overrides: Partial<CliOptions> = {},
): CliOptions {
  return {
    repoPath: '.',
    changelogPath: 'CHANGELOG.md',
    baseBranch: 'main',
    provider: PROVIDER_OPENAI,
    releaseTag: 'v1.2.3',
    releaseName: '1.2.3',
    releaseBody: 'release notes from cli',
    language: 'ja',
    instructions: 'Use concise bullets.',
    instructionsFile: '.github/changelog-instructions.md',
    output: 'pull-request',
    dryRun: true,
    dryRunJsonReport: false,
    failOnLlmError: false,
    requireProvider: false,
    noAi: false,
    why: false,
    whyEngine: 'llm',
    whyMaxPrs: 30,
    whyMaxCharsPerPr: 800,
    whyConfidence: 'medium',
    whyLabel: 'Why',
    ...overrides,
  };
}

/**
 * Creates default application configuration for changelog orchestration tests.
 * @param overrides Specific configuration fields to override.
 * @returns Fully populated AppConfig object.
 */
export function createMockAppConfig(
  overrides: Partial<AppConfig> = {},
): AppConfig {
  return {
    github: {
      token: undefined,
      apiBase: 'https://api.github.com',
      repoFullName: 'octo/repo',
      ...overrides.github,
    },
    providers: {
      openai: { apiKey: undefined, model: 'mock-openai' },
      anthropic: { apiKey: undefined, model: 'mock-anthropic' },
      gemini: { apiKey: undefined, model: 'mock-gemini' },
      xai: { apiKey: undefined, model: 'mock-xai' },
      ...overrides.providers,
    },
    typesafe: { apiKey: undefined, model: 'jev-latest', ...overrides.typesafe },
  };
}

/**
 * Creates a mock Provider instance for testing orchestration.
 * @param overrides Specific provider fields or methods to override.
 * @returns Fully populated Provider mock.
 */
export function createMockProvider(
  overrides: Partial<Provider> = {},
): Provider {
  return {
    name: PROVIDER_OPENAI,
    modelName: 'mock-openai',
    supports: {
      jsonMode: true,
      streaming: false,
      reasoning: false,
      maxOutputTokens: 1000,
    },
    generate: async () => ({
      changes: {},
    }),
    classifyChanges: async () => ({ assignments: {}, diagnostics: [] }),
    extractWhyNotes: async () => ({ items: [] }),
    ...overrides,
  };
}

/**
 * Creates a mock release plan representing resolved version and date context.
 * @param overrides Specific release plan fields to override.
 * @returns Fully populated ReleasePlan object.
 */
export function createMockReleasePlan(
  overrides: Partial<ReleasePlan> = {},
): ReleasePlan {
  return {
    owner: 'octo',
    repo: 'repo',
    repoPath: '.',
    changelogPath: 'CHANGELOG.md',
    releaseRef: 'v1.2.3',
    version: '1.2.3',
    prevRef: 'v1.2.2',
    date: '2026-05-23',
    ...overrides,
  };
}

/** Default unresolved customization resolution diagnostics fixture. */
export const unresolvedCustomization: CustomInstructionsResolution = {
  instructions: undefined,
  diagnostics: {
    requested: false,
    resolved: false,
    sources: [],
    chars: 0,
    maxChars: 16000,
    encoding: 'utf8',
    truncated: false,
    fileStatus: 'not_provided',
  },
};

/** Default resolved customization resolution diagnostics fixture. */
export const resolvedCustomization: CustomInstructionsResolution = {
  instructions: 'combined instructions',
  diagnostics: {
    requested: true,
    resolved: true,
    sources: ['inline', 'file'],
    chars: 21,
    maxChars: 16000,
    encoding: 'utf8',
    truncated: false,
    fileStatus: 'loaded',
    filePath: '.github/changelog-instructions.md',
  },
};

/**
 * Creates a mock LLM output structure for changelog tests.
 * @param overrides Specific LLM output fields to override.
 * @returns Fully populated LLMOutput object.
 */
export function createMockLlmOutput(
  overrides: Partial<LLMOutput> = {},
): LLMOutput {
  return {
    new_section_markdown: 'generated section',
    insert_after_anchor: '## [Unreleased]',
    pr_title: 'docs(changelog): 1.2.3',
    pr_body: 'body',
    labels: ['changelog'],
    ...overrides,
  };
}

/**
 * Builds safe, complete mock dependencies for `executeChangelogRun()`.
 * WHY: Providing explicit mocks for all external side effects (git CLI, GitHub HTTP API,
 * LLM requests, disk file writes) ensures individual orchestration tests do not leak
 * real network or filesystem mutations, while letting each test override only the
 * dependencies relevant to its scenario.
 * @param overrides Specific dependencies to override.
 * @param options Assembly options controlling dependency behavior.
 * @returns Complete dependencies object for changelog run orchestration.
 */
export function createChangelogRunDeps(
  overrides: Partial<ChangelogRunDependencies> = {},
  options: ChangelogRunFixtureOptions = {},
): ChangelogRunDependencies {
  const defaultProvider = createMockProvider();
  const defaultAppConfig = createMockAppConfig();
  const defaultReleasePlan = createMockReleasePlan();

  const baseMocks: ChangelogRunDependencies = {
    providerFactory: jest.fn(() => defaultProvider),
    getRepoFullName: jest.fn(() => 'octo/repo'),
    resolveReleasePlan: jest.fn(() => defaultReleasePlan),
    gitMergedPRs: jest.fn(() => ''),
    commitsInRange: jest.fn(() => []),
    currentBranch: jest.fn(() => 'main'),
    tryFindPullRequestNumberForBranch: jest.fn(() => null),
    prepareExistingChangelog: jest.fn(() => 'existing changelog'),
    resolveRunCredentials: jest.fn(async () => ({
      token: undefined,
      hasProviderKey: false,
    })),
    fetchPullRequestsForBranch: jest.fn(async () => []),
    mapCommitsToPrs: jest.fn(async () => ({})),
    fetchReleaseBody: jest.fn(async () => ''),
    fetchPRDetails: jest.fn<ChangelogRunDependencies['fetchPRDetails']>(
      async () => ({ status: 'not-found', message: 'Mock PR not found' }),
    ),
    fetchIssueDetails: jest.fn<ChangelogRunDependencies['fetchIssueDetails']>(
      async () => ({ status: 'not-found', message: 'Mock issue not found' }),
    ),
    resolveCustomInstructionsWithDiagnostics: jest.fn(
      () => unresolvedCustomization,
    ),
    buildPrMapBySha: jest.fn(() => ({})),
    buildTitleToPr: jest.fn(() => ({})),
    getProviderRuntimeConfig: jest.fn(() => defaultAppConfig.providers.openai),
    buildChangelogLlmOutput: jest.fn(async () => ({
      llm: createMockLlmOutput(),
      aiUsed: false,
      fallbackReasons: [],
    })),
    finalizeChangelogUpdate: jest.fn<
      ChangelogRunDependencies['finalizeChangelogUpdate']
    >((params) => ({
      llm: params.llm,
      updated: 'updated changelog',
    })),
    runWhyExtraction: jest.fn<ChangelogRunDependencies['runWhyExtraction']>(
      async (params) => ({
        llm: params.llm,
        diagnostics: {
          enabled: false,
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
    writeChangelog: jest.fn(),
    ensureGithubTokenRequired: jest.fn(),
    createPR: jest.fn(async () => 1),
    writeStdout: jest.fn(),
    deliverChangelog,
  };

  if (options.useRealFinalization) {
    // WHY: Omitting finalizeChangelogUpdate forces resolveChangelogRunDependencies
    // to fall back to the real production finalizer, testing integration with
    // Markdown link generation and stdout delivery.
    delete (baseMocks as Partial<ChangelogRunDependencies>)
      .finalizeChangelogUpdate;
  }

  return {
    ...baseMocks,
    ...overrides,
  };
}
