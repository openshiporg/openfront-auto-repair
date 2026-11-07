import { describe, expect, it } from 'vitest'
import { fixtureAdapter, FIXTURE_VINS } from './fixtures'
import { decodeHasErrors, nhtsaAdapter, nhtsaDate, parseRecalls } from './nhtsa'
import { checkVin, normalizeVin, vinCheckDigit, withCheckDigit } from './vin'
import accord from './fixtures/recalls-accord-2018.json'

describe('VIN (I-V1)', () => {
  it('normalises spaces, dashes and case', () => {
    expect(normalizeVin(' 1hgcv1f3-7ja 000001 ')).toBe('1HGCV1F37JA000001')
  })

  it('computes the check digit (position 9), including X', () => {
    expect(vinCheckDigit(FIXTURE_VINS.clean)).toBe('7')
    expect(vinCheckDigit('11111111111111111')).toBe('1') // the classic all-ones test VIN
    const x = Array.from({ length: 1000 }, (_, i) => withCheckDigit(`1M8GDM9A${'0'}KP${String(i).padStart(6, '0')}`)).find(v => v[8] === 'X')
    expect(x).toBeDefined()
    expect(checkVin(x).validity).toBe('valid')
  })

  it('a wrong check digit warns but never blocks; a malformed VIN is invalid; empty is none', () => {
    expect(checkVin(FIXTURE_VINS.clean)).toMatchObject({ validity: 'valid' })
    expect(checkVin(FIXTURE_VINS.checkDigit)).toMatchObject({ validity: 'check_digit_warning', message: expect.stringContaining('should be 7') })
    expect(checkVin('1HGCV1F37JA00000I').validity).toBe('invalid_format') // I is never used
    expect(checkVin('1HGCV1F37JA0001').validity).toBe('invalid_format') // too short
    expect(checkVin('')).toMatchObject({ vin: null, validity: 'none' })
  })
})

describe('NHTSA adapter on recorded responses', () => {
  const adapter = fixtureAdapter()

  it('decodes the clean fixture VIN', async () => {
    const res = await adapter.decodeVin(FIXTURE_VINS.clean)
    expect(res.kind).toBe('ok')
    if (res.kind !== 'ok') return
    expect(res.value).toMatchObject({ year: 2018, make: 'HONDA', model: 'Accord', errorCode: '0' })
    expect(decodeHasErrors(res.value.errorCode)).toBe(false)
  })

  it('reports the check-digit error from NHTSA but still decodes year, make and model', async () => {
    const res = await adapter.decodeVin(FIXTURE_VINS.checkDigit)
    expect(res.kind).toBe('ok')
    if (res.kind !== 'ok') return
    expect(res.value.errorCode).toBe('1')
    expect(decodeHasErrors(res.value.errorCode)).toBe(true)
    expect(res.value).toMatchObject({ year: 2018, model: 'Accord' })
  })

  it('an unknown manufacturer decodes to errors and no make', async () => {
    const res = await adapter.decodeVin(withCheckDigit('9ZZZZ000000000001'))
    expect(res.kind).toBe('ok')
    if (res.kind !== 'ok') return
    expect(res.value.errorCode).toBe('1,7,11,400')
    expect(res.value.make ?? null).toBeNull()
  })

  it('refuses a malformed VIN before any network call', async () => {
    let called = false
    const live = nhtsaAdapter(async () => { called = true; throw new Error('no network in tests') })
    expect(await live.decodeVin('NOT-A-VIN')).toMatchObject({ kind: 'error', code: 'INVALID_INPUT' })
    expect(called).toBe(false)
  })

  it('reads recalls, including null Notes (seen live), and converts DD/MM/YYYY dates', async () => {
    const res = await adapter.recallsByVehicle({ make: 'Honda', model: 'Accord', modelYear: 2018 })
    expect(res.kind).toBe('ok')
    if (res.kind !== 'ok') return
    expect(res.value).toHaveLength(6)
    expect(res.value[0]).toMatchObject({ nhtsaCampaignNumber: '20V314000', reportReceivedDate: '2020-05-28', parkIt: false })
    expect(parseRecalls(accord).find(r => r.nhtsaCampaignNumber === '26V332000')?.notes).toBeUndefined()
    expect(nhtsaDate('09/03/2023')).toBe('2023-03-09')
  })

  it('flags park-outside campaigns', async () => {
    const res = await adapter.recallsByVehicle({ make: 'Kia', model: 'Sportage', modelYear: 2017 })
    expect(res.kind === 'ok' && res.value.filter(r => r.parkOutSide)).toHaveLength(2)
  })

  it('maps transport failures to retryable errors and bad bodies to PROVIDER_SHAPE', async () => {
    const down = nhtsaAdapter(async () => ({ ok: false, status: 503, json: async () => ({}) }))
    expect(await down.recallsByVehicle({ make: 'Honda', model: 'Accord', modelYear: 2018 })).toMatchObject({ kind: 'error', code: 'PROVIDER_ERROR', retryable: true })
    const limited = nhtsaAdapter(async () => ({ ok: false, status: 429, json: async () => ({}) }))
    expect(await limited.decodeVin(FIXTURE_VINS.clean)).toMatchObject({ code: 'RATE_LIMITED', retryable: true })
    const garbage = nhtsaAdapter(async () => ({ ok: true, status: 200, json: async () => ({ unexpected: true }) }))
    expect(await garbage.recallsByVehicle({ make: 'Honda', model: 'Accord', modelYear: 2018 })).toMatchObject({ kind: 'error', code: 'PROVIDER_SHAPE', retryable: false })
  })
})
