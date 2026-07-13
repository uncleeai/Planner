// Granica loading dla trasy wypadu. Trasa jest dynamiczna (payload RSC z serwera przy
// każdym wejściu), więc bez tej granicy tap na kartę czekał na pełną rundę sieciową
// ZANIM cokolwiek się przełączyło — na komórce 2-3 s zamrożonego dashboardu. Z granicą
// Next przełącza widok natychmiast (i prefetchuje shell trasy z wyprzedzeniem), a
// właściwa strona i tak zwykle wchodzi z seedem z cache'a.
export default function Loading() {
  return (
    <main className="glass-page">
      <div className="nav-row">
        <span className="back-btn-round" aria-hidden="true" />
        <span className="nav-label">Lobby</span>
      </div>
      <p className="muted">Wczytuję…</p>
    </main>
  );
}
