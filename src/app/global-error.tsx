'use client';

// Ostatnia linia obrony: błąd w samym root layoucie. Renderuje się BEZ layoutu
// (i bez globals.css), więc musi mieć własne <html>/<body> i style inline.
export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="pl">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          background: '#0c0e10',
          color: '#e8eaed',
          fontFamily: 'ui-monospace, monospace',
          textAlign: 'center',
          padding: 24,
        }}
      >
        <b style={{ fontSize: 18, letterSpacing: 1 }}>WYPAD.EXE</b>
        <p style={{ margin: 0, opacity: 0.7 }}>Coś się mocno wysypało.</p>
        <button
          type="button"
          onClick={reset}
          style={{
            padding: '10px 22px',
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'rgba(255,255,255,0.08)',
            color: 'inherit',
            font: 'inherit',
            cursor: 'pointer',
          }}
        >
          Spróbuj ponownie
        </button>
      </body>
    </html>
  );
}
