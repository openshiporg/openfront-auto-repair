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

See [docs/foundation.md](./docs/foundation.md). Customers, vehicles, scheduling and check-in are next.

## Development

```bash
npm install
DATABASE_URL=postgres://… npm run dev     # runs migrations, then Next.js
npm run verify                            # typecheck, lint, unit tests, node tests
```

The database tests run when `AR_TEST_DATABASE_URL` points at a disposable Postgres schema named `vitest`.

## License

MIT. See [LICENSE](./LICENSE).
