import { Tabs } from '../../components/ui';

const TABS = [
  { key: 'parts', label: 'Parts board', href: '/dashboard/platform/parts' },
  { key: 'orders', label: 'Orders', href: '/dashboard/platform/purchase-orders' },
  { key: 'stock', label: 'Stock', href: '/dashboard/platform/stock' },
  { key: 'cores', label: 'Cores', href: '/dashboard/platform/cores' },
  { key: 'invoices', label: 'Supplier invoices', href: '/dashboard/platform/supplier-invoices' },
  { key: 'tires', label: 'Tires', href: '/dashboard/platform/tires' },
];

export function PartsTabs({ active }: { active: string }) {
  return <Tabs active={active} items={TABS} />;
}
