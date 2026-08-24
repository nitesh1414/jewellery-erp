import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface BranchState {
  selectedBranchId: string | null;
  setSelectedBranch: (id: string | null) => void;
  clearBranch: () => void;
}

/**
 * Holds the branch the user is currently operating in (multi-branch support).
 * The API client reads this and sends it as the `x-branch-id` header so the
 * backend scopes every action (sale, purchase, expense, income, URD…).
 * Defaults to the user's primary branch (set on login / branch select).
 */
export const useBranchStore = create<BranchState>()(
  persist(
    (set) => ({
      selectedBranchId: null,
      setSelectedBranch: (id) => set({ selectedBranchId: id }),
      clearBranch: () => set({ selectedBranchId: null }),
    }),
    {
      name: 'branch-storage',
      partialize: (state) => ({ selectedBranchId: state.selectedBranchId }),
    },
  ),
);

/** Read the current branch id outside React (used by the axios interceptor). */
export function getActiveBranchId(): string | null {
  return useBranchStore.getState().selectedBranchId;
}
