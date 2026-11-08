import { q } from '../../lib/server';
import { money, milli } from '../../lib/format';
import { Page, Row, Empty, Meta, Section, Stat } from '../../components/ui';
import { PartsTabs } from './PartsTabs';
import { AdjustForm, CountForm } from './PartsActions';

type Item = { id: string; sku: string; partNumber: string; brand: string; description: string; binLocation: string; minQuantityMilli: number; shop: { id: string; name: string } | null; stock: { onHandMilli: number; committedMilli: number; onOrderMilli: number; averageCostMinor: string } | null };

/** Stocked parts: on hand, committed to jobs, on order, and the average cost the shelf holds. */
export default async function StockPage() {
  const { shopItems } = await q<{ shopItems: Item[] }>(`{ shopItems(where: { isStocked: { equals: true }, active: { equals: true } }, orderBy: { sku: asc }, take: 400) {
    id sku partNumber brand description binLocation minQuantityMilli shop { id name } stock { onHandMilli committedMilli onOrderMilli averageCostMinor } } }`);
  const value = shopItems.reduce((s, i) => s + (i.stock ? BigInt(i.stock.onHandMilli) * BigInt(i.stock.averageCostMinor) : 0n), 0n);
  const low = shopItems.filter(i => i.stock && i.stock.onHandMilli - i.stock.committedMilli + i.stock.onOrderMilli < i.minQuantityMilli);
  const shops = [...new Map(shopItems.filter(i => i.shop).map(i => [i.shop!.id, i.shop!.name])).entries()];
  return (
    <Page title="Stock">
      <PartsTabs active="stock" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat name="Parts stocked" value={<span className="font-mono text-base">{shopItems.length}</span>} />
        <Stat name="Value on hand" value={<span className="font-mono text-base">{money((value / 1000n).toString())}</span>} />
        <Stat name="At or under minimum" value={<span className={`font-mono text-base ${low.length ? 'text-amber-600' : ''}`}>{low.length}</span>} />
      </div>
      {shops.map(([shopId, shopName]) => {
        const rows = shopItems.filter(i => i.shop?.id === shopId);
        return (
          <Section key={shopId} title={shopName} aside={<CountForm shopId={shopId} items={rows.map(i => ({ id: i.id, sku: i.sku, onHand: i.stock?.onHandMilli ?? 0 }))} />}>
            {rows.length ? rows.map(i => (
              <div key={i.id} className="min-w-0 space-y-2 border-b py-3 last:border-b-0">
                <Row className="border-b-0 py-0">
                  <div className="min-w-0 break-words"><span className="font-mono text-sm">{i.sku}</span> <span className="text-sm">{i.description}</span> <Meta>{i.brand}{i.binLocation ? ` · bin ${i.binLocation}` : ''}</Meta></div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <span className="font-mono">{milli(i.stock?.onHandMilli)} on hand</span>
                    <Meta>{milli(i.stock?.committedMilli)} for jobs · {milli(i.stock?.onOrderMilli)} on order · avg {money(i.stock?.averageCostMinor)}</Meta>
                    <AdjustForm shopItemId={i.id} sku={i.sku} />
                  </div>
                </Row>
              </div>
            )) : <Empty>No stocked parts.</Empty>}
          </Section>
        );
      })}
      {!shops.length ? <Empty>No stocked parts yet. Load the setup to add the opening stock.</Empty> : null}
    </Page>
  );
}
