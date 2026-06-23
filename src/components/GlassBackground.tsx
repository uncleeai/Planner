// Tło „Liquid Glass" — falujące kurtyny zorzy polarnej + subtelne ziarno.
export default function GlassBackground() {
  return (
    <div className="glass-bg" aria-hidden="true">
      <div className="aurora">
        <span className="aurora-band b1" />
        <span className="aurora-band b2" />
        <span className="aurora-band b3" />
      </div>
      <div className="glass-grain" />
    </div>
  );
}
