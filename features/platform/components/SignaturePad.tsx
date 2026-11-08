'use client';

import * as React from 'react';

/** A finger or stylus signature on the staff tablet. Points are in the pad's own coordinates. */
export function SignaturePad({ strokes, onChange }: { strokes: number[][][]; onChange: (s: number[][][]) => void }) {
  const canvas = React.useRef<HTMLCanvasElement>(null);
  const drawing = React.useRef<number[][] | null>(null);

  React.useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = getComputedStyle(c).color;
    for (const s of strokes) {
      ctx.beginPath();
      s.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
  }, [strokes]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * e.currentTarget.width, ((e.clientY - r.top) / r.height) * e.currentTarget.height];
  };
  return (
    <canvas
      ref={canvas}
      width={800}
      height={220}
      aria-label="Signature pad: the customer signs here"
      className="block h-40 w-full touch-none rounded-md border bg-background text-foreground"
      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); drawing.current = [point(e)]; onChange([...strokes, drawing.current]); }}
      onPointerMove={e => { if (!drawing.current) return; drawing.current.push(point(e)); onChange([...strokes.slice(0, -1), [...drawing.current]]); }}
      onPointerUp={() => { drawing.current = null; }}
      onPointerCancel={() => { drawing.current = null; }}
    />
  );
}
