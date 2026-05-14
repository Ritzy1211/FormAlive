import { describe, it, expect } from 'vitest';
import { parseResumeText } from '../src/shared/resume-parse';

describe('parseResumeText', () => {
  it('extracts email, phone, name and links', () => {
    const text = [
      'Ada Lovelace',
      'Software engineer',
      'ada.lovelace@example.com  +1 (415) 555-0123',
      'https://github.com/ada  https://linkedin.com/in/ada',
      'Portfolio: https://ada.dev/work'
    ].join('\n');
    const s = parseResumeText(text);
    expect(s.basics.email).toBe('ada.lovelace@example.com');
    expect(s.basics.phone).toContain('555');
    expect(s.basics.firstName).toBe('Ada');
    expect(s.basics.lastName).toBe('Lovelace');
    expect(s.links.linkedin).toBe('https://linkedin.com/in/ada');
    expect(s.links.github).toBe('https://github.com/ada');
    expect(s.links.website).toBe('https://ada.dev/work');
  });

  it('handles missing fields gracefully', () => {
    const s = parseResumeText('just some random text with no signals');
    expect(s.basics.email).toBeUndefined();
    expect(s.basics.firstName).toBeUndefined();
  });
});
