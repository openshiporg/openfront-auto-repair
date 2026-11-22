import Link from 'next/link'
import type { StorePerson, StoreService } from '../lib/data'

/** Services and prices as a two-column ruled list. Each row opens the service. */
export function ServiceRows({ services, compact = false }: { services: StoreService[]; compact?: boolean }) {
  if (!services.length) return <p className="text-[17px]">Call the shop for services and prices.</p>
  return (
    <ul className="sf-rows">
      {services.map(s => (
        <li key={s.slug}>
          <Link href={`/services/${s.slug}`} className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 no-underline hover:bg-white/5 lg:items-baseline lg:grid-cols-[minmax(0,325px)_minmax(0,1fr)] ${compact ? 'min-h-11 py-1.5 lg:min-h-0' : 'min-h-11 py-2.5'}`}>
            <span className="sf-label break-words text-[16px] lg:text-[19px]" style={{ fontFamily: 'var(--font-sf-body)', fontWeight: 600 }}>{s.name}</span>
            <span className="text-right text-[15px] lg:text-left lg:text-[17px]">{s.priceLine}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function People({ title, people }: { title: string; people: StorePerson[] }) {
  if (!people.length) return null
  return (
    <div>
      <h3 className="sf-label text-[17px] lg:text-[19px]">{title}</h3>
      <ul className="text-[16px] lg:text-[17px]">
        {people.map(p => <li key={p.name}>{p.name}{p.title ? <span className="sf-dim block text-[14px] lg:inline lg:text-[16px]"> {p.title}</span> : null}</li>)}
      </ul>
    </div>
  )
}

/** Technicians and service advisors by name. */
export function TeamLists({ technicians, advisors, split = false }: { technicians: StorePerson[]; advisors: StorePerson[]; split?: boolean }) {
  if (split) {
    return (
      <div className="grid grid-cols-2">
        <div className="pr-4 lg:pr-6"><People title="Technicians" people={technicians} /></div>
        <div className="border-l border-[var(--sf-line)] pl-4 lg:border-[var(--sf-rule)] lg:pl-10"><People title="Service advisors" people={advisors} /></div>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <div className="sf-note"><People title="Technicians" people={technicians} /></div>
      <div className="sf-note"><People title="Service advisors" people={advisors} /></div>
    </div>
  )
}
