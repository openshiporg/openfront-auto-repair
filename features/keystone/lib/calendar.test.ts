import { describe, expect, it } from 'vitest'
import { addBusinessDays, businessDaysBetween, fromRows, hoursOn, isBusinessDay, localDate, nextBusinessDay, sessionAt } from './calendar'
import { CALENDAR_COVERAGE_THROUGH, SHOP_CLOSURES, SHOPS } from '../seed/northgate'

const NGA = fromRows('NGA', 'America/Los_Angeles', { weeklyHours: SHOPS[0].weeklyHours, coverageThrough: CALENDAR_COVERAGE_THROUGH }, [
  ...SHOP_CLOSURES.map(([date]) => ({ date, closed: true })),
  { date: '2026-12-24', closed: false, open: '07:30', close: '13:00' },
])

describe('Shop calendar (Northgate Auto Care)', () => {
  it('knows open days, Saturdays, Sundays and holiday closures', () => {
    expect(isBusinessDay(NGA, '2026-11-26')).toBe(false) // Thanksgiving closure
    expect(isBusinessDay(NGA, '2026-11-29')).toBe(false) // Sunday
    expect(hoursOn(NGA, '2026-11-28')).toEqual({ open: '08:00', close: '14:00' }) // Saturday
    expect(hoursOn(NGA, '2026-11-27')).toEqual({ open: '07:30', close: '18:00' })
    expect(hoursOn(NGA, '2026-12-24')).toEqual({ open: '07:30', close: '13:00' }) // special hours
  })

  it('counts business days across closures and weekends', () => {
    expect(nextBusinessDay(NGA, '2026-11-25')).toBe('2026-11-27')
    expect(addBusinessDays(NGA, '2026-12-24', 1)).toBe('2026-12-26') // Saturday is open
    expect(addBusinessDays(NGA, '2026-12-26', 1)).toBe('2026-12-28')
    expect(addBusinessDays(NGA, '2026-11-30', -1)).toBe('2026-11-28')
    expect(businessDaysBetween(NGA, '2026-11-20', '2026-11-30')).toBe(7)
  })

  it('opens and closes in shop-local time across daylight saving', () => {
    // 2026-11-02 is after the fall-back: 07:30 PST = 15:30Z.
    expect(sessionAt(NGA, Date.parse('2026-11-02T15:29:59Z')).phase).toBe('closed')
    expect(sessionAt(NGA, Date.parse('2026-11-02T15:30:00Z')).phase).toBe('open')
    // 2026-10-30 is before it: 07:30 PDT = 14:30Z.
    expect(sessionAt(NGA, Date.parse('2026-10-30T15:00:00Z')).opensAt?.toISOString()).toBe('2026-10-30T14:30:00.000Z')
    expect(sessionAt(NGA, Date.parse('2026-12-24T21:30:00Z')).phase).toBe('closed') // 13:30 PST, after the early close
    expect(sessionAt(NGA, Date.parse('2026-11-26T18:00:00Z'))).toMatchObject({ businessDay: false, phase: 'closed', opensAt: null })
  })

  it('uses the shop-local date, not the server date', () => {
    expect(localDate(NGA, Date.parse('2026-11-03T06:00:00Z'))).toBe('2026-11-02')
  })

  it('fails closed past its coverage and on malformed hours', () => {
    expect(() => isBusinessDay(NGA, '2028-01-03')).toThrow(/no verified schedule/)
    expect(() => fromRows('X', 'America/Los_Angeles', { weeklyHours: [{ dow: 1, open: '18:00', close: '08:00' }], coverageThrough: '2027-12-31' }, [])).toThrow(/Invalid hours/)
    expect(() => fromRows('X', 'America/Los_Angeles', { weeklyHours: [], coverageThrough: null }, [])).toThrow(/no coverage/)
  })
})
