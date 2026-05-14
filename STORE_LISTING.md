# FormAlive — Chrome Web Store listing

## Name
FormAlive — Encrypted form autofill

## Short description (≤132 chars)
One-click autofill for job applications and forms. End-to-end encrypted. Your data never leaves your device.

## Detailed description

FormAlive fills out online forms for you — job applications, sign-ups, profile
pages — using a profile that stays on your device, encrypted with a password
only you know.

**Why FormAlive is different**

- **Local-first.** Your profile, resume, and answers are stored in your browser
  and encrypted with AES-256-GCM. We have no server. We have no telemetry.
- **One password, real crypto.** Your master password derives an encryption key
  via PBKDF2-SHA256 with 600,000 iterations. Even if your machine is stolen,
  the encrypted vault is useless without the password.
- **Multi-profile.** Keep separate Personal / Freelance / Family profiles and
  switch in one click from the popup.
- **Smart field matching.** Detects fields by `autocomplete`, label, name, and
  Greenhouse / Workday / Lever conventions. Learns your manual corrections per
  site so future fills get more accurate.
- **Resume auto-attach.** Stores your resume PDF and attaches it automatically
  to job-application file inputs.
- **Cover-letter snippets.** Write a template once with `{{company}}` and
  `{{role}}` placeholders — FormAlive fills it into long-text fields with the
  page's context substituted in.
- **Optional AI fallback (you bring the key).** Off by default. If you turn it
  on, only field metadata (label + autocomplete hints) plus the *names* of your
  profile keys are sent — never the values.

**How it works**

1. Open the popup and create a vault with a strong password.
2. Open the Options page and import your resume (parsed locally).
3. On any form, click the toolbar icon → **Fill this page**.

**Permissions explained**

- `storage`: to save your encrypted vault and per-site corrections locally.
- `activeTab` + `scripting`: to read and fill fields on the page you're on,
  only when you click the icon.
- No host permissions are requested.

Open source. MIT licensed.

## Category
Productivity

## Languages
English

## Promotional images
- 1280×800 marquee — popup with "Fill this page" button
- 1280×800 — Options page with profiles
- 1280×800 — example fill on a Greenhouse-style application

---

# Privacy policy

FormAlive is a local-first browser extension.

1. **What data is collected?** None by us. The extension stores your profile,
   per-site corrections, and (optionally) your resume PDF inside Chrome's local
   storage on your device, encrypted with a key derived from your master
   password (PBKDF2-SHA256, 600,000 iterations; AES-256-GCM).
2. **What data is transmitted?** None, unless you explicitly enable the
   optional AI fallback and provide your own API key for OpenAI / Anthropic /
   Gemini. In that case, only field metadata (label text, autocomplete hints)
   and the names of profile keys are sent to the provider you chose. Profile
   values are never sent.
3. **Tracking & analytics.** None.
4. **Third parties.** None, except the AI provider you opt into.
5. **Account.** There is no account, no sign-up, and no server.
6. **Data deletion.** Uninstalling the extension removes all stored data. You
   can also clear your vault from the popup at any time.
7. **Contact.** File issues on the project's GitHub repository.
