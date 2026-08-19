# Jewellery Shop ERP + POS — Architecture Document

## 1. System Overview

A production-ready, scalable Jewellery Shop ERP + POS system designed to replace Tally-based workflows and multiple standalone software products with a single integrated platform.

## 2. Architecture Principles

- **Domain-Driven Design** — Each business domain (Billing, Inventory, Job Work, etc.) is a self-contained module.
- **Event-Driven** — Domain events drive stock updates, ledger entries, notifications, and audit logs.
- **Immutable Transactions** — Financial and stock transactions are never deleted; only reversed or adjusted.
- **Offline-First** — Desktop POS continues operating during network interruptions via local SQLite + sync engine.
- **Backend-Authoritative** — All financial calculations are validated and finalized server-side; frontend previews are advisory only.

## 3. Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, TanStack Query, Zustand, React Router v6 |
| Desktop | Tauri 2 (Rust shell, web UI) |
| Backend | NestJS, TypeScript, REST APIs, WebSocket |
| Database | PostgreSQL (production), SQLite (dev/offline) |
| ORM | Prisma |
| Cache/Queue | Redis, BullMQ |
| Auth | JWT + Refresh Tokens |
| Testing | Vitest, Playwright |

## 4. Module Architecture

### Modules (27 total)

1. **Auth** — JWT login, refresh, password management
2. **Users** — User management, profiles
3. **Roles & Permissions** — RBAC engine
4. **Organizations** — Multi-tenant root
5. **Branches** — Multi-branch management
6. **Customers** — Customer master, addresses, contacts
7. **Suppliers** — Supplier master, contacts
8. **Products** — Product catalog, categories, designs
9. **Jewellery Items** — Physical inventory items with barcodes
10. **Barcodes** — Barcode generation, printing, scanning
11. **Inventory** — Stock ledger, balances, movements
12. **Rates** — Gold/silver rate management, history
13. **Sales / POS** — Billing engine, GST/Non-GST
14. **Payments** — Payment processing, split payments
15. **Sales Returns** — Full/partial returns, tax reversal
16. **Exchanges** — Jewellery exchange workflow
17. **Purchases** — Purchase orders, inventory receipt
18. **URD / Old Metal** — Old gold/silver valuation
19. **Job Orders** — Customer orders, custom manufacturing
20. **Job Assignments** — Employee/goldsmith assignment
21. **Job Materials** — Material issue/return tracking
22. **Repairs** — Repair management workflow
23. **GST & HSN** — Tax configuration, HSN master
24. **Reports** — All business reports
25. **Notifications** — In-app, WhatsApp, SMS abstractions
26. **Settings** — Global configuration
27. **Audit Logs** — Immutable action history

## 5. Billing Calculation Engine

```
Metal Value = Net Weight × Rate Per Gram
→ Making Charge (Percentage/Per Gram/Fixed)
→ Hallmark Charge (Fixed)
→ Other Charges (configurable types)
→ Subtotal (Metal + All Charges)
→ Discount (% or fixed)
→ URD Deduction (if applicable)
→ Taxable Amount
→ CGST (taxable × 9%) + SGST (taxable × 9%) or IGST
→ Round Off
→ Final Amount
→ Payment Allocation
→ Balance / Outstanding
```

## 6. Inventory Transaction Model

Every stock change creates an immutable transaction:

| Transaction Type | Effect |
|----------------|--------|
| PURCHASE | +Stock |
| SALE | -Stock |
| SALE_RETURN | +Stock |
| MANUFACTURING_ISSUE | -Stock |
| MANUFACTURING_RETURN | +Stock |
| EXCHANGE_OUT | -Stock |
| EXCHANGE_IN | +Stock |
| URD_RECEIVE | +Credit |
| TRANSFER | +/- Branch |
| ADJUSTMENT | +/- |
| MELTING | -Stock |
| SCRAPPED | -Stock |

## 7. Sync Architecture (Offline Desktop)

```
Local Action → Outbox Table → Sync Engine → Server API → ACK → Mark Synced
                              ↕
                        Conflict Detector
                              ↕
                        Retry Queue (BullMQ)
```

- Every transaction has a client-generated UUID (idempotency key)
- Server rejects duplicates
- Conflicts are queued for manual resolution

## 8. Folder Structure

```
jewellery-erp/
├── docs/
├── packages/
│   ├── shared/          # Shared types, constants, DTOs
│   ├── backend/         # NestJS backend
│   │   ├── prisma/      # Schema, migrations
│   │   └── src/
│   │       ├── modules/ # One folder per module
│   │       ├── common/  # Shared utilities, guards, pipes
│   │       └── main.ts
│   ├── frontend/        # React/Vite SPA
│   │   └── src/
│   │       ├── modules/ # Feature modules
│   │       ├── components/ # Shared components
│   │       ├── hooks/
│   │       ├── stores/
│   │       ├── services/ # API service layer
│   │       └── main.tsx
│   └── desktop/         # Tauri 2 app
│       ├── src-tauri/
│       └── src/
└── package.json         # Root workspace
```
