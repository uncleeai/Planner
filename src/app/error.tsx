'use client';

// Granica błędów dla stron (App Router): zamiast domyślnego białego ekranu Next
// pokazujemy komunikat w skórce apki z możliwością ponowienia. Renderuje się
// wewnątrz layoutu, więc tło i style globalne działają normalnie.
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="glass-page">
      <div className="wordmark cursor" style={{ textAlign: 'center', margin: '32px 0 18px' }}>
        WYPAD<span>.EXE</span>
      </div>
      <div className="card">
        <div className="modal-label">Coś się wysypało</div>
        <p className="small muted">
          Apka napotkała błąd. Spróbuj ponownie — a jak nie pomoże, odśwież stronę.
        </p>
        {error?.message && (
          <p className="small" style={{ color: 'var(--no)', wordBreak: 'break-word' }}>
            {error.message}
          </p>
        )}
        <button type="button" className="cta-gradient" onClick={reset}>
          Spróbuj ponownie
        </button>
        <button
          type="button"
          className="ghost mt"
          style={{ width: '100%' }}
          onClick={() => window.location.assign('/')}
        >
          Wróć na główną
        </button>
      </div>
    </main>
  );
}
