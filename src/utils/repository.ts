import { ConfigError } from '@/lib/errors.js';
import type { AppConfig } from '@/types/config.js';

const REPOSITORY_PARTS_COUNT = 2;

/**
 * Resolve the GitHub repo full name (owner/repo) from runtime config.
 * WHY: The CLI relies on a concrete repo to build compare links and PR URLs; we fail fast here.
 * @param appConfig Runtime configuration for the current invocation.
 * @returns Repository slug in the form `owner/repo`.
 */
export function getRepoFullName(appConfig: AppConfig): string {
  const repoFull = appConfig.github.repoFullName;
  const repositoryParts = repoFull?.split('/') ?? [];
  if (
    !repoFull ||
    repositoryParts.length !== REPOSITORY_PARTS_COUNT ||
    repositoryParts.some((component) => !component || /\s/.test(component))
  ) {
    throw new ConfigError(
      'REPO_FULL_NAME or GITHUB_REPOSITORY is required (owner/repo).',
    );
  }
  return repoFull;
}
