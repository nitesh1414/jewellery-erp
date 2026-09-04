import { useEffect, useRef } from 'react';
import { onAppShortcut, AppShortcutName } from '../hotkeys/bus';

/**
 * Answer a named global shortcut while this screen is mounted.
 *
 * The screen decides *what* the shortcut means (open its Add dialog, save its
 * form, focus its search box…); the global engine decides *which key* fires it.
 *
 *   useAppShortcut('app:add', () => setShowAdd(true));
 *
 * Return `false` to say "not handled" — the engine then falls back to its
 * generic behaviour (e.g. click the dialog's Save button). Useful when a screen
 * has a panel open on top of it.
 */
export function useAppShortcut(name: AppShortcutName, handler: () => void | boolean) {
  // Always call the newest handler without re-subscribing on every render.
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });

  useEffect(() => onAppShortcut(name, () => ref.current()), [name]);
}
