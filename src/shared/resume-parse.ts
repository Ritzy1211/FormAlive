// Pure text-extraction heuristics for resumes. No PDF deps so this can be
// unit-tested in jsdom and reused elsewhere.

import type { Profile } from './types';

export interface ResumeSuggestion {
  basics: Partial<Profile['basics']>;
  links: Partial<Profile['links']>;
  rawText: string;
}

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/;
const LINKEDIN_RE = /https?:\/\/(?:www\.)?linkedin\.com\/[^\s)]+/i;
const GITHUB_RE = /https?:\/\/(?:www\.)?github\.com\/[^\s)]+/i;
const URL_RE = /https?:\/\/[^\s)]+/g;

export function parseResumeText(text: string): ResumeSuggestion {
  const basics: Partial<Profile['basics']> = {};
  const links: Partial<Profile['links']> = {};

  const email = text.match(EMAIL_RE)?.[0];
  if (email) basics.email = email;

  const phone = text.match(PHONE_RE)?.[0]?.trim();
  if (phone) basics.phone = phone;

  const linkedin = text.match(LINKEDIN_RE)?.[0];
  if (linkedin) links.linkedin = linkedin.replace(/[),.]+$/, '');

  const github = text.match(GITHUB_RE)?.[0];
  if (github) links.github = github.replace(/[),.]+$/, '');

  const urls = text.match(URL_RE) ?? [];
  const other = urls.find(
    (u) => !LINKEDIN_RE.test(u) && !GITHUB_RE.test(u) && !u.endsWith('.pdf')
  );
  if (other) links.website = other.replace(/[),.]+$/, '');

  const firstLine =
    text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 0 && l.length < 80) ?? '';
  const nameMatch = /^([A-Z][A-Za-z'’-]+)(?:\s+([A-Z][A-Za-z'’-]+)){1,3}$/.exec(firstLine);
  if (nameMatch && !/[@\d]/.test(firstLine)) {
    const parts = firstLine.split(/\s+/);
    basics.firstName = parts[0];
    basics.lastName = parts.slice(1).join(' ');
  }

  return { basics, links, rawText: text };
}
