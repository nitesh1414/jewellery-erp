import { useEffect } from 'react';

type ShortcutEvent = 'app:add' | 'app:new';

/**
 * Listens for a global "add"/"new" shortcut (Ctrl+A / Ctrl+N) and invokes the
 * handler. Pages use this to open their "Add/New" modal from anywhere.
 */
export function useAppShortcut(event: ShortcutEvent, handler: () => void) {
  useEffect(() => {
    const fn = () => handler();
    window.addEventListener(event, fn);
    return () => window.removeEventListener(event, fn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);
}
