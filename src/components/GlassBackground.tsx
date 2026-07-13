// Globalne tło (.glass-bg, globals.css): pojedyncza, płaska, cache'owana warstwa
// w kolorze skórki. Bez `filter: blur` i `mix-blend-mode`, które zmuszały iOS do
// rekompozycji całego ekranu przy każdym przerysowaniu (freeze przy naciśnięciu/
// scrollu). Wysokość: `100lvh` (patrz komentarz przy .glass-bg).
export default function GlassBackground() {
  return <div className="glass-bg" aria-hidden="true" />;
}
