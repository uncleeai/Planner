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
  // przesunięcie w px, anim = czy toczy się animacja dojazdu/powrotu.
  const [dragDx, setDragDx] = useState(0);
  const [anim, setAnim] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; w: number } | null>(null);
  const pendingIdx = useRef<number | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('event_photos')
      .select('*')
      .eq('event_id', eventId)
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
    if (anim || viewerIdx === null) return;
    const w = trackRef.current?.clientWidth ?? window.innerWidth;
    dragStart.current = { x: e.touches[0].clientX, w };
    setDragDx(0);
  }
  function onSwipeMove(e: React.TouchEvent) {
    const start = dragStart.current;
    if (start === null || viewerIdx === null) return;
    let dx = e.touches[0].clientX - start.x;
    // Opór gumki na krańcach (brak sąsiada w tę stronę).
    if ((viewerIdx === 0 && dx > 0) || (viewerIdx === photos.length - 1 && dx < 0)) dx *= 0.28;
    setDragDx(dx);
  }
  function onSwipeEnd() {
    const start = dragStart.current;
    dragStart.current = null;
    if (start === null || viewerIdx === null) return;
    const w = start.w;
    const threshold = Math.min(72, w * 0.22);
    let target = viewerIdx;
    if (dragDx <= -threshold && viewerIdx < photos.length - 1) target = viewerIdx + 1;
    else if (dragDx >= threshold && viewerIdx > 0) target = viewerIdx - 1;

    // Nic do animowania (czysty tap bez ruchu) — nie właączamy tranzycji, żeby
    // onTransitionEnd na pewno padł i nie zablokował pagera.
    if (target === viewerIdx && dragDx === 0) return;

    setAnim(true);
    if (target === viewerIdx) {
      pendingIdx.current = null;
      setDragDx(0); // powrót na miejsce
    } else {
      pendingIdx.current = target;
      setDragDx(target > viewerIdx ? -w : w); // dojazd do sąsiada
    }
  }
  function onSwipeSettled() {
    setAnim(false);
    if (pendingIdx.current !== null) {
      setViewerIdx(pendingIdx.current);
      pendingIdx.current = null;
    }
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
              className={anim ? 'pv-track anim' : 'pv-track'}
              style={{ transform: `translate3d(calc(-100% + ${dragDx}px), 0, 0)` }}
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
