// Per-site override memory: learned mappings from a field signature on a
// given hostname to a "profile key" path. Stored encrypted with the rest of
// the vault.

import type { DetectedField, Profile } from './types';

export type ProfileKey =
  | `basics.${keyof Profile['basics']}`
  | `links.${keyof Profile['links']}`
  | `custom.${string}`
  | 'fullName';

export interface SiteOverride {
  /** Stable signature of the field across page reloads. */
  signature: string;
  /** What value to fill, expressed as a path into the active profile. */
  profileKey: ProfileKey;
}

export interface OverrideStore {
  /** hostname -> list of overrides */
  byHost: Record<string, SiteOverride[]>;
}

export function emptyOverrides(): OverrideStore {
  return { byHost: {} };
}

/** Build a hopefully-stable signature for a field. */
export function fieldSignature(f: DetectedField): string {
  return [f.name, f.id, f.autocomplete, f.type, f.label.slice(0, 40)]
    .map((s) => s.toLowerCase().trim())
    .join('|');
}

export function resolveProfileValue(profile: Profile, key: ProfileKey): string | null {
  if (key === 'fullName') {
    return `${profile.basics.firstName} ${profile.basics.lastName}`.trim() || null;
  }
  const [group, name] = key.split('.') as [string, string];
  if (group === 'basics' && name in profile.basics) {
    return profile.basics[name as keyof Profile['basics']] || null;
  }
  if (group === 'links' && name in profile.links) {
    return profile.links[name as keyof Profile['links']] || null;
  }
  if (group === 'custom') {
    return profile.custom[name] || null;
  }
  return null;
}

/** Reverse-lookup: which profile key does this value correspond to (if any)? */
export function findProfileKeyForValue(profile: Profile, value: string): ProfileKey | null {
  const v = value.trim();
  if (!v) return null;
  for (const k of Object.keys(profile.basics) as Array<keyof Profile['basics']>) {
    if (profile.basics[k] && profile.basics[k] === v) return `basics.${k}` as ProfileKey;
  }
  for (const k of Object.keys(profile.links) as Array<keyof Profile['links']>) {
    if (profile.links[k] && profile.links[k] === v) return `links.${k}` as ProfileKey;
  }
  for (const [k, val] of Object.entries(profile.custom)) {
    if (val && val === v) return `custom.${k}` as ProfileKey;
  }
  const full = `${profile.basics.firstName} ${profile.basics.lastName}`.trim();
  if (full && full === v) return 'fullName';
  return null;
}

export function upsertOverride(store: OverrideStore, host: string, ov: SiteOverride): OverrideStore {
  const list = store.byHost[host] ?? [];
  const next = list.filter((o) => o.signature !== ov.signature);
  next.push(ov);
  return { ...store, byHost: { ...store.byHost, [host]: next } };
}

export function findOverride(
  store: OverrideStore,
  host: string,
  signature: string
): SiteOverride | null {
  return store.byHost[host]?.find((o) => o.signature === signature) ?? null;
}

/**
 * Drop overrides whose signature obviously contradicts the mapped profile key.
 * For example: a signature containing "address-level2" mapped to basics.addressLine1
 * was learned before the matcher fix and should be discarded.
 */
export function purgeBadOverrides(store: OverrideStore): OverrideStore {
  const out: OverrideStore = { byHost: {} };
  for (const [host, list] of Object.entries(store.byHost)) {
    const kept = list.filter((o) => {
      const sig = o.signature;
      const key = o.profileKey;
      // City signal but mapped to something other than city
      if (/(^|\|)(city|address-level2|locality|town)(\||$)|address-level2/.test(sig)) {
        if (key !== 'basics.city') return false;
      }
      // State signal but mapped to something other than state
      if (/(^|\|)(state|province|region|address-level1)(\||$)|address-level1/.test(sig)) {
        if (key !== 'basics.state') return false;
      }
      // Postal signal
      if (/postal|\bzip\b|zipcode/.test(sig)) {
        if (key !== 'basics.postalCode') return false;
      }
      // Email signal
      if (/(^|\|)email(\||$)/.test(sig) && key !== 'basics.email') return false;
      return true;
    });
    if (kept.length > 0) out.byHost[host] = kept;
  }
  return out;
}

export function clearAll(): OverrideStore {
  return { byHost: {} };
}
