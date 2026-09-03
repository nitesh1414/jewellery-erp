import { useState, useEffect } from 'react';
import { Keyboard, X } from 'lucide-react';

const shortcuts = [
  { section: 'Global (anywhere)', items: [
    { key: 'Ctrl+A', desc: 'Add / new (bill, item, customer…)' },
    { key: 'Ctrl+N', desc: 'New bill (reset POS)' },
    { key: 'Esc', desc: 'Cancel / close open modal' },
    { key: 'Alt+N', desc: 'Open Quick Action menu' },
    { key: 'F1 / ?', desc: 'Show this shortcuts help' },
    { key: 'Ctrl+P', desc: 'Print current page' },
  ]},
  { section: 'Billing / POS', items: [
    { key: 'F2', desc: 'New bill (reset current)' },
    { key: 'F3', desc: 'Focus customer search' },
    { key: 'F4', desc: 'Focus barcode scanner' },
    { key: 'F5', desc: 'Add manual item' },
    { key: 'F6', desc: 'Open payment panel' },
    { key: 'F7', desc: 'Save / finalize bill' },
    { key: 'F8', desc: 'Focus discount field' },
    { key: 'F9', desc: 'Pick from inventory' },
    { key: 'Ctrl+Enter', desc: 'Save / finalize bill' },
    { key: 'Enter', desc: 'Confirm / submit / scan' },
  ]},
];

export function KeyboardShortcutsHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F1' || (e.shiftKey && e.key === '?') || (e.key === '?' && e.shiftKey)) {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === 'Escape' && open) setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3" onClick={() => setOpen(false)}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-3 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-primary-600" />
            <h2 className="text-base font-bold text-gray-900">Keyboard Shortcuts</h2>
          </div>
          <button onClick={() => setOpen(false)} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-3 overflow-y-auto">
          {shortcuts.map((sec, idx) => (
            <div key={idx}>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{sec.section}</h3>
              <div className="space-y-1.5">
                {sec.items.map((s, i) => (
                  <div key={i} className="flex items-center justify-between text-[13px]">
                    <span className="text-gray-700">{s.desc}</span>
                    <kbd className="bg-gray-100 border border-gray-200 px-2 py-0.5 rounded text-xs font-mono text-gray-700">{s.key}</kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="px-3 py-2.5 border-t border-gray-200 bg-gray-50 text-xs text-gray-500 flex items-center justify-between">
          <span>Press <kbd className="bg-white border border-gray-200 px-1.5 rounded">F1</kbd> or <kbd className="bg-white border border-gray-200 px-1.5 rounded">?</kbd> any time to show this.</span>
          <span><kbd className="bg-white border border-gray-200 px-1.5 rounded">Esc</kbd> to close</span>
        </div>
      </div>
    </div>
  );
}
