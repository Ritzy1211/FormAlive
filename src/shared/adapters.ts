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
  [/middleName/i, 'middle name'],
  [/preferredName/i, 'preferred name'],
  [/firstName|givenName/i, 'first name given name'],
  [/lastName|familyName/i, 'last name family name surname'],
  [/email/i, 'email'],
  [/countryPhoneCode|phoneCode|dialCode/i, 'phone country code dial code'],
  [/phoneExtension|extension/i, 'phone extension'],
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
    // Workday surfaces field semantics via several attrs; check all of them.
    const signals = [
      el.getAttribute('data-automation-id') ?? '',
      el.getAttribute('id') ?? '',
      el.getAttribute('name') ?? ''
    ].join(' ');
    if (!signals.trim()) return null;
    for (const [re, hint] of workdayMap) {
      if (re.test(signals)) return { extraLabel: hint };
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

// ---------- Ashby ----------
// Ashby (jobs.ashbyhq.com) uses `name="_systemfield_name"`, `_systemfield_email`,
// `_systemfield_resume`, `_systemfield_phoneNumber`, `_systemfield_location`,
// `_systemfield_linkedinUrl`, `_systemfield_githubUrl`, `_systemfield_websiteUrl`.
// Custom questions use `_userfield_*` with the question text in a sibling label.
const ashbyAdapter: SiteAdapter = {
  id: 'ashby',
  matches: (h) => /ashbyhq\.com$/i.test(h),
  hintFor(el) {
    const name = (el.getAttribute('name') || '').toLowerCase();
    if (!name.startsWith('_systemfield')) return null;
    const key = name.replace(/^_systemfield_?/, '');
    if (key === 'name') return { extraLabel: 'full name' };
    if (key === 'email') return { extraLabel: 'email' };
    if (key === 'phonenumber') return { extraLabel: 'phone' };
    if (key === 'location') return { extraLabel: 'city location' };
    if (key === 'linkedinurl') return { extraLabel: 'linkedin' };
    if (key === 'githuburl') return { extraLabel: 'github' };
    if (key === 'websiteurl') return { extraLabel: 'website portfolio' };
    if (key === 'resume') return null; // file input, handled by attachResume
    return null;
  }
};

// ---------- SmartRecruiters ----------
// SmartRecruiters uses ids like "field-firstName", "field-email", "field-phoneNumber",
// "field-location-city", "field-location-country". Sometimes wrapped in a postings shell.
const smartRecruitersAdapter: SiteAdapter = {
  id: 'smartrecruiters',
  matches: (h) => /smartrecruiters\.com$/i.test(h) || /jobs\.smartrecruiters\.com$/i.test(h),
  hintFor(el) {
    const id = (el.id || '').toLowerCase();
    const name = (el.getAttribute('name') || '').toLowerCase();
    const blob = `${id} ${name}`;
    if (/firstname/.test(blob)) return { extraLabel: 'first name' };
    if (/lastname/.test(blob)) return { extraLabel: 'last name' };
    if (/email/.test(blob)) return { extraLabel: 'email' };
    if (/phone/.test(blob)) return { extraLabel: 'phone' };
    if (/location[-_ ]?city|^city/.test(blob)) return { extraLabel: 'city' };
    if (/location[-_ ]?country|^country/.test(blob)) return { extraLabel: 'country' };
    if (/linkedin/.test(blob)) return { extraLabel: 'linkedin' };
    if (/coverletter|cover[-_ ]?letter/.test(blob)) return { extraLabel: 'cover letter' };
    return null;
  }
};

// ---------- BambooHR ----------
// BambooHR career sites (acme.bamboohr.com/careers) name fields with simple
// kebab/camel like "firstName", "lastName", "email", "phone", "coverLetter".
const bambooAdapter: SiteAdapter = {
  id: 'bamboohr',
  matches: (h) => /bamboohr\.com$/i.test(h),
  hintFor(el) {
    const id = (el.id || '').toLowerCase();
    const name = (el.getAttribute('name') || '').toLowerCase();
    const blob = `${id} ${name}`;
    if (/firstname|first[-_ ]?name/.test(blob)) return { extraLabel: 'first name' };
    if (/lastname|last[-_ ]?name/.test(blob)) return { extraLabel: 'last name' };
    if (/^email\b|emailaddress/.test(blob)) return { extraLabel: 'email' };
    if (/phone/.test(blob)) return { extraLabel: 'phone' };
    if (/city/.test(blob)) return { extraLabel: 'city' };
    if (/state/.test(blob)) return { extraLabel: 'state' };
    if (/zip|postal/.test(blob)) return { extraLabel: 'postal code zip' };
    if (/coverletter|cover[-_ ]?letter/.test(blob)) return { extraLabel: 'cover letter' };
    return null;
  }
};

// ---------- Taleo / Oracle HCM ----------
// Taleo (taleo.net / oraclecloud.com career sites) uses long ids like
// "input1" but exposes semantic data-* attrs. Best signal is usually the label
// text already; the adapter just promotes common cases.
const taleoAdapter: SiteAdapter = {
  id: 'taleo',
  matches: (h) =>
    /taleo\.net$/i.test(h) || /oraclecloud\.com$/i.test(h) || /jobs\.oracle\.com$/i.test(h),
  hintFor(el) {
    const aria = (el.getAttribute('aria-label') || '').toLowerCase();
    const ph = (el.getAttribute('placeholder') || '').toLowerCase();
    const blob = `${aria} ${ph}`;
    if (/first[-_ ]?name/.test(blob)) return { extraLabel: 'first name' };
    if (/last[-_ ]?name/.test(blob)) return { extraLabel: 'last name' };
    if (/email/.test(blob)) return { extraLabel: 'email' };
    if (/phone|mobile/.test(blob)) return { extraLabel: 'phone' };
    return null;
  }
};

// ---------- Indeed Apply ----------
// Indeed Apply uses ids like "input-applicant.name", "input-applicant.email",
// "input-applicant.phoneNumber". Forms often appear in an iframe on the job
// page itself (smartapply.indeed.com).
const indeedAdapter: SiteAdapter = {
  id: 'indeed',
  matches: (h) =>
    /indeed\.com$/i.test(h) || /smartapply\.indeed\.com$/i.test(h),
  hintFor(el) {
    const id = (el.id || '').toLowerCase();
    const name = (el.getAttribute('name') || '').toLowerCase();
    const blob = `${id} ${name}`;
    if (/applicant\.?(first)?name|first[-_ ]?name/.test(blob)) return { extraLabel: 'full name' };
    if (/email/.test(blob)) return { extraLabel: 'email' };
    if (/phone/.test(blob)) return { extraLabel: 'phone' };
    if (/location|city/.test(blob)) return { extraLabel: 'city' };
    if (/coverletter|cover[-_ ]?letter/.test(blob)) return { extraLabel: 'cover letter' };
    return null;
  }
};

// ---------- Workable ----------
// Workable (apply.workable.com) names fields by question id but exposes labels
// reliably. Adapter just normalises the obvious ones.
const workableAdapter: SiteAdapter = {
  id: 'workable',
  matches: (h) => /workable\.com$/i.test(h) || /apply\.workable\.com$/i.test(h),
  hintFor(el) {
    const id = (el.id || '').toLowerCase();
    const blob = id;
    if (/firstname/.test(blob)) return { extraLabel: 'first name' };
    if (/lastname/.test(blob)) return { extraLabel: 'last name' };
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
  icimsAdapter,
  ashbyAdapter,
  smartRecruitersAdapter,
  bambooAdapter,
  taleoAdapter,
  indeedAdapter,
  workableAdapter
];

export function pickAdapter(hostname: string): SiteAdapter | null {
  return ADAPTERS.find((a) => a.matches(hostname)) ?? null;
}
