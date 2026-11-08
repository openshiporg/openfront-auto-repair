import Link from 'next/link';
import { Tabs } from '../../components/ui';

const TABS = [
  { key: 'time', label: 'Time clock', href: '/dashboard/platform/time' },
  { key: 'technicians', label: 'Technicians', href: '/dashboard/platform/technicians' },
  { key: 'pay', label: 'Pay periods', href: '/dashboard/platform/pay-periods' },
  { key: 'comebacks', label: 'Comebacks', href: '/dashboard/platform/comebacks' },
];

export function LaborTabs({ active }: { active: string }) {
  return <Tabs active={active} items={TABS} />;
}

type ShopLite = { id: string; code: string; name: string };

/** Which shop's labor is on screen: ?shop=NGT, else the first shop. */
export function pickShop(shops: ShopLite[], code?: string) {
  return shops.find(s => s.code === code) ?? shops[0];
}

export function ShopSwitch({ shops, current, path }: { shops: ShopLite[]; current: ShopLite; path: string }) {
  if (shops.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-2 text-sm">
      {shops.map(s => (
        <Link key={s.id} href={`${path}?shop=${s.code}`} className={s.id === current.id ? 'font-semibold underline' : 'text-muted-foreground underline'}>{s.name}</Link>
      ))}
    </div>
  );
}
