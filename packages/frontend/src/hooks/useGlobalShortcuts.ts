import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { emitAppShortcut } from '../hotkeys/bus';
import {
  isTypingTarget,
  isTextField,
  moveFocus,
  topModal,
  findSaveButton,
  findAddButton,
  focusSearchInput,
} from '../hotkeys/keys';

/**
 * Global keyboard behaviour shared by every screen.
 *
 *   Enter            → next field (behaves like Tab)
 *   Shift + Enter    → previous field
 *   Ctrl + Enter     → save / submit the open form
 *   Ctrl + S         → save / submit the open form
 *   Ctrl + A         → Add / New on the current screen
 *   Ctrl + F         → jump to the search box
 *   Ctrl + P         → print
 *   Ctrl + N         → new document (POS: new bill)
 *   Esc              → cancel / close the top-most dialog
 *   Alt + ← / →      → browser back / forward
 *
 * Alt + letter is the main menu and is owned by `TopNav` (it owns the open
 * state of the dropdowns). Function keys F2–F9 belong to the screen that
 * defines them (Billing / POS).
 *
 * A form is **only** submitted when a button actually has focus — Enter inside
 * a field never submits, it moves to the next control. That is what makes
 * "Enter = Tab" safe: the last Enter lands on the Save button, and the next
 * one presses it.
 */
export function useGlobalShortcuts() {
  const navigate = useNavigate();

  useEffect(() => {
    // ------------------------------------------------------------------
    // 1. Enter behaves like Tab
    //
    // Capture phase, so it runs before any screen's own keydown handler.
    // Screens that want Enter for themselves (barcode scan, "add metal"…)
    // mark the input with `data-enter-action` and are left alone.
    // ------------------------------------------------------------------
    const onEnter = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.altKey || e.metaKey) return;

      const target = e.target as HTMLElement | null;
      if (!target || !isTextField(target)) return;      // buttons/links keep native Enter
      if (target.closest('[data-enter-action]')) return; // the screen handles Enter here

      // A textarea would swallow Enter as a newline and trap the user's walk,
      // so Enter always moves on and Ctrl+Enter is the newline instead.
      if (e.ctrlKey) return; // Ctrl+Enter = save (command handler) / newline in a note

      e.preventDefault();
      e.stopPropagation();
      moveFocus(target, e.shiftKey ? -1 : 1);
    };

    // ------------------------------------------------------------------
    // 2. No accidental form submission
    //
    // A form may only submit when the submit came from a focused (or clicked)
    // button. Implicit submission — pressing Enter inside a text field — is
    // cancelled. This is the safety net behind "Enter = Tab".
    // ------------------------------------------------------------------
    const onSubmit = (e: Event) => {
      const form = e.target as HTMLFormElement | null;
      if (!form || form.tagName !== 'FORM') return;

      const submitter = (e as SubmitEvent).submitter as HTMLElement | null;
      const active = document.activeElement as HTMLElement | null;

      const cameFromButton =
        !!submitter && (submitter === active || submitter.contains(active));
      const typedInto =
        !!active &&
        form.contains(active) &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName);

      if (typedInto && !cameFromButton) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // ------------------------------------------------------------------
    // 3. Command shortcuts
    // ------------------------------------------------------------------
    const onCommand = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      // Escape — cancel / close the top-most dialog.
      // A screen that handled Escape itself has already called preventDefault.
      if (e.key === 'Escape') {
        if (e.defaultPrevented) return;
        const modal = topModal();
        if (modal) {
          e.preventDefault();
          (modal as HTMLElement).click(); // clicks the backdrop → its onClose fires
        }
        return;
      }

      // Alt + arrow keys: back / forward, like desktop accounting software.
      if (e.altKey && !mod && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        if (e.key === 'ArrowLeft') navigate(-1);
        else navigate(1);
        return;
      }

      if (!mod || e.altKey) return; // Alt+letter belongs to the menu (TopNav)

      switch (key) {
        case 'enter':
        case 's': {
          // Save / submit whatever is open.
          e.preventDefault();
          if (emitAppShortcut('app:save')) return;
          const saveBtn = findSaveButton();
          if (saveBtn) saveBtn.click();
          return;
        }

        case 'a': {
          // Add / New — but never steal Ctrl+A "select all" while typing.
          if (isTypingTarget(e.target)) return;
          if (topModal()) return; // a dialog is already open
          e.preventDefault();
          if (emitAppShortcut('app:add')) return;
          const addBtn = findAddButton();
          if (addBtn) addBtn.click();
          return;
        }

        case 'f': {
          // Focus the search box — leave the browser's find-in-page while typing.
          if (isTypingTarget(e.target)) return;
          e.preventDefault();
          if (emitAppShortcut('app:search')) return;
          focusSearchInput();
          return;
        }

        case 'p': {
          e.preventDefault();
          if (emitAppShortcut('app:print')) return;
          window.print();
          return;
        }

        case 'n': {
          e.preventDefault();
          emitAppShortcut('app:new');
          return;
        }

        default:
          return;
      }
    };

    document.addEventListener('keydown', onEnter, true);
    document.addEventListener('submit', onSubmit, true);
    window.addEventListener('keydown', onCommand);

    return () => {
      document.removeEventListener('keydown', onEnter, true);
      document.removeEventListener('submit', onSubmit, true);
      window.removeEventListener('keydown', onCommand);
    };
  }, [navigate]);
}
