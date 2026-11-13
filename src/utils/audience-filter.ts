
import {
  DEFAULT_AUDIENCE,
  type Audience,
} from '@/constants/audience.js';
import {
  SECTION_BREAKING_CHANGES,
  SECTION_ADDED,
  SECTION_FIXED,
  SECTION_CHANGED,
} from '@/constants/changelog.js';
import type { CategoryAssignments } from '@/types/changelog.js';
import type { ReleaseDraft } from '@/types/release.js';

const USER_VISIBLE_CATEGORIES = new Set<string>([  SECTION_BREAKING_CHANGES,
  SECTION_ADDED,
  SECTION_FIXED,
  SECTION_CHANGED,
]);

/**
 * Filter a release draft according to the selected audience.
 *
 * Changes excluded by the audience policy remain tracked in
 * excludedChanges so release completeness validation still passes.
 */
export function filterReleaseDraftByAudience(
  draft: ReleaseDraft,
  audience: Audience = DEFAULT_AUDIENCE,
): ReleaseDraft {
  if (audience === 'all') {
    return draft;
  }

  const includedChanges = draft.changes.filter((change) =>
    USER_VISIBLE_CATEGORIES.has(draft.assignments[change.id]),
  );

  const filteredChanges = draft.changes.filter(
    (change) => !USER_VISIBLE_CATEGORIES.has(draft.assignments[change.id]),
  );

  const assignments = {} as CategoryAssignments;

  for (const change of includedChanges) {
    assignments[change.id] = draft.assignments[change.id];
  }

  const filteredExclusions = filteredChanges.map((change) => ({
    change,
    reason: 'filtered' as const,
    detail: 'audience:user',
  }));

  return {
    ...draft,
    changes: includedChanges,
    assignments,
    excludedChanges: [
      ...draft.excludedChanges,
      ...filteredExclusions,
    ],
  };
}
