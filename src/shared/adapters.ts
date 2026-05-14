// Site-specific adapters. Adapters can:
//   - claim a host (e.g. "*.myworkdayjobs.com")
//   - provide extra field hints (extra label text) for elements we detect
//   - provide a custom locator for fields the generic scanner misses
//
// The matcher then sees richer signal text and matches more confidently.

export interface AdapterHint {
  /** Extra text appended to a field's `label` signal (improves matcher). */
  extraLabel?: string;
  /** Override the autocomplete signal entirely. */
  autocompleteOverride?: string;
}

export interface SiteAdapter {
  id: string;
  /** Returns true if this adapter handles the given hostname. */
  matches(hostname: string): boolean;
  /**
   * Inspect an input/textarea/select and optionally return hints to enrich
   * what the generic field scanner sees. Return null to skip.
   */
  hintFor(el: HTMLElement): AdapterHint | null;
}

// ---------- Workday ----------
// Workday inputs typically carry `data-automation-id` such as
// "legalName--firstName", "email", "phoneNumber--phoneNumber", "city".
const workdayMap: Array<[RegExp, string]> = [
  [/firstName|givenName/i, 'first name given name'],
  [/lastName|familyName/i, 'last name family name surname'],
  [/email/i, 'email'],
  [/phone/i, 'phone tel'],
  [/addressLine1|address1|streetAddress/i, 'address line 1 street address'],
  [/addressLine2|address2/i, 'address line 2'],
  [/city|locality/i, 'city'],
  [/state|province|region/i, 'state province'],
  [/postal|zip/i, 'postal code zip'],
  [/country/i, 'country'],
  [/linkedin/i, 'linkedin'],
  [/website|url/i, 'website url']
];

const workdayAdapter: SiteAdapter = {
  id: 'workday',
  matches: (h) => /myworkdayjobs\.com$/i.test(h) || /workday\.com$/i.test(h),
  hintFor(el) {
    const aid = el.getAttribute('data-automation-id') ?? '';
    if (!aid) return null;
    for (const [re, hint] of workdayMap) {
      if (re.test(aid)) return { extraLabel: hint };
    }
    return null;
  }
};

// ---------- Greenhouse ----------
// Greenhouse inputs use names like `job_application[first_name]`,
// `job_application[last_name]`, `job_application[email]`, `job_application[phone]`.
const greenhouseAdapter: SiteAdapter = {
  id: 'greenhouse',
  matches: (h) => /greenhouse\.io$/i.test(h) || /boards\.greenhouse\.io$/i.test(h),
  hintFor(el) {
    const name = el.getAttribute('name') ?? '';
    const m = name.match(/job_application\[([^\]]+)\]/);
    if (!m) return null;
    const key = m[1].toLowerCase();
    const mapped = key.replace(/_/g, ' ');
    return { extraLabel: mapped };
  }
};

// ---------- Lever ----------
// Lever forms (jobs.lever.co) use simple names: name, email, phone, resume,
// urls[LinkedIn], urls[GitHub], urls[Other].
const leverAdapter: SiteAdapter = {
  id: 'lever',
  matches: (h) => /jobs\.lever\.co$/i.test(h) || /lever\.co$/i.test(h),
  hintFor(el) {
    const name = el.getAttribute('name') ?? '';
    if (/^urls\[LinkedIn\]/i.test(name)) return { extraLabel: 'linkedin' };
    if (/^urls\[GitHub\]/i.test(name)) return { extraLabel: 'github' };
    if (/^urls\[Other\]/i.test(name)) return { extraLabel: 'website portfolio' };
    if (/^name$/i.test(name)) return { extraLabel: 'full name' };
    return null;
  }
};

// ---------- LinkedIn Easy Apply ----------
// LinkedIn uses dynamic ids like "single-line-text-form-component-formElement-..."
// and labels are usually present via aria-labelledby. The generic label finder
// covers most of it; this adapter just normalizes common phrasing.
const linkedinAdapter: SiteAdapter = {
  id: 'linkedin',
  matches: (h) => /linkedin\.com$/i.test(h),
  hintFor(el) {
    const aria = el.getAttribute('aria-label') ?? '';
    if (!aria) return null;
    const lower = aria.toLowerCase();
    if (lower.includes('mobile phone')) return { extraLabel: 'phone' };
    if (lower.includes('email address')) return { extraLabel: 'email' };
    if (lower.includes('first name')) return { extraLabel: 'first name' };
    if (lower.includes('last name')) return { extraLabel: 'last name' };
    return null;
  }
};

// ---------- iCIMS ----------
// iCIMS often uses name="fields[first_name]" style or id="firstname".
const icimsAdapter: SiteAdapter = {
  id: 'icims',
  matches: (h) => /icims\.com$/i.test(h),
  hintFor(el) {
    const id = (el.id || '').toLowerCase();
    const name = (el.getAttribute('name') || '').toLowerCase();
    const blob = `${id} ${name}`;
    if (/firstname|first_name/.test(blob)) return { extraLabel: 'first name' };
    if (/lastname|last_name/.test(blob)) return { extraLabel: 'last name' };
    if (/email/.test(blob)) return { extraLabel: 'email' };
    if (/phone/.test(blob)) return { extraLabel: 'phone' };
    return null;
  }
};

const ADAPTERS: SiteAdapter[] = [
  workdayAdapter,
  greenhouseAdapter,
  leverAdapter,
  linkedinAdapter,
  icimsAdapter
];

export function pickAdapter(hostname: string): SiteAdapter | null {
  return ADAPTERS.find((a) => a.matches(hostname)) ?? null;
}
