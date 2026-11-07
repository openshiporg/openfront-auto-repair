# Foundation (Phase 0)

The platform spine every later feature builds on.

## What ships

- **Organisation and shops.** One organisation per deployment (`OrganizationSettings`), with several `Shop` rows. Each shop has its own bays, weekly hours, holiday closures and staff memberships. A user sees and changes only the shops they belong to, unless their role has `canAccessAllShops`. Money is never merged across shops.
- **Roles.** Eleven seeded roles with separated duties: Owner, Shop Manager, Service Advisor, Lead Technician, Technician, Parts Manager, Bookkeeper, Marketing, Auditor, Customer Portal and Fleet Approver. `canBreakGlass` is never seeded.
- **Write path.** One mutation per state change:
  - every change takes a version check and a row lock;
  - the state change, audit event and outbox message commit in one transaction, with no network calls inside it;
  - an idempotency key makes retries safe.
- **Audit.** A hash-chained, append-only `AuditEvent` log. The database refuses updates and deletes. You can verify the chain under Settings → Audit log.
- **Maker-checker.** `ApprovalRequest` and `ApprovalDecision` record approvals. The approver must be a different person, and an agent can never approve; a database trigger enforces this even for raw SQL. The approval is bound to the exact payload it was given for and can be used only once. Organisation controls (agent-owner separation, cross-shop customer visibility, record retention) change only through this path.
- **Exact numbers.**
  - Money is integer cents (`bigint`).
  - Labor time is in centi-hours, and quantities are in milli-units.
  - Rates are exact decimals (`decimal.js`, half-even rounding).
  - Lint rules reject `Number` on money and float fields.
- **Authorized ceiling** (`lib/ceiling.ts`): `charge ≤ authorized + tolerance`, where the tolerance rule comes from the state's policy.
  - CA allows nothing over the authorized amount.
  - FL, MI and WA rules are typed data.
  - A breach raises `REAUTHORIZATION_REQUIRED`.
- **Shop calendar** (`lib/calendar.ts`):
  - shop-local dates, DST-safe opening times and business-day arithmetic;
  - it fails closed past the calendar's coverage date.
- **Workers.** Outbox delivery is exactly-once in effect, using leases with fencing tokens. Gap-free staff references (`RO-2026-000412`) and random customer-visible codes.

## Setup data

The sidebar card "Set up your shop" loads **Northgate Auto Group**, a fictitious group of two California shops:
- **NGA**, Sacramento: 8 bays, including a heavy lift and alignment;
- **NGT**, Roseville: tire, alignment and quick-lube bays.

It also loads 12 staff, 3 agent identities and 22 approval policies. Running it again changes nothing.

## Not here yet

- Customer-facing pages (shop website, booking, estimate approval, payment, portals). The root URL redirects to the staff dashboard.
- The APIs those pages will use arrive phase by phase.

Customers, vehicles, scheduling and check-in: see [customers-and-scheduling.md](./customers-and-scheduling.md).
