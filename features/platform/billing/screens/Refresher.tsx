'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

/** Re-reads the page every few seconds while a card payment is still settling. */
export function Refresher({ seconds = 4 }: { seconds?: number }) {
  const router = useRouter();
  React.useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return <p role="status" className="text-sm text-muted-foreground">Waiting for the card payment to settle.</p>;
}
