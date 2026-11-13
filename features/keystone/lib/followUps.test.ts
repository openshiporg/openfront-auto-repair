import { describe, expect, it } from 'vitest'
import { computeReminder, nextFollowUp } from './followUps'

describe('follow-up and reminder dates', () => {
  it('counts the follow-up from the shop day of the decline, not the UTC day', () => {
    // Wed Nov 11 2026, 6:31 pm PT is Thu Nov 12 in UTC. Three days after the shop day is Sat Nov 14.
    const rec = { declinedAt: '2026-11-12T02:31:00Z', deferUntil: null, contactedCount: 0, lastContactedAt: null }
    expect(nextFollowUp(rec, [3, 30, 90], 'America/Los_Angeles')?.dueOn).toBe('2026-11-14')
    expect(nextFollowUp({ ...rec, declinedAt: '2026-03-01T17:00:00Z' }, [3, 30, 90])?.dueOn).toBe('2026-03-04')
    expect(nextFollowUp({ ...rec, declinedAt: '2026-03-01T17:00:00Z', deferUntil: '2026-06-15T00:00:00Z' }, [3, 30, 90])?.dueOn).toBe('2026-06-15')
  })

  it('clamps the due date at month end', () => {
    const base = { serviceOdometer: null, currentOdometer: null, today: '2026-09-01', perDay: 33 }
    expect(computeReminder({ ...base, servicedOn: '2026-08-31', interval: { miles: 5000, months: 6 } }).dueOn).toBe('2027-02-28')
    expect(computeReminder({ ...base, servicedOn: '2027-08-31', interval: { miles: 5000, months: 6 } }).dueOn).toBe('2028-02-29')
    expect(computeReminder({ ...base, servicedOn: '2026-01-10', interval: { miles: 5000, months: 6 } }).dueOn).toBe('2026-07-10')
  })
})
