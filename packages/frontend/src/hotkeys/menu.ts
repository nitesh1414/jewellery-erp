import {
  LayoutDashboard, ShoppingCart, Receipt, Users, HandCoins,
  ShoppingBag, Truck, Package,
  Diamond, Barcode, Gem,
  ArrowLeftRight,
  Wallet, CreditCard,
  FileBarChart, Building, Users as UsersIcon, Settings,
} from 'lucide-react';

export interface MenuLeaf {
  to: string;
  label: string;
  icon: any;
}

export interface MenuGroup {
  key: string;
  label: string;
  icon?: any;
  /** Alt + this letter opens the menu. The letter must appear in `label`. */
  mnemonic: string;
  /** Set when the group is a direct link instead of a dropdown. */
  to?: string;
  items?: MenuLeaf[];
}

/**
 * One definition of the main menu.
 *
 * `TopNav` renders it, `KeyboardShortcutsHelp` documents it, and the global
 * hotkey engine binds Alt + `mnemonic` to it — so the menu, the keys and the
 * help screen can never drift apart.
 *
 * The order follows the way a jewellery shop actually works:
 *   Purchase  → supplier ledger + stock + material ledger + accounts
 *   Sales     → billing, bills, customer ledger, payments
 *   Inventory → jewellery items, stock, barcodes, ornament master
 *   Job Work  → job work in/out, URD / old gold exchange, workers
 *   Accounts  → ledger accounts, credit/debit entries, expenses, income
 */
export const APP_MENU: MenuGroup[] = [
  { key: 'home', label: 'Home', icon: LayoutDashboard, mnemonic: 'H', to: '/dashboard' },
  {
    key: 'sales', label: 'Sales', icon: ShoppingCart, mnemonic: 'S',
    items: [
      { to: '/billing', label: 'Billing / POS', icon: ShoppingCart },
      { to: '/bills', label: 'Bills', icon: Receipt },
      { to: '/payments', label: 'Payments', icon: HandCoins },
      { to: '/customers', label: 'Customers', icon: Users },
    ],
  },
  {
    key: 'purchase', label: 'Purchase', icon: ShoppingBag, mnemonic: 'P',
    items: [
      { to: '/purchases', label: 'Purchases', icon: ShoppingBag },
      { to: '/suppliers', label: 'Suppliers', icon: Truck },
      { to: '/inventory', label: 'Stock & Material Ledger', icon: Package },
    ],
  },
  {
    key: 'inventory', label: 'Inventory', icon: Diamond, mnemonic: 'I',
    items: [
      { to: '/jewellery', label: 'Jewellery Items', icon: Diamond },
      { to: '/barcodes', label: 'Barcodes', icon: Barcode },
      { to: '/ledger/master', label: 'Ornament Master', icon: Gem },
    ],
  },
  {
    key: 'jobwork', label: 'Job Work', icon: ArrowLeftRight, mnemonic: 'W',
    items: [
      { to: '/job-work', label: 'Job Work In / Out', icon: ArrowLeftRight },
      { to: '/urd', label: 'URD / Old Gold Exchange', icon: Gem },
      { to: '/workers', label: 'Workers', icon: Users },
    ],
  },
  {
    key: 'accounts', label: 'Accounts', icon: Wallet, mnemonic: 'C',
    items: [
      { to: '/ledger/accounts', label: 'Ledger Accounts', icon: Wallet },
      { to: '/ledger/entries', label: 'Credit / Debit Entries', icon: CreditCard },
      { to: '/expenses', label: 'Expenses', icon: ShoppingBag },
      { to: '/income', label: 'Income (Non-Sale)', icon: CreditCard },
    ],
  },
  {
    key: 'admin', label: 'Admin', icon: Building, mnemonic: 'M',
    items: [
      { to: '/reports', label: 'Reports', icon: FileBarChart },
      { to: '/branches', label: 'Branches', icon: Building },
      { to: '/users', label: 'Users', icon: UsersIcon },
      { to: '/roles', label: 'Roles & Access', icon: UsersIcon },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

/** Every screen reachable from the menu, flattened (used by the help overlay). */
export function allMenuLeaves(): { group: MenuGroup; leaf: MenuLeaf; index: number }[] {
  const out: { group: MenuGroup; leaf: MenuLeaf; index: number }[] = [];
  for (const group of APP_MENU) {
    (group.items ?? []).forEach((leaf, index) => out.push({ group, leaf, index }));
  }
  return out;
}

/** Index of `mnemonic` inside `label` (case-insensitive), or -1. */
export function mnemonicIndex(label: string, mnemonic: string): number {
  return label.toLowerCase().indexOf(mnemonic.toLowerCase());
}

/** "Alt+S" style label for a menu group. */
export function mnemonicCombo(group: MenuGroup): string {
  return 'Alt+' + group.mnemonic.toUpperCase();
}
