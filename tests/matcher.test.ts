import { describe, it, expect } from 'vitest';
import { matchField } from '../src/shared/matcher';
import { emptyProfile } from '../src/shared/profile';
import type { DetectedField } from '../src/shared/types';

function field(overrides: Partial<DetectedField>): DetectedField {
  return {
    fieldId: 'x',
    name: '',
    id: '',
    type: 'text',
    autocomplete: '',
    placeholder: '',
    label: '',
    ariaLabel: '',
    ...overrides
  };
}

describe('matcher', () => {
  const p = emptyProfile();
  p.basics.firstName = 'Ada';
  p.basics.lastName = 'Lovelace';
  p.basics.email = 'ada@example.com';
  p.links.linkedin = 'https://linkedin.com/in/ada';

  it('matches autocomplete=given-name', () => {
    const r = matchField(field({ autocomplete: 'given-name' }), p);
    expect(r?.value).toBe('Ada');
  });

  it('matches name=email', () => {
    const r = matchField(field({ name: 'email' }), p);
    expect(r?.value).toBe('ada@example.com');
  });

  it('matches label "Last Name"', () => {
    const r = matchField(field({ label: 'Last Name' }), p);
    expect(r?.value).toBe('Lovelace');
  });

  it('matches placeholder containing linkedin', () => {
    const r = matchField(field({ placeholder: 'Your LinkedIn URL' }), p);
    expect(r?.value).toBe('https://linkedin.com/in/ada');
  });

  it('returns null when no signal matches', () => {
    const r = matchField(field({ name: 'mystery_xyz' }), p);
    expect(r).toBeNull();
  });

  it('does not confuse address-level2 (city) with address-line-1', () => {
    p.basics.addressLine1 = '4 Yerima Street';
    p.basics.city = 'Sabon Tasha';
    const r = matchField(field({ autocomplete: 'address-level2' }), p);
    expect(r?.value).toBe('Sabon Tasha');
  });

  it('does not confuse address-level1 (state) with address-line-1', () => {
    p.basics.addressLine1 = '4 Yerima Street';
    p.basics.state = 'Kaduna';
    const r = matchField(field({ autocomplete: 'address-level1' }), p);
    expect(r?.value).toBe('Kaduna');
  });

  it('still matches autocomplete=address-line1 to address line 1', () => {
    p.basics.addressLine1 = '4 Yerima Street';
    const r = matchField(field({ autocomplete: 'address-line1' }), p);
    expect(r?.value).toBe('4 Yerima Street');
  });

  // ---- International / job-app coverage ----

  it('matches UK postcode label', () => {
    p.basics.postalCode = 'SW1A 1AA';
    const r = matchField(field({ label: 'Postcode' }), p);
    expect(r?.value).toBe('SW1A 1AA');
  });

  it('matches India PIN code label', () => {
    p.basics.postalCode = '110001';
    const r = matchField(field({ label: 'PIN code' }), p);
    expect(r?.value).toBe('110001');
  });

  it('matches Japanese prefecture as state', () => {
    p.basics.state = 'Tokyo';
    const r = matchField(field({ label: 'Prefecture' }), p);
    expect(r?.value).toBe('Tokyo');
  });

  it('matches notice period', () => {
    p.eligibility!.noticePeriod = '2 weeks';
    const r = matchField(field({ label: 'Notice period' }), p);
    expect(r?.value).toBe('2 weeks');
  });

  it('matches "Do you require sponsorship?"', () => {
    p.eligibility!.requiresSponsorship = 'no';
    const r = matchField(field({ label: 'Do you require sponsorship?' }), p);
    expect(r?.value).toBe('no');
  });

  it('matches desired salary', () => {
    p.compensation!.desiredSalary = '120000';
    const r = matchField(field({ label: 'Expected salary' }), p);
    expect(r?.value).toBe('120000');
  });

  it('matches preferred name before generic name', () => {
    p.basics.firstName = 'Adaeze';
    p.basics.preferredName = 'Ada';
    const r = matchField(field({ label: 'Preferred name' }), p);
    expect(r?.value).toBe('Ada');
  });

  it('matches pronouns', () => {
    p.basics.pronouns = 'she/her';
    const r = matchField(field({ label: 'Pronouns' }), p);
    expect(r?.value).toBe('she/her');
  });

  it('matches passport number', () => {
    p.identifiers!.passportNumber = 'A1234567';
    const r = matchField(field({ label: 'Passport number' }), p);
    expect(r?.value).toBe('A1234567');
  });

  it('matches nationality without colliding with country', () => {
    p.basics.nationality = 'Nigerian';
    p.basics.country = 'Nigeria';
    const r = matchField(field({ label: 'Nationality' }), p);
    expect(r?.value).toBe('Nigerian');
  });

  it('derives "yes" for authorized-to-work when no sponsorship needed', () => {
    p.eligibility!.requiresSponsorship = 'no';
    const r = matchField(
      field({ type: 'checkbox', label: 'Are you authorized to work in the country?' }),
      p
    );
    expect(r?.value).toBe('yes');
  });

  it('derives "no" for authorized-to-work when sponsorship needed', () => {
    p.eligibility!.requiresSponsorship = 'yes';
    const r = matchField(
      field({ type: 'checkbox', label: 'Are you authorized to work in the country?' }),
      p
    );
    expect(r?.value).toBe('no');
  });

  it('does NOT auto-fill consent/declaration checkboxes', () => {
    p.basics.firstName = 'Ada';
    const r = matchField(
      field({ type: 'checkbox', label: 'I confirm I have read the above.' }),
      p
    );
    expect(r).toBeNull();
  });

  it('does NOT auto-fill marketing-subscribe checkboxes', () => {
    p.basics.email = 'a@b.com';
    const r = matchField(
      field({ type: 'checkbox', label: 'Subscribe me to marketing emails' }),
      p
    );
    expect(r).toBeNull();
  });

  it('matches "Where are you currently located?" with City, Country', () => {
    p.basics.city = 'Lagos';
    p.basics.country = 'Nigeria';
    const r = matchField(field({ label: 'Where are you currently located?' }), p);
    expect(r?.value).toBe('Lagos, Nigeria');
  });

  it('matches "Current location" when only city is set', () => {
    p.basics.city = 'Berlin';
    p.basics.country = '';
    const r = matchField(field({ label: 'Current location' }), p);
    expect(r?.value).toBe('Berlin');
  });
});
