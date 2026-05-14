import { describe, it, expect } from 'vitest';
import { inferLocale, disclosureRegimeFor, localizeProfile } from '../src/shared/locale';
import { emptyProfile } from '../src/shared/profile';

describe('locale', () => {
  it('reads ISO from html lang attribute (en-GB)', () => {
    const r = inferLocale('example.com', 'en-GB');
    expect(r.language).toBe('en');
    expect(r.country).toBe('GB');
  });

  it('falls back to TLD when lang has no region (de.example.com / .de)', () => {
    const r = inferLocale('jobs.example.de', 'de');
    expect(r.language).toBe('de');
    expect(r.country).toBe('DE');
  });

  it('handles co.uk style hostnames', () => {
    const r = inferLocale('careers.bbc.co.uk', '');
    expect(r.country).toBe('GB');
  });

  it('returns nothing useful for ambiguous TLDs', () => {
    const r = inferLocale('jobs.example.com', '');
    expect(r.country).toBeUndefined();
  });

  it('disclosureRegime: US → us-eeo, UK → uk-eu, NG → other', () => {
    expect(disclosureRegimeFor('US')).toBe('us-eeo');
    expect(disclosureRegimeFor('GB')).toBe('uk-eu');
    expect(disclosureRegimeFor('NG')).toBe('other');
    expect(disclosureRegimeFor(undefined)).toBe('unknown');
  });

  it('localizeProfile masks UK diversity section on US sites', () => {
    const p = emptyProfile();
    p.ukEuDiversity!.religion = 'None';
    p.usEEO!.veteranStatus = 'No';
    const us = localizeProfile(p, 'US');
    expect(us.ukEuDiversity).toBeUndefined();
    expect(us.usEEO?.veteranStatus).toBe('No');
  });

  it('localizeProfile masks US EEO on UK sites', () => {
    const p = emptyProfile();
    p.ukEuDiversity!.religion = 'None';
    p.usEEO!.veteranStatus = 'No';
    const uk = localizeProfile(p, 'GB');
    expect(uk.usEEO).toBeUndefined();
    expect(uk.ukEuDiversity?.religion).toBe('None');
  });

  it('localizeProfile masks UK NI when filling a US form', () => {
    const p = emptyProfile();
    p.identifiers!.nationalIdType = 'UK NI';
    p.identifiers!.nationalIdNumber = 'AB123456C';
    const us = localizeProfile(p, 'US');
    expect(us.identifiers?.nationalIdNumber).toBe('');
  });

  it('keeps SSN on US forms', () => {
    const p = emptyProfile();
    p.identifiers!.nationalIdType = 'SSN';
    p.identifiers!.taxId = '1234';
    const us = localizeProfile(p, 'US');
    expect(us.identifiers?.taxId).toBe('1234');
  });
});
