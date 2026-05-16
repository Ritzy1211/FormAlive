// Optional LLM fallback for fields the rule-based matcher misses.
// The user supplies their own API key; it's stored encrypted in the vault.
// We send the LLM only the field's metadata + a flat list of profile keys
// and ask it to pick the best key. We then resolve the value locally — the
// LLM never sees full profile values.

import type { DetectedField, LlmSettings, Profile } from './types';
import { resolveProfileValue, type ProfileKey } from './overrides';

export interface LlmMatch {
  fieldId: string;
  profileKey: ProfileKey;
  confidence: number;
}

/** Build the list of profile keys with sample-type hints (no raw values). */
function profileKeyChoices(profile: Profile): ProfileKey[] {
  const keys: ProfileKey[] = ['fullName'];
  for (const k of Object.keys(profile.basics) as Array<keyof Profile['basics']>) {
    keys.push(`basics.${k}` as ProfileKey);
  }
  for (const k of Object.keys(profile.links) as Array<keyof Profile['links']>) {
    keys.push(`links.${k}` as ProfileKey);
  }
  for (const k of Object.keys(profile.custom)) {
    keys.push(`custom.${k}` as ProfileKey);
  }
  return keys;
}

const SYSTEM_PROMPT =
  'You are an autofill assistant. Given a web-form field description and a list of available ' +
  'profile keys, pick the single best profile key for that field, or "none" if no key fits. ' +
  'Respond with strict JSON only: {"key":"<key-or-none>","confidence":0.0-1.0}.';

function userPrompt(field: DetectedField, keys: ProfileKey[]): string {
  return JSON.stringify({
    field: {
      name: field.name,
      id: field.id,
      type: field.type,
      autocomplete: field.autocomplete,
      placeholder: field.placeholder,
      label: field.label,
      ariaLabel: field.ariaLabel
    },
    available_keys: keys
  });
}

async function callOpenAI(settings: LlmSettings, system: string, user: string): Promise<string> {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model: settings.model || 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      temperature: 0
    })
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return j.choices?.[0]?.message?.content ?? '';
}

async function callAnthropic(settings: LlmSettings, system: string, user: string): Promise<string> {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': settings.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: settings.model || 'claude-3-5-haiku-latest',
      max_tokens: 200,
      system,
      messages: [{ role: 'user', content: user }]
    })
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return j.content?.[0]?.text ?? '';
}

async function callGemini(settings: LlmSettings, system: string, user: string): Promise<string> {
  const model = settings.model || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(settings.apiKey)}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { role: 'system', parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' }
    })
  });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return j.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

function parseLlmJson(raw: string): { key: string; confidence: number } | null {
  try {
    const j = JSON.parse(raw);
    if (typeof j.key !== 'string') return null;
    return { key: j.key, confidence: Math.max(0, Math.min(1, Number(j.confidence) || 0)) };
  } catch {
    // try to find a JSON object inside the text
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) return parseLlmJson(m[0]);
    return null;
  }
}

export async function llmMatchField(
  settings: LlmSettings,
  field: DetectedField,
  profile: Profile
): Promise<LlmMatch | null> {
  if (settings.provider === 'off' || !settings.apiKey) return null;

  const keys = profileKeyChoices(profile);
  const user = userPrompt(field, keys);

  let raw = '';
  if (settings.provider === 'openai') raw = await callOpenAI(settings, SYSTEM_PROMPT, user);
  else if (settings.provider === 'anthropic') raw = await callAnthropic(settings, SYSTEM_PROMPT, user);
  else if (settings.provider === 'gemini') raw = await callGemini(settings, SYSTEM_PROMPT, user);

  const parsed = parseLlmJson(raw);
  if (!parsed || parsed.key === 'none') return null;
  if (!keys.includes(parsed.key as ProfileKey)) return null;
  // Ensure the resolved value isn't empty.
  if (!resolveProfileValue(profile, parsed.key as ProfileKey)) return null;
  return {
    fieldId: field.fieldId,
    profileKey: parsed.key as ProfileKey,
    confidence: parsed.confidence
  };
}

// ============================================================================
// Free-text essay drafting
// ----------------------------------------------------------------------------
// Generates a tailored paragraph for open-ended application questions like
// "Tell us about your experience" or "Why are you a good fit". The drafter is
// grounded in the user's resume + work history + page context (company/role)
// so answers feel personal and on-topic.
// ============================================================================

export interface EssayContext {
  question: string;
  /** Plain-text resume extract, if available. */
  resumeText?: string;
  /** Page metadata: company name, role title, etc. */
  page?: {
    title?: string;
    siteName?: string;
    url?: string;
  };
  /** Approximate target length in words. Defaults to 120. */
  targetWords?: number;
}

const ESSAY_SYSTEM = [
  'You are helping the user write a short, authentic answer to a job-application question.',
  'Constraints:',
  '- Write in first person from the user\'s perspective.',
  '- Ground every claim in the resume / work history provided. Never invent employers, titles, dates, or credentials.',
  '- Match the tone of a real applicant: confident, specific, not robotic.',
  '- Avoid clichés ("passionate self-starter", "team player"), bullet lists, and headings.',
  '- Keep to roughly the requested length (one to two short paragraphs).',
  '- If the resume contains nothing relevant to the question, return an empty string. Do NOT fabricate.',
  'Respond with strict JSON only: {"answer":"<your-draft-or-empty-string>"}.'
].join('\n');

function essayUserPrompt(profile: Profile, ctx: EssayContext): string {
  const work = (profile.work ?? []).slice(0, 6).map((w) => ({
    company: w.company,
    title: w.title,
    start: w.startDate,
    end: w.endDate,
    description: w.description?.slice(0, 600) ?? ''
  }));
  const education = (profile.education ?? []).slice(0, 4).map((e) => ({
    school: e.school,
    degree: e.degree,
    field: e.field,
    end: e.endDate
  }));
  return JSON.stringify({
    question: ctx.question,
    target_word_count: ctx.targetWords ?? 120,
    applicant: {
      name: `${profile.basics.firstName} ${profile.basics.lastName}`.trim(),
      location: [profile.basics.city, profile.basics.country].filter(Boolean).join(', '),
      work_history: work,
      education,
      resume_excerpt: ctx.resumeText ? ctx.resumeText.slice(0, 4000) : ''
    },
    role_context: {
      title: ctx.page?.title ?? '',
      site: ctx.page?.siteName ?? '',
      url: ctx.page?.url ?? ''
    }
  });
}

function parseEssayJson(raw: string): string {
  try {
    const j = JSON.parse(raw);
    return typeof j.answer === 'string' ? j.answer.trim() : '';
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) return parseEssayJson(m[0]);
    return '';
  }
}

export async function draftEssay(
  settings: LlmSettings,
  profile: Profile,
  ctx: EssayContext
): Promise<string> {
  if (settings.provider === 'off' || !settings.apiKey) return '';
  // Require at least some grounding; refuse to hallucinate.
  const hasGrounding = (ctx.resumeText && ctx.resumeText.length > 100) || (profile.work?.length ?? 0) > 0;
  if (!hasGrounding) return '';

  const user = essayUserPrompt(profile, ctx);
  let raw = '';
  try {
    if (settings.provider === 'openai') raw = await callOpenAI(settings, ESSAY_SYSTEM, user);
    else if (settings.provider === 'anthropic') raw = await callAnthropic(settings, ESSAY_SYSTEM, user);
    else if (settings.provider === 'gemini') raw = await callGemini(settings, ESSAY_SYSTEM, user);
  } catch (e) {
    console.warn('[FormAlive] essay drafter error:', e);
    return '';
  }
  return parseEssayJson(raw);
}

/** Patterns that suggest a textarea expects a free-text application answer. */
const ESSAY_LABEL_RE =
  /tell[-_ ]?us[-_ ]?(about|why)|why[-_ ]?(do|are|would|should)[-_ ]?(you|we)|why[-_ ]?(this|our|us)|describe[-_ ]?(your|a)|what[-_ ]?(makes|excites)[-_ ]?you|cover[-_ ]?letter|elaborat|explain[-_ ]?(why|how|your)|motivation|your[-_ ]?(experience|background|story)|share[-_ ]?(your|a)|interest[-_ ]?in|good[-_ ]?fit|strengths?|weakness/i;

export function looksLikeEssayQuestion(field: DetectedField): boolean {
  if (field.type !== 'textarea') return false;
  const blob = `${field.label} ${field.name} ${field.placeholder} ${field.ariaLabel}`.trim();
  if (!blob) return false;
  if (blob.length > 400) return false; // page-rendered legal text — skip
  return ESSAY_LABEL_RE.test(blob);
}
