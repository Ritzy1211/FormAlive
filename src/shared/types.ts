// Shared types used across popup, options, background, and content scripts.

export interface ProfileBasics {
  firstName: string;
  middleName: string;
  lastName: string;
  preferredName: string;
  pronouns: string;
  dateOfBirth: string; // YYYY-MM-DD
  gender: string;
  nationality: string;
  email: string;
  phone: string;
  phoneCountryCode: string; // e.g. "+1", "+44"
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string; // also: province / region / prefecture / oblast
  postalCode: string;
  country: string;
}

export interface ProfileLinks {
  website: string;
  linkedin: string;
  github: string;
  portfolio: string;
  twitter: string;
  stackoverflow: string;
  behance: string;
  dribbble: string;
}

/** Work eligibility — varies wildly by jurisdiction. */
export interface WorkEligibility {
  /** "us-citizen" | "us-permanent-resident" | "us-visa-holder" | "eu-citizen" |
   *  "uk-citizen" | "uk-settled" | "other" | "" */
  status: string;
  requiresSponsorship: '' | 'yes' | 'no';
  visaType: string; // H1B, L1, Tier 2, Blue Card, etc.
  rightToWorkUK: '' | 'yes' | 'no';
  workAuthCountries: string; // free-text list, comma separated
  noticePeriod: string; // e.g. "2 weeks", "30 days", "Immediately"
  availableStartDate: string; // YYYY-MM-DD
  willingToRelocate: '' | 'yes' | 'no';
  willingToTravel: '' | 'yes' | 'no';
  remotePreference: string; // remote / hybrid / onsite
}

export interface Compensation {
  currentSalary: string;
  desiredSalary: string;
  currency: string; // USD, EUR, GBP, INR, SGD, JPY…
  salaryPeriod: string; // yearly / monthly / hourly
}

/** Sensitive identifiers — stored encrypted, but most matchers should be
 *  conservative about auto-filling these. */
export interface Identifiers {
  passportNumber: string;
  passportCountry: string;
  passportExpiry: string;
  nationalIdNumber: string; // generic — UK NI, India PAN, etc.
  nationalIdType: string;
  taxId: string; // SSN last-4 / NI / TIN
  driversLicense: string;
  driversLicenseState: string;
}

/** US voluntary self-identification — Equal Employment Opportunity. */
export interface UsEEO {
  raceEthnicity: string;
  genderIdentity: string;
  veteranStatus: string;
  disabilityStatus: string;
  hispanicOrLatino: '' | 'yes' | 'no';
}

/** UK / EU diversity monitoring — different categories than US EEO. */
export interface UkEuDiversity {
  ethnicity: string;
  religion: string;
  sexualOrientation: string;
  disabilityStatus: string;
  socioEconomicBackground: string;
}

export interface LanguageSkill {
  id: string;
  language: string;
  proficiency: string; // Native / Fluent / Conversational / Basic
}

export interface Reference {
  id: string;
  name: string;
  relationship: string;
  company: string;
  title: string;
  email: string;
  phone: string;
}

export interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
  email: string;
}

export interface WorkExperience {
  id: string;
  company: string;
  title: string;
  startDate: string; // YYYY-MM
  endDate: string; // YYYY-MM or "Present"
  description: string;
}

export interface Education {
  id: string;
  school: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string;
}

export interface Profile {
  id: string;
  label: string; // e.g. "Personal", "Freelance"
  basics: ProfileBasics;
  links: ProfileLinks;
  work: WorkExperience[];
  education: Education[];
  custom: Record<string, string>;
  /** Named templates for long-text fields (cover letter, summary, etc.).
   *  Values may contain {{firstName}}, {{lastName}}, {{email}}, {{company}}, {{role}}. */
  snippets?: Record<string, string>;
  /** Optional resume PDF stored as base64. Filename is preserved. */
  resume?: { filename: string; mime: string; dataB64: string };
  // ---- Optional sections (back-compat: older vaults may omit these) ----
  eligibility?: WorkEligibility;
  compensation?: Compensation;
  identifiers?: Identifiers;
  usEEO?: UsEEO;
  ukEuDiversity?: UkEuDiversity;
  languages?: LanguageSkill[];
  references?: Reference[];
  emergencyContact?: EmergencyContact;
  updatedAt: number;
}

/** Persisted, encrypted vault envelope stored in chrome.storage.local. */
export interface VaultEnvelope {
  v: 1;
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  saltB64: string;
  ivB64: string;
  ciphertextB64: string;
}

export interface VaultContents {
  profiles: Profile[];
  activeProfileId: string;
  createdAt: number;
  /** Per-host learned field mappings. */
  overrides?: import('./overrides').OverrideStore;
  /** Optional LLM settings (API key stored only in the encrypted vault). */
  llm?: LlmSettings;
}

export interface LlmSettings {
  provider: 'openai' | 'anthropic' | 'gemini' | 'off';
  apiKey: string;
  model: string;
}

// ---- Messaging ----

export type RuntimeMessage =
  | { type: 'VAULT_STATUS' }
  | { type: 'VAULT_INIT'; passphrase: string }
  | { type: 'VAULT_UNLOCK'; passphrase: string }
  | { type: 'VAULT_LOCK' }
  | { type: 'VAULT_GET' }
  | { type: 'VAULT_SAVE'; contents: VaultContents }
  | { type: 'FILL_REQUEST'; hostname: string; fields: DetectedField[]; pageContext?: PageContext }
  | { type: 'LEARN_OVERRIDE'; hostname: string; field: DetectedField; value: string }
  | { type: 'FILL_PAGE' }
  | { type: 'SCAN_REPORT' }
  | { type: 'GET_RESUME' };

export interface PageContext {
  title: string;
  siteName: string;
  url: string;
  /** ISO 639-1 language code from `<html lang>` (e.g. "en", "fr", "ja"). */
  language?: string;
  /** ISO 3166-1 alpha-2 country guess from TLD/lang region (e.g. "US", "GB", "DE"). */
  country?: string;
}

export interface DetectedField {
  fieldId: string; // synthetic id assigned by content script
  name: string;
  id: string;
  type: string;
  autocomplete: string;
  placeholder: string;
  label: string;
  ariaLabel: string;
  /** For radio groups and <select>: the option labels. Empty otherwise. */
  options?: string[];
}

export interface FilledValue {
  fieldId: string;
  value: string;
  confidence: number; // 0..1
}

export type RuntimeResponse =
  | { ok: true; data?: unknown }
  | { ok: false; error: string };
