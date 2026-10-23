import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../services/api';
import { Building, DollarSign, Users, CheckCircle, ChevronRight, ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const STEPS = [
  { key: 'profile', title: 'Business Profile', icon: Building, desc: 'Shop name, address, GSTIN' },
  { key: 'branches', title: 'Branches', icon: Building, desc: 'Your shop locations' },
  { key: 'accounts', title: 'Ledger Accounts', icon: DollarSign, desc: 'Cash, bank, wallet — opening balances' },
  { key: 'users', title: 'Users', icon: Users, desc: 'Operators (optional)' },
  { key: 'done', title: 'Finish', icon: CheckCircle, desc: 'You are ready to start' },
];

export default function SetupWizardPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState({ shopName: 'My Jewellery Shop', shopAddress: '', shopCity: '', shopState: '', shopPin: '', shopPhone: '', shopEmail: '', shopGstin: '', defaultGstRate: 3, defaultCgstRate: 1.5, defaultSgstRate: 1.5 });
  const [accounts, setAccounts] = useState({ cashOpening: 0, bankName: '', bankAccountNumber: '', bankIfscCode: '', bankOpening: 0 });

  const saveStep = useMutation({
    mutationFn: (b: any) => api.post('/settings/setup/complete', b),
    onSuccess: () => api.get('/settings'),
  });
  const seedAccts = useMutation({
    mutationFn: (b: any) => api.post('/settings/setup/seed-accounts', b),
  });

  function next() { setStep((s) => Math.min(STEPS.length - 1, s + 1)); }
  function prev() { setStep((s) => Math.max(0, s - 1)); }
  function finish() {
    saveStep.mutate(profile, {
      onSuccess: () => navigate('/dashboard'),
    });
  }

  const current = STEPS[step];

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="page-title">Welcome! Let's set up your business.</h1>
        <div className="mt-3 grid grid-cols-5 gap-2">
          {STEPS.map((s, idx) => (
            <button key={s.key} onClick={() => setStep(idx)} disabled={idx > step}
              className={'flex flex-col items-center text-center p-3 rounded-lg transition-colors ' +
                (step === idx ? 'bg-primary-50 text-primary-700 border border-primary-200' :
                 idx < step ? 'bg-green-50 text-green-700 cursor-pointer' :
                 idx > step ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : '')}>
              <s.icon className="w-5 h-5 mb-1" />
              <p className="text-[11px] font-medium leading-tight">{s.title}</p>
            </button>
          ))}
        </div>
        <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-primary-500 transition-all" style={{ width: ((step + 1) / STEPS.length * 100) + '%' }} />
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-bold mb-1">{current.title}</h2>
        <p className="text-[13px] text-gray-500 mb-5">{current.desc}</p>

        {current.key === 'profile' && (
          <div className="space-y-3">
            <div><label className="label">Shop name *</label><input className="input-field" value={profile.shopName} onChange={(e) => setProfile({ ...profile, shopName: e.target.value })} /></div>
            <div><label className="label">Address</label><input className="input-field" value={profile.shopAddress} onChange={(e) => setProfile({ ...profile, shopAddress: e.target.value })} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="label">City</label><input className="input-field" value={profile.shopCity} onChange={(e) => setProfile({ ...profile, shopCity: e.target.value })} /></div>
              <div><label className="label">State</label><input className="input-field" value={profile.shopState} onChange={(e) => setProfile({ ...profile, shopState: e.target.value })} /></div>
              <div><label className="label">PIN</label><input className="input-field" value={profile.shopPin} onChange={(e) => setProfile({ ...profile, shopPin: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Phone</label><input className="input-field" value={profile.shopPhone} onChange={(e) => setProfile({ ...profile, shopPhone: e.target.value })} /></div>
              <div><label className="label">Email</label><input type="email" className="input-field" value={profile.shopEmail} onChange={(e) => setProfile({ ...profile, shopEmail: e.target.value })} /></div>
            </div>
            <div><label className="label">GSTIN</label><input className="input-field" value={profile.shopGstin} onChange={(e) => setProfile({ ...profile, shopGstin: e.target.value })} placeholder="27ABCDE1234F1Z5" /></div>
          </div>
        )}

        {current.key === 'branches' && (
          <div className="space-y-3">
            <p className="text-[13px] text-gray-600">A primary branch will be created automatically. Add more branches later from the Branches page.</p>
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <CheckCircle className="w-8 h-8 mx-auto text-green-600 mb-2" />
              <p className="text-[13px] font-medium">"Main Branch" will be created</p>
              <p className="text-xs text-gray-500 mt-1">You can rename and add more branches after setup</p>
            </div>
          </div>
        )}

        {current.key === 'accounts' && (
          <div className="space-y-3">
            <p className="text-[13px] text-gray-600">Default "Cash Counter" and "Bank Account" will be created. Set their opening balances below.</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="font-semibold mb-2">Cash Counter (opening)</p>
                <label className="label">Opening balance (₹)</label>
                <input type="number" className="input-field" value={accounts.cashOpening || ''} onChange={(e) => setAccounts({ ...accounts, cashOpening: Number(e.target.value) })} />
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="font-semibold mb-2">Bank Account</p>
                <label className="label">Bank name</label>
                <input className="input-field" value={accounts.bankName} onChange={(e) => setAccounts({ ...accounts, bankName: e.target.value })} />
                <label className="label mt-2 block">A/C no.</label>
                <input className="input-field" value={accounts.bankAccountNumber} onChange={(e) => setAccounts({ ...accounts, bankAccountNumber: e.target.value })} />
                <label className="label mt-2 block">IFSC</label>
                <input className="input-field" value={accounts.bankIfscCode} onChange={(e) => setAccounts({ ...accounts, bankIfscCode: e.target.value })} />
                <label className="label mt-2 block">Opening balance (₹)</label>
                <input type="number" className="input-field" value={accounts.bankOpening || ''} onChange={(e) => setAccounts({ ...accounts, bankOpening: Number(e.target.value) })} />
              </div>
            </div>
          </div>
        )}

        {current.key === 'users' && (
          <div className="space-y-3">
            <p className="text-[13px] text-gray-600">You can add operators, salesmen, cashiers, etc. later from the Users page. This step is optional.</p>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-[13px]">
              <strong>Tip:</strong> Each user will need a unique email and password to login. Roles determine what permissions they get.
            </div>
          </div>
        )}

        {current.key === 'done' && (
          <div className="text-center py-6">
            <CheckCircle className="w-16 h-16 mx-auto text-green-600 mb-3" />
            <p className="text-lg font-semibold">All set!</p>
            <p className="text-gray-500 mt-1">Your business is configured and ready to operate.</p>
          </div>
        )}
      </div>

      <div className="flex justify-between mt-6">
        <button onClick={prev} disabled={step === 0} className="btn-secondary"><ChevronLeft className="w-4 h-4" /> Back</button>
        {step < STEPS.length - 1 ? (
          <button
            onClick={() => {
              if (step === 2) {
                seedAccts.mutate({
                  cashOpening: accounts.cashOpening,
                  bankName: accounts.bankName,
                  bankAccountNumber: accounts.bankAccountNumber,
                  bankIfscCode: accounts.bankIfscCode,
                  bankOpening: accounts.bankOpening,
                });
              }
              next();
            }}
            className="btn-primary"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button onClick={finish} className="btn-primary">Open Dashboard <ChevronRight className="w-4 h-4" /></button>
        )}
      </div>
    </div>
  );
}
