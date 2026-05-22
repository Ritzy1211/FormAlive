// FormAlive plan / license module.
//
// Plans:
//   - free   : Starter — encrypted vault, 1 profile, capped snippets, no AI drafts
//   - pro    : Pro    — unlimited profiles + snippets, AI drafts, cross-site memory
//   - teams  : Teams  — Pro + admin features (handled separately)
//
// Beta period (until BETA_END below) automatically upgrades every user to Pro
// so the entire surface is available at no cost. When beta ends, users on the
// free plan fall back to free-tier limits. Existing Pro/Teams licenses keep
// their tier indefinitely.

export type Plan = 'free' | 'pro' | 'teams';

export interface License {
  plan: Plan;
  /** When this license was assigned/activated (epoch ms). */
  activatedAt?: number;
  /** Future paid licenses can carry an expiry or external customer id. */
  expiresAt?: number;
  customerId?: string;
}

/** While in beta, every install effectively gets Pro for free. Bump this
 *  date (or set it to 0 to end beta) when the paid plans launch.
 *  Stored as ISO millis to keep tests deterministic. */
export const BETA_END_MS = Date.parse('2027-01-01T00:00:00Z');

export interface PlanLimits {
  /** Max number of profiles. Infinity = unlimited. */
  maxProfiles: number;
  /** Max number of saved snippets per profile. */
  maxSnippets: number;
  /** AI-powered features (field matcher + essay drafter). */
  aiEnabled: boolean;
  /** Full per-site override learning (free gets a smaller window). */
  fullCrossSiteMemory: boolean;
  /** Priority email support (informational; surfaced in UI). */
  prioritySupport: boolean;
  /** Teams-only: SSO, audit log, shared snippets. */
  teamsFeatures: boolean;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    maxProfiles: 1,
    maxSnippets: 10,
    aiEnabled: false,
    fullCrossSiteMemory: false,
    prioritySupport: false,
    teamsFeatures: false
  },
  pro: {
    maxProfiles: Infinity,
    maxSnippets: Infinity,
    aiEnabled: true,
    fullCrossSiteMemory: true,
    prioritySupport: true,
    teamsFeatures: false
  },
  teams: {
    maxProfiles: Infinity,
    maxSnippets: Infinity,
    aiEnabled: true,
    fullCrossSiteMemory: true,
    prioritySupport: true,
    teamsFeatures: true
  }
};

export function defaultLicense(): License {
  return { plan: 'free', activatedAt: Date.now() };
}

/** True while every install gets Pro for free. */
export function inBeta(now: number = Date.now()): boolean {
  return now < BETA_END_MS;
}

/** The plan a user actually has access to today. During beta, free upgrades
 *  to pro automatically. After beta ends, the stored plan is authoritative.
 *  Teams stays teams either way. */
export function effectivePlan(license: License | undefined, now: number = Date.now()): Plan {
  const stored: Plan = license?.plan ?? 'free';
  if (stored === 'teams' || stored === 'pro') return stored;
  return inBeta(now) ? 'pro' : 'free';
}

export function limitsFor(license: License | undefined, now: number = Date.now()): PlanLimits {
  return PLAN_LIMITS[effectivePlan(license, now)];
}

export function isPro(license: License | undefined, now: number = Date.now()): boolean {
  const p = effectivePlan(license, now);
  return p === 'pro' || p === 'teams';
}

export function isTeams(license: License | undefined, now: number = Date.now()): boolean {
  return effectivePlan(license, now) === 'teams';
}

/** Human-readable label used by the popup/options badge. */
export function planLabel(license: License | undefined, now: number = Date.now()): string {
  const stored: Plan = license?.plan ?? 'free';
  if (stored === 'teams') return 'Teams';
  if (stored === 'pro') return 'Pro';
  return inBeta(now) ? 'Pro · Beta' : 'Free';
}

/** Short reason string used in paywall toasts and tooltips. */
export function planTagline(license: License | undefined, now: number = Date.now()): string {
  const stored: Plan = license?.plan ?? 'free';
  if (stored === 'teams') return 'Teams — every feature unlocked across your workspace.';
  if (stored === 'pro') return 'Pro — every feature unlocked. Thanks for supporting FormAlive.';
  if (inBeta(now)) return 'Pro is free for everyone during beta. Lock in launch pricing later.';
  return 'On the Free plan. Upgrade to Pro to unlock AI drafts, unlimited profiles, and more.';
}
