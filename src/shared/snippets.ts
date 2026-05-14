// Snippets: long-text templates (cover letters, summaries, "why this role").
// Resolved with {{var}} placeholders sourced from the active profile + page context.

import type { DetectedField, PageContext, Profile } from './types';

export interface SnippetContext {
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  company: string;
  role: string;
  website: string;
  linkedin: string;
  github: string;
}

const PLACEHOLDER_RE = /\{\{\s*(\w+)\s*\}\}/g;

export function renderSnippet(template: string, ctx: SnippetContext): string {
  return template.replace(PLACEHOLDER_RE, (_m, key: string) => {
    const v = (ctx as unknown as Record<string, string>)[key];
    return v ?? '';
  });
}

/** Guess company/role from page metadata. Best-effort heuristics. */
export function inferCompanyAndRole(page: PageContext | undefined): { company: string; role: string } {
  if (!page) return { company: '', role: '' };
  const company = page.siteName || hostToCompany(page.url);
  // Common job-board title patterns:
  //   "Senior Engineer at Acme — Greenhouse"
  //   "Acme | Senior Engineer"
  //   "Job Application for Senior Engineer at Acme"
  let role = '';
  const t = page.title;
  const atMatch = t.match(/(.+?)\s+at\s+([^—\-|·•]+)/i);
  if (atMatch) {
    role = atMatch[1].replace(/^job application for\s+/i, '').trim();
  }
  return { company, role };
}

function hostToCompany(url: string): string {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    const root = h.split('.')[0];
    return root.charAt(0).toUpperCase() + root.slice(1);
  } catch {
    return '';
  }
}

export function buildContext(profile: Profile, page: PageContext | undefined): SnippetContext {
  const { company, role } = inferCompanyAndRole(page);
  return {
    firstName: profile.basics.firstName,
    lastName: profile.basics.lastName,
    fullName: `${profile.basics.firstName} ${profile.basics.lastName}`.trim(),
    email: profile.basics.email,
    phone: profile.basics.phone,
    company,
    role,
    website: profile.links.website,
    linkedin: profile.links.linkedin,
    github: profile.links.github
  };
}

const SNIPPET_KEYWORDS: Array<{ test: RegExp; preferKey: string }> = [
  { test: /cover[\s-]?letter/i, preferKey: 'coverLetter' },
  { test: /why (do )?you (want|wish) (to )?(work|join)|why us|why this/i, preferKey: 'whyUs' },
  { test: /tell us about yourself|about yourself|short bio|brief intro/i, preferKey: 'aboutMe' },
  { test: /summary|professional summary/i, preferKey: 'summary' }
];

/**
 * If a field's signal matches a known snippet kind, return the snippet name
 * to render (e.g. "coverLetter"). Otherwise null.
 */
export function pickSnippetForField(field: DetectedField, snippets: Record<string, string>): string | null {
  const signal = [
    field.label,
    field.ariaLabel,
    field.placeholder,
    field.name,
    field.id
  ]
    .join(' ')
    .toLowerCase();
  if (!isLongTextField(field)) return null;
  // Prefer exact-keyed matches first.
  for (const { test, preferKey } of SNIPPET_KEYWORDS) {
    if (test.test(signal) && snippets[preferKey]) return preferKey;
  }
  // Fall back: any snippet name appearing in the signal.
  for (const key of Object.keys(snippets)) {
    if (signal.includes(key.toLowerCase())) return key;
  }
  return null;
}

function isLongTextField(f: DetectedField): boolean {
  if (f.type === 'textarea') return true;
  // Some forms render long-text as <input type=text> with a "tell us" label.
  const signal = `${f.label} ${f.placeholder}`.toLowerCase();
  return /cover letter|tell us|why|about yourself|summary|message/i.test(signal);
}
