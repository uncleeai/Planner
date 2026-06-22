// Statyczne, nasycone tło „Liquid Glass" — kolorowe bloby prześwitujące przez szkło kart.
export default function GlassBackground() {
  return (
    <div className="glass-bg" aria-hidden="true">
      <div className="glass-blob glass-blob-1" />
      <div className="glass-blob glass-blob-2" />
    </div>
  );
}
