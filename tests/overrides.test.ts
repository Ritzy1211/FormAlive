import { describe, it, expect } from 'vitest';
import {
  emptyOverrides,
  fieldSignature,
  findOverride,
  findProfileKeyForValue,
  resolveProfileValue,
  upsertOverride
} from '../src/shared/overrides';
import { emptyProfile } from '../src/shared/profile';
import type { DetectedField } from '../src/shared/types';

const field: DetectedField = {
  fieldId: 'x',
  name: 'q1_email',
  id: '',
  type: 'text',
  autocomplete: '',
  placeholder: '',
  label: 'Best email to reach you',
  ariaLabel: ''
};

describe('overrides', () => {
  it('round-trips through upsert/find', () => {
    const sig = fieldSignature(field);
    const store = upsertOverride(emptyOverrides(), 'jobs.example.com', {
      signature: sig,
      profileKey: 'basics.email'
    });
    const ov = findOverride(store, 'jobs.example.com', sig);
    expect(ov?.profileKey).toBe('basics.email');
  });

  it('reverse-looks up profile keys', () => {
    const p = emptyProfile();
    p.basics.email = 'ada@example.com';
    p.basics.firstName = 'Ada';
    p.basics.lastName = 'Lovelace';
    expect(findProfileKeyForValue(p, 'ada@example.com')).toBe('basics.email');
    expect(findProfileKeyForValue(p, 'Ada Lovelace')).toBe('fullName');
    expect(findProfileKeyForValue(p, 'nothing')).toBeNull();
  });

  it('resolves profile values back', () => {
    const p = emptyProfile();
    p.basics.email = 'a@b.co';
    p.basics.firstName = 'Ada';
    p.basics.lastName = 'Lovelace';
    expect(resolveProfileValue(p, 'basics.email')).toBe('a@b.co');
    expect(resolveProfileValue(p, 'fullName')).toBe('Ada Lovelace');
  });
});
