'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/auth';
import {
  uploadEventPhotos,
  deleteEventPhoto,
  photoUrl,
  isGalleryConfigured,
  type EventPhoto,
} from '@/lib/gallery';
import type { Profile } from '@/lib/types';
import { Avatar } from '@/components/Avatar';
import { appAlert, appConfirm } from '@/components/Dialogs';
import { IconX } from '@/components/icons';

// Galeria wypadu: siatka podglądów (JPEG 2048px z R2) + pełnoekranowy viewer ze
// swipe. Oryginały bajt-w-bajt do pobrania w viewerze. Realtime bez filtra
// (filtry nie łapią DELETE — jak przy reakcjach), reload i tak pyta per wypad.
export default function EventGallery({
  eventId,
  members,
  isOrganizer,
}: {
  eventId: string;
  members: Profile[];
  isOrganizer: boolean;
}) {
  const { userId } = useAuth();
  // Prześwit między slajdami viewera w px — musi zgadzać się z gap .pv-track.
  const PV_GAP = 16;
  const [photos, setPhotos] = useState<EventPhoto[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [viewerIdx, setViewerIdx] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Pager viewera (jak iOS Zdjęcia): pozycję trzymamy w refie i piszemy
  // transform bezpośrednio na elemencie (bez setState per klatka), a dojazd po
  // puszczeniu napędza sprężyna w rAF startująca z prędkością palca. Dzięki
  // temu animację można w KAŻDEJ chwili przerwać dotknięciem — łapiesz
  // zdjęcie w locie i ciągniesz dalej, jak natywnie.
  const trackRef = useRef<HTMLDivElement>(null);
  const posRef = useRef(0); // przesunięcie tracka w px względem wycentrowania
  const velRef = useRef(0); // px/ms, + = palec w prawo
  const rafRef = useRef<number | null>(null);
  const dragRef = useRef<{ baseX: number; basePos: number; w: number } | null>(null);
  const sampleRef = useRef<{ x: number; t: number } | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('event_photos')
      .select('*')
      .eq('event_id', eventId)
      .is('deleted_at', null)
      .order('taken_at', { ascending: true })
      .order('created_at', { ascending: true });
    setPhotos((data ?? []) as EventPhoto[]);
  }, [eventId]);

  useEffect(() => {
    if (!isGalleryConfigured) return;
    load();
    const ch = supabase
      .channel(`photos-${eventId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_photos' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load, eventId]);

  // Viewer przykrywa ekran — blokada scrolla strony (wzorzec WeatherModal).
  useEffect(() => {
    if (viewerIdx === null) return;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = prev;
    };
  }, [viewerIdx]);

  async function onPick(list: FileList | null) {
    const files = list ? Array.from(list) : [];
    if (files.length === 0) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setProgress({ done: 0, total: files.length });
    try {
      const errors = await uploadEventPhotos(
        eventId,
        userId,
        files,
        (done, total) => setProgress({ done, total }),
        controller.signal,
      );
      // Po zatrzymaniu nie pokazujemy błędu — to świadoma akcja użytkownika.
      if (errors.length > 0 && !controller.signal.aborted) {
        appAlert(
          errors.length === files.length
            ? 'Nie udało się wgrać zdjęć'
            : `Nie wgrało się ${errors.length} z ${files.length} zdjęć`,
          errors[0],
        );
      }
    } catch (err) {
      appAlert('Nie udało się wgrać zdjęć', err instanceof Error ? err.message : 'Spróbuj ponownie.');
    } finally {
      abortRef.current = null;
      setProgress(null);
      if (inputRef.current) inputRef.current.value = '';
      load();
    }
  }

  async function removePhoto(p: EventPhoto) {
    const ok = await appConfirm('Usunąć zdjęcie?', { confirmLabel: 'Usuń', danger: true });
    if (!ok) return;
    try {
      await deleteEventPhoto(p);
      setViewerIdx(null);
      load();
    } catch (err) {
      appAlert('Błąd', err instanceof Error ? err.message : 'Nie udało się usunąć.');
    }
  }

  // --- Pager viewera: przesuwanie palcem między zdjęciami (jak iOS Zdjęcia) ---
  const applyPos = useCallback(() => {
    const el = trackRef.current;
    // -100% - gap centruje środkowy slajd (slajdy są rozsunięte o gap).
    if (el) el.style.transform = `translate3d(calc(-100% - ${PV_GAP - posRef.current}px), 0, 0)`;
  }, [PV_GAP]);
  // Po każdym renderze (w tym po zmianie indeksu w locie animacji) przykładamy
  // bieżącą pozycję ZANIM przeglądarka namaluje klatkę — zero mignięć.
  useLayoutEffect(() => {
    applyPos();
  });
  const stopAnim = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);
  useEffect(() => stopAnim, [stopAnim]);

  // Sprężyna krytycznie tłumiona do 0 (ω w 1/ms): startuje z prędkością palca
  // i wygasza się bez oscylacji — miękki doślizg zamiast przyciągnięcia.
  function settle() {
    stopAnim();
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(now - last, 32);
      last = now;
      const OMEGA = 0.012;
      let x = posRef.current;
      let v = velRef.current;
      v += (-OMEGA * OMEGA * x - 2 * OMEGA * v) * dt;
      x += v * dt;
      if (Math.abs(x) < 0.5 && Math.abs(v) < 0.05) {
        posRef.current = 0;
        velRef.current = 0;
        applyPos();
        rafRef.current = null;
        return;
      }
      posRef.current = x;
      velRef.current = v;
      applyPos();
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }

  function openViewer(i: number) {
    stopAnim();
    posRef.current = 0;
    velRef.current = 0;
    setViewerIdx(i);
  }
  function onSwipeStart(e: React.TouchEvent) {
    if (viewerIdx === null) return;
    stopAnim(); // przejęcie w locie — ciągniemy dalej od bieżącej pozycji
    const x = e.touches[0].clientX;
    const w = trackRef.current?.clientWidth ?? window.innerWidth;
    dragRef.current = { baseX: x, basePos: posRef.current, w };
    sampleRef.current = { x, t: performance.now() };
    velRef.current = 0;
  }
  function onSwipeMove(e: React.TouchEvent) {
    const drag = dragRef.current;
    if (drag === null || viewerIdx === null) return;
    const x = e.touches[0].clientX;
    let pos = drag.basePos + (x - drag.baseX);
    // Opór gumki na krańcach (brak sąsiada w tę stronę).
    if ((viewerIdx === 0 && pos > 0) || (viewerIdx === photos.length - 1 && pos < 0)) pos *= 0.3;
    // Wygładzona prędkość chwilowa (px/ms) — napęd sprężyny przy puszczeniu.
    const now = performance.now();
    const prev = sampleRef.current;
    if (prev && now > prev.t) {
      const inst = (x - prev.x) / (now - prev.t);
      velRef.current = velRef.current * 0.2 + inst * 0.8;
    }
    sampleRef.current = { x, t: now };
    posRef.current = pos;
    applyPos();
  }
  function onSwipeEnd() {
    const drag = dragRef.current;
    dragRef.current = null;
    sampleRef.current = null;
    if (drag === null || viewerIdx === null) return;
    const { w } = drag;
    const pos = posRef.current;
    const v = velRef.current;

    const FLICK = 0.3; // px/ms — machnięcie przełącza nawet przy małym dystansie
    const distTh = Math.min(80, w * 0.22);
    const canNext = viewerIdx < photos.length - 1;
    const canPrev = viewerIdx > 0;

    // Commit indeksu OD RAZU, kompensując pozycję o szerokość — klatka wygląda
    // identycznie (slajdy się przesuwają, pozycja to wyrównuje), a sprężyna
    // zawsze zbiega do 0. Bez „pending" i czekania na koniec animacji.
    const stride = w + PV_GAP; // krok strony: szerokość slajdu + prześwit
    if ((v <= -FLICK || pos <= -distTh) && canNext) {
      posRef.current = pos + stride;
      setViewerIdx(viewerIdx + 1);
    } else if ((v >= FLICK || pos >= distTh) && canPrev) {
      posRef.current = pos - stride;
      setViewerIdx(viewerIdx - 1);
    }
    settle();
  }

  if (!isGalleryConfigured) return null;

  const current = viewerIdx !== null ? photos[viewerIdx] : null;
  const author = current?.user_id ? members.find((m) => m.id === current.user_id) : undefined;
  const canDelete = !!current && (current.user_id === userId || isOrganizer);

  return (
    <section>
      <div className="section-label">Zdjęcia{photos.length > 0 ? ` · ${photos.length}` : ''}</div>
      <div className="gallery-grid">
        {photos.map((p, i) => (
          <button
            type="button"
            key={p.id}
            className="gallery-ph"
            onClick={() => openViewer(i)}
            aria-label="Pokaż zdjęcie"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl(p.preview_path)} alt="" loading="lazy" />
          </button>
        ))}
        <button
          type="button"
          className={progress ? 'gallery-add uploading' : 'gallery-add'}
          onClick={() => (progress ? abortRef.current?.abort() : inputRef.current?.click())}
          aria-label={progress ? 'Zatrzymaj wgrywanie' : 'Dodaj zdjęcia'}
        >
          {progress ? `${progress.done}/${progress.total}…` : '+'}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => onPick(e.target.files)}
      />

      {current && viewerIdx !== null && (
        <div className="photo-viewer">
          <button type="button" className="modal-close pv-close" onClick={() => setViewerIdx(null)} aria-label="Zamknij">
            <IconX size={14} />
          </button>
          <span className="pv-count">{viewerIdx + 1} / {photos.length}</span>
          <div
            className="pv-stage"
            onTouchStart={onSwipeStart}
            onTouchMove={onSwipeMove}
            onTouchEnd={onSwipeEnd}
            onTouchCancel={onSwipeEnd}
          >
            <div
              ref={trackRef}
              className="pv-track"
              style={{ transform: `translate3d(calc(-100% - ${PV_GAP}px), 0, 0)` }}
            >
              {[viewerIdx - 1, viewerIdx, viewerIdx + 1].map((idx) => {
                const ph = idx >= 0 && idx < photos.length ? photos[idx] : null;
                // Klucz po INDEKSIE zdjęcia, nie slocie: przy commicie indeksu
                // React przenosi gotowe (zdekodowane) <img> zamiast podmieniać
                // im src w trakcie animacji — bez re-dekodowania = bez gubienia
                // klatek w doślizgu.
                return (
                  <div className="pv-slide" key={idx}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {ph && (
                      <img className="pv-img" src={photoUrl(ph.preview_path)} alt="" decoding="async" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="pv-bar">
            <span className="pv-who">
              {author && <Avatar name={author.display_name} avatar={author.avatar} size={24} />}
              <span className="pv-meta">
                <b>{current.user_id === userId ? 'Ty' : author?.display_name ?? '?'}</b>
                {current.taken_at && (
                  <span>
                    {new Date(current.taken_at).toLocaleString('pl-PL', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                )}
              </span>
            </span>
            <span className="pv-actions">
              <a
                className="pv-btn"
                href={photoUrl(current.original_path ?? current.preview_path)}
                download
                target="_blank"
                rel="noopener noreferrer"
              >
                Oryginał
              </a>
              {canDelete && (
                <button type="button" className="pv-btn danger" onClick={() => removePhoto(current)}>
                  Usuń
                </button>
              )}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
