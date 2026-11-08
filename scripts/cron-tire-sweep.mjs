// Railway cron service: asks the app to mark overdue tire registrations. Exits non-zero when the call fails so the run shows red.
const base = process.env.APP_URL
const secret = process.env.CRON_SECRET
if (!base || !secret) { console.error('APP_URL and CRON_SECRET are needed'); process.exit(2) }
const res = await fetch(`${base.replace(/\/$/, '')}/api/jobs/tire-sweep`, { method: 'POST', headers: { authorization: `Bearer ${secret}` } })
const body = await res.text()
console.log(res.status, body)
process.exit(res.ok ? 0 : 1)
