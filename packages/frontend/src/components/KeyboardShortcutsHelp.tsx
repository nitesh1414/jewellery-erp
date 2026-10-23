import { useState, useEffect, useCallback } from 'react';
import { Keyboard, X } from 'lucide-react';
import { APP_MENU } from '../hotkeys/menu';

/** Event name used to open the overlay from anywhere (the navbar "?" button). */
export const HELP_EVENT = 'app:help';

/** Open the keyboard shortcuts overlay. */
export function openShortcutHelp() {
  window.dispatchEvent(new CustomEvent(HELP_EVENT));
}

const GLOBAL_SHORTCUTS: { key: string; desc: string }[] = [
  { key: 'Enter', desc: 'Next field (works like Tab)' },
  { key: 'Shift + Enter', desc: 'Previous field' },
  { key: 'Ctrl + Enter', desc: 'Save / submit the open form' },
  { key: 'Ctrl + S', desc: 'Save / submit the open form' },
  { key: 'Ctrl + A', desc: 'Add / new on this screen' },
  { key: 'Ctrl + F', desc: 'Jump to the search box' },
  { key: 'Ctrl + P', desc: 'Print this screen' },
  { key: 'Ctrl + N', desc: 'New bill (Billing / POS)' },
  { key: 'Esc', desc: 'Cancel / close the open dialog' },
  { key: 'Alt + ← / →', desc: 'Go back / forward' },
  { key: 'Alt + N', desc: 'Quick actions menu' },
  { key: 'F1  or  ?', desc: 'Show this help' },
];

const BILLING_SHORTCUTS: { key: string; desc: string }[] = [
  { key: 'F2', desc: 'New bill (reset current)' },
  { key: 'F3', desc: 'Focus customer search' },
  { key: 'F4', desc: 'Focus barcode scanner' },
  { key: 'F5', desc: 'Add manual item' },
  { key: 'F6', desc: 'Open / close payment panel' },
  { key: 'F7', desc: 'Save / finalize bill' },
  { key: 'F8', desc: 'Focus discount field' },
  { key: 'F9', desc: 'Pick from inventory' },
  { key: 'Ctrl + Enter', desc: 'Save / finalize bill' },
];

function Row({ desc, keys }: { desc: string; keys: string[] }) {
  return (
    <div className="flex items-center justify-between gap-3 py-[3px]">
      <span className="text-gray-700 text-[13px] leading-snug">{desc}</span>
      <span className="flex items-center gap-1 shrink-0">
        {keys.map((k) => (
          <kbd
            key={k}
            className="bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded text-[11px] font-mono text-gray-700 whitespace-nowrap"
          >
            {k}
          </kbd>
        ))}
      </span>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded text-[11px] font-mono text-gray-700 whitespace-nowrap">
      {children}
    </kbd>
  );
}

export function KeyboardShortcutsHelp() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLElement &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable);
      if (e.key === 'F1') {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === '?' && !typing) {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === 'Escape' && open) setOpen(false);
    };
    const openHandler = () => setOpen(true);
    window.addEventListener('keydown', handler);
    window.addEventListener(HELP_EVENT, openHandler);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener(HELP_EVENT, openHandler);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-3"
      onClick={close}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        data-focus-scope
      >
        <div className="flex items-center justify-between px-3 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-primary-600" />
            <div>
              <h2 className="text-base font-bold text-gray-900 leading-tight">Keyboard Shortcuts</h2>
              <p className="text-[11px] text-gray-500 leading-tight">
                Enter moves to the next field — a form is saved only when a button is selected.
              </p>
            </div>
          </div>
          <button onClick={close} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto">
          {/* ---------------- Column 1 ---------------- */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Every screen
            </h3>
            <div className="divide-y divide-gray-50">
              {GLOBAL_SHORTCUTS.map((s) => (
                <Row key={s.key} desc={s.desc} keys={s.key.split('  or  ')} />
              ))}
            </div>

            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mt-4 mb-1.5">
              Billing / POS
            </h3>
            <div className="divide-y divide-gray-50">
              {BILLING_SHORTCUTS.map((s) => (
                <Row key={s.key} desc={s.desc} keys={[s.key]} />
              ))}
            </div>
          </div>

          {/* ---------------- Column 2 ---------------- */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Main menu
            </h3>
            <div className="space-y-2">
              {APP_MENU.map((group) => (
                <div key={group.key}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold text-gray-900">{group.label}</span>
                    <span className="flex items-center gap-1">
                      {group.to && (
                        <span className="text-[11px] text-gray-400 truncate">→ {group.label}</span>
                      )}
                      <Kbd>Alt+{group.mnemonic.toUpperCase()}</Kbd>
                    </span>
                  </div>
                  {group.items && (
                    <div className="ml-1 mt-0.5 border-l border-gray-100 pl-2 divide-y divide-gray-50">
                      {group.items.map((leaf, i) => (
                        <div key={leaf.to} className="flex items-center justify-between gap-2 py-[3px]">
                          <span className="text-[13px] text-gray-600 leading-snug">{leaf.label}</span>
                          <span className="flex items-center gap-1 shrink-0">
                            <Kbd>{i + 1}</Kbd>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-2 leading-snug">
              Press <Kbd>Alt+S</Kbd> to open a menu, then <Kbd>1</Kbd>…<Kbd>9</Kbd> or{' '}
              <Kbd>↑</Kbd> <Kbd>↓</Kbd> and <Kbd>Enter</Kbd> to pick a screen.
            </p>
          </div>
        </div>

        <div className="px-3 py-2.5 border-t border-gray-200 bg-gray-50 text-[11px] text-gray-500 flex items-center justify-between gap-2 flex-wrap">
          <span>
            Press <Kbd>F1</Kbd> or <Kbd>?</Kbd> any time to show this.
          </span>
          <span>
            <Kbd>Esc</Kbd> to close
          </span>
        </div>
      </div>
    </div>
  );
}
