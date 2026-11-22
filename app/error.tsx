'use client'

/** A page that failed to load: say so plainly and offer a way on, instead of a blank screen. */
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, background: '#111315', color: '#f4f6f8', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 420 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>This page did not load</h1>
        <p style={{ marginTop: 12, fontSize: 16, lineHeight: 1.5 }}>Something went wrong on our side. Try again, or go back to the home page. If you were booking or paying, check with the shop before doing it a second time.</p>
        <p style={{ marginTop: 20, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button type="button" onClick={reset} style={{ minHeight: 44, padding: '0 18px', borderRadius: 4, border: 0, background: '#ff6a1a', color: '#111315', fontSize: 16, fontWeight: 600, cursor: 'pointer' }}>Try again</button>
          {/* A full page load on purpose: it clears whatever state broke this page. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" style={{ minHeight: 44, padding: '0 18px', borderRadius: 4, border: '1px solid #8a8d91', color: '#f4f6f8', fontSize: 16, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>Home</a>
        </p>
      </div>
    </main>
  )
}
