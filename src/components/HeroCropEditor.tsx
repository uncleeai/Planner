'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { HERO_CATEGORIES, DEFAULT_CROP, type HeroCrop } from '@/lib/heroImage';
import { loadHeroCrops, saveHeroCrop } from '@/lib/heroCrops';
import { updateCachedCrop } from '@/lib/dataCache';
import { IconX, IconChevron, IconPin } from '@/components/icons';

// Admin: kadrowanie zdjęć hero per kategoria (emoji). Suwaki (zoom + pozycja) jak
// w placu zabaw, podgląd na wiernej mini-karcie hero. Zapis do hero_crops (RLS: admin).
export default function HeroCropEditor({ onClose }: { onClose: () => void }) {
  const [crops, setCrops] = useState<Record<string, HeroCrop>>({});
  const [sel, setSel] = useState(HERO_CATEGORIES[0].emoji);
  const [zoom, setZoom] = useState(DEFAULT_CROP.zoom);
  const [px, setPx] = useState(DEFAULT_CROP.pos_x);
  const [py, setPy] = useState(DEFAULT_CROP.pos_y);
  const [bright, setBright] = useState(DEFAULT_CROP.brightness);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadHeroCrops().then((list) => {
      const m: Record<string, HeroCrop> = {};
      for (const c of list) m[c.emoji] = c;
      setCrops(m);
    });
  }, []);

  // Zmiana kategorii → wczytaj jej kadr (zapisany albo domyślny).
  useEffect(() => {
    const c = crops[sel] ?? DEFAULT_CROP;
    setZoom(c.zoom);
    setPx(c.pos_x);
    setPy(c.pos_y);
    setBright(c.brightness ?? DEFAULT_CROP.brightness);
    setSaved(false);
    setError('');
  }, [sel, crops]);

  const cat = HERO_CATEGORIES.find((c) => c.emoji === sel)!;
  const src = `/hero/${cat.slug}.jpg`;

  async function save() {
    setBusy(true);
    setError('');
    const err = await saveHeroCrop({ emoji: sel, zoom, pos_x: px, pos_y: py, brightness: bright });
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    const crop = { emoji: sel, zoom, pos_x: px, pos_y: py, brightness: bright };
    setCrops((m) => ({ ...m, [sel]: crop }));
    updateCachedCrop(crop); // powrót na dashboard od razu z nowym kadrem
    setSaved(true);
  }

  function touch(setter: (n: number) => void) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setter(Number(e.target.value));
      setSaved(false);
    };
  }

  return createPortal(
    <div className="profile-overlay" onClick={onClose}>
      <div className="profile-modal crop-modal" role="dialog" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Zamknij"><IconX size={14} /></button>
        <div className="modal-label">Kadrowanie zdjęć</div>

        <div className="crop-cats">
          {HERO_CATEGORIES.map((c) => (
            <button
              key={c.emoji}
              type="button"
              className={`crop-cat${c.emoji === sel ? ' on' : ''}`}
              onClick={() => setSel(c.emoji)}
              aria-pressed={c.emoji === sel}
            >
              {c.emoji}
            </button>
          ))}
        </div>

        {/* Wierny podgląd karty hero (tak zobaczą to inni) */}
        <div className="crop-card">
          <div className="hero-photo" aria-hidden="true">
            <div
              className="hp-img"
              style={{
                backgroundImage: `url(${src})`,
                backgroundSize: `${zoom}%`,
                backgroundPosition: `${px}% ${py}%`,
                ['--hp-bright' as string]: `${bright / 100}`,
              } as React.CSSProperties}
            />
            <i className="hp-tint" /><i className="hp-half" /><i className="hp-grain" /><i className="hp-vig" /><i className="hp-scrim" />
          </div>
          <div className="crop-card-content">
            <div className="hero-emoji-top">{sel}</div>
            <div className="hero-head">
              <div className="hero-title-block">
                <span className="hero-title">{cat.label}</span>
                <div className="hero-meta">
                  <span className="event-meta"><IconPin size={13} /> Bydgoszcz</span>
                  <span className="sep">·</span>
                  <span className="mono-date">WT 7.07</span>
                </div>
              </div>
              <IconChevron size={20} className="row-chevron" />
            </div>
            <div className="hero-host">
              <span className="crop-ava">🦉</span><b>Lukens</b><span className="host-tag">HOST</span>
            </div>
            <div className="readybar">
              <span className="segs"><i className="on-yes" /><i className="on-yes" /></span>
              <b>2/2 <span>DAŁO ZNAĆ</span></b>
            </div>
          </div>
        </div>

        <div className="crop-ctl"><label>Zoom</label><input type="range" min="100" max="340" value={zoom} onChange={touch(setZoom)} /><output>{zoom}%</output></div>
        <div className="crop-ctl"><label>Lewo↔prawo</label><input type="range" min="0" max="100" value={px} onChange={touch(setPx)} /><output>{px}%</output></div>
        <div className="crop-ctl"><label>Góra↔dół</label><input type="range" min="0" max="100" value={py} onChange={touch(setPy)} /><output>{py}%</output></div>
        <div className="crop-ctl"><label>Jasność</label><input type="range" min="40" max="140" value={bright} onChange={touch(setBright)} /><output>{bright}%</output></div>

        {error && <p className="small" style={{ color: 'var(--no)', margin: '4px 0 0' }}>{error}</p>}
        <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'nowrap' }}>
          <button type="button" className="cta-gradient" style={{ flex: 1 }} disabled={busy} onClick={save}>
            {busy ? 'Zapisuję…' : saved ? 'Zapisano ✓' : 'Zapisz kadr'}
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => { setZoom(DEFAULT_CROP.zoom); setPx(DEFAULT_CROP.pos_x); setPy(DEFAULT_CROP.pos_y); setBright(DEFAULT_CROP.brightness); setSaved(false); }}
          >
            Reset
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
