import type { Profile, VaultContents } from './types';

export function newId(): string {
  return crypto.randomUUID();
}

export function emptyProfile(label = 'Personal'): Profile {
  return {
    id: newId(),
    label,
    basics: {
      firstName: '',
      middleName: '',
      lastName: '',
      preferredName: '',
      pronouns: '',
      dateOfBirth: '',
      gender: '',
      nationality: '',
      email: '',
      phone: '',
      phoneCountryCode: '',
      addressLine1: '',
      addressLine2: '',
      city: '',
      state: '',
      postalCode: '',
      country: ''
    },
    links: {
      website: '',
      linkedin: '',
      github: '',
      portfolio: '',
      twitter: '',
      stackoverflow: '',
      behance: '',
      dribbble: ''
    },
    work: [],
    education: [],
    custom: {},
    eligibility: {
      status: '',
      requiresSponsorship: '',
      visaType: '',
      rightToWorkUK: '',
      workAuthCountries: '',
      noticePeriod: '',
      availableStartDate: '',
      willingToRelocate: '',
      willingToTravel: '',
      remotePreference: ''
    },
    compensation: {
      currentSalary: '',
      desiredSalary: '',
      currency: '',
      salaryPeriod: ''
    },
    identifiers: {
      passportNumber: '',
      passportCountry: '',
      passportExpiry: '',
      nationalIdNumber: '',
      nationalIdType: '',
      taxId: '',
      driversLicense: '',
      driversLicenseState: ''
    },
    usEEO: {
      raceEthnicity: '',
      genderIdentity: '',
      veteranStatus: '',
      disabilityStatus: '',
      hispanicOrLatino: ''
    },
    ukEuDiversity: {
      ethnicity: '',
      religion: '',
      sexualOrientation: '',
      disabilityStatus: '',
      socioEconomicBackground: ''
    },
    languages: [],
    references: [],
    emergencyContact: { name: '', relationship: '', phone: '', email: '' },
    updatedAt: Date.now()
  };
}

export function emptyVault(): VaultContents {
  const p = emptyProfile();
  return {
    profiles: [p],
    activeProfileId: p.id,
    createdAt: Date.now()
  };
}

/** Fill in optional sections that older vaults may not have, so the UI can
 *  bind to them safely without optional-chaining every leaf. Idempotent. */
export function normalizeProfile(p: Profile): Profile {
  const fresh = emptyProfile(p.label);
  return {
    ...fresh,
    ...p,
    basics: { ...fresh.basics, ...p.basics },
    links: { ...fresh.links, ...p.links },
    eligibility: { ...fresh.eligibility!, ...(p.eligibility ?? {}) },
    compensation: { ...fresh.compensation!, ...(p.compensation ?? {}) },
    identifiers: { ...fresh.identifiers!, ...(p.identifiers ?? {}) },
    usEEO: { ...fresh.usEEO!, ...(p.usEEO ?? {}) },
    ukEuDiversity: { ...fresh.ukEuDiversity!, ...(p.ukEuDiversity ?? {}) },
    languages: p.languages ?? [],
    references: p.references ?? [],
    emergencyContact: { ...fresh.emergencyContact!, ...(p.emergencyContact ?? {}) },
    custom: p.custom ?? {},
    work: p.work ?? [],
    education: p.education ?? []
  };
}

export function normalizeVault(v: VaultContents): VaultContents {
  return { ...v, profiles: v.profiles.map(normalizeProfile) };
}
