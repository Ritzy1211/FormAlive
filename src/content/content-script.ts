// Content script: scans forms and fills detected fields with values from the
// background service worker. Runs in an isolated world per Manifest V3.

import type { DetectedField, FilledValue, RuntimeResponse } from '../shared/types';
import { pickAdapter } from '../shared/adapters';
import { inferLocale } from '../shared/locale';

const FIELD_ATTR = 'data-formalive-id';
const ADAPTER = pickAdapter(location.hostname);

/** Element-set of fields we just filled programmatically. We use a WeakSet
 *  to suppress the "learn from user edit" listener for our own dispatched
 *  change events. Entries time-out via a separate timestamp map. */
const recentlyFilled = new WeakSet<HTMLElement>();
const recentlyFilledExpiry = new WeakMap<HTMLElement, number>();
const LEARN_SUPPRESS_MS = 1500;

function markFilled(el: HTMLElement) {
  recentlyFilled.add(el);
  recentlyFilledExpiry.set(el, Date.now() + LEARN_SUPPRESS_MS);
}
function wasRecentlyFilled(el: HTMLElement): boolean {
  if (!recentlyFilled.has(el)) return false;
  const exp = recentlyFilledExpiry.get(el) ?? 0;
  return Date.now() < exp;
}

function findLabel(el: HTMLElement): string {
  if (el.id) {
    const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (lbl?.textContent) return lbl.textContent.trim();
  }
  const parentLabel = el.closest('label');
  if (parentLabel?.textContent) return parentLabel.textContent.trim();
  const aria = el.getAttribute('aria-labelledby');
  if (aria) {
    // aria-labelledby can be a space-separated id list
    const refs = aria
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
      .filter(Boolean);
    if (refs.length) return refs.join(' ').trim();
  }
  // Fallback: walk up a few wrappers and look for a preceding label/heading
  // sibling. Ashby/Lever/Workday often render <label>question</label><div><input/></div>.
  let node: HTMLElement | null = el;
  for (let depth = 0; node && depth < 5; depth++, node = node.parentElement) {
    let prev = node.previousElementSibling as HTMLElement | null;
    while (prev) {
      if (
        prev.matches(
          'label, h1, h2, h3, h4, h5, h6, legend, p, div[class*="label" i], div[class*="question" i], span[class*="label" i]'
        )
      ) {
        const txt = prev.textContent?.trim() ?? '';
        if (txt && txt.length < 300) return txt;
      }
      prev = prev.previousElementSibling as HTMLElement | null;
    }
  }
  return '';
}

function isFillable(el: Element): el is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  if (el instanceof HTMLInputElement) {
    const skip = ['hidden', 'submit', 'button', 'image', 'reset', 'file', 'password'];
    if (skip.includes(el.type)) return false;
    if (el.disabled || el.readOnly) return false;
    return true;
  }
  if (el instanceof HTMLTextAreaElement) return !el.disabled && !el.readOnly;
  if (el instanceof HTMLSelectElement) return !el.disabled;
  return false;
}

/** Find the legend / nearest descriptive text for a radio/checkbox group. */
function findGroupLabel(el: HTMLElement): string {
  const fieldset = el.closest('fieldset');
  const legend = fieldset?.querySelector(':scope > legend');
  if (legend?.textContent) return legend.textContent.trim();
  const aria = el.getAttribute('aria-labelledby');
  if (aria) {
    const ref = document.getElementById(aria);
    if (ref?.textContent) return ref.textContent.trim();
  }
  // Walk up for a heading-like sibling
  let p: HTMLElement | null = el.parentElement;
  for (let i = 0; p && i < 4; i++, p = p.parentElement) {
    const hdr = p.querySelector(':scope > legend, :scope > label, :scope > p, :scope > h2, :scope > h3, :scope > h4');
    if (hdr?.textContent?.trim()) return hdr.textContent.trim();
  }
  return '';
}

function findResumeFileInputs(): HTMLInputElement[] {
  const out: HTMLInputElement[] = [];
  const inputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
  inputs.forEach((el) => {
    if (el.disabled) return;
    const accept = (el.accept || '').toLowerCase();
    if (accept && !/pdf|\.doc|application/i.test(accept) && accept !== '*') return;
    const signal = [
      el.name,
      el.id,
      el.getAttribute('aria-label') ?? '',
      findLabel(el)
    ]
      .join(' ')
      .toLowerCase();
    if (/resume|cv|curriculum/i.test(signal) || /resume|cv/.test(accept)) {
      out.push(el);
    }
  });
  return out;
}

function b64ToBlob(b64: string, mime: string): Blob {
  const s = atob(b64);
  const a = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
  return new Blob([a], { type: mime });
}

async function attachResume(): Promise<number> {
  const inputs = findResumeFileInputs();
  if (inputs.length === 0) return 0;
  const resp = (await chrome.runtime.sendMessage({ type: 'GET_RESUME' })) as RuntimeResponse;
  if (!resp.ok || !resp.data) return 0;
  const { filename, mime, dataB64 } = resp.data as {
    filename: string;
    mime: string;
    dataB64: string;
  };
  const blob = b64ToBlob(dataB64, mime || 'application/pdf');
  const file = new File([blob], filename || 'resume.pdf', { type: mime || 'application/pdf' });
  let count = 0;
  for (const el of inputs) {
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      el.files = dt.files;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.style.outline = '2px solid #22c55e';
      setTimeout(() => (el.style.outline = ''), 1200);
      count++;
    } catch (e) {
      console.warn('[FormAlive] could not attach resume:', e);
    }
  }
  return count;
}

function scan(): { fields: DetectedField[]; elements: Map<string, HTMLElement> } {
  const fields: DetectedField[] = [];
  const elements = new Map<string, HTMLElement>();
  const all = document.querySelectorAll('input, textarea, select');
  let counter = 0;
  const seenRadioGroups = new Set<string>();

  all.forEach((node) => {
    if (!(node instanceof HTMLElement) || !isFillable(node)) return;

    // Radio groups: emit a single field for the whole group keyed by `name`.
    if (node instanceof HTMLInputElement && node.type === 'radio') {
      const groupName = node.name;
      if (!groupName || seenRadioGroups.has(groupName)) return;
      seenRadioGroups.add(groupName);
      const peers = Array.from(
        document.querySelectorAll<HTMLInputElement>(
          `input[type="radio"][name="${CSS.escape(groupName)}"]`
        )
      );
      const options = peers.map(
        (p) => findLabel(p) || p.value || p.getAttribute('aria-label') || ''
      );
      const id = `fa-${counter++}-${Date.now().toString(36)}`;
      node.setAttribute(FIELD_ATTR, id);
      elements.set(id, node);
      fields.push({
        fieldId: id,
        name: groupName,
        id: node.id ?? '',
        type: 'radio',
        autocomplete: '',
        placeholder: '',
        label: findGroupLabel(node) || findLabel(node),
        ariaLabel: node.getAttribute('aria-label') ?? '',
        options
      });
      return;
    }

    // Standalone checkbox: treat as a yes/no field.
    if (node instanceof HTMLInputElement && node.type === 'checkbox') {
      const id = `fa-${counter++}-${Date.now().toString(36)}`;
      node.setAttribute(FIELD_ATTR, id);
      elements.set(id, node);
      fields.push({
        fieldId: id,
        name: node.getAttribute('name') ?? '',
        id: node.id ?? '',
        type: 'checkbox',
        autocomplete: node.getAttribute('autocomplete') ?? '',
        placeholder: '',
        label: findLabel(node) || findGroupLabel(node),
        ariaLabel: node.getAttribute('aria-label') ?? '',
        options: ['yes', 'no']
      });
      return;
    }

    let id = node.getAttribute(FIELD_ATTR);
    if (!id) {
      id = `fa-${counter++}-${Date.now().toString(36)}`;
      node.setAttribute(FIELD_ATTR, id);
    }
    elements.set(id, node);
    const hint = ADAPTER?.hintFor(node) ?? null;
    const baseLabel = findLabel(node);
    const options =
      node instanceof HTMLSelectElement
        ? Array.from(node.options).map((o) => o.text.trim())
        : undefined;
    fields.push({
      fieldId: id,
      name: node.getAttribute('name') ?? '',
      id: node.id ?? '',
      type: (node as HTMLInputElement).type ?? node.tagName.toLowerCase(),
      autocomplete: hint?.autocompleteOverride ?? node.getAttribute('autocomplete') ?? '',
      placeholder: node.getAttribute('placeholder') ?? '',
      label: hint?.extraLabel ? `${baseLabel} ${hint.extraLabel}`.trim() : baseLabel,
      ariaLabel: node.getAttribute('aria-label') ?? '',
      options
    });
  });
  return { fields, elements };
}

/**
 * Set the value on a framework-controlled input (React/Vue) by calling the
 * native setter and dispatching bubbling input/change events.
 */
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const proto = Object.getPrototypeOf(el);
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  const baseSetter = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'value')?.set;

  // Focus first — Workday/Ashby React inputs only commit values when the
  // field was focused before input/change fired.
  try {
    el.focus({ preventScroll: true });
  } catch {
    /* ignore */
  }

  if (setter && setter !== baseSetter) {
    setter.call(el, value);
  } else {
    el.value = value;
  }

  // Use InputEvent so React's synthetic event system treats this like real
  // typing (sets `nativeEvent.data`).
  try {
    el.dispatchEvent(
      new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText', data: value })
    );
  } catch {
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  el.dispatchEvent(new Event('change', { bubbles: true }));

  // Blur to trigger validators on Workday/Ashby.
  try {
    el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    el.blur();
  } catch {
    /* ignore */
  }
}

function fillSelect(el: HTMLSelectElement, value: string) {
  const v = value.toLowerCase().trim();
  const wantYes = YES_RE.test(v);
  const wantNo = NO_RE.test(v);
  const opts = Array.from(el.options);
  // 1. exact value or text
  for (const opt of opts) {
    if (opt.value.toLowerCase() === v || opt.text.toLowerCase() === v) {
      el.value = opt.value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
  }
  // 2. yes/no semantic
  if (wantYes || wantNo) {
    for (const opt of opts) {
      const t = opt.text.toLowerCase();
      if (wantYes && YES_RE.test(t)) {
        el.value = opt.value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
      if (wantNo && NO_RE.test(t)) {
        el.value = opt.value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
    }
  }
  // 3. substring fallback
  for (const opt of opts) {
    if (opt.text.toLowerCase().includes(v) || v.includes(opt.text.toLowerCase())) {
      el.value = opt.value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
  }
}

const YES_RE = /^(yes|y|true|1|agree|accept|confirm|✓)$/i;
const NO_RE = /^(no|n|false|0|disagree|decline|prefer not|do not)$/i;

function fillRadioGroup(anyRadio: HTMLInputElement, value: string) {
  const peers = Array.from(
    document.querySelectorAll<HTMLInputElement>(
      `input[type="radio"][name="${CSS.escape(anyRadio.name)}"]`
    )
  );
  const v = value.toLowerCase().trim();
  // 1. exact value / label match
  for (const r of peers) {
    const label = findLabel(r).toLowerCase();
    if (r.value.toLowerCase() === v || label === v) {
      clickRadio(r);
      return;
    }
  }
  // 2. yes/no semantic
  const wantYes = YES_RE.test(v);
  const wantNo = NO_RE.test(v);
  if (wantYes || wantNo) {
    for (const r of peers) {
      const label = (findLabel(r) || r.value).toLowerCase();
      if (wantYes && YES_RE.test(label)) {
        clickRadio(r);
        return;
      }
      if (wantNo && NO_RE.test(label)) {
        clickRadio(r);
        return;
      }
    }
  }
  // 3. substring match (last resort)
  for (const r of peers) {
    const label = (findLabel(r) || r.value).toLowerCase();
    if (label.includes(v) || v.includes(label)) {
      clickRadio(r);
      return;
    }
  }
}

function clickRadio(r: HTMLInputElement) {
  markFilled(r);
  r.checked = true;
  r.dispatchEvent(new Event('input', { bubbles: true }));
  r.dispatchEvent(new Event('change', { bubbles: true }));
  r.dispatchEvent(new Event('click', { bubbles: true }));
  r.style.outline = '2px solid #22c55e';
  setTimeout(() => (r.style.outline = ''), 1200);
}

function fillCheckbox(el: HTMLInputElement, value: string) {
  const v = value.toLowerCase().trim();
  const wantOn = YES_RE.test(v);
  const wantOff = NO_RE.test(v);
  if (!wantOn && !wantOff) return;
  const target = wantOn;
  if (el.checked === target) return;

  // React-controlled checkboxes (Ashby, Workday, Lever) usually render the
  // <input> as visually hidden and use a styled <label> / <span> as the
  // click target. Calling .click() on a display:none input is a no-op in
  // some browsers, so prefer clicking the associated label.
  const labelEl = findClickableLabel(el);
  try {
    el.focus({ preventScroll: true });
  } catch {
    /* ignore */
  }
  if (labelEl) {
    labelEl.click();
  } else {
    el.click();
  }

  // Fallback if click was intercepted: force state + events.
  if (el.checked !== target) {
    el.checked = target;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function findClickableLabel(el: HTMLInputElement): HTMLElement | null {
  // 1. Explicit <label for="id">
  if (el.id) {
    const doc = el.ownerDocument;
    const explicit = doc.querySelector<HTMLLabelElement>(
      `label[for="${CSS.escape(el.id)}"]`
    );
    if (explicit) return explicit;
  }
  // 2. Wrapping <label>
  const parentLabel = el.closest('label');
  if (parentLabel) return parentLabel as HTMLElement;
  // 3. Ashby pattern: input is inside a div with a sibling .ashby-checkbox or
  //    a styled span/div acting as the visual checkbox. Click the nearest
  //    interactive ancestor.
  const wrapper = el.closest<HTMLElement>(
    '[role="checkbox"], [class*="checkbox" i], [class*="Checkbox"]'
  );
  if (wrapper && wrapper !== (el as unknown as HTMLElement)) return wrapper;
  return null;
}

function applyFills(filled: FilledValue[], elements: Map<string, HTMLElement>): number {
  let count = 0;
  for (const f of filled) {
    const el = elements.get(f.fieldId);
    if (!el) continue;
    markFilled(el);
    if (el instanceof HTMLSelectElement) {
      fillSelect(el, f.value);
    } else if (el instanceof HTMLInputElement && el.type === 'radio') {
      fillRadioGroup(el, f.value);
    } else if (el instanceof HTMLInputElement && el.type === 'checkbox') {
      fillCheckbox(el, f.value);
    } else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      setNativeValue(el, f.value);
    } else {
      continue;
    }
    el.style.outline = '2px solid #22c55e';
    setTimeout(() => (el.style.outline = ''), 1200);
    count++;
  }
  return count;
}

async function fillPage(): Promise<void> {
  const { fields, elements } = scan();
  if (fields.length === 0) return;
  const ogSite =
    document
      .querySelector('meta[property="og:site_name"]')
      ?.getAttribute('content') ?? '';
  const htmlLang = document.documentElement.getAttribute('lang') ?? '';
  const locale = inferLocale(location.hostname, htmlLang);
  const resp = (await chrome.runtime.sendMessage({
    type: 'FILL_REQUEST',
    hostname: location.hostname,
    fields,
    pageContext: {
      title: document.title,
      siteName: ogSite,
      url: location.href,
      language: locale.language,
      country: locale.country
    }
  })) as RuntimeResponse;
  if (!resp.ok) {
    console.warn('[FormAlive]', resp.error);
    return;
  }
  const filled = (resp.data as FilledValue[]) ?? [];
  const n = applyFills(filled, elements);
  const attached = await attachResume();
  console.info(`[FormAlive] filled ${n}/${fields.length} fields; resume attached: ${attached}`);
}

chrome.runtime.onMessage.addListener((msg: { type: string }, _sender, sendResponse) => {
  if (msg.type === 'FILL_PAGE') {
    fillPage().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'SCAN_REPORT') {
    try {
      const { fields } = scan();
      const htmlLang = document.documentElement.getAttribute('lang') ?? '';
      sendResponse({
        hostname: location.hostname,
        title: document.title,
        htmlLang,
        url: location.href,
        adapter: ADAPTER?.id ?? null,
        fieldCount: fields.length,
        fields: fields.map((f) => ({
          name: f.name,
          id: f.id,
          type: f.type,
          autocomplete: f.autocomplete,
          placeholder: f.placeholder,
          label: f.label,
          ariaLabel: f.ariaLabel,
          options: f.options?.slice(0, 8) ?? undefined
        }))
      });
    } catch (e) {
      sendResponse({ error: String(e) });
    }
    return false;
  }
  return false;
});

// ---- Learn-from-user: when the user types in a field and blurs/changes it,
// ask the background to record a mapping if the value matches a profile entry.
document.addEventListener(
  'change',
  (ev) => {
    // Only react to genuine user events. Programmatic dispatches (including
    // ours via setNativeValue) have isTrusted === false.
    if (!ev.isTrusted) return;
    const t = ev.target;
    if (!(t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement)) return;
    if (!isFillable(t)) return;
    // Don't try to learn from radio/checkbox toggles — their "value" isn't a
    // free-text profile value, so the override store would be useless.
    if (t instanceof HTMLInputElement && (t.type === 'radio' || t.type === 'checkbox')) return;
    if (wasRecentlyFilled(t)) return;
    const value = (t as HTMLInputElement).value;
    if (!value || value.length < 2) return;
    let id = t.getAttribute(FIELD_ATTR);
    if (!id) {
      id = `fa-learn-${Date.now().toString(36)}`;
      t.setAttribute(FIELD_ATTR, id);
    }
    const hint = ADAPTER?.hintFor(t) ?? null;
    const baseLabel = findLabel(t);
    const field: DetectedField = {
      fieldId: id,
      name: t.getAttribute('name') ?? '',
      id: t.id ?? '',
      type: (t as HTMLInputElement).type ?? t.tagName.toLowerCase(),
      autocomplete: hint?.autocompleteOverride ?? t.getAttribute('autocomplete') ?? '',
      placeholder: t.getAttribute('placeholder') ?? '',
      label: hint?.extraLabel ? `${baseLabel} ${hint.extraLabel}`.trim() : baseLabel,
      ariaLabel: t.getAttribute('aria-label') ?? ''
    };
    chrome.runtime
      .sendMessage({ type: 'LEARN_OVERRIDE', hostname: location.hostname, field, value })
      .catch(() => {});
  },
  true
);
