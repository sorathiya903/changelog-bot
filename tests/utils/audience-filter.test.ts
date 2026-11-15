
import { describe, expect, test } from '@jest/globals';
import {
  SECTION_ADDED,
  SECTION_BREAKING_CHANGES,
  SECTION_CHANGED,
  SECTION_CHORE,
  SECTION_FIXED,
} from '@/constants/changelog.js';
import {
  ReleaseValidationError,
  validateReleaseResult,
} from '@/utils/release-validation.js';import { filterReleaseDraftByAudience } from '@/utils/audience-filter.js';
import type { ReleaseChange, ReleaseDraft } from '@/types/release.js';
import type { CategoryAssignments } from '@/types/changelog.js';

function createChange(id: ReleaseChange['id']): ReleaseChange {
  return {
    id,
    title: 'Example change',
    origin: {
      kind: 'pull-request',
      number: 1,
    },
  };
}

function createDraft(
  changes: ReleaseChange[],
  assignments: CategoryAssignments,
): ReleaseDraft {
  return {
    version: '1.0.0',
    date: '2026-11-14',
    changes,
    assignments,
    excludedChanges: [],
    sourceChanges: changes,
  };
}

describe('filterReleaseDraftByAudience', () => {
  test('rejects a missing category assignment before filtering', () => {
    const change = createChange('pr:1');
    const draft = createDraft([change], {} as CategoryAssignments);

    expect(() => filterReleaseDraftByAudience(draft, 'user')).toThrow(
      ReleaseValidationError,
    );
  });

  test('rejects an invalid category assignment before filtering', () => {
    const change = createChange('pr:1');
    const draft = createDraft([change], {
      [change.id]: 'Invalid Category',
    } as CategoryAssignments);

    expect(() => filterReleaseDraftByAudience(draft, 'user')).toThrow(
      ReleaseValidationError,
    );
  });

  test('rejects assignments for unknown change IDs before filtering', () => {
    const change = createChange('pr:1');
    const draft = createDraft([change], {
      [change.id]: SECTION_ADDED,
      'pr:2': SECTION_CHORE,
    } as CategoryAssignments);

    expect(() => filterReleaseDraftByAudience(draft, 'user')).toThrow(
      ReleaseValidationError,
    );
  });

    test('returns the original draft for the all audience', () => {
    const change = createChange('pr:1');
    const draft = createDraft([change], {
      [change.id]: SECTION_CHORE,
    });

    const result = filterReleaseDraftByAudience(draft, 'all');

    expect(result).toBe(draft);
  });

  test('keeps only user-facing categories for the user audience', () => {
    const changes = [
      createChange('pr:1'),
      createChange('pr:2'),
      createChange('pr:3'),
      createChange('pr:4'),
      createChange('pr:5'),
    ];

    const draft = createDraft(changes, {
      'pr:1': SECTION_BREAKING_CHANGES,
      'pr:2': SECTION_ADDED,
      'pr:3': SECTION_FIXED,
      'pr:4': SECTION_CHANGED,
      'pr:5': SECTION_CHORE,
    });

    const result = filterReleaseDraftByAudience(draft, 'user');

    expect(result.changes.map((change) => change.id)).toEqual([
      'pr:1',
      'pr:2',
      'pr:3',
      'pr:4',
    ]);

    expect(result.excludedChanges).toEqual([
      {
        change: changes[4],
        reason: 'filtered',
        detail: 'audience:user',
      },
    ]);
  });

  test('preserves release completeness after filtering', () => {
    const changes = [
      createChange('pr:1'),
      createChange('pr:2'),
    ];

    const draft = createDraft(changes, {
      'pr:1': SECTION_ADDED,
      'pr:2': SECTION_CHORE,
    });

    const result = filterReleaseDraftByAudience(draft, 'user');

    expect(() => validateReleaseResult(result)).not.toThrow();
  });
});
