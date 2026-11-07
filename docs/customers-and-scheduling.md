# Customers, vehicles and scheduling (Phase 1)

Everything up to the moment a vehicle is checked in. Repair orders start from a check-in in the next phase.

## Policies

Shop rules are **versioned**. A published version never changes, and the database refuses edits to it.
- **Kinds:** shop policy, labor rates, parts matrix, fees, sales tax and warranty, per shop. The state rules (jurisdiction packs) are separate.
- **Changing a rule:** make a draft (a copy), edit it, then publish. Publishing checks the draft:
  - CA shops cannot charge generic "shop supplies";
  - an agent can never be allowed to record a customer authorization;
  - labor rates and tax rates must be in range.
- **Who publishes:** someone other than the author must publish, unless nobody else holds the permission. Any change to what agents may do needs the agent-autonomy approval.
- **State rules:** California is the default pack and the only one marked verified. The other state packs carry a "not checked against the regulations" banner.
- **Seeded fees:**
  - the California tire fee, $1.75 per tire;
  - the California battery fee, $2.00;
  - a battery deposit, refundable within 45 days and taxable. Its amount is a **placeholder rate** until confirmed.
- **Seeded sales tax** (CDTFA, effective 2026-10-01): Sacramento 8.75%, Roseville 7.75%.

## Customers

- **Customers and accounts:** people and fleet (business) accounts. Fleet accounts carry terms, a credit limit, whether a PO is required, and the billing mode.
- **Contacts** are normalised and looked up by a hash. The dashboard shows masked values. The audit log never stores the number or address.
- **Duplicate check:** a new customer with a phone or email already on file is refused unless staff confirm it is a different person.
- **Consent** is an append-only history per contact, channel and purpose. The latest event wins.
  - A STOP reply revokes texting at once.
  - Marketing texts need written consent.
  - An automated reply classifier may only revoke, never grant.

## Vehicles

- **VINs** are checked with the check digit. A failed check digit warns but does not block, because older and grey-market VINs exist. Two active vehicles can't share a VIN.
- **Decoding:** NHTSA vPIC decodes the VIN.
- **Recalls:** NHTSA Recalls lists campaigns for the year, make and model. Results are stored as immutable snapshots. Recall text from NHTSA is shown as plain text, and park-outside or do-not-drive campaigns are flagged in red.
- **Odometer readings** are append-only. A reading lower than the last one needs a reason.

## Scheduling

- **Appointment states:** requested → confirmed → arrived (only by check-in) or no-show. Requested or confirmed can be cancelled.
- **Capacity** is checked per shop and date under a lock, so two advisors can't take the last slot:
  - drop-offs per day;
  - waiters per clock hour;
  - bay hours per day;
  - a cut-off time for waiters;
  - booking lead time.
  - A rule for a specific weekday beats an every-day rule.
- **Holds:** a hold keeps a slot for 10 minutes while a booking is finished.
- **No-shows:** an appointment can be marked a no-show only after the grace period.

## Check-in

Check-in is a staff screen on the shop tablet. It is not a customer page.
- **Captured:** the concerns in the customer's own words, odometer in, the promised time, a key tag and transport.
- **Signature:** the customer signs the work order on the tablet. The work order shows the state's required wording; for CA, that is the written-estimate notice and the offer of replaced parts.
- **Recalls:** if the model has open recall campaigns, the screen warns before the vehicle is left, in red for park-outside or do-not-drive.
- **Result:** the appointment becomes arrived, and the check-in gets a reference such as `CI-NGA-2026-000001`.

## Commands

All of these are GraphQL mutations with an idempotency key:
- `createPolicyDraft`, `publishPolicyVersion`;
- `saveCustomer`, `createBusinessAccount`, `recordContactConsent`;
- `saveVehicle`, `recordOdometerReading`, `decodeVehicleVin`, `checkVehicleRecalls`;
- `bookShopAppointment`, `transitionAppointment`;
- `checkInShopVehicle`.

The `checkAuthorizedCeiling` query reports whether a charge fits inside the authorized amount plus the state's tolerance. Repair orders use it in the next phase.

## Demo data

`npm run seed`, or the sidebar card, loads Northgate Auto Group. Running it again creates nothing new. It contains:
- 2 shops;
- 40 customers and 2 fleet accounts;
- 55 vehicles;
- appointments for the next business days;
- one customer who replied STOP;
- a 2017 Kia Sportage with four recall campaigns, two of them park-outside.
