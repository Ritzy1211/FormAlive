import { describe, expect, it } from 'vitest';
import {
  BETA_END_MS,
  effectivePlan,
  isPro,
  isTeams,
  inBeta,
  limitsFor,
  planLabel,
  PLAN_LIMITS
} from '../src/shared/license';

const BEFORE = BETA_END_MS - 1000; // still in beta
const AFTER = BETA_END_MS + 1000; // after beta

describe('license — beta window', () => {
  it('inBeta toggles around BETA_END_MS', () => {
    expect(inBeta(BEFORE)).toBe(true);
    expect(inBeta(AFTER)).toBe(false);
  });

  it('free user gets Pro effectively while beta is active', () => {
    const lic = { plan: 'free' as const };
    expect(effectivePlan(lic, BEFORE)).toBe('pro');
    expect(isPro(lic, BEFORE)).toBe(true);
    expect(limitsFor(lic, BEFORE)).toEqual(PLAN_LIMITS.pro);
  });

  it('free user falls back to free limits once beta ends', () => {
    const lic = { plan: 'free' as const };
    expect(effectivePlan(lic, AFTER)).toBe('free');
    expect(isPro(lic, AFTER)).toBe(false);
    expect(limitsFor(lic, AFTER).maxProfiles).toBe(1);
    expect(limitsFor(lic, AFTER).aiEnabled).toBe(false);
  });

  it('stored Pro stays Pro before and after beta', () => {
    const lic = { plan: 'pro' as const };
    expect(effectivePlan(lic, BEFORE)).toBe('pro');
    expect(effectivePlan(lic, AFTER)).toBe('pro');
    expect(isPro(lic, AFTER)).toBe(true);
  });

  it('stored Teams stays Teams and gets teams features', () => {
    const lic = { plan: 'teams' as const };
    expect(isTeams(lic, BEFORE)).toBe(true);
    expect(isTeams(lic, AFTER)).toBe(true);
    expect(limitsFor(lic, AFTER).teamsFeatures).toBe(true);
  });

  it('missing license defaults to free (Pro during beta)', () => {
    expect(effectivePlan(undefined, BEFORE)).toBe('pro');
    expect(effectivePlan(undefined, AFTER)).toBe('free');
  });
});

describe('license — labels', () => {
  it('renders friendly badge label during beta for free users', () => {
    expect(planLabel({ plan: 'free' }, BEFORE)).toBe('Pro · Beta');
  });
  it('renders plain Free after beta for free users', () => {
    expect(planLabel({ plan: 'free' }, AFTER)).toBe('Free');
  });
  it('renders Pro/Teams as-is', () => {
    expect(planLabel({ plan: 'pro' }, AFTER)).toBe('Pro');
    expect(planLabel({ plan: 'teams' }, AFTER)).toBe('Teams');
  });
});

describe('license — Pro limits matrix', () => {
  it('Pro is unlimited', () => {
    expect(PLAN_LIMITS.pro.maxProfiles).toBe(Infinity);
    expect(PLAN_LIMITS.pro.maxSnippets).toBe(Infinity);
    expect(PLAN_LIMITS.pro.aiEnabled).toBe(true);
  });
  it('Free is gated', () => {
    expect(PLAN_LIMITS.free.maxProfiles).toBe(1);
    expect(PLAN_LIMITS.free.aiEnabled).toBe(false);
    expect(PLAN_LIMITS.free.fullCrossSiteMemory).toBe(false);
  });
});
