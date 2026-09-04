# Jewellery ERP & POS

Complete jewellery shop ERP + POS — billing (bills **and** estimated bills),
inventory with barcode sticker printing, job work with worker master, ledger,
quotations with shareable links, reports — packaged as an **offline desktop
application** (Electron + SQLite) with a **cloud-managed subscription system**.

## Packages

| Package | Description |
|---|---|
| `packages/frontend` | React 18 + Vite web UI |
| `packages/backend` | NestJS + Prisma API (SQLite dev / Postgres prod) |
| `packages/desktop-electron` | **Offline desktop app** — Windows / macOS / Linux installers |
| `packages/license-core` | Shared license logic (keys, Ed25519 signing, offline validation) |
| `packages/license-server` | **Cloud license server** (subscription admin API) |
| `packages/admin-portal` | **Cloud admin panel** to manage subscriptions |
| `packages/shared` | Shared types/validation |

---

## Step-by-step setup (web / development)

**1. Install** (Node.js 20+):

```powershell
npm install
```

**2. Create/update the local database** (SQLite; a `packages/backend/.env` with
`DATABASE_URL="file:./dev.db"` is auto-created on first run — no manual setup):

```powershell
npm run db:push
```

**3. Seed demo data** (optional; safe to re-run):

```powershell
npm run db:seed
```

Login: `admin@jewellery.com` / `admin123` (also manager/sales/cashier demo
users — see `packages/backend/prisma/seed.ts`).

**4. Run the app** (backend :3001 + frontend :5173):

```powershell
npm run dev
```

Open http://localhost:5173

> Whenever you pull changes that touch `packages/backend/prisma/schema.prisma`,
> run `npm run db:push` again to update your local database. To check a schema
> change without a database (and without downloading engines), run
> `npm run db:check` — it verifies every relation and runs Prisma's own schema
> validator.

### Handy extras

```powershell
npm run db:studio      # browse/edit the database in Prisma Studio
npm run build          # compile every package
```

> On Windows, the build and development commands cache Prisma clients when
> their schema has not changed, so a running app does not normally lock the
> native query engine. If a schema changed and `prisma generate` reports
> `EPERM` while renaming a `query_engine-windows.dll.node` file, stop the
> backend, license server, Electron app, Prisma Studio, and other Node
> processes that may use it, then run the command again. The `db:push` scripts
> run the same cached generation first and skip Prisma's automatic second
> generation.

### Daily use cheatsheet

- **Keyboard shortcuts** (web + desktop) — press `F1` or `?` (or the keyboard
  button in the header) for the full list:

  | Key | What it does |
  | --- | --- |
  | `Enter` | Next field — behaves like **Tab**. `Shift+Enter` goes back one field. |
  | `Ctrl+Enter` / `Ctrl+S` | Save / submit the open form |
  | `Ctrl+A` | Add / new on the current screen |
  | `Ctrl+F` | Jump to the search box |
  | `Ctrl+P` | Print the screen |
  | `Ctrl+N` | New bill (POS) |
  | `Esc` | Cancel / close the open dialog |
  | `Alt+←` / `Alt+→` | Go back / forward |
  | `Alt+N` | Quick-action menu |
  | `Alt+H` `Alt+S` `Alt+P` `Alt+I` `Alt+W` `Alt+C` `Alt+M` | Open **Home / Sales / Purchase / Inventory / Job Work / Accounts / Admin**. With a menu open, press `1`–`9` (or `↑` `↓` then `Enter`) to jump straight to a screen — the keys are shown right in the menu. |

  **Enter never submits a form on its own.** It walks field to field and skips
  the buttons that would throw work away (Cancel, Back, Close) and the repeat
  buttons inside a form (`+ Add line`, row actions…), then stops on the main
  **Save** button — a form is saved only when that button is selected. Use
  **Tab** when you do want to reach every button.

  Billing / POS additionally uses `F2` new bill, `F3` customer, `F4` scan,
  `F5` manual item, `F6` payment, `F7` save, `F8` discount, `F9` inventory.
- **Billing** (`/billing`): scan barcodes (F4) or manual items (F5); switch the
  top-right tabs between **Bill** and **Estimated Bill**. Estimates get their
  own `EST-…` number, stay editable (Bills → Estimated Bills → ✏) and are
  converted into a real GST/Non-GST bill with one click (→ button).
- **URD (old gold) in billing**: on the billing screen take the customer's old
  gold through **Add Payment → URD / Old Gold** — metal, purity, gross, stone
  and net weight, rate, deduction (₹) and melting loss (%). The value is worked
  out as `net weight × rate − deduction − melting loss %` and that **final value
  pays the bill**. A URD entry is recorded (URD register, linked to the bill)
  and, on a real bill, the old gold is **credited to the metal ledger** of that
  metal + purity, so it shows up as available metal stock.
- **URD Exchange** (`/urd`): the full old-gold cycle in one screen.
  *Receive Old Gold* records the metal into the **material (metal) ledger** and
  credits the **customer ledger** with its value. From there each exchange can
  be **adjusted against one of that customer's pending bills** (bill gets paid,
  customer credit cleared, no cash moves), **paid out** to the customer from a
  cash/bank account, or **sold / melted out** (metal leaves the material ledger,
  money comes in). Status tells you where it stands — `ACTIVE` (metal in, value
  owed), `ADJUSTED` (used in a bill), `SETTLED` (paid out) or `SOLD`. The view
  dialog lists every ledger movement of that exchange.
- **Multiple payment modes on one bill**: a single bill can be settled with any
  mix of **URD, Cash, Online, UPI, Debit Card, Credit Card, Bank Transfer and
  Cheque** — add each mode with its own amount and reference. Every line (mode,
  reference, amount) plus the URD details are printed on the bill.
- **Same on every bill type**: the settlement block and URD details print on
  **GST, Non-GST, A5, thermal and estimate** prints. On an **estimated bill**
  the settlement is recorded as a **proposed payment** — it shows as
  *“Proposed settlement (not collected)”*, nothing is collected and neither
  stock, metal ledger nor GST is touched until the estimate is confirmed.
- **Print sizes**: on any print screen choose A4 GST / A4 plain / A5 /
  thermal 80 / 76 / 58 mm / estimate.
- **Barcodes**: Barcodes → print stickers on every common label size; item
  rows in *Jewellery Items* have a 🖨 print-barcode button too. **Every size
  prints the same tag design**: the **left half** carries the jewellery shop
  name with the **barcode printed under the name**, the **right half** lists
  **Item · Purity · Gross · Net · HUID**. Type sizes, padding and the barcode
  scale with the sticker, so a 22 × 12 cm tag and a 38 × 25 mm sticker look
  identical. The **22 × 12 cm tag** is a large card printed one tag per page
  (`@page size 220mm 120mm`); smaller sizes print as a grid on A4 (or as a roll
  for the 58/80 mm thermal layouts).
- **Multi-branch**: if the user has access to more than one branch, a branch
  selector appears in the top bar. All actions (sale, purchase, expense,
  income, URD, payment…) are recorded against the selected branch; the default
  is the user's primary branch. Estimated bills never affect sales,
  outstanding, today's totals or GST until confirmed into a real bill.
- **How the ledgers are wired** — every screen feeds the same books:
  - **Purchase** → supplier ledger + stock/metal ledger + **cash/bank** (the
    amount paid at purchase time is stored as a purchase payment and debited
    from the account it was paid from).
  - **Sale** → customer ledger + stock reduction (items go `SOLD`) + sales
    ledger + cash/bank ledger for the money received + the **GST/tax ledger**
    (CGST + SGST on a local bill, IGST on an inter-state one; the accounts are
    created automatically and reversed if the bill is cancelled).
  - **URD Exchange** → customer ledger + material (metal) ledger, then
    adjusted against a bill, paid out or sold out (see above).
- **GST accounts**: `CGST Payable`, `SGST Payable` and `IGST Payable` are
  created on the first bill that needs them (Accounts → Ledger Accounts) and
  every rupee of tax collected is credited there automatically.
- **Job work OUT → IN** (`/job-work`): hand metal and other material to a
  worker (karigar) and track it until the finished ornaments come back.
  - **OUT (issue)**: worker, issue/due date, the metal (metal + purity, grams,
    rate) taken from a **metal ledger** and any other material (stones,
    polish…), plus the ornaments to be made. Saving **debits the metal from its
    metal ledger** straight away — the grams show as *Metal with workers*.
  - **Tracking**: status moves **Given to worker → In process → Completed**,
    with a status history on every job, due-date highlighting and a cancel
    button that puts the issued metal back into the ledger.
  - **IN (receive)**: enter gross / stone / other weight per ornament — each
    received line is **added to Jewellery Items with its own barcode** (same
    `G0000000x` series), the **wastage / scrap returned is credited back** to
    the metal ledger, and the **labour charges become payable to the worker**
    (pay part or all of it now and it is recorded as a worker payment).
  - After receiving you can jump straight to the **22 × 12 cm barcode tag**
    print for the new barcodes.
- **Purchase → inventory**: a purchase is a material entry. It uses the same
  fields as the inventory "Add Item" form (metal, purity, category,
  sub-category, ornament, HSN, making charge, hallmark, certificate no.) and can
  hold **many metals/purities in one purchase**. The supplier's invoice number
  is optional. Purchases, inventory items, URD and users all have View + Edit.
- **Two kinds of purchase** (choose at the top of the New Purchase form):
  - **Metal / Bullion** — raw metal (bar, coin, scrap). The weight is **added
    to the metal ledger** of that metal + purity (the ledger is auto-selected
    from metal + purity, or created as `GOLD 22K`-style if it does not exist).
    No inventory item is created.
  - **Ornament / Jewellery** — readymade pieces. Every line is barcoded into
    inventory and its **net weight (gross − stone − other) is deducted from the
    metal ledger** picked
    on that line (defaults to the ledger matching the line's metal + purity).
  Editing a purchase reverses and re-posts those metal movements, so the gram
  stock always matches the bill.
- **Metal / material ledgers**: Ledger → Accounts → *Add Account* → type
  **Metal / Material (grams)**. Give it a metal, a purity and an **opening stock
  in grams** (the opening value is auto-filled from today's rate). The account
  card then shows live stock in grams (in / out) plus its value in ₹. Metal
  ledgers are also listed on Purchases when you pick which ledger to use.
- **Inventory stock from the metal ledgers**: Inventory → Stock Balance now
  shows, for every metal + purity, the **metal / material stock in grams taken
  from its metal ledger account** next to the **ornament stock in grams** from
  the jewellery items, plus the total available and its value. The summary card
  above it lists **all** metals and purities (including the ones with zero
  stock) with the grams available, so nothing is hidden.
- **Rate schedule (daily + historical)**: Settings → Rate Schedule is one page
  with two parts. On top, the **daily rate grid** — every metal with all of its
  purities, an input per row, "no rate yet" tags and a last-updated column;
  type a rate and click away (or press Enter) to save it, and the row **stays
  put** afterwards (a rate that did not exist is simply created). Below it, the
  **historical rate schedule**: every change in list format with date, metal,
  purity and old → new rate, newest first.
- **Ornament master linked to a metal ledger**: Ledger → Ornament Master now
  lets you link each ornament to a metal ledger and shows the stock held in it.
  In **Jewellery → Add Item** and in a **Purchase** line, picking a *Metal
  ledger* (metal + purity, with its grams) filters the *Ornament* list to that
  ledger's ornaments, and every option shows its **live stock** (pieces and
  grams) from inventory. Picking the ledger also sets the line's metal, purity
  and rate.
- **Items made from a metal ledger deduct it automatically**: adding a jewellery
  item with a *Metal ledger* selected takes the item’s **net weight
  (gross − stone − other) out of that ledger** and adds the piece to **ornament
  stock**, so Inventory → Stock Balance moves metal grams ↓ and ornament grams ↑
  in one step. The ledger entry spells the sum out —
  `DEBIT 10 g · Jewellery item RING-900 — GROSS 15 g - STONE WEIGHT 3 g -
  OTHER 2 g from GOLD 22K → ornament stock`. Editing any weight, the rate or the
  ledger re-posts the movement, and deleting the item (🗑 on the row) gives the
  metal back. **Ornament purchases do the same** — every ornament line debits its
  net weight (`DEBIT 10 g · Ornament purchase — NECK-500 — GROSS 15 g -
  STONE WEIGHT 3 g - OTHER 2 g from GOLD 22K → ornament stock`), while a
  *Metal / Bullion* line still credits the full weight it bought.
- **Net weight is automatic**: Net Weight = Gross Weight − Stone Weight
  (− other weight). Purchases, Jewellery items, URD and billing manual items
  work it out as you type; nothing to key in twice.
- **Barcode stickers**: choose what prints on a tag in **Settings → Barcode** —
  tick any of jeweller name, item name, weight (g), purity, metal, gross, stone,
  net, rate, amount, SKU, barcode number, HSN, category, ornament, hallmark,
  making charge, size and date, then drag them into the order you want. The
  first field prints as the heading, the rest under the barcode. The same
  setting drives `Barcodes → print`, the 🖨 button on jewellery items and
  `GET /api/barcodes/labels`.
- **Job order actions**: marking a job READY / DELIVERED / IN PROGRESS etc.
  asks for the **action date + note** and appends it to the Action Log
  (status history) in the job detail. Advance and bill payments can be taken
  into a specific cash/bank ledger account.
- **Job work**: New Job Order picks customers from the database (or prompts to
  add new), assigns a worker, and walks CREATED → ASSIGNED → IN PROGRESS →
  READY → DELIVERED; generate the final bill when READY.
- **Company details**: Settings → Shop Profile (name, address, **logo**) is
  shown in the header and on every print.

---

## Desktop app (offline, subscription-licensed)

Builds native installers that run **100% offline** with a local SQLite
database. Internet is needed only once — to activate the subscription key
right after installation (offline activation codes also supported).

```powershell
npm run dist:desktop:win     # Windows installer (.exe)  → packages/desktop-electron/release/
npm run dist:desktop:mac     # macOS (.dmg, Intel + Apple Silicon)
npm run dist:desktop:linux   # Linux (.AppImage / .deb / .rpm / .tar.gz)
npm run dist:desktop         # current OS
```

Prerequisites per OS are listed in **[docs/ELECTRON.md](docs/ELECTRON.md)**.

After installing, the app opens the activation screen: paste the license key
you received (the machine ID shown there is what your vendor needs for
machine-locked keys). First login after activation:
`admin@jewellery.com` / `admin123` — change it immediately.

To test the desktop shell locally without building an installer:

```powershell
npm run dev:desktop          # builds backend+frontend, launches Electron
```

App updates keep the database, uploads and subscription license intact
(`%APPDATA%\Shri Jewellers ERP` on Windows, `~/Library/Application Support/…`
on macOS, `~/.config/…` on Linux) — the schema is upgraded automatically on
first launch of the new version.

## Subscriptions (cloud-managed)

```powershell
npm run dev:license     # license server :4010 + admin portal :5174
```

Admins create license keys from the cloud panel: day / month / year / lifetime
plans, optional **machine-ID lock** or open keys with N seats, bulk creation,
revoke / extend, and offline activation codes. Revocations and extensions
reach desktops automatically whenever they are online; expired subscriptions
lock the app until renewed.

Default admin (first boot): `admin@jewellery-erp.cloud` / `Admin@12345` —
configure `ADMIN_EMAIL` / `ADMIN_PASSWORD` before first start and change it.

Full architecture, API and security notes:
**[docs/SUBSCRIPTION.md](docs/SUBSCRIPTION.md)**.

## Production deployment (web)

The backend supports PostgreSQL — point `DATABASE_URL` at your Postgres
instance and run `npm run build && npm start -w packages/backend`. The desktop
build is unaffected and always uses its local SQLite database.

## Verification scripts

```powershell
node scripts/check-prisma-schema.mjs   # offline schema relation check
node scripts/test-license-flow.mjs     # 26-case license/subscription test suite
```
