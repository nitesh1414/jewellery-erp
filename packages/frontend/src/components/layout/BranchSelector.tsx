import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building, ChevronDown, Check } from 'lucide-react';
import { api } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { useBranchStore } from '../../stores/branchStore';

/**
 * Multi-branch selector shown in the top bar. Appears only when the user has
 * access to more than one active branch. The chosen branch is sent with every
 * API request (x-branch-id header) and is the branch the user performs
 * actions in. Defaults to the user's primary branch.
 */
export function BranchSelector() {
  const { user } = useAuthStore();
  const { selectedBranchId, setSelectedBranch } = useBranchStore();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.getBranches(),
    enabled: !!user,
    staleTime: 60000,
  });

  const activeBranches = ((branches as any) || []).filter((b: any) => b.isActive !== false);

  // Default to the user's primary branch once branches are loaded.
  useEffect(() => {
    if (!user || activeBranches.length === 0) return;
    const existing = activeBranches.find((b: any) => b.id === selectedBranchId);
    if (!existing) {
      const def = activeBranches.find((b: any) => b.id === user.branchId) || activeBranches[0];
      setSelectedBranch(def?.id ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeBranches.length, selectedBranchId]);

  // More than one branch → let the user choose the branch actions are for.
  // Single branch → hide the selector and always use the primary branch.
  if (!user || activeBranches.length <= 1) return null;

  const current = activeBranches.find((b: any) => b.id === selectedBranchId) || activeBranches[0];

  const onChange = (id: string) => {
    setSelectedBranch(id);
    setOpen(false);
    // Re-fetch all data for the newly selected branch.
    qc.invalidateQueries();
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md hover:bg-gray-100 text-gray-700 border border-gray-200 bg-white"
        title="Select branch"
      >
        <Building className="w-3.5 h-3.5 text-primary-600" />
        <span className="text-xs font-medium max-w-[110px] truncate">{current?.name || 'Branch'}</span>
        <ChevronDown className={'w-3 h-3 text-gray-400 transition-transform ' + (open ? 'rotate-180' : '')} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
          <div className="px-3 py-2 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Switch Branch</p>
            <p className="text-[10px] text-gray-400">Actions below use this branch</p>
          </div>
          {activeBranches.map((b: any) => (
            <button
              key={b.id}
              onClick={() => onChange(b.id)}
              className='w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 text-left'
            >
              <span className="flex-1">
                <span className="font-medium text-gray-800">{b.name}</span>
                <span className="block text-[10px] text-gray-400">Code: {b.code}</span>
              </span>
              {b.id === current?.id && <Check className="w-4 h-4 text-primary-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
