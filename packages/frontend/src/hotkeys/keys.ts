/**
 * Small DOM helpers shared by the keyboard engine.
 *
 * Everything here is deliberately dependency-free: the engine has to make its
 * decision in the same tick as the key press, and it has to work on whatever
 * markup a screen happens to render.
 */

/** Selector for things that can hold keyboard focus. */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  'summary',
  '[tabindex]',
].join(',');

const NON_TYPING_INPUT_TYPES = new Set([
  'button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit',
]);

/**
 * Is this element (or anything above it) actually rendered?
 * A `display:none` parent hides its children even though the children
 * themselves still report `display:block`, so the whole chain is checked.
 */
function isRendered(el: HTMLElement): boolean {
  if (el.hidden) return false;
  let node: HTMLElement | null = el;
  let hops = 0;
  while (node && node.nodeType === 1 && hops < 40) {
    const style = window.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    node = node.parentElement;
    hops += 1;
  }
  return true;
}

/** Can this element actually receive focus right now? */
export function isFocusable(el: HTMLElement): boolean {
  if (el.hasAttribute('disabled')) return false;
  if ((el as any).disabled === true) return false;
  if (el.getAttribute('tabindex') === '-1') return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;
  if (el.tagName === 'INPUT' && NON_TYPING_INPUT_TYPES.has((el as HTMLInputElement).type)) return false;
  return isRendered(el);
}

/** Every focusable element inside `root`, in DOM order. */
export function focusableIn(root: ParentNode = document): HTMLElement[] {
  const all = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  return all.filter(isFocusable);
}

/** True for text-entry controls (Enter-as-Tab only applies to these). */
export function isTextField(el: EventTarget | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return !el.hasAttribute('disabled');
  if (el.tagName === 'INPUT') {
    const input = el as HTMLInputElement;
    return !NON_TYPING_INPUT_TYPES.has(input.type) && !input.disabled;
  }
  return false;
}

/** Any control the user types into — used to avoid hijacking browser keys. */
export function isTypingTarget(el: EventTarget | null): boolean {
  return isTextField(el);
}

/** Labels of buttons that throw work away (never "Enter to continue" targets). */
const DISMISSIVE = /^(cancel|back|close|no|discard|clear|reset|बंद|रद्द)$/i;

/**
 * Buttons like Cancel / Back sit next to Save, and a user walking the form with
 * Enter must not land on them first — one slip would throw the entry away.
 * Moving forward skips them; going back (Shift+Enter) still reaches them.
 */
export function isDismissive(el: HTMLElement): boolean {
  if (el.tagName !== 'BUTTON' && el.getAttribute('role') !== 'button') return false;
  if (el.hasAttribute('data-hotkey-cancel')) return true;
  if (el.hasAttribute('data-hotkey-save')) return false;
  return DISMISSIVE.test((el.textContent || '').trim());
}

/**
 * Move focus from `from` to the next (`dir = 1`) or previous (`dir = -1`)
 * focusable control.
 *
 * Scoped first to the nearest `[data-focus-scope]` (a modal, a form) so Tab-like
 * movement stays inside the dialog, then to the whole document so the walk
 * naturally continues from the last field onto the dialog's buttons.
 */
function focusIt(el: HTMLElement | undefined | null): boolean {
  if (!el) return false;
  el.focus();
  if (el.tagName === 'INPUT' && !NON_TYPING_INPUT_TYPES.has((el as HTMLInputElement).type)) {
    try {
      (el as HTMLInputElement).select();
    } catch {
      /* select() is not available on every input type */
    }
  }
  return true;
}

export function moveFocus(from: HTMLElement, dir: 1 | -1): boolean {
  // An open dialog keeps the walk to itself, so the user never lands on the
  // page behind it.
  const modal = from.closest('.fixed.inset-0') as HTMLElement | null;
  const scopeEl = modal || (from.closest('[data-focus-scope]') as HTMLElement | null);
  const scope: ParentNode = scopeEl || document;

  const all = focusableIn(scope);

  // ---------------- backwards: previous control, wrapping inside a dialog
  if (dir === -1) {
    const i = all.indexOf(from);
    if (i > 0) return focusIt(all[i - 1]);
    if (i === 0 && modal && all.length > 1) return focusIt(all[all.length - 1]);
  }

  // ---------------- forwards
  // Buttons that throw work away are never an "Enter to continue" target.
  const safe = all.filter((el) => !isDismissive(el));
  const list = safe.length ? safe : all;
  const i = list.indexOf(from);

  if (i !== -1) {
    if (isTextField(from)) {
      // Fields first. Repeat / toggle buttons that sit between fields
      // ("+ Add line", "Add item", debit-credit switches, row actions…) are
      // skipped — they stay reachable with Tab, but Enter never fires one.
      for (let k = i + 1; k < list.length; k += 1) {
        if (isTextField(list[k])) return focusIt(list[k]);
      }
      // No field left: land on the dialog's main action.
      const primary = (scope as Document).querySelector?.('[data-hotkey-save]') as HTMLElement | null;
      if (primary && primary !== from && isFocusable(primary)) return focusIt(primary);
    }

    const next = list[i + 1];
    if (next) return focusIt(next);
    // End of a dialog: wrap back to the top so Enter always does something.
    if (modal && list.length > 1) return focusIt(list[0]);
  }

  // ---------------- fall back to the whole document
  const docList = focusableIn(document);
  const j = docList.indexOf(from);
  if (j === -1) return false;
  return focusIt(docList[j + dir]);
}

/**
 * The top-most open modal backdrop, if any.
 * Matches the way modals are built across the app: `.fixed.inset-0` with a
 * dark translucent overlay.
 */
export function topModal(): HTMLElement | null {
  const overlays = Array.from(document.querySelectorAll<HTMLElement>('.fixed.inset-0'));
  const modals = overlays.filter(
    (el) => /z-50|z-40/.test(el.className) && /black|bg-opacity/.test(el.className),
  );
  return modals[modals.length - 1] || null;
}

/** Pick the first match of `selector`, preferring the open modal over the page. */
function pick(selector: string, modalFirst = true): HTMLElement | null {
  const modal = modalFirst ? topModal() : null;
  if (modal) {
    const hit = modal.querySelector<HTMLElement>(selector);
    if (hit) return hit;
  }
  return document.querySelector<HTMLElement>(selector);
}

/** The primary action button of the open dialog (or of the page). */
export function findSaveButton(): HTMLElement | null {
  const marked = pick('[data-hotkey-save]');
  if (marked && isFocusable(marked)) return marked;

  const modal = topModal();
  if (modal) {
    // Fall back to the last primary-looking button in the dialog footer.
    const buttons = Array.from(modal.querySelectorAll<HTMLElement>('button')).filter(isFocusable);
    const primary = buttons.filter((b) => b.className.includes('btn-primary'));
    const candidate = primary[primary.length - 1] || buttons[buttons.length - 1];
    return candidate || null;
  }

  const pageSave = document.querySelector<HTMLElement>('[data-hotkey-save]');
  return pageSave || null;
}

/** The page's "Add / New" button (only used when no dialog is open). */
export function findAddButton(): HTMLElement | null {
  if (topModal()) return null;
  const btn = document.querySelector<HTMLElement>('[data-hotkey-add]');
  return btn && isFocusable(btn) ? btn : null;
}

/**
 * Focus the screen's search box: an explicitly marked one first, otherwise the
 * first visible input that looks like a search field.
 */
export function focusSearchInput(): boolean {
  // Prefer a search box inside the open dialog over the one behind it.
  const modal = topModal();
  const marked =
    (modal?.querySelector<HTMLElement>('[data-search-input]') as HTMLElement | null) ||
    document.querySelector<HTMLElement>('[data-search-input]');
  if (marked && isFocusable(marked)) {
    marked.focus();
    if ((marked as HTMLInputElement).select) {
      try {
        (marked as HTMLInputElement).select();
      } catch {
        /* ignore */
      }
    }
    return true;
  }

  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>('input[type="search"], input[placeholder]'),
  ).filter(isFocusable);
  const hit = candidates.find((el) => /search|find|filter|barcode|sku/i.test(el.getAttribute('placeholder') || ''))
    || candidates[0];
  if (!hit) return false;
  hit.focus();
  try {
    (hit as HTMLInputElement).select();
  } catch {
    /* ignore */
  }
  return true;
}
