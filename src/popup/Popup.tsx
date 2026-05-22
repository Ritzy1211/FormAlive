import { useEffect, useState } from 'react';
import type { RuntimeResponse, VaultContents } from '../shared/types';
import { effectivePlan, isPro, planLabel } from '../shared/license';

type Status = { initialized: boolean; unlocked: boolean };

async function send<T = unknown>(msg: unknown): Promise<RuntimeResponse & { data?: T }> {
  return chrome.runtime.sendMessage(msg);
}

export default function Popup() {
  const [status, setStatus] = useState<Status | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [vault, setVault] = useState<VaultContents | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    send<Status>({ type: 'VAULT_STATUS' }).then((r) => {
      if (r.ok) setStatus(r.data as Status);
    });
  }, []);

  useEffect(() => {
    if (status?.unlocked) {
      send<VaultContents>({ type: 'VAULT_GET' }).then((r) => {
        if (r.ok) setVault(r.data as VaultContents);
      });
    }
  }, [status?.unlocked]);

  async function init() {
    setError('');
    if (passphrase.length < 8) return setError('Passphrase must be at least 8 characters.');
    if (passphrase !== confirm) return setError('Passphrases do not match.');
    setBusy(true);
    const r = await send({ type: 'VAULT_INIT', passphrase });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setStatus({ initialized: true, unlocked: true });
    setPassphrase('');
    setConfirm('');
  }

  async function unlock() {
    setError('');
    setBusy(true);
    const r = await send({ type: 'VAULT_UNLOCK', passphrase });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setStatus({ initialized: true, unlocked: true });
    setPassphrase('');
  }

  async function lock() {
    await send({ type: 'VAULT_LOCK' });
    setStatus({ initialized: true, unlocked: false });
    setVault(null);
  }

  async function fillPage() {
    setMsg('');
    const r = await send({ type: 'FILL_PAGE' });
    setMsg(r.ok ? 'Filling…' : r.error);
  }

  async function copyScanReport() {
    setMsg('Scanning…');
    const r = await send<unknown>({ type: 'SCAN_REPORT' });
    if (!r.ok) {
      setMsg(r.error ?? 'Scan failed');
      return;
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(r.data, null, 2));
      setMsg('Scan report copied to clipboard.');
    } catch {
      setMsg('Copy failed — open devtools to view.');
      console.log('[FormAlive scan report]', r.data);
    }
  }

  function openOptions() {
    chrome.runtime.openOptionsPage();
  }

  if (!status) {
    return <div className="p-4 text-sm text-gray-500">Loading…</div>;
  }

  if (!status.initialized) {
    return (
      <div className="p-4 space-y-3">
        <div>
          <h1 className="text-lg font-semibold">Welcome to FormAlive</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Your personal job-application assistant.
          </p>
        </div>
        <p className="text-xs text-gray-600">
          Create a master passphrase. It encrypts your résumé, contact details, and work
          history on this device using AES-256. We can’t recover it if you forget it —
          and nothing ever leaves your computer unless you explicitly enable AI help.
        </p>
        <input
          type="password"
          placeholder="Master passphrase"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          className="w-full border rounded px-2 py-1 text-sm"
        />
        <input
          type="password"
          placeholder="Confirm passphrase"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full border rounded px-2 py-1 text-sm"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button
          onClick={init}
          disabled={busy}
          className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm rounded py-2"
        >
          Create vault
        </button>
      </div>
    );
  }

  if (!status.unlocked) {
    return (
      <div className="p-4 space-y-3">
        <div>
          <h1 className="text-lg font-semibold">Unlock FormAlive</h1>
          <p className="text-xs text-gray-500 mt-0.5">🔒 Your application data is encrypted on this device.</p>
        </div>
        <input
          type="password"
          placeholder="Master passphrase"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && unlock()}
          className="w-full border rounded px-2 py-1 text-sm"
          autoFocus
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button
          onClick={unlock}
          disabled={busy}
          className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm rounded py-2"
        >
          Unlock
        </button>
      </div>
    );
  }

  const active = vault?.profiles.find((p) => p.id === vault.activeProfileId);

  async function switchProfile(id: string) {
    if (!vault) return;
    const next = { ...vault, activeProfileId: id };
    setVault(next);
    await send({ type: 'VAULT_SAVE', contents: next });
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold">FormAlive</h1>
          <p className="text-[10px] text-gray-500 leading-tight">Personal job-application assistant</p>
        </div>
        <button onClick={lock} className="text-xs text-gray-500 hover:text-gray-800">
          Lock
        </button>
      </div>

      <PlanRow license={vault?.license} />
      {vault && vault.profiles.length > 0 ? (
        <div className="space-y-1">
          <label className="text-xs text-gray-600">Active profile</label>
          <select
            value={vault.activeProfileId}
            onChange={(e) => switchProfile(e.target.value)}
            className="w-full border rounded px-2 py-1 text-sm"
          >
            {vault.profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
                {p.basics.firstName ? ` — ${p.basics.firstName} ${p.basics.lastName}` : ''}
              </option>
            ))}
          </select>
          {active && active.basics.email && (
            <p className="text-[10px] text-gray-500 truncate">{active.basics.email}</p>
          )}
        </div>
      ) : (
        <div className="text-xs text-gray-500">No profile yet.</div>
      )}
      <button
        onClick={fillPage}
        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded py-2"
      >
        Fill this page
      </button>
      <button
        onClick={openOptions}
        className="w-full border text-sm rounded py-2 hover:bg-gray-50"
      >
        Edit profiles
      </button>
      <button
        onClick={copyScanReport}
        className="w-full text-xs text-gray-500 hover:text-gray-800 py-1"
        title="Copies a redacted JSON dump of detected fields on this page"
      >
        Debug: copy scan report
      </button>
      {msg && <p className="text-xs text-gray-500">{msg}</p>}
    </div>
  );
}

function PlanRow({ license }: { license?: import('../shared/license').License }) {
  const pro = isPro(license);
  const stored = license?.plan ?? 'free';
  const label = planLabel(license);
  const tone = pro
    ? 'bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white'
    : 'bg-gray-100 text-gray-700';
  // Show "Get Pro" only when the user is genuinely on free (post-beta).
  const showUpgrade = effectivePlan(license) === 'free' && stored === 'free';
  return (
    <div className="flex items-center justify-between rounded-md bg-gray-50/70 px-2 py-1.5 ring-1 ring-gray-200">
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone}`}>
        <span className="h-1.5 w-1.5 rounded-full bg-current opacity-90"></span>
        Plan · {label}
      </span>
      {showUpgrade ? (
        <a
          href="https://ritzy1211.github.io/FormAlive/pricing.html"
          target="_blank"
          rel="noopener"
          className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700"
        >
          Get Pro →
        </a>
      ) : (
        <span className="text-[10px] text-gray-500">All features unlocked</span>
      )}
    </div>
  );
}
