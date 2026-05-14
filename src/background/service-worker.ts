// Background service worker — vault state lives here in memory only.
// Persisted vault is stored encrypted in chrome.storage.local.

import type {
  RuntimeMessage,
  RuntimeResponse,
  VaultContents,
  VaultEnvelope,
  FilledValue
} from '../shared/types';
import { encryptJson, decryptJson } from '../shared/crypto';
import { emptyVault, normalizeVault } from '../shared/profile';
import { matchAll } from '../shared/matcher';
import {
  emptyOverrides,
  fieldSignature,
  findOverride,
  findProfileKeyForValue,
  purgeBadOverrides,
  resolveProfileValue,
  upsertOverride
} from '../shared/overrides';
import { llmMatchField } from '../shared/llm';
import { buildContext, pickSnippetForField, renderSnippet } from '../shared/snippets';
import { localizeProfile } from '../shared/locale';

const STORAGE_KEY = 'formalive.vault.v1';
const AUTO_LOCK_MS = 10 * 60 * 1000;

interface SessionState {
  passphrase: string;
  vault: VaultContents;
  lockTimer: ReturnType<typeof setTimeout> | null;
}

let session: SessionState | null = null;

function scheduleAutoLock() {
  if (!session) return;
  if (session.lockTimer) clearTimeout(session.lockTimer);
  session.lockTimer = setTimeout(() => lock(), AUTO_LOCK_MS);
}

function lock() {
  if (session?.lockTimer) clearTimeout(session.lockTimer);
  session = null;
}

async function readEnvelope(): Promise<VaultEnvelope | null> {
  const out = await chrome.storage.local.get(STORAGE_KEY);
  return (out[STORAGE_KEY] as VaultEnvelope | undefined) ?? null;
}

async function writeEnvelope(env: VaultEnvelope): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: env });
}

async function persist(contents: VaultContents, passphrase: string): Promise<void> {
  const blob = await encryptJson(passphrase, contents);
  const env: VaultEnvelope = {
    v: 1,
    kdf: 'PBKDF2-SHA256',
    iterations: blob.iterations,
    saltB64: blob.saltB64,
    ivB64: blob.ivB64,
    ciphertextB64: blob.ciphertextB64
  };
  await writeEnvelope(env);
}

async function handle(msg: RuntimeMessage): Promise<RuntimeResponse> {
  switch (msg.type) {
    case 'VAULT_STATUS': {
      const env = await readEnvelope();
      return {
        ok: true,
        data: {
          initialized: !!env,
          unlocked: !!session
        }
      };
    }

    case 'VAULT_INIT': {
      const existing = await readEnvelope();
      if (existing) return { ok: false, error: 'Vault already initialized.' };
      const contents = emptyVault();
      await persist(contents, msg.passphrase);
      session = { passphrase: msg.passphrase, vault: contents, lockTimer: null };
      scheduleAutoLock();
      return { ok: true, data: contents };
    }

    case 'VAULT_UNLOCK': {
      const env = await readEnvelope();
      if (!env) return { ok: false, error: 'No vault. Initialize first.' };
      try {
        const raw = await decryptJson<VaultContents>(msg.passphrase, env);
        // Backfill optional sections added in later versions so the UI can
        // bind to them without optional-chaining every leaf.
        const contents = normalizeVault(raw);
        // One-time sanity sweep: drop any learned overrides whose field
        // signature contradicts the mapped profile key (cleans up bad data
        // recorded by older builds).
        if (contents.overrides) {
          const cleaned = purgeBadOverrides(contents.overrides);
          const before = Object.values(contents.overrides.byHost).reduce(
            (n, l) => n + l.length,
            0
          );
          const after = Object.values(cleaned.byHost).reduce((n, l) => n + l.length, 0);
          if (after !== before) {
            contents.overrides = cleaned;
            await persist(contents, msg.passphrase);
          }
        }
        session = { passphrase: msg.passphrase, vault: contents, lockTimer: null };
        scheduleAutoLock();
        return { ok: true, data: contents };
      } catch {
        return { ok: false, error: 'Wrong passphrase.' };
      }
    }

    case 'VAULT_LOCK': {
      lock();
      return { ok: true };
    }

    case 'VAULT_GET': {
      if (!session) return { ok: false, error: 'Vault locked.' };
      scheduleAutoLock();
      return { ok: true, data: session.vault };
    }

    case 'VAULT_SAVE': {
      if (!session) return { ok: false, error: 'Vault locked.' };
      session.vault = msg.contents;
      await persist(session.vault, session.passphrase);
      scheduleAutoLock();
      return { ok: true };
    }

    case 'FILL_REQUEST': {
      if (!session) return { ok: false, error: 'Vault locked.' };
      const rawProfile =
        session.vault.profiles.find((p) => p.id === session!.vault.activeProfileId) ??
        session.vault.profiles[0];
      if (!rawProfile) return { ok: false, error: 'No active profile.' };
      // Mask out disclosure / ID fields that don't apply in this jurisdiction.
      const profile = localizeProfile(rawProfile, msg.pageContext?.country);

      const overrides = session.vault.overrides ?? emptyOverrides();
      const host = msg.hostname;
      const filled: FilledValue[] = [];
      const remaining = [];
      for (const f of msg.fields) {
        const ov = findOverride(overrides, host, fieldSignature(f));
        if (ov) {
          const v = resolveProfileValue(profile, ov.profileKey);
          if (v) {
            filled.push({ fieldId: f.fieldId, value: v, confidence: 0.99 });
            continue;
          }
        }
        remaining.push(f);
      }
      const filledIds = new Set(filled.map((x) => x.fieldId));
      const ruleFilled = matchAll(remaining, profile);
      filled.push(...ruleFilled);
      ruleFilled.forEach((r) => filledIds.add(r.fieldId));

      // Snippet pass: fill long-text fields (cover letter, "why us", etc.)
      const snippets = profile.snippets ?? {};
      if (Object.keys(snippets).length > 0) {
        const ctx = buildContext(profile, msg.pageContext);
        for (const f of remaining) {
          if (filledIds.has(f.fieldId)) continue;
          const key = pickSnippetForField(f, snippets);
          if (!key) continue;
          const value = renderSnippet(snippets[key], ctx);
          if (value.trim()) {
            filled.push({ fieldId: f.fieldId, value, confidence: 0.85 });
            filledIds.add(f.fieldId);
          }
        }
      }

      // LLM fallback for fields still unfilled.
      const llm = session.vault.llm;
      if (llm && llm.provider !== 'off' && llm.apiKey) {
        const unmatched = remaining.filter((f) => !filledIds.has(f.fieldId));
        const results = await Promise.allSettled(
          unmatched.map((f) => llmMatchField(llm, f, profile))
        );
        for (const r of results) {
          if (r.status !== 'fulfilled' || !r.value) continue;
          const v = resolveProfileValue(profile, r.value.profileKey);
          if (v) {
            filled.push({ fieldId: r.value.fieldId, value: v, confidence: r.value.confidence });
          }
        }
      }

      scheduleAutoLock();
      return { ok: true, data: filled };
    }

    case 'LEARN_OVERRIDE': {
      if (!session) return { ok: false, error: 'Vault locked.' };
      const profile =
        session.vault.profiles.find((p) => p.id === session!.vault.activeProfileId) ??
        session.vault.profiles[0];
      if (!profile) return { ok: false, error: 'No active profile.' };

      const key = findProfileKeyForValue(profile, msg.value);
      if (!key) return { ok: true, data: { learned: false } };

      const overrides = session.vault.overrides ?? emptyOverrides();
      const next = upsertOverride(overrides, msg.hostname, {
        signature: fieldSignature(msg.field),
        profileKey: key
      });
      session.vault = { ...session.vault, overrides: next };
      await persist(session.vault, session.passphrase);
      scheduleAutoLock();
      return { ok: true, data: { learned: true, key } };
    }

    case 'FILL_PAGE': {
      // Triggered from popup — forward to the active tab's content script.
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return { ok: false, error: 'No active tab.' };
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'FILL_PAGE' }, { frameId: 0 });
        return { ok: true };
      } catch (e) {
        return { ok: false, error: 'Content script not ready on this page.' };
      }
    }

    case 'SCAN_REPORT': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return { ok: false, error: 'No active tab.' };
      try {
        const data = await chrome.tabs.sendMessage(tab.id, { type: 'SCAN_REPORT' }, { frameId: 0 });
        return { ok: true, data };
      } catch (e) {
        return { ok: false, error: 'Content script not ready on this page.' };
      }
    }

    case 'GET_RESUME': {
      if (!session) return { ok: false, error: 'Vault locked.' };
      const profile =
        session.vault.profiles.find((p) => p.id === session!.vault.activeProfileId) ??
        session.vault.profiles[0];
      scheduleAutoLock();
      return { ok: true, data: profile?.resume ?? null };
    }
  }
}

chrome.runtime.onMessage.addListener((msg: RuntimeMessage, _sender, sendResponse) => {
  handle(msg).then(sendResponse).catch((e) => sendResponse({ ok: false, error: String(e) }));
  return true; // async
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/welcome/index.html') });
  }
});
