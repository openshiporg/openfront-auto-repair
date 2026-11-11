// r6 crawl gate: every dashboard page as each role (+ public pages), plus a missing id per list. Prints only PASS/FAIL.
// Usage: CRAWL_BASE=<url> CRAWL_LOGINS=<json {role:{email,password}}> node scripts/r6-crawl.mjs [roles...]
// FAIL = HTTP 5xx/0 or an error boundary. A missing/unreadable item must be 404.
import fs from 'node:fs'
import { chromium } from '/Users/junaid/Code/vibeghost/vibeghost/node_modules/playwright/index.mjs'
const BASE = process.env.CRAWL_BASE
const people = JSON.parse(fs.readFileSync(process.env.CRAWL_LOGINS, 'utf8'))
const roles = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(people)
const gql = async (query, cookie) => (await fetch(BASE + '/api/graphql', { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify({ query }) })).json()
const o = people.owner
const auth = await (await fetch(BASE + '/api/graphql', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: 'mutation($e:String!,$p:String!){authenticateUserWithPassword(email:$e,password:$p){... on UserAuthenticationWithPasswordSuccess{sessionToken}}}', variables: { e: o.email, p: o.password } }) })).json()
const cookie = 'keystonejs-session=' + auth.data?.authenticateUserWithPassword?.sessionToken
const meta = (await gql('{keystone{adminMeta{lists{key path listQueryName}}}}', cookie)).data?.keystone?.adminMeta?.lists
if (!meta) { console.log('CHECK crawl setup: FAIL'); process.exit(1) }
const platform = ['accounts', 'statements', 'approvals', 'audit', 'board', 'canned-jobs', 'check-in', 'comebacks', 'cores', 'customers', 'day-close', 'inspections', 'parts', 'pay-periods', 'policies', 'purchase-orders', 'receivables', 'repair-orders', 'schedule', 'shops', 'stock', 'supplier-invoices', 'technicians', 'time', 'tires', 'vehicles']
const pages = ['/dashboard/', ...platform.map(s => '/dashboard/platform/' + s)]
const ro = (await gql('{repairOrders(take:2){id}}', cookie)).data?.repairOrders ?? []
for (const r of ro) pages.push('/dashboard/platform/repair-orders/' + r.id, '/dashboard/platform/repair-orders/' + r.id + '/authorize')
const insp = (await gql('{inspections(take:1){id}}', cookie)).data?.inspections?.[0]; if (insp) pages.push('/dashboard/platform/inspections/' + insp.id)
const expect404 = new Set()
const acct = (await gql('{businessAccounts(take:1){id}}', cookie)).data?.businessAccounts?.[0]; if (acct) pages.push('/dashboard/platform/accounts/' + acct.id)
pages.push('/dashboard/platform/accounts/nope123'); expect404.add('/dashboard/platform/accounts/nope123')
for (const l of meta) {
  pages.push('/dashboard/' + l.path)
  const row = (await gql(`{${l.listQueryName}(take:1){id}}`, cookie)).data?.[l.listQueryName]?.[0]
  if (row) pages.push(`/dashboard/${l.path}/${row.id}`)
  const bad = `/dashboard/${l.path}/nope123`; pages.push(bad); expect404.add(bad)
}
const b = await chromium.launch({ executablePath: process.env.HOME + '/Library/Caches/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-mac-arm64/chrome-headless-shell' })
let bad = 0, total = 0
const broken = /something went wrong|application error|server-side exception|internal server error|this page could not be loaded|QUERY_TOO_BROAD/i
for (const role of roles) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true }); const p = await ctx.newPage()
  await p.goto(BASE + '/dashboard/signin'); await p.fill('input[name=email]', people[role].email); await p.fill('input[name=password]', people[role].password)
  await Promise.all([p.waitForURL(u => !u.pathname.includes('signin'), { timeout: 30000 }), p.click('button[type=submit]')])
  let n = 0, f = 0
  for (const path of pages) {
    const r = await p.goto(BASE + path, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => null)
    const txt = await p.evaluate(() => document.body.innerText).catch(() => '')
    const http = r?.status() ?? 0
    const ok = http > 0 && http < 500 && !broken.test(txt) && (!expect404.has(path) || http === 404)
    n++; total++; if (!ok) { f++; bad++; console.log(`CHECK ${role} ${path}: FAIL (${http})`) }
  }
  console.log(`CHECK ${role} dashboard: ${f ? 'FAIL' : 'PASS'} (${n} loads, ${f} failed)`)
  await ctx.close()
}
const pc = await b.newContext({ ignoreHTTPSErrors: true }); const pp = await pc.newPage(); let pf = 0
for (const path of ['/', '/pay/not-a-real-link-0000', '/dashboard/signin', '/dashboard/reset', '/dashboard/platform/board']) {
  const r = await pp.goto(BASE + path, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => null)
  const txt = await pp.evaluate(() => document.body.innerText).catch(() => '')
  if (!(r && r.status() < 500 && !broken.test(txt))) { pf++; bad++; console.log(`CHECK public ${path}: FAIL (${r?.status() ?? 0})`) }
}
console.log(`CHECK public: ${pf ? 'FAIL' : 'PASS'}`)
await b.close()
console.log(`CHECK crawl all: ${bad ? 'FAIL' : 'PASS'} (${total} dashboard loads x ${roles.length} roles, ${bad} failed)`)
