import { UNRELEASED_ANCHOR } from '@/constants/changelog.js';
import { ANY_H2_HEADING_RE } from '@/constants/markdown.js';
import { escapeRegExp } from '@/utils/escape.js';
import { isUndefined } from '@/utils/is.js';

/**
 * Insert a rendered section below the given anchor heading, or near the top when absent.
 * If `anchor` is not an H2 heading ("## "), it falls back to the conventional
 * Unreleased anchor to avoid placing content under an unintended line.
 * @param changelog Existing changelog text.
 * @param anchor Heading text to insert below (e.g., "## [v1.2.3] - 2025-01-01").
 * @param newSection Section content to insert; outer blank lines are trimmed.
 * @returns Updated changelog with the section inserted at the intended position.
 */
export function insertSection(
  changelog: string,
  anchor: string,
  newSection: string,
): string {
  const isHeading = /^##\s/.test(anchor);
  const safeAnchor = isHeading ? anchor : UNRELEASED_ANCHOR;

  // Normalize the new section: trim outer blank lines to avoid piling up
  const normalizedSection = newSection.trim();

  // WHY: Match the anchor as a full line to avoid incidental partial matches
  // within other lines (use multiline flag to anchor with ^ and $).
  // NOTE: Do not consume the trailing newline after the anchor line.
  // Using a lookahead ensures we stop before a line break or end-of-input.
  const anchorRegExp = new RegExp(
    `^${escapeRegExp(safeAnchor)}[^\\S\\r\\n]*(?=\\r?\\n|$)`,
    'm',
  );
  const anchorMatch = changelog.match(anchorRegExp);
  if (anchorMatch && !isUndefined(anchorMatch.index)) {
    const anchorStartIndex = anchorMatch.index;
    const anchorLine = anchorMatch[0];
    const beforeAnchor = changelog.slice(0, anchorStartIndex);
    const afterAnchor = changelog.slice(anchorStartIndex + anchorLine.length);
    // Ensure exactly two newlines after anchor and before/after the inserted section
    const afterAnchorStripped = afterAnchor.replace(/^\n+/, '');
    return `${beforeAnchor}${anchorLine}\n\n${normalizedSection}\n\n${afterAnchorStripped}`;
  }

  // If anchor not found, attempt to preserve a header block (e.g. "# Changelog")
  const existingContent = changelog.replace(/^\n+/, '');

  // Find the first "## " heading which marks the start of changelog sections
  const firstHeadingMatch = existingContent.match(ANY_H2_HEADING_RE);
  if (!isUndefined(firstHeadingMatch?.index)) {
    const firstHeadingIndex = firstHeadingMatch.index;
    if (firstHeadingIndex > 0) {
      // There is a header block before the first section
      const header = existingContent.slice(0, firstHeadingIndex).trimEnd();
      const rest = existingContent.slice(firstHeadingIndex).replace(/^\n+/, '');
      return `${header}\n\n${normalizedSection}\n\n${rest}`;
    }
    // No header block before the first section
    return `${normalizedSection}\n\n${existingContent}`;
  }

  // No "## " sections yet; treat entire existing content as header block if present
  if (existingContent.trim() !== '') {
    return `${existingContent.trimEnd()}\n\n${normalizedSection}\n`;
  }

  // Fallback: prepend at the very top
  return `${normalizedSection}\n\n${existingContent}`;
}

/**
 * Detect duplicate version link labels like "[v1.2.3]" within the content.
 * @param content Changelog text to scan.
 * @param version Semantic version string without leading "v".
 * @returns True when the link label appears more than once.
 */
export function hasDuplicateVersion(content: string, version: string): boolean {
  const regExp = new RegExp(`\\[v${escapeRegExp(version)}\\]`, 'g');
  return (content.match(regExp) ?? []).length > 1;
}

/**
 * Check if a section heading for a version exists, e.g., "## [v1.2.3]".
 * @param content Changelog text to scan.
 * @param version Semantic version string without leading "v".
 * @returns True when the heading exists.
 */
export function hasSection(content: string, version: string): boolean {
  const regExp = new RegExp(`^##\\s*\\[v${escapeRegExp(version)}\\]`, 'm');
  return regExp.test(content);
}

/**
 * Replace a specific version section with new content.
 * Section is matched from the heading line until the next version heading or end.
 * @param content Changelog text to modify.
 * @param version Version (no leading "v").
 * @param newSection Replacement section text; outer blank lines are trimmed.
 * @returns Updated changelog with the target section replaced.
 */
/**
 * Find the end of a version section without consuming its separator
 * or any following version compare-link definitions.
 */
function findVersionSectionEnd(content: string, startIndex: number): number {
  // A section ends before the next version heading, a version reference
  // definition, or the end of the document.
  const boundaryRegExp = /^(?:##\s*\[|\[v[^\]]+\]:)/gm;
  boundaryRegExp.lastIndex = startIndex;

  const boundaryMatch = boundaryRegExp.exec(content);
  let endIndex = boundaryMatch?.index ?? content.length;

  // Leave all trailing line breaks in the original content. This preserves
  // the separator when replacing or removing a section.
  while (
    endIndex > startIndex &&
    (content[endIndex - 1] === '\n' || content[endIndex - 1] === '\r')
  ) {
    endIndex--;
  }

  return endIndex;
}

/**
 * Find all occurrences of a version section.
 */
function findVersionSectionRanges(
  content: string,
  version: string,
): Array<{ start: number; end: number }> {
  const headingRegExp = new RegExp(
    `^##\\s*\\[v${escapeRegExp(version)}\\][^\\r\\n]*`,
    'gm',
  );

  const ranges: Array<{ start: number; end: number }> = [];
  let match: RegExpExecArray | null;

  while ((match = headingRegExp.exec(content)) !== null) {
    const start = match.index;
    const headingEnd = start + match[0].length;
    const end = findVersionSectionEnd(content, headingEnd);

    ranges.push({ start, end });
  }

  return ranges;
}

export function replaceSection(
  content: string,
  version: string,
  newSection: string,
): string {
  const [range] = findVersionSectionRanges(content, version);

  if (!range) return content;

  return (
    content.slice(0, range.start) +
    newSection.trim() +
    content.slice(range.end)
  );
}

export function removeAllSections(content: string, version: string): string {
  const ranges = findVersionSectionRanges(content, version);

  // Remove from the end so earlier character positions remain unchanged.
  let result = content;

  for (const range of ranges.reverse()) {
    result =
      result.slice(0, range.start) +
      result.slice(range.end);
  }

  return result.replace(/\n{3,}/g, '\n\n').trimStart();
}
