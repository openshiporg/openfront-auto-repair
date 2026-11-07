'use client';

import * as React from 'react';
import { FormError, inputClass, useCommand } from '../../components/useCommand';
import { pillClass } from '../../components/ActionButton';

/** A reading lower than the last one is refused unless the advisor gives a reason (cluster swap, typo on the last visit). */
export function OdometerForm({ vehicleId, last, unit }: { vehicleId: string; last: number | null; unit: string }) {
  const [value, setValue] = React.useState('');
  const [reason, setReason] = React.useState('');
  const save = useCommand('recordOdometerReading');
  const lower = last !== null && value !== '' && Number(value) < last;
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={e => {
        e.preventDefault();
        save.run({ vehicleId, value: Number(value), unit, overrideReason: lower ? reason : undefined }, () => { setValue(''); setReason(''); });
      }}
    >
      <label className="space-y-1 text-xs text-muted-foreground">New reading ({unit})
        <input required inputMode="numeric" pattern="[0-9]{1,7}" className={`${inputClass} w-36 font-mono`} value={value} onChange={e => setValue(e.target.value.replace(/\D/g, ''))} />
      </label>
      {lower ? (
        <label className="min-w-0 flex-1 space-y-1 text-xs text-muted-foreground">Why is it lower than {last!.toLocaleString('en-US')}?
          <input required className={inputClass} value={reason} onChange={e => setReason(e.target.value)} placeholder="Instrument cluster replaced" />
        </label>
      ) : null}
      <button type="submit" disabled={save.pending} className={pillClass}>{save.pending ? 'Saving' : 'Record'}</button>
      <div className="basis-full"><FormError error={save.error} /></div>
    </form>
  );
}
