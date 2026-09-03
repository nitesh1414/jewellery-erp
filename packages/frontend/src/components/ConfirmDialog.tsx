import { useEffect, useState } from 'react';

/**
 * A friendly replacement for `window.confirm`.
 *
 * The native dialog cannot be styled, blocks the whole window and looks out of
 * place inside the app. Any screen can ask the user a yes/no question with:
 *
 *   if (await confirmAction({ title: 'Delete this expense?', danger: true })) { … }
 */
export interface ConfirmOptions {
  /** Bold heading of the dialog */
  title: string;
  /** Extra explanation under the heading */
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button for destructive actions */
  danger?: boolean;
}

type State = ConfirmOptions & { open: boolean };

let resolveCurrent: ((value: boolean) => void) | null = null;
let publish: ((state: State) => void) | null = null;

export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  publish?.({ confirmLabel: 'Yes', cancelLabel: 'Cancel', danger: false, ...options, open: true });
  return new Promise<boolean>((resolve) => {
    resolveCurrent?.(false); // a second question cancels a pending one
    resolveCurrent = resolve;
  });
}

/** Mounted once, in the app shell. */
export function ConfirmHost() {
  const [state, setState] = useState<State>({ title: '', open: false });

  useEffect(() => {
    publish = setState;
    return () => {
      publish = null;
    };
  }, []);

  const close = (result: boolean) => {
    setState((s) => ({ ...s, open: false }));
    const resolve = resolveCurrent;
    resolveCurrent = null;
    resolve?.(result);
  };

  useEffect(() => {
    if (!state.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Enter') close(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.open]);

  if (!state.open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] p-4" onClick={() => close(false)}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-4 sm:p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base sm:text-lg font-semibold text-gray-900">{state.title}</h3>
        {state.message && <p className="text-sm text-gray-500 mt-2">{state.message}</p>}
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => close(false)} className="btn-secondary">
            {state.cancelLabel}
          </button>
          <button
            autoFocus
            onClick={() => close(true)}
            className={'btn-primary ' + (state.danger ? '!bg-red-600 hover:!bg-red-700' : '')}
          >
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
