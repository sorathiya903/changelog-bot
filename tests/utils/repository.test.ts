import { describe, test, expect } from '@jest/globals';
import { EXIT_USAGE } from '@/constants/errors.js';
import { loadAppConfig } from '@/lib/app-config.js';
import { ConfigError } from '@/lib/errors.js';
import { getRepoFullName } from '@/utils/repository.js';

describe('utils/repository.getRepoFullName', () => {
  test('returns REPO_FULL_NAME when set', () => {
    const config = loadAppConfig({ REPO_FULL_NAME: 'owner/repo' });

    const name = getRepoFullName(config);

    expect(name).toBe('owner/repo');
  });

  test('falls back to GITHUB_REPOSITORY when REPO_FULL_NAME is missing', () => {
    const config = loadAppConfig({ GITHUB_REPOSITORY: 'acme/tools' });

    const name = getRepoFullName(config);

    expect(name).toBe('acme/tools');
  });

  describe.each(['REPO_FULL_NAME', 'GITHUB_REPOSITORY'] as const)(
    '%s',
    (envName) => {
      test.each(['Owner-Name/repo_name.js', 'acme/repo.git'])(
        'preserves valid repository name %j',
        (repoFullName) => {
          const config = loadAppConfig({ [envName]: repoFullName });

          expect(getRepoFullName(config)).toBe(repoFullName);
        },
      );

      test.each([
        '',
        'owner',
        '/repo',
        'owner/',
        '/',
        '//',
        'owner/repo/extra',
        'owner//repo',
        ' /repo',
        'owner/ \t',
        ' owner/repo',
        'owner/repo\n',
      ])('rejects malformed repository name %j', (repoFullName) => {
        const config = loadAppConfig({ [envName]: repoFullName });

        expect(() => getRepoFullName(config)).toThrow(ConfigError);
        expect(() => getRepoFullName(config)).toThrow(
          'REPO_FULL_NAME or GITHUB_REPOSITORY is required (owner/repo).',
        );
      });
    },
  );

  test('throws usage error when neither env is set or invalid', () => {
    expect(() => getRepoFullName(loadAppConfig({}))).toThrow(ConfigError);

    try {
      getRepoFullName(loadAppConfig({}));
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).exitCode).toBe(EXIT_USAGE);
    }
  });

  test('throws usage error when value does not include a slash', () => {
    expect(() =>
      getRepoFullName(loadAppConfig({ REPO_FULL_NAME: 'invalid' })),
    ).toThrow(ConfigError);

    try {
      getRepoFullName(loadAppConfig({ REPO_FULL_NAME: 'invalid' }));
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).exitCode).toBe(EXIT_USAGE);
    }
  });
});
