import { describe, it, expect } from 'vitest';
import { pickAdapter } from '../src/shared/adapters';

describe('adapters', () => {
  it('picks workday for myworkdayjobs.com', () => {
    const a = pickAdapter('company.wd1.myworkdayjobs.com');
    expect(a?.id).toBe('workday');
  });

  it('workday hint maps firstName automation id', () => {
    const a = pickAdapter('foo.myworkdayjobs.com')!;
    const el = document.createElement('input');
    el.setAttribute('data-automation-id', 'legalName--firstName');
    expect(a.hintFor(el)?.extraLabel).toContain('first name');
  });

  it('greenhouse hint splits job_application[first_name]', () => {
    const a = pickAdapter('boards.greenhouse.io')!;
    const el = document.createElement('input');
    el.setAttribute('name', 'job_application[first_name]');
    expect(a.hintFor(el)?.extraLabel).toBe('first name');
  });

  it('lever hint maps urls[LinkedIn]', () => {
    const a = pickAdapter('jobs.lever.co')!;
    const el = document.createElement('input');
    el.setAttribute('name', 'urls[LinkedIn]');
    expect(a.hintFor(el)?.extraLabel).toBe('linkedin');
  });

  it('returns null for unknown host', () => {
    expect(pickAdapter('example.com')).toBeNull();
  });
});
