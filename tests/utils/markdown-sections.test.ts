import { describe, expect, test } from '@jest/globals';
import {
  appendUniqueBulletLines,
  renderMarkdownSections,
  splitMarkdownSections,
} from '@/utils/markdown-sections.js';

describe('markdown-sections utils', () => {
  test('splits and renders H3 sections without changing content', () => {
    const markdown = [
      '## [v1.2.3] - 2025-01-01',
      '',
      '### Added',
      '',
      '- Add feature',
      '',
      '### Fixed',
      '',
      '- Fix bug',
      '',
    ].join('\n');

    const document = splitMarkdownSections(markdown);

    expect(document.preamble).toEqual(['## [v1.2.3] - 2025-01-01', '']);
    expect(document.sections.map((section) => section.name)).toEqual([
      'Added',
      'Fixed',
    ]);
    expect(renderMarkdownSections(document)).toBe(markdown);
  });

  test('appends only unique bullet lines and preserves blank-line framing', () => {
    const document = splitMarkdownSections(
      ['### Chore', '', '- Update lockfile', ''].join('\n'),
    );
    const [section] = document.sections;

    appendUniqueBulletLines(section, ['- Update lockfile', '- Bump eslint']);

    expect(section.lines).toEqual([
      '',
      '- Update lockfile',
      '- Bump eslint',
      '',
    ]);
  });

  test('deduplicates a bullet repeated within the incoming batch', () => {
    const document = splitMarkdownSections('### Added\n');
    const [section] = document.sections;

    appendUniqueBulletLines(section, ['- Add feature', '- Add feature']);

    expect(section.lines).toEqual(['', '- Add feature', '']);
  });

  test('skips a bullet already in the section even when duplicated in the batch', () => {
    const document = splitMarkdownSections(
      ['### Added', '', '- Add feature', ''].join('\n'),
    );
    const [section] = document.sections;

    appendUniqueBulletLines(section, [
      '- Add feature',
      '- Add feature',
      '- Fix bug',
    ]);

    expect(section.lines).toEqual(['', '- Add feature', '- Fix bug', '']);
  });

  test('preserves the original order of incoming bullets after deduplication', () => {
    const document = splitMarkdownSections('### Added\n');
    const [section] = document.sections;

    appendUniqueBulletLines(section, [
      '- Third',
      '- First',
      '- Third',
      '- Second',
      '- First',
    ]);

    expect(section.lines).toEqual(['', '- Third', '- First', '- Second', '']);
  });

  test('compares incoming bullets using their trimmed text', () => {
    const document = splitMarkdownSections('### Added\n');
    const [section] = document.sections;

    appendUniqueBulletLines(section, ['- Add feature', '  - Add feature  ']);

    expect(section.lines).toEqual(['', '- Add feature', '']);
  });
});
