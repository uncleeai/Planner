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
  const swipeX = useRef<number | null>(null);

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
    setProgress({ done: 0, total: files.length });
    try {
      await uploadEventPhotos(eventId, userId, files, (done, total) => setProgress({ done, total }));
    } catch (err) {
      appAlert('Nie udało się wgrać zdjęć', err instanceof Error ? err.message : 'Spróbuj ponownie.');
    } finally {
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
          className="gallery-add"
          disabled={!!progress}
          onClick={() => inputRef.current?.click()}
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

      {current && (
        <div
          className="photo-viewer"
          onTouchStart={(e) => {
            swipeX.current = e.touches[0].clientX;
          }}
          onTouchEnd={(e) => {
            if (swipeX.current === null) return;
            const dx = e.changedTouches[0].clientX - swipeX.current;
            swipeX.current = null;
            if (Math.abs(dx) < 40 || viewerIdx === null) return;
            const next = viewerIdx + (dx < 0 ? 1 : -1);
            if (next >= 0 && next < photos.length) setViewerIdx(next);
          }}
        >
          <button type="button" className="modal-close pv-close" onClick={() => setViewerIdx(null)} aria-label="Zamknij">
            <IconX size={14} />
          </button>
          <span className="pv-count">{(viewerIdx ?? 0) + 1} / {photos.length}</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="pv-img" src={photoUrl(current.preview_path)} alt="" />
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
