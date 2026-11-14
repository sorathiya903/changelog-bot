
import { describe, expect, test } from '@jest/globals';

import {
  SECTION_ADDED,
  SECTION_CHORE,
} from '@/constants/changelog.js';
import { ReleaseValidationError } from '@/utils/release-validation.js';
import { filterReleaseDraftByAudience } from '@/utils/audience-filter.js';
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
});
