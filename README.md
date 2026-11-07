# Openfront Auto Repair

The open-source alternative to Tekmetric.

Openfront Auto Repair runs an independent repair shop on one system: appointments and the shop's online booking, customers and vehicles with VIN decoding, repair orders, digital vehicle inspections with photos and red/yellow/green findings, estimates the customer approves by text, labor times, parts ordering, tires and core charges, warranties and comebacks, technician time clocks and efficiency, fleet accounts and receivables, payments, and the customer portal. AI agents can call suppliers, follow up with customers and build estimates through the same tools the staff use.

Built on Next.js and KeystoneJS 6 with PostgreSQL.

## Status

Early and moving fast. The foundation is in place:
- shops, bays and hours;
- roles with separated duties;
- a hash-chained audit log;
- maker-checker approvals;
- exact money;
- the authorized-amount ceiling.

Customers, vehicles, scheduling and check-in are also in place:
- customers and fleet accounts, with per-channel texting consent (STOP is honoured);
- vehicles with VIN check digits, NHTSA decoding and recall checks, and odometer history;
- appointments with per-shop capacity (drop-offs, waiters per hour, bay hours);
- tablet check-in with the customer's signature on the work order and the state's wording;
- versioned shop policies (labor rates, parts matrix, fees, sales tax, warranty) and state rules.

See [docs/foundation.md](./docs/foundation.md) and [docs/customers-and-scheduling.md](./docs/customers-and-scheduling.md). Repair orders, inspections and estimates are next.

## Development

```bash
npm install
DATABASE_URL=postgres://… npm run dev     # runs migrations, then Next.js
DATABASE_URL=postgres://… npm run seed    # loads the Northgate demo group (safe to run again)
npm run verify                            # typecheck, lint, unit tests, node tests
```

Seeded staff (for example `priya.shah@northgateautocare.com`) cannot sign in until an owner sets a password for them. Create the first owner at `/dashboard/init` before running the seed, or set staff passwords from the People screen.

The database tests run when `AR_TEST_DATABASE_URL` points at a disposable Postgres schema named `vitest`.

## License

MIT. See [LICENSE](./LICENSE).
