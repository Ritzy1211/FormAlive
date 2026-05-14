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
