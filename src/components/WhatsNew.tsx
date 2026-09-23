'use client';

import { useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

// „Co nowego" — pokazuje się RAZ NA KONTO: znacznik w user_metadata (Supabase Auth),
// nie w localStorage. Poprzednia notka (localStorage) wracała po logowaniu, bo iOS
// czyści pamięć strony po ~7 dniach, PWA z ekranu głównego ma osobną pamięć, a każdy
// nowy adres (preview) zaczyna od zera. Nowa wersja notki = nowe WHATS_NEW_ID.
export const WHATS_NEW_ID = 'chat-2';

// Zdjęcie ze slajdu „Linki i zdjęcia" (od paczki).
const PHOTO = '/whatsnew/thumbs-up.png';

const SLIDES = [
  {
    title: 'Czat na pełnym ekranie',
    text: 'Czat ma teraz osobny ekran, więc koniec z syfem pod terminami. Wchodzisz tapnięciem w kartę czatu.',
    art: (
      <>
        <div className="wn-bub">kto bierze grilla?</div>
        <div className="wn-bub">ja mam węgiel</div>
        <div className="wn-bub me">to ja ogarnę listę</div>
      </>
    ),
  },
  {
    title: 'Linki i zdjęcia',
    text: 'Aparat obok pola pisania i zdjęcie leci prosto do czatu. Sexy nudeski też wejdą 😏',
    art: (
      <>
        <div className="wn-bub">patrzcie gdzie jedziemy</div>
        <div className="wn-link">
          <div className="wn-link-img" style={{ backgroundImage: 'url(/hero/camp.jpg)' }} />
          <p>Pole namiotowe z ogniskiem · Mazury</p>
          <small>CAMPING</small>
        </div>
        <div className="wn-photo" style={{ backgroundImage: `url(${PHOTO})` }} />
      </>
    ),
  },
  {
    title: 'Przytrzymaj wiadomość',
    text: 'Reakcje podjebane z iMessage 🤙 Przytrzymaj wiadomość, żeby zareagować, skopiować, poprawić albo usunąć.',
    art: (
      <>
        <div className="wn-rx">👍 ❤️ 😂 😮 😎 🤙 💀</div>
        <div className="wn-bub me">wyjazd w piątek po 16</div>
        <div className="wn-menu">
          <div>Kopiuj</div>
          <div>Edytuj</div>
          <div className="del">Usuń</div>
        </div>
      </>
    ),
  },
];

export default function WhatsNew() {
  const [open, setOpen] = useState(true);
  const [idx, setIdx] = useState(0);
  const slidesRef = useRef<HTMLDivElement>(null);

  function close() {
    setOpen(false);
    // Zapis na koncie — kolejne logowanie / inny telefon już tego nie pokaże.
    supabase.auth.updateUser({ data: { whats_new: WHATS_NEW_ID } }).catch(() => {});
  }

  function next() {
    const el = slidesRef.current;
    if (!el || idx >= SLIDES.length - 1) return close();
    el.scrollTo({ left: (idx + 1) * el.clientWidth, behavior: 'smooth' });
  }

  if (!open) return null;
  const last = idx === SLIDES.length - 1;

  return (
    <div className="wn" role="dialog" aria-modal="true" aria-label="Co nowego">
      <div className="wn-inner">
        <div className="wn-top">
          <span className="wn-tag">
            <i>PATCH NOTES</i> CZAT 2.0
          </span>
          <button type="button" className="wn-skip" onClick={close}>
            POMIŃ
          </button>
        </div>
        <div
          className="wn-slides"
          ref={slidesRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            setIdx(Math.round(el.scrollLeft / el.clientWidth));
          }}
        >
          {SLIDES.map((s) => (
            <div className="wn-slide" key={s.title}>
              <div className="wn-art">{s.art}</div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
        <div className="wn-dots" aria-hidden="true">
          {SLIDES.map((s, i) => (
            <i key={s.title} className={i === idx ? 'on' : ''} />
          ))}
        </div>
        <button type="button" className="wn-cta" onClick={next}>
          {last ? 'Ogarnięte' : 'Dalej'}
        </button>
      </div>
    </div>
  );
}
