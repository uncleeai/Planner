'use client';

import { useEffect } from 'react';

// Granica błędów dla stron (App Router): zamiast domyślnego białego ekranu Next
// pokazujemy komunikat w skórce apki z możliwością ponowienia. Renderuje się
// wewnątrz layoutu, więc tło i style globalne działają normalnie.

// „Failed to load chunk" = klient ma HTML ze starego deploya i prosi o pliki JS,
// których już nie ma (skew po wdrożeniu). „Spróbuj ponownie" nic tu nie da —
// pomaga tylko świeży HTML, więc przeładowujemy stronę sami. Bezpiecznik
// w sessionStorage chroni przed pętlą reloadów, gdyby świeży HTML też padał.
function isChunkError(error: Error) {
  return /failed to load chunk|loading chunk .* failed|importing a module script failed/i.test(
    error?.message ?? '',
  );
}

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (!isChunkError(error)) return;
    try {
      const KEY = 'planner-chunk-reload';
      const last = Number(sessionStorage.getItem(KEY) ?? 0);
      if (Date.now() - last < 30_000) return; // dopiero co przeładowane — nie pętlimy
      sessionStorage.setItem(KEY, String(Date.now()));
      window.location.reload();
    } catch { /* brak sessionStorage — zostaje ekran z przyciskami */ }
  }, [error]);

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
