'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
  const [photos, setPhotos] = useState<EventPhoto[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [viewerIdx, setViewerIdx] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Pager viewera (przesuwanie palcem jak w iOS Zdjęcia): dx = bieżące
  // przesunięcie w px; animMs = czas dojazdu/powrotu (0 = śledzenie palca).
  // Tranzycja jest ZAWSZE zdefiniowana, zmieniamy tylko czas — inaczej Safari
  // potrafi pominąć animację włączaną w tej samej klatce co zmiana transformu
  // (stąd „przeskok"). Czas liczymy z prędkości gestu → dojazd płynnie
  // kontynuuje ruch palca (momentum jak natywnie).
  const [dragDx, setDragDx] = useState(0);
  const [animMs, setAnimMs] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; w: number } | null>(null);
  const velRef = useRef<{ x: number; t: number; v: number } | null>(null);
  const pendingIdx = useRef<number | null>(null);

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
  function onSwipeStart(e: React.TouchEvent) {
    if (animMs > 0 || viewerIdx === null) return; // nie przerywamy trwającego dojazdu
    const w = trackRef.current?.clientWidth ?? window.innerWidth;
    const x = e.touches[0].clientX;
    dragStart.current = { x, w };
    velRef.current = { x, t: performance.now(), v: 0 };
    setAnimMs(0);
    setDragDx(0);
  }
  function onSwipeMove(e: React.TouchEvent) {
    const start = dragStart.current;
    if (start === null || viewerIdx === null) return;
    const x = e.touches[0].clientX;
    let dx = x - start.x;
    // Opór gumki na krańcach (brak sąsiada w tę stronę).
    if ((viewerIdx === 0 && dx > 0) || (viewerIdx === photos.length - 1 && dx < 0)) dx *= 0.3;
    // Chwilowa prędkość (px/ms) z ostatniej próbki — do momentum przy puszczeniu.
    const now = performance.now();
    const prev = velRef.current;
    if (prev && now > prev.t) velRef.current = { x, t: now, v: (x - prev.x) / (now - prev.t) };
    setDragDx(dx);
  }
  function onSwipeEnd() {
    const start = dragStart.current;
    dragStart.current = null;
    if (start === null || viewerIdx === null) return;
    const w = start.w;
    const v = velRef.current?.v ?? 0; // + = w prawo (do poprzedniego), − = do następnego
    velRef.current = null;

    const FLICK = 0.3; // px/ms — próg „machnięcia": commit nawet przy małym dystansie
    const distTh = Math.min(80, w * 0.22);
    const canPrev = viewerIdx > 0;
    const canNext = viewerIdx < photos.length - 1;

    let target = viewerIdx;
    if (v <= -FLICK && canNext) target = viewerIdx + 1;
    else if (v >= FLICK && canPrev) target = viewerIdx - 1;
    else if (dragDx <= -distTh && canNext) target = viewerIdx + 1;
    else if (dragDx >= distTh && canPrev) target = viewerIdx - 1;

    const targetDx = target === viewerIdx ? 0 : target > viewerIdx ? -w : w;

    // Nic do animowania (czysty tap / już na miejscu) — commit bez tranzycji,
    // żeby brak onTransitionEnd nie zamroził pagera.
    if (targetDx === dragDx) {
      if (target !== viewerIdx) setViewerIdx(target);
      setAnimMs(0);
      setDragDx(0);
      return;
    }

    // Czas dojazdu z prędkości gestu: szybkie machnięcie → krócej, wolne → dłużej.
    // Krzywa (ease-out z długim ogonem) robi całą „miękkość" — start w tempie
    // palca, potem długie wygaszanie; dlatego czasy są dość długie.
    const remaining = Math.abs(targetDx - dragDx);
    const speed = Math.max(Math.abs(v), 0.7);
    const dur = Math.round(Math.max(300, Math.min(560, remaining / speed)));
    pendingIdx.current = target === viewerIdx ? null : target;
    setAnimMs(dur);
    setDragDx(targetDx);
  }
  function onSwipeSettled() {
    if (pendingIdx.current !== null) {
      setViewerIdx(pendingIdx.current);
      pendingIdx.current = null;
    }
    setAnimMs(0); // wracamy do śledzenia palca; commit środkowego slajdu = bez skoku
    setDragDx(0);
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
            onClick={() => setViewerIdx(i)}
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
              style={{
                transform: `translate3d(calc(-100% + ${dragDx}px), 0, 0)`,
                transition: `transform ${animMs}ms cubic-bezier(0.16, 1, 0.3, 1)`,
              }}
              onTransitionEnd={onSwipeSettled}
            >
              {[viewerIdx - 1, viewerIdx, viewerIdx + 1].map((idx, slot) => {
                const ph = idx >= 0 && idx < photos.length ? photos[idx] : null;
                return (
                  <div className="pv-slide" key={slot}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {ph && <img className="pv-img" src={photoUrl(ph.preview_path)} alt="" />}
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
