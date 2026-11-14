// @ts-nocheck
import { test, expect } from '@jest/globals';
import { ensureCompareLinks } from '@/lib/changelog.js';
import { HEAD_REF } from '@/constants/git.js';

test('creates compare link for HEAD release', () => {
  const { compareLine, unreleasedLine } = ensureCompareLinks({
    owner: 'foo',
    repo: 'bar',
    prevTag: 'v0.1.0',
    releaseRef: HEAD_REF,
    version: '0.2.0',
    existing: '',
  });

  expect(compareLine).toBe(
    '[v0.2.0]: https://github.com/foo/bar/compare/v0.1.0...HEAD',
  );
  expect(unreleasedLine).toBeUndefined();
});

test('creates compare link for a tagged release', () => {
  const { compareLine, unreleasedLine } = ensureCompareLinks({
    owner: 'foo',
    repo: 'bar',
    prevTag: 'v0.1.0',
    releaseRef: 'v0.2.0',
    version: '0.2.0',
    existing: '',
  });

  expect(compareLine).toBe(
    '[v0.2.0]: https://github.com/foo/bar/compare/v0.1.0...v0.2.0',
  );
  expect(unreleasedLine).toBeUndefined();
});

test('updates the Unreleased comparison target when an existing Unreleased link is present', () => {
  const { compareLine, unreleasedLine } = ensureCompareLinks({
    owner: 'foo',
    repo: 'bar',
    prevTag: 'v0.1.0',
    releaseRef: 'v0.2.0',
    version: '0.2.0',
    existing:
      '# Changelog\n\n[Unreleased]: https://github.com/foo/bar/compare/v0.1.0...HEAD\n',
  });

  expect(compareLine).toBe(
    '[v0.2.0]: https://github.com/foo/bar/compare/v0.1.0...v0.2.0',
  );
  expect(unreleasedLine).toBe(
    '[Unreleased]: https://github.com/foo/bar/compare/v0.2.0...HEAD',
  );
});

test('does not generate an Unreleased link when the original changelog has none', () => {
  const { unreleasedLine } = ensureCompareLinks({
    owner: 'foo',
    repo: 'bar',
    prevTag: 'v0.1.0',
    releaseRef: 'v0.2.0',
    version: '0.2.0',
    existing: '# Changelog\n\n## [0.1.0] - 2026-01-01\n\n- Initial release\n',
  });

  expect(unreleasedLine).toBeUndefined();
});

test('does not generate an Unreleased link for a HEAD release even when one exists', () => {
  const { unreleasedLine } = ensureCompareLinks({
    owner: 'foo',
    repo: 'bar',
    prevTag: 'v0.1.0',
    releaseRef: HEAD_REF,
    version: '0.2.0',
    existing:
      '# Changelog\n\n[Unreleased]: https://github.com/foo/bar/compare/v0.1.0...HEAD\n',
  });

  expect(unreleasedLine).toBeUndefined();
});
