import { useEffect, useRef, useState } from 'react';
import type { Profile, RuntimeResponse, VaultContents } from '../shared/types';
import { parseResumeFile, type ResumeSuggestion } from '../shared/resume';
import { emptyProfile } from '../shared/profile';

async function send<T = unknown>(msg: unknown): Promise<RuntimeResponse & { data?: T }> {
  return chrome.runtime.sendMessage(msg);
}

const BASIC_FIELDS: Array<[keyof Profile['basics'], string]> = [
  ['firstName', 'First name'],
  ['middleName', 'Middle name'],
  ['lastName', 'Last name'],
  ['preferredName', 'Preferred / nickname'],
  ['pronouns', 'Pronouns'],
  ['dateOfBirth', 'Date of birth (YYYY-MM-DD)'],
  ['gender', 'Gender'],
  ['nationality', 'Nationality / citizenship'],
  ['email', 'Email'],
  ['phoneCountryCode', 'Phone country code (+1, +44…)'],
  ['phone', 'Phone'],
  ['addressLine1', 'Address line 1'],
  ['addressLine2', 'Address line 2'],
  ['city', 'City'],
  ['state', 'State / province / region'],
  ['postalCode', 'Postal / ZIP / PIN code'],
  ['country', 'Country']
];

const LINK_FIELDS: Array<[keyof Profile['links'], string]> = [
  ['website', 'Website'],
  ['linkedin', 'LinkedIn'],
  ['github', 'GitHub'],
  ['portfolio', 'Portfolio'],
  ['twitter', 'X / Twitter'],
  ['stackoverflow', 'Stack Overflow'],
  ['behance', 'Behance'],
  ['dribbble', 'Dribbble']
];

const ELIGIBILITY_FIELDS: Array<[keyof NonNullable<Profile['eligibility']>, string, string?]> = [
  ['status', 'Work auth status', 'us-citizen, eu-citizen, h1b, visa-holder…'],
  ['requiresSponsorship', 'Requires sponsorship?', 'yes / no'],
  ['visaType', 'Visa type', 'H1B, Tier 2, Blue Card…'],
  ['rightToWorkUK', 'Right to work in UK?', 'yes / no'],
  ['workAuthCountries', 'Authorized to work in', 'comma separated'],
  ['noticePeriod', 'Notice period', '2 weeks, 30 days, Immediate'],
  ['availableStartDate', 'Earliest start date', 'YYYY-MM-DD'],
  ['willingToRelocate', 'Willing to relocate?', 'yes / no'],
  ['willingToTravel', 'Willing to travel?', 'yes / no'],
  ['remotePreference', 'Remote / hybrid / onsite', 'remote, hybrid, onsite']
];

const COMP_FIELDS: Array<[keyof NonNullable<Profile['compensation']>, string, string?]> = [
  ['currentSalary', 'Current salary', ''],
  ['desiredSalary', 'Desired / expected salary', ''],
  ['currency', 'Currency', 'USD, EUR, GBP, INR…'],
  ['salaryPeriod', 'Salary period', 'yearly / monthly / hourly']
];

const ID_FIELDS: Array<[keyof NonNullable<Profile['identifiers']>, string, string?]> = [
  ['passportNumber', 'Passport number', ''],
  ['passportCountry', 'Passport issuing country', ''],
  ['passportExpiry', 'Passport expiry', 'YYYY-MM-DD'],
  ['nationalIdType', 'National ID type', 'UK NI, India PAN, Aadhaar, MyKad…'],
  ['nationalIdNumber', 'National ID number', ''],
  ['taxId', 'Tax ID / SSN', 'last 4 only recommended'],
  ['driversLicense', "Driver's license #", ''],
  ['driversLicenseState', "Driver's license state", '']
];

const EEO_FIELDS: Array<[keyof NonNullable<Profile['usEEO']>, string, string?]> = [
  ['raceEthnicity', 'Race / ethnicity', ''],
  ['hispanicOrLatino', 'Hispanic or Latino?', 'yes / no'],
  ['genderIdentity', 'Gender identity', ''],
  ['veteranStatus', 'Veteran status', ''],
  ['disabilityStatus', 'Disability status', '']
];

const DIVERSITY_FIELDS: Array<[keyof NonNullable<Profile['ukEuDiversity']>, string, string?]> = [
  ['ethnicity', 'Ethnicity', ''],
  ['religion', 'Religion / belief', ''],
  ['sexualOrientation', 'Sexual orientation', ''],
  ['disabilityStatus', 'Disability status', ''],
  ['socioEconomicBackground', 'Socio-economic background', '']
];

const EC_FIELDS: Array<[keyof NonNullable<Profile['emergencyContact']>, string]> = [
  ['name', 'Name'],
  ['relationship', 'Relationship'],
  ['phone', 'Phone'],
  ['email', 'Email']
];

export default function Options() {
  const [vault, setVault] = useState<VaultContents | null>(null);
  const [status, setStatus] = useState<'loading' | 'locked' | 'ready'>('loading');
  const [saved, setSaved] = useState('');
  const [resumeMsg, setResumeMsg] = useState('');
  const [suggestion, setSuggestion] = useState<ResumeSuggestion | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const s = await send<{ initialized: boolean; unlocked: boolean }>({ type: 'VAULT_STATUS' });
      if (!s.ok) return setStatus('locked');
      const st = s.data as { initialized: boolean; unlocked: boolean };
      if (!st.unlocked) return setStatus('locked');
      const v = await send<VaultContents>({ type: 'VAULT_GET' });
      if (v.ok) {
        setVault(v.data as VaultContents);
        setStatus('ready');
      } else {
        setStatus('locked');
      }
    })();
  }, []);

  function updateActive(updater: (p: Profile) => Profile) {
    if (!vault) return;
    const profiles = vault.profiles.map((p) =>
      p.id === vault.activeProfileId ? { ...updater(p), updatedAt: Date.now() } : p
    );
    setVault({ ...vault, profiles });
  }

  async function save() {
    if (!vault) return;
    const r = await send({ type: 'VAULT_SAVE', contents: vault });
    setSaved(r.ok ? 'Saved.' : `Error: ${r.error}`);
    setTimeout(() => setSaved(''), 2000);
  }

  async function handleResume(file: File) {
    setResumeMsg('Parsing…');
    try {
      const s = await parseResumeFile(file);
      setSuggestion(s);
      // Also stash the file bytes so we can auto-attach it to job applications.
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      const dataB64 = btoa(bin);
      updateActive((p) => ({
        ...p,
        resume: { filename: file.name, mime: file.type || 'application/pdf', dataB64 },
        resumeText: s.rawText ?? ''
      }));
      setResumeMsg(`Stored ${file.name} (${Math.round(file.size / 1024)} KB). Review suggestions below, then apply.`);
    } catch (e) {
      setResumeMsg(`Failed to parse PDF: ${String(e)}`);
    }
  }

  function applySuggestion() {
    if (!suggestion) return;
    updateActive((p) => ({
      ...p,
      basics: { ...p.basics, ...stripEmpty(suggestion.basics) },
      links: { ...p.links, ...stripEmpty(suggestion.links) }
    }));
    setSuggestion(null);
    setResumeMsg('Applied. Remember to Save.');
  }

  if (status === 'loading') {
    return <div className="p-6 text-gray-500">Loading…</div>;
  }

  if (status === 'locked' || !vault) {
    return (
      <div className="p-6 max-w-xl mx-auto">
        <h1 className="text-xl font-semibold mb-2">FormAlive</h1>
        <p className="text-sm text-gray-600">
          Vault is locked. Open the extension popup to unlock it, then refresh this page.
        </p>
      </div>
    );
  }

  const active = vault.profiles.find((p) => p.id === vault.activeProfileId)!;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">FormAlive — Profile</h1>
        <div className="flex items-center gap-2">
          {saved && <span className="text-xs text-emerald-600">{saved}</span>}
          <button
            onClick={save}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded px-4 py-2"
          >
            Save
          </button>
        </div>
      </header>

      <section className="space-y-2">
        <label className="block text-sm font-medium">Profiles</label>
        <ProfileTabs
          profiles={vault.profiles}
          activeId={vault.activeProfileId}
          onSwitch={(id) => setVault({ ...vault, activeProfileId: id })}
          onAdd={() => {
            const np = emptyProfile(`Profile ${vault.profiles.length + 1}`);
            setVault({
              ...vault,
              profiles: [...vault.profiles, np],
              activeProfileId: np.id
            });
          }}
          onDelete={(id) => {
            if (vault.profiles.length <= 1) return;
            const profiles = vault.profiles.filter((p) => p.id !== id);
            const activeProfileId =
              vault.activeProfileId === id ? profiles[0].id : vault.activeProfileId;
            setVault({ ...vault, profiles, activeProfileId });
          }}
        />
        <label className="block text-xs text-gray-600 mt-2">Label for this profile</label>
        <input
          value={active.label}
          onChange={(e) => updateActive((p) => ({ ...p, label: e.target.value }))}
          className="w-full border rounded px-2 py-1 text-sm"
        />
      </section>

      <section className="space-y-2 border rounded p-3 bg-gray-50">
        <h2 className="text-sm font-semibold">Import from resume (PDF)</h2>
        <p className="text-xs text-gray-600">
          Parsed locally on your device. The file is never uploaded.
        </p>
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleResume(f);
          }}
          className="text-xs"
        />
        {resumeMsg && <p className="text-xs text-gray-600">{resumeMsg}</p>}
        {active.resume && (
          <div className="text-xs flex items-center justify-between bg-white border rounded px-2 py-1">
            <span>
              Stored:&nbsp;
              <code>{active.resume.filename}</code>
              <span className="text-gray-500">
                {' '}
                ({Math.round((active.resume.dataB64.length * 3) / 4 / 1024)} KB)
              </span>
            </span>
            <button
              onClick={() =>
                updateActive((p) => {
                  const { resume: _r, ...rest } = p;
                  return rest as typeof p;
                })
              }
              className="text-red-600 hover:underline"
            >
              Remove
            </button>
          </div>
        )}
        {suggestion && (
          <div className="text-xs space-y-1 pt-2 border-t">
            <p className="font-medium">Suggestions:</p>
            <pre className="bg-white border rounded p-2 overflow-auto max-h-40">
              {JSON.stringify({ basics: suggestion.basics, links: suggestion.links }, null, 2)}
            </pre>
            <div className="flex gap-2">
              <button
                onClick={applySuggestion}
                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded px-3 py-1"
              >
                Apply
              </button>
              <button
                onClick={() => setSuggestion(null)}
                className="border rounded px-3 py-1"
              >
                Discard
              </button>
            </div>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold mb-2">Basics</h2>
        <div className="grid grid-cols-2 gap-3">
          {BASIC_FIELDS.map(([key, label]) => (
            <label key={key} className="block text-xs text-gray-600">
              {label}
              <input
                value={active.basics[key]}
                onChange={(e) =>
                  updateActive((p) => ({ ...p, basics: { ...p.basics, [key]: e.target.value } }))
                }
                className="mt-1 w-full border rounded px-2 py-1 text-sm"
              />
            </label>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold mb-2">Links</h2>
        <div className="grid grid-cols-2 gap-3">
          {LINK_FIELDS.map(([key, label]) => (
            <label key={key} className="block text-xs text-gray-600">
              {label}
              <input
                value={active.links[key]}
                onChange={(e) =>
                  updateActive((p) => ({ ...p, links: { ...p.links, [key]: e.target.value } }))
                }
                className="mt-1 w-full border rounded px-2 py-1 text-sm"
              />
            </label>
          ))}
        </div>
      </section>

      <details className="border rounded p-3">
        <summary className="text-sm font-semibold cursor-pointer">
          Work eligibility &amp; preferences (job apps)
        </summary>
        <div className="grid grid-cols-2 gap-3 pt-3">
          {ELIGIBILITY_FIELDS.map(([key, label, hint]) => (
            <label key={key} className="block text-xs text-gray-600">
              {label}
              <input
                placeholder={hint}
                value={active.eligibility?.[key] ?? ''}
                onChange={(e) =>
                  updateActive((p) => ({
                    ...p,
                    eligibility: { ...(p.eligibility ?? ({} as NonNullable<Profile['eligibility']>)), [key]: e.target.value }
                  }))
                }
                className="mt-1 w-full border rounded px-2 py-1 text-sm"
              />
            </label>
          ))}
        </div>
      </details>

      <details className="border rounded p-3">
        <summary className="text-sm font-semibold cursor-pointer">Compensation</summary>
        <div className="grid grid-cols-2 gap-3 pt-3">
          {COMP_FIELDS.map(([key, label, hint]) => (
            <label key={key} className="block text-xs text-gray-600">
              {label}
              <input
                placeholder={hint}
                value={active.compensation?.[key] ?? ''}
                onChange={(e) =>
                  updateActive((p) => ({
                    ...p,
                    compensation: { ...(p.compensation ?? ({} as NonNullable<Profile['compensation']>)), [key]: e.target.value }
                  }))
                }
                className="mt-1 w-full border rounded px-2 py-1 text-sm"
              />
            </label>
          ))}
        </div>
      </details>

      <details className="border rounded p-3">
        <summary className="text-sm font-semibold cursor-pointer">
          Government IDs (sensitive — leave blank if unsure)
        </summary>
        <p className="text-xs text-amber-700 pt-2">
          Stored encrypted on this device. We recommend only filling fields you frequently
          need on forms, e.g. passport for international travel/work, last-4 of SSN for US,
          NI for UK. Aadhaar / full SSN are rarely required online — leave blank by default.
        </p>
        <div className="grid grid-cols-2 gap-3 pt-3">
          {ID_FIELDS.map(([key, label, hint]) => (
            <label key={key} className="block text-xs text-gray-600">
              {label}
              <input
                placeholder={hint}
                value={active.identifiers?.[key] ?? ''}
                onChange={(e) =>
                  updateActive((p) => ({
                    ...p,
                    identifiers: { ...(p.identifiers ?? ({} as NonNullable<Profile['identifiers']>)), [key]: e.target.value }
                  }))
                }
                className="mt-1 w-full border rounded px-2 py-1 text-sm"
              />
            </label>
          ))}
        </div>
      </details>

      <details className="border rounded p-3">
        <summary className="text-sm font-semibold cursor-pointer">
          US EEO (voluntary self-identification)
        </summary>
        <p className="text-xs text-gray-500 pt-2">
          Some US employers ask these as a separate "voluntary self-identification" section.
          Always optional — leave blank to prefer not to disclose.
        </p>
        <div className="grid grid-cols-2 gap-3 pt-3">
          {EEO_FIELDS.map(([key, label, hint]) => (
            <label key={key} className="block text-xs text-gray-600">
              {label}
              <input
                placeholder={hint}
                value={active.usEEO?.[key] ?? ''}
                onChange={(e) =>
                  updateActive((p) => ({
                    ...p,
                    usEEO: { ...(p.usEEO ?? ({} as NonNullable<Profile['usEEO']>)), [key]: e.target.value }
                  }))
                }
                className="mt-1 w-full border rounded px-2 py-1 text-sm"
              />
            </label>
          ))}
        </div>
      </details>

      <details className="border rounded p-3">
        <summary className="text-sm font-semibold cursor-pointer">
          UK / EU diversity monitoring (voluntary)
        </summary>
        <div className="grid grid-cols-2 gap-3 pt-3">
          {DIVERSITY_FIELDS.map(([key, label, hint]) => (
            <label key={key} className="block text-xs text-gray-600">
              {label}
              <input
                placeholder={hint}
                value={active.ukEuDiversity?.[key] ?? ''}
                onChange={(e) =>
                  updateActive((p) => ({
                    ...p,
                    ukEuDiversity: { ...(p.ukEuDiversity ?? ({} as NonNullable<Profile['ukEuDiversity']>)), [key]: e.target.value }
                  }))
                }
                className="mt-1 w-full border rounded px-2 py-1 text-sm"
              />
            </label>
          ))}
        </div>
      </details>

      <details className="border rounded p-3">
        <summary className="text-sm font-semibold cursor-pointer">Languages</summary>
        <LanguagesEditor
          languages={active.languages ?? []}
          onChange={(languages) => updateActive((p) => ({ ...p, languages }))}
        />
      </details>

      <details className="border rounded p-3">
        <summary className="text-sm font-semibold cursor-pointer">References</summary>
        <ReferencesEditor
          refs={active.references ?? []}
          onChange={(references) => updateActive((p) => ({ ...p, references }))}
        />
      </details>

      <details className="border rounded p-3">
        <summary className="text-sm font-semibold cursor-pointer">Emergency contact</summary>
        <div className="grid grid-cols-2 gap-3 pt-3">
          {EC_FIELDS.map(([key, label]) => (
            <label key={key} className="block text-xs text-gray-600">
              {label}
              <input
                value={active.emergencyContact?.[key] ?? ''}
                onChange={(e) =>
                  updateActive((p) => ({
                    ...p,
                    emergencyContact: {
                      ...(p.emergencyContact ?? ({} as NonNullable<Profile['emergencyContact']>)),
                      [key]: e.target.value
                    }
                  }))
                }
                className="mt-1 w-full border rounded px-2 py-1 text-sm"
              />
            </label>
          ))}
        </div>
      </details>

      <section>
        <h2 className="text-sm font-semibold mb-2">Custom fields</h2>
        <p className="text-xs text-gray-500 mb-2">
          Keys are matched against form field <code>name</code> or <code>id</code> attributes.
        </p>
        <CustomFieldsEditor
          custom={active.custom}
          onChange={(custom) => updateActive((p) => ({ ...p, custom }))}
        />
      </section>

      <section>
        <h2 className="text-sm font-semibold mb-2">Snippets (cover letters, etc.)</h2>
        <p className="text-xs text-gray-500 mb-2">
          Long-text templates for fields like cover letter, "why this role", "tell us about yourself".
          Use placeholders: <code>{`{{firstName}}`}</code>, <code>{`{{lastName}}`}</code>,{' '}
          <code>{`{{email}}`}</code>, <code>{`{{company}}`}</code>, <code>{`{{role}}`}</code>.
          Recommended keys: <code>coverLetter</code>, <code>whyUs</code>, <code>aboutMe</code>,{' '}
          <code>summary</code>.
        </p>
        <SnippetsEditor
          snippets={active.snippets ?? {}}
          onChange={(snippets) => updateActive((p) => ({ ...p, snippets }))}
        />
      </section>

      <section className="space-y-2 border-t pt-4">
        <h2 className="text-sm font-semibold">AI fallback (optional)</h2>
        <p className="text-xs text-gray-500">
          When rules can't match a field, FormAlive can ask an LLM you choose to pick the best
          profile key. Only the field's metadata + your profile key names are sent — never your
          actual values. Your API key is stored encrypted in your vault.
        </p>
        <LlmEditor
          settings={vault.llm ?? { provider: 'off', apiKey: '', model: '' }}
          onChange={(llm) => setVault({ ...vault, llm })}
        />
      </section>

      <section className="border-t pt-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold">Learned site mappings</h2>
          {vault.overrides && Object.keys(vault.overrides.byHost).length > 0 && (
            <button
              onClick={() => setVault({ ...vault, overrides: { byHost: {} } })}
              className="text-xs text-red-600 hover:underline"
            >
              Clear all
            </button>
          )}
        </div>
        <OverridesViewer
          overrides={vault.overrides?.byHost ?? {}}
          onClear={(host) => {
            const byHost = { ...(vault.overrides?.byHost ?? {}) };
            delete byHost[host];
            setVault({ ...vault, overrides: { byHost } });
          }}
        />
      </section>
    </div>
  );
}

function SnippetsEditor({
  snippets,
  onChange
}: {
  snippets: Record<string, string>;
  onChange: (s: Record<string, string>) => void;
}) {
  const [newKey, setNewKey] = useState('');
  const keys = Object.keys(snippets);
  return (
    <div className="space-y-3">
      {keys.length === 0 && (
        <p className="text-xs text-gray-500 italic">No snippets yet.</p>
      )}
      {keys.map((k) => (
        <div key={k} className="border rounded p-2 space-y-1 bg-white">
          <div className="flex items-center justify-between">
            <code className="text-xs font-medium">{k}</code>
            <button
              onClick={() => {
                if (!confirm(`Delete snippet "${k}"?`)) return;
                const next = { ...snippets };
                delete next[k];
                onChange(next);
              }}
              className="text-xs text-red-600 hover:underline"
            >
              Remove
            </button>
          </div>
          <textarea
            value={snippets[k]}
            onChange={(e) => onChange({ ...snippets, [k]: e.target.value })}
            rows={6}
            className="w-full border rounded p-2 text-xs font-mono"
            placeholder="Dear {{company}} team,&#10;&#10;I'm excited to apply for the {{role}} role…"
          />
        </div>
      ))}
      <div className="flex items-center gap-2 pt-2 border-t">
        <input
          placeholder="snippet key (e.g. coverLetter)"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          className="flex-1 border rounded px-2 py-1 text-sm"
        />
        <button
          onClick={() => {
            const k = newKey.trim();
            if (!k || snippets[k] != null) return;
            onChange({ ...snippets, [k]: '' });
            setNewKey('');
          }}
          className="text-xs bg-gray-800 text-white rounded px-3 py-1"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function CustomFieldsEditor({
  custom,
  onChange
}: {
  custom: Record<string, string>;
  onChange: (c: Record<string, string>) => void;
}) {
  const [key, setKey] = useState('');
  const [val, setVal] = useState('');
  const entries = Object.entries(custom);

  return (
    <div className="space-y-2">
      {entries.map(([k, v]) => (
        <div key={k} className="flex items-center gap-2">
          <input value={k} readOnly className="flex-1 border rounded px-2 py-1 text-sm bg-gray-50" />
          <input
            value={v}
            onChange={(e) => onChange({ ...custom, [k]: e.target.value })}
            className="flex-1 border rounded px-2 py-1 text-sm"
          />
          <button
            onClick={() => {
              const next = { ...custom };
              delete next[k];
              onChange(next);
            }}
            className="text-xs text-red-600 hover:underline"
          >
            Remove
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2 pt-2 border-t">
        <input
          placeholder="field name or id"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          className="flex-1 border rounded px-2 py-1 text-sm"
        />
        <input
          placeholder="value"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          className="flex-1 border rounded px-2 py-1 text-sm"
        />
        <button
          onClick={() => {
            if (!key) return;
            onChange({ ...custom, [key]: val });
            setKey('');
            setVal('');
          }}
          className="text-xs bg-gray-800 text-white rounded px-3 py-1"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function stripEmpty<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' && v.trim()) out[k] = v;
    else if (v != null && typeof v !== 'string') out[k] = v;
  }
  return out as Partial<T>;
}

function LlmEditor({
  settings,
  onChange
}: {
  settings: import('../shared/types').LlmSettings;
  onChange: (s: import('../shared/types').LlmSettings) => void;
}) {
  const defaultModel: Record<string, string> = {
    openai: 'gpt-4o-mini',
    anthropic: 'claude-3-5-haiku-latest',
    gemini: 'gemini-1.5-flash',
    off: ''
  };
  return (
    <div className="grid grid-cols-3 gap-2">
      <label className="block text-xs text-gray-600">
        Provider
        <select
          value={settings.provider}
          onChange={(e) => {
            const provider = e.target.value as import('../shared/types').LlmSettings['provider'];
            onChange({ ...settings, provider, model: settings.model || defaultModel[provider] });
          }}
          className="mt-1 w-full border rounded px-2 py-1 text-sm"
        >
          <option value="off">Off</option>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="gemini">Google Gemini</option>
        </select>
      </label>
      <label className="block text-xs text-gray-600">
        Model
        <input
          value={settings.model}
          onChange={(e) => onChange({ ...settings, model: e.target.value })}
          placeholder={defaultModel[settings.provider] || ''}
          className="mt-1 w-full border rounded px-2 py-1 text-sm"
        />
      </label>
      <label className="block text-xs text-gray-600">
        API key
        <input
          type="password"
          value={settings.apiKey}
          onChange={(e) => onChange({ ...settings, apiKey: e.target.value })}
          className="mt-1 w-full border rounded px-2 py-1 text-sm"
        />
      </label>
    </div>
  );
}

function ProfileTabs({
  profiles,
  activeId,
  onSwitch,
  onAdd,
  onDelete
}: {
  profiles: Profile[];
  activeId: string;
  onSwitch: (id: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {profiles.map((p) => {
        const isActive = p.id === activeId;
        return (
          <div
            key={p.id}
            className={`flex items-center gap-1 rounded px-2 py-1 text-xs border ${
              isActive ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'border-gray-200'
            }`}
          >
            <button
              onClick={() => onSwitch(p.id)}
              className={isActive ? 'font-medium' : 'hover:underline'}
            >
              {p.label || 'Untitled'}
            </button>
            {profiles.length > 1 && (
              <button
                onClick={() => {
                  if (confirm(`Delete profile "${p.label || 'Untitled'}"?`)) onDelete(p.id);
                }}
                className="text-red-500 hover:text-red-700"
                title="Delete profile"
              >
                ×
              </button>
            )}
          </div>
        );
      })}
      <button
        onClick={onAdd}
        className="text-xs rounded px-2 py-1 border border-dashed hover:bg-gray-50"
      >
        + Add profile
      </button>
    </div>
  );
}

function OverridesViewer({
  overrides,
  onClear
}: {
  overrides: Record<string, Array<{ signature: string; profileKey: string }>>;
  onClear: (host: string) => void;
}) {
  const hosts = Object.keys(overrides);
  if (hosts.length === 0) {
    return (
      <p className="text-xs text-gray-500">
        No learned mappings yet. As you fill forms manually, FormAlive will remember which fields
        match which profile values for that site.
      </p>
    );
  }
  return (
    <ul className="space-y-2 text-xs">
      {hosts.map((h) => (
        <li key={h} className="border rounded p-2">
          <div className="flex items-center justify-between">
            <span className="font-medium">{h}</span>
            <button onClick={() => onClear(h)} className="text-red-600 hover:underline">
              Clear
            </button>
          </div>
          <div className="text-gray-500 mt-1">{overrides[h].length} mapping(s)</div>
        </li>
      ))}
    </ul>
  );
}

function LanguagesEditor({
  languages,
  onChange
}: {
  languages: NonNullable<Profile['languages']>;
  onChange: (l: NonNullable<Profile['languages']>) => void;
}) {
  return (
    <div className="space-y-2 pt-3">
      {languages.map((lang, i) => (
        <div key={lang.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <input
            placeholder="Language (e.g. English)"
            value={lang.language}
            onChange={(e) => {
              const next = [...languages];
              next[i] = { ...lang, language: e.target.value };
              onChange(next);
            }}
            className="border rounded px-2 py-1 text-sm"
          />
          <input
            placeholder="Proficiency (Native / Fluent / Conversational / Basic)"
            value={lang.proficiency}
            onChange={(e) => {
              const next = [...languages];
              next[i] = { ...lang, proficiency: e.target.value };
              onChange(next);
            }}
            className="border rounded px-2 py-1 text-sm"
          />
          <button
            onClick={() => onChange(languages.filter((_, j) => j !== i))}
            className="text-red-600 text-xs px-2"
          >
            Remove
          </button>
        </div>
      ))}
      <button
        onClick={() =>
          onChange([...languages, { id: crypto.randomUUID(), language: '', proficiency: '' }])
        }
        className="text-xs bg-gray-800 text-white rounded px-3 py-1"
      >
        Add language
      </button>
    </div>
  );
}

function ReferencesEditor({
  refs,
  onChange
}: {
  refs: NonNullable<Profile['references']>;
  onChange: (r: NonNullable<Profile['references']>) => void;
}) {
  const update = (i: number, patch: Partial<NonNullable<Profile['references']>[number]>) => {
    const next = [...refs];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  return (
    <div className="space-y-3 pt-3">
      {refs.map((r, i) => (
        <div key={r.id} className="border rounded p-2 grid grid-cols-2 gap-2 bg-white">
          <input
            placeholder="Name"
            value={r.name}
            onChange={(e) => update(i, { name: e.target.value })}
            className="border rounded px-2 py-1 text-sm"
          />
          <input
            placeholder="Relationship (e.g. Manager)"
            value={r.relationship}
            onChange={(e) => update(i, { relationship: e.target.value })}
            className="border rounded px-2 py-1 text-sm"
          />
          <input
            placeholder="Company"
            value={r.company}
            onChange={(e) => update(i, { company: e.target.value })}
            className="border rounded px-2 py-1 text-sm"
          />
          <input
            placeholder="Title"
            value={r.title}
            onChange={(e) => update(i, { title: e.target.value })}
            className="border rounded px-2 py-1 text-sm"
          />
          <input
            placeholder="Email"
            value={r.email}
            onChange={(e) => update(i, { email: e.target.value })}
            className="border rounded px-2 py-1 text-sm"
          />
          <input
            placeholder="Phone"
            value={r.phone}
            onChange={(e) => update(i, { phone: e.target.value })}
            className="border rounded px-2 py-1 text-sm"
          />
          <button
            onClick={() => onChange(refs.filter((_, j) => j !== i))}
            className="col-span-2 text-red-600 text-xs hover:underline justify-self-end"
          >
            Remove reference
          </button>
        </div>
      ))}
      <button
        onClick={() =>
          onChange([
            ...refs,
            {
              id: crypto.randomUUID(),
              name: '',
              relationship: '',
              company: '',
              title: '',
              email: '',
              phone: ''
            }
          ])
        }
        className="text-xs bg-gray-800 text-white rounded px-3 py-1"
      >
        Add reference
      </button>
    </div>
  );
}

