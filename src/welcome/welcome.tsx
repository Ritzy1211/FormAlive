import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/global.css';

const STEPS = [
  {
    title: 'Welcome to FormAlive',
    body: (
      <>
        <p>
          FormAlive auto-fills online forms — job applications, sign-ups, profile
          pages — using a profile you keep on this device.
        </p>
        <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700">
          <li>Your data is encrypted with a password only you know.</li>
          <li>Nothing is sent to a server unless you opt into AI fallback.</li>
          <li>You can switch between multiple profiles (Personal / Freelance / …).</li>
        </ul>
      </>
    )
  },
  {
    title: '1. Create your vault',
    body: (
      <>
        <p>Click the FormAlive icon in the toolbar to open the popup.</p>
        <p>
          Pick a strong password — it derives an encryption key (PBKDF2 +
          AES-256-GCM). We cannot recover it for you.
        </p>
      </>
    )
  },
  {
    title: '2. Import your resume',
    body: (
      <>
        <p>
          Right-click the FormAlive icon → <strong>Options</strong>. Upload your
          resume PDF. We parse it locally, prefill your basics, and stash the
          file so it can be auto-attached to future job applications.
        </p>
      </>
    )
  },
  {
    title: '3. Try it out',
    body: (
      <>
        <p>
          Visit any application or signup form, click the FormAlive icon, and
          press <strong>Fill this page</strong>.
        </p>
        <p>
          If a site uses unusual field names, your manual corrections are
          remembered per-site so future fills get more accurate over time.
        </p>
      </>
    )
  }
];

function Welcome() {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-white">
      <div className="max-w-2xl mx-auto p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-emerald-600 text-white grid place-items-center font-bold">
            F
          </div>
          <h1 className="text-2xl font-semibold">FormAlive</h1>
        </div>

        <div className="bg-white border rounded-lg shadow-sm p-6 space-y-4">
          <div className="flex gap-1">
            {STEPS.map((_, idx) => (
              <div
                key={idx}
                className={`h-1 flex-1 rounded ${
                  idx <= i ? 'bg-emerald-600' : 'bg-gray-200'
                }`}
              />
            ))}
          </div>
          <h2 className="text-lg font-semibold">{step.title}</h2>
          <div className="space-y-2 text-sm text-gray-700">{step.body}</div>
          <div className="flex justify-between pt-4 border-t">
            <button
              onClick={() => setI((n) => Math.max(0, n - 1))}
              disabled={i === 0}
              className="text-sm text-gray-600 disabled:opacity-30 px-3 py-1"
            >
              Back
            </button>
            {last ? (
              <button
                onClick={() => window.close()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded px-4 py-2"
              >
                Get started
              </button>
            ) : (
              <button
                onClick={() => setI((n) => Math.min(STEPS.length - 1, n + 1))}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded px-4 py-2"
              >
                Next
              </button>
            )}
          </div>
        </div>

        <p className="text-xs text-gray-500 mt-4 text-center">
          Your data stays on this device. No telemetry.
        </p>
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <Welcome />
  </React.StrictMode>
);
