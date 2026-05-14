// Locale inference from a page's HTML and hostname.
// Used to bias the matcher toward jurisdiction-appropriate fields (e.g. avoid
// volunteering UK National Insurance number on a US Greenhouse form).

const TLD_COUNTRY: Record<string, string> = {
  us: 'US',
  uk: 'GB',
  gb: 'GB',
  ie: 'IE',
  de: 'DE',
  fr: 'FR',
  es: 'ES',
  it: 'IT',
  nl: 'NL',
  se: 'SE',
  no: 'NO',
  dk: 'DK',
  fi: 'FI',
  pl: 'PL',
  ch: 'CH',
  at: 'AT',
  ca: 'CA',
  mx: 'MX',
  br: 'BR',
  ar: 'AR',
  au: 'AU',
  nz: 'NZ',
  jp: 'JP',
  kr: 'KR',
  cn: 'CN',
  hk: 'HK',
  tw: 'TW',
  sg: 'SG',
  my: 'MY',
  id: 'ID',
  ph: 'PH',
  th: 'TH',
  vn: 'VN',
  in: 'IN',
  pk: 'PK',
  bd: 'BD',
  ng: 'NG',
  ke: 'KE',
  za: 'ZA',
  gh: 'GH',
  eg: 'EG',
  ae: 'AE',
  sa: 'SA',
  tr: 'TR',
  il: 'IL',
  ru: 'RU',
  ua: 'UA'
};

export function inferLocale(
  hostname: string,
  htmlLang: string
): { language?: string; country?: string } {
  const out: { language?: string; country?: string } = {};

  if (htmlLang) {
    const [lang, region] = htmlLang.toLowerCase().split('-');
    if (lang) out.language = lang;
    if (region && region.length === 2) out.country = region.toUpperCase();
  }

  if (!out.country) {
    const m = hostname.toLowerCase().match(/\.([a-z]{2,3})(?::\d+)?$/);
    const tld = m?.[1];
    if (tld && TLD_COUNTRY[tld]) out.country = TLD_COUNTRY[tld];
  }

  return out;
}

/** Which voluntary-disclosure section is most plausible for this country? */
export function disclosureRegimeFor(country?: string): 'us-eeo' | 'uk-eu' | 'other' | 'unknown' {
  if (!country) return 'unknown';
  if (country === 'US') return 'us-eeo';
  const ukEu = new Set([
    'GB',
    'IE',
    'DE',
    'FR',
    'ES',
    'IT',
    'NL',
    'SE',
    'NO',
    'DK',
    'FI',
    'PL',
    'CH',
    'AT',
    'BE',
    'PT',
    'CZ',
    'HU',
    'RO',
    'GR'
  ]);
  if (ukEu.has(country)) return 'uk-eu';
  return 'other';
}

import type { Profile } from './types';

/** Return a shallow copy of the profile with disclosure sections
 *  zeroed out when they don't match the page's jurisdiction. Identifiers that
 *  are jurisdiction-specific (UK NI, India PAN/Aadhaar) are also masked when
 *  the page is clearly somewhere else. Lets the matcher remain aggressive
 *  without volunteering UK NI on a US site. */
export function localizeProfile(profile: Profile, country?: string): Profile {
  if (!country) return profile;
  const regime = disclosureRegimeFor(country);
  const next: Profile = { ...profile };

  if (regime === 'us-eeo') {
    next.ukEuDiversity = undefined;
  } else if (regime === 'uk-eu' || regime === 'other') {
    next.usEEO = undefined;
  }

  // Mask jurisdiction-specific national IDs when the page country mismatches.
  if (next.identifiers && next.identifiers.nationalIdType) {
    const idType = next.identifiers.nationalIdType.toLowerCase();
    const isUk = /\b(ni|national insurance)\b/.test(idType);
    const isIndia = /\b(pan|aadhaar)\b/.test(idType);
    const isUS = /\b(ssn|social security)\b/.test(idType);
    if (
      (isUk && country !== 'GB') ||
      (isIndia && country !== 'IN') ||
      (isUS && country !== 'US')
    ) {
      next.identifiers = { ...next.identifiers, nationalIdNumber: '', taxId: '' };
    }
  }

  return next;
}
