# FormAlive

Local-first, encrypted Chrome extension that auto-fills online forms (job applications, signups, etc.) with one click. Your data never leaves your device.

## Status

MVP scaffold (v0.1). Rule-based field matching. Encrypted local vault. No cloud, no telemetry.

## Tech

- Manifest V3 Chrome extension
- TypeScript + React + Vite (`@crxjs/vite-plugin`)
- Tailwind CSS
- Web Crypto API (AES-256-GCM + PBKDF2-SHA256, 600k iterations)
- Vitest for unit tests

## Project layout

```
src/
  background/service-worker.ts   # vault state, message router
  content/content-script.ts      # field scanner + filler
  popup/                         # toolbar popup UI (React)
  options/                       # full profile editor (React)
  shared/                        # types, crypto, matcher, profile
  manifest.config.ts             # Manifest V3 definition
  assets/                        # icons (replace placeholders)
tests/                           # vitest unit tests
```

## Getting started

```powershell
npm install
npm run dev       # build with HMR; output goes to dist/
# or
npm run build     # production build into dist/
```

### Load into Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `dist/` folder
4. Click the FormAlive toolbar icon → create a master passphrase
5. Open the options page → fill in your profile → **Save**
6. Visit any form and click **Fill this page** in the popup

## Security model

- Master passphrase is **never stored**. It derives an AES-256 key via PBKDF2 (600k iterations, SHA-256).
- Vault is stored as an encrypted blob in `chrome.storage.local`. No `chrome.storage.sync` (not encrypted at rest by Chrome).
- Decrypted session key lives only in the service worker memory and is wiped after 10 min idle.
- Content scripts run in an isolated world; the page cannot read the vault.
- Background never returns the whole vault to content scripts — only specific field values per fill request.
- No remote code, no telemetry, no analytics. Minimal permissions: `storage`, `activeTab`, `scripting`.

## Tests

```powershell
npm test
```

## Next steps

- Site adapters: Workday, Greenhouse, Lever, iCIMS, LinkedIn Easy Apply
- Resume PDF parsing (`pdfjs-dist`) → profile autofill
- Optional LLM matching when heuristics fail (user-supplied API key)
- Inline suggestion chips next to focused fields
- Encrypted cloud sync (zero-knowledge) for Pro tier

## Placeholder icons

`src/assets/icon-16.png`, `icon-48.png`, `icon-128.png` ship as 1×1 transparent placeholders. Replace before publishing.
