'use client';

import { FormError, useCommand } from '../../components/useCommand';
import { pillClass } from '../../components/ActionButton';

export function SaveSnapshot({ shopId, from, to }: { shopId: string; from: string; to: string }) {
  const cmd = useCommand<{ existing?: boolean }>('saveReportSnapshot', ['/dashboard/platform/reports']);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" disabled={cmd.pending} className={pillClass} onClick={() => cmd.run({ shopId, from, to })}>{cmd.pending ? 'Working' : 'Save a copy'}</button>
      {cmd.result ? <p role="status" className="text-sm">{cmd.result.existing ? 'Already saved.' : 'Saved.'}</p> : null}
      <FormError error={cmd.error} />
    </span>
  );
}
