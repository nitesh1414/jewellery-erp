/**
 * Named shortcut bus.
 *
 * Global key combos (Ctrl+A, Ctrl+S, …) do not know what the screen on display
 * can do, and the screens do not want to know about key handling. So the global
 * engine emits a *named intent* (`app:add`, `app:save`, …) and whichever screen
 * is mounted answers it.
 *
 * A handler returning `false` means "I did not handle it" — the engine then
 * falls back to its generic behaviour (click the Add button, focus the search
 * box, …). Returning anything else (including `undefined`) means handled.
 */

export type AppShortcutName =
  | 'app:add'      // open the "Add / New" form of the current screen
  | 'app:new'      // start a fresh document (POS: new bill)
  | 'app:save'     // save / submit whatever is open
  | 'app:search'   // focus this screen's search box
  | 'app:print'    // print this screen (instead of window.print())
  | 'app:refresh'; // reload this screen's data

type Handler = () => void | boolean;

const listeners = new Map<AppShortcutName, Set<Handler>>();

/** Subscribe to a named shortcut. Returns the unsubscribe function. */
export function onAppShortcut(name: AppShortcutName, fn: Handler): () => void {
  let set = listeners.get(name);
  if (!set) {
    set = new Set();
    listeners.set(name, set);
  }
  set.add(fn);
  return () => {
    set!.delete(fn);
  };
}

/** True when at least one screen is listening for `name`. */
export function hasAppShortcut(name: AppShortcutName): boolean {
  return (listeners.get(name)?.size ?? 0) > 0;
}

/**
 * Fire every listener for `name`.
 * Returns true when at least one listener actually handled the shortcut.
 */
export function emitAppShortcut(name: AppShortcutName): boolean {
  const set = listeners.get(name);
  if (!set || set.size === 0) return false;
  let handled = false;
  // Copy first: a handler may unsubscribe itself (e.g. a modal closing).
  for (const fn of Array.from(set)) {
    try {
      if (fn() !== false) handled = true;
    } catch {
      // A broken listener must never stop the others.
    }
  }
  return handled;
}
