import { useEffect } from 'react';

/**
 * Global keyboard shortcuts shared across the whole app (web + desktop).
 *
 * - Ctrl/Cmd + A  → dispatch `app:add`   (pages open their "Add/New" form)
 * - Ctrl/Cmd + N  → dispatch `app:new`   (billing resets to a new bill)
 * - Esc           → close the top-most open modal (cancel)
 *
 * Function keys (F1…F9) are handled by the individual page/component that
 * owns them (e.g. Billing/POS), so they are not duplicated here.
 */
export function useGlobalShortcuts() {
  useEffect(() => {
    const isTypingTarget = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable;
    };

    const findTopModal = (): HTMLElement | null => {
      const overlays = Array.from(document.querySelectorAll<HTMLElement>('.fixed.inset-0'));
      // Prefer the top-most modal backdrop (dark overlay) over e.g. toasts.
      const modals = overlays.filter((el) => el.className.includes('z-50') && /black\/|bg-black/.test(el.className));
      return modals[modals.length - 1] || null;
    };

    const handler = (e: KeyboardEvent) => {
      // ---- Escape: cancel / close the top-most modal ----
      if (e.key === 'Escape') {
        const modal = findTopModal();
        if (modal) {
          e.preventDefault();
          // Programmatically click the backdrop → underlying onClose fires.
          (modal as HTMLElement).click();
        }
        return;
      }

      if (isTypingTarget(e.target)) return; // don't hijack Ctrl+A inside inputs (select-all)

      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('app:add'));
      } else if (mod && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('app:new'));
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
