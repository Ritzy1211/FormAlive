import type { DetectedField, FilledValue, Profile } from './types';

/**
 * Rule-based field matcher. Maps a DetectedField to the best value
 * from the active profile using HTML autocomplete tokens and label heuristics.
 *
 * Returns null when no confident match is found (caller can fall back to LLM later).
 */
export function matchField(field: DetectedField, profile: Profile): FilledValue | null {
  const signal = [
    field.autocomplete,
    field.name,
    field.id,
    field.placeholder,
    field.label,
    field.ariaLabel
  ]
    .join(' ')
    .toLowerCase();

  // Never auto-check consent / declaration / agreement checkboxes — the user
  // must read and confirm these themselves. Same for "subscribe" / "marketing".
  if (
    (field.type === 'checkbox' || field.type === 'radio') &&
    /\b(agree|consent|confirm|terms|privacy|policy|read[-_ ]?the[-_ ]?above|certify|attest|sign[-_ ]?off|subscribe|marketing|gdpr)\b/i.test(
      signal
    )
  ) {
    return null;
  }

  const b = profile.basics;
  const l = profile.links;
  const el = profile.eligibility;
  const co = profile.compensation;
  const ids = profile.identifiers;
  const eeo = profile.usEEO;
  const div = profile.ukEuDiversity;
  const ec = profile.emergencyContact;
  const ref0 = profile.references?.[0];
  const lang0 = profile.languages?.[0];

  // Derived yes/no for "are you authorized to work" — inverse of sponsorship.
  // If user said they need sponsorship → not authorized in that country.
  const authorizedToWork =
    el?.requiresSponsorship === 'no'
      ? 'yes'
      : el?.requiresSponsorship === 'yes'
        ? 'no'
        : '';

  const rules: Array<{ test: RegExp; value: string | undefined; confidence: number }> = [
    // ---- Identity ----
    // Specific name variants before generic "name"
    { test: /\bmiddle[-_ ]?name\b|\bmiddle\b/, value: b.middleName, confidence: 0.9 },
    { test: /preferred[-_ ]?name|nickname|\bgoes by\b|known[-_ ]?as/, value: b.preferredName, confidence: 0.9 },
    { test: /\bpronouns?\b/, value: b.pronouns, confidence: 0.95 },
    { test: /date[-_ ]?of[-_ ]?birth|\bdob\b|\bbirth[-_ ]?date\b|\bbday\b/, value: b.dateOfBirth, confidence: 0.95 },
    { test: /\bnationality\b|citizenship/, value: b.nationality, confidence: 0.9 },
    { test: /\bgender\b(?!.*identity)|\bsex\b/, value: b.gender, confidence: 0.85 },

    // HTML autocomplete tokens — highest confidence
    { test: /\bgiven-name\b|\bfirst[-_ ]?name\b|\bfname\b|\bforename\b/, value: b.firstName, confidence: 0.95 },
    { test: /\bfamily-name\b|\blast[-_ ]?name\b|\bsurname\b|\blname\b/, value: b.lastName, confidence: 0.95 },
    { test: /\bemail\b/, value: b.email, confidence: 0.95 },
    // Phone country / dial code before generic phone
    { test: /country[-_ ]?code|dial[-_ ]?code|phone[-_ ]?code|\biso[-_ ]?code\b/, value: b.phoneCountryCode, confidence: 0.85 },
    { test: /\btel\b|\bphone\b|\bmobile\b|\bcell\b/, value: b.phone, confidence: 0.9 },

    // ---- Work eligibility (job applications) ----
    // These must run BEFORE address rules so questions like "authorized to
    // work in the country?" don't get caught by the generic country rule.
    { test: /sponsor(ship)?|require[-_ ]?sponsor|need[-_ ]?sponsor/, value: el?.requiresSponsorship, confidence: 0.92 },
    { test: /authoriz(ed|ation)[-_ ]?to[-_ ]?work|work[-_ ]?auth|legally[-_ ]?(allowed|authoris(ed|ation))|eligible[-_ ]?to[-_ ]?work/, value: authorizedToWork || el?.status, confidence: 0.9 },
    { test: /right[-_ ]?to[-_ ]?work/, value: el?.rightToWorkUK, confidence: 0.9 },
    { test: /\bvisa\b/, value: el?.visaType, confidence: 0.8 },
    { test: /notice[-_ ]?period/, value: el?.noticePeriod, confidence: 0.95 },
    { test: /(available|start)[-_ ]?(date|from)|earliest[-_ ]?start/, value: el?.availableStartDate, confidence: 0.9 },
    { test: /relocat/, value: el?.willingToRelocate, confidence: 0.9 },
    { test: /willing[-_ ]?to[-_ ]?travel|travel[-_ ]?(percentage|required)/, value: el?.willingToTravel, confidence: 0.85 },
    { test: /\bremote\b|hybrid|on[-_ ]?site|work[-_ ]?(model|arrangement|location)/, value: el?.remotePreference, confidence: 0.7 },

    // ---- Address ----
    // City and state MUST be checked before generic "address".
    { test: /\bcity\b|address-level2|\blocality\b|\btown\b/, value: b.city, confidence: 0.9 },
    { test: /\bstate\b|\bprovince\b|\bregion\b|prefecture|\boblast\b|\bcounty\b|address-level1/, value: b.state, confidence: 0.85 },
    { test: /postal[-_ ]?code|\bzip\b|zipcode|\bpostcode\b|\bpin[-_ ]?code\b|\beircode\b/, value: b.postalCode, confidence: 0.9 },
    { test: /\bcountry\b/, value: b.country, confidence: 0.85 },
    { test: /address[-_ ]?line[-_ ]?1|street[-_ ]?address|\baddress1\b|\baddress\b(?![-_ ]?(?:line[-_ ]?2|2|level))/, value: b.addressLine1, confidence: 0.85 },
    { test: /address[-_ ]?line[-_ ]?2|\baddress2\b|\bapt\b|apartment|\bsuite\b|\bunit\b/, value: b.addressLine2, confidence: 0.85 },

    // ---- Links ----
    { test: /linkedin/, value: l.linkedin, confidence: 0.95 },
    { test: /github/, value: l.github, confidence: 0.95 },
    { test: /portfolio/, value: l.portfolio, confidence: 0.9 },
    { test: /\btwitter\b|\bx\.com\b|x[-_ ]?handle/, value: l.twitter, confidence: 0.9 },
    { test: /stack[-_ ]?overflow|\bstackoverflow\b/, value: l.stackoverflow, confidence: 0.95 },
    { test: /behance/, value: l.behance, confidence: 0.95 },
    { test: /dribbble/, value: l.dribbble, confidence: 0.95 },
    { test: /\bwebsite\b|personal[-_ ]?site|\burl\b/, value: l.website, confidence: 0.75 },

    // ---- Compensation ----
    { test: /current[-_ ]?(salary|compensation|pay|ctc)/, value: co?.currentSalary, confidence: 0.95 },
    { test: /(desired|expected|target)[-_ ]?(salary|compensation|pay|ctc)|salary[-_ ]?expectation/, value: co?.desiredSalary, confidence: 0.95 },
    { test: /\bcurrency\b/, value: co?.currency, confidence: 0.85 },

    // ---- Sensitive IDs ----
    { test: /passport[-_ ]?(number|no|#)|passport$/, value: ids?.passportNumber, confidence: 0.9 },
    { test: /passport[-_ ]?country/, value: ids?.passportCountry, confidence: 0.9 },
    { test: /passport[-_ ]?(expiry|expiration)/, value: ids?.passportExpiry, confidence: 0.9 },
    { test: /national[-_ ]?(id|insurance)|\bni[-_ ]?number\b|\bnin\b|\bpan\b(?!el)|\baadhaar\b|\bmyk(ad|number)\b/, value: ids?.nationalIdNumber, confidence: 0.85 },
    { test: /\bssn\b|social[-_ ]?security|tax[-_ ]?id|\btin\b|\bitin\b/, value: ids?.taxId, confidence: 0.85 },
    { test: /driver'?s?[-_ ]?licen[cs]e/, value: ids?.driversLicense, confidence: 0.9 },

    // ---- US EEO ----
    { test: /race|ethnic/, value: eeo?.raceEthnicity, confidence: 0.85 },
    { test: /gender[-_ ]?identity/, value: eeo?.genderIdentity, confidence: 0.9 },
    { test: /veteran/, value: eeo?.veteranStatus, confidence: 0.9 },
    { test: /disab(ility|led)/, value: eeo?.disabilityStatus, confidence: 0.85 },
    { test: /hispanic|latino|latinx/, value: eeo?.hispanicOrLatino, confidence: 0.9 },

    // ---- UK/EU diversity ----
    { test: /religion|faith[-_ ]?belief/, value: div?.religion, confidence: 0.9 },
    { test: /sexual[-_ ]?orientation/, value: div?.sexualOrientation, confidence: 0.95 },
    { test: /socio[-_ ]?economic|social[-_ ]?background/, value: div?.socioEconomicBackground, confidence: 0.85 },

    // ---- Emergency contact ----
    { test: /emergency[-_ ]?contact[-_ ]?name|emergency.*name/, value: ec?.name, confidence: 0.9 },
    { test: /emergency.*(phone|tel|mobile)/, value: ec?.phone, confidence: 0.9 },
    { test: /emergency.*email/, value: ec?.email, confidence: 0.9 },
    { test: /emergency.*relationship/, value: ec?.relationship, confidence: 0.9 },

    // ---- First reference / language (only if user has any) ----
    { test: /reference[-_ ]?(name|1[-_ ]?name)|referee[-_ ]?name/, value: ref0?.name, confidence: 0.8 },
    { test: /reference[-_ ]?(email|1[-_ ]?email)/, value: ref0?.email, confidence: 0.85 },
    { test: /reference[-_ ]?(phone|1[-_ ]?phone)/, value: ref0?.phone, confidence: 0.85 },
    { test: /\blanguage\b(?!.*level)|languages[-_ ]?spoken/, value: lang0?.language, confidence: 0.7 },

    { test: /full[-_ ]?name|\byour name\b|^name$|\bapplicant name\b|legal[-_ ]?name/, value: `${b.firstName} ${b.lastName}`.trim(), confidence: 0.8 }
  ];

  for (const r of rules) {
    if (r.value && r.test.test(signal)) {
      return { fieldId: field.fieldId, value: r.value, confidence: r.confidence };
    }
  }

  // Custom fields exact key match (case-insensitive on name/id)
  for (const [k, v] of Object.entries(profile.custom)) {
    const kl = k.toLowerCase();
    if (v && (field.name.toLowerCase() === kl || field.id.toLowerCase() === kl)) {
      return { fieldId: field.fieldId, value: v, confidence: 0.85 };
    }
  }

  return null;
}

export function matchAll(fields: DetectedField[], profile: Profile): FilledValue[] {
  const out: FilledValue[] = [];
  for (const f of fields) {
    const m = matchField(f, profile);
    if (m) out.push(m);
  }
  return out;
}
