'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { HERO_CATEGORIES } from '@/lib/heroImage';
import { firstEmoji } from '@/lib/emoji';
import { haptic } from '@/lib/haptics';

// Wybór emoji wypadu: karuzela w stylu pokrętła iOS. Ramka akcentu stoi
// nieruchomo na środku, emoji jadą pod nią i snapują — wybrane jest to w ramce.
// Lista zapętla się w obie strony (trzy kopie cyklu; po zatrzymaniu wracamy do
// środkowej, co jest niewidoczne, bo kopie są identyczne).
//
// WYDAJNOŚĆ: handler scrolla nie dotyka geometrii DOM. Kafelki mają równą
// szerokość i zerowy odstęp, a boczny zapas szyny to dokładnie połowa kafelka,
// więc indeks pod ramką to po prostu scrollLeft / szerokość kafelka. Wcześniejsza
// wersja liczyła to, czytając offsetLeft wszystkich kafelków przy każdym zdarzeniu
// scroll i przestawiając klasy na wszystkich — wymuszony reflow w najgorętszym
// miejscu dławił gest na telefonie (scroll „puszczał" i gubił dotyk).
//
// Ostatnia pozycja cyklu to kafelek „własne": przezroczyste pole tekstowe nad
// kafelkiem. iOS nie pozwala otworzyć klawiatury od razu na emoji (nie ma takiego
// API), więc karuzela jest główną drogą, a pole — furtką na resztę emoji.

const COPIES = 3;

export default function EmojiCarousel({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (emoji: string | null) => void;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<(HTMLDivElement | null)[]>([]);
  const strideRef = useRef(0); // szerokość kafelka w px (mierzona raz)
  const slotRef = useRef(-1); // kafelek pod ramką (z numerem kopii)
  const settleRef = useRef(0);
  const rafRef = useRef(0);
  const touchingRef = useRef(false);
  const readyRef = useRef(false);

  const [onOwnTile, setOnOwnTile] = useState(false);

  const cycle = HERO_CATEGORIES.length + 1; // + kafelek „własne"
  const ownIndex = cycle - 1;
  const isOwn = !!value && !HERO_CATEGORIES.some((c) => c.emoji === value);

  // Podświetlenie przestawiamy na dwóch kafelkach (stary/nowy), nie na wszystkich,
  // i wprost na DOM — stan Reacta przerysowywałby całą szynę co klatkę.
  const markCentered = useCallback((slot: number) => {
    const prev = slotRef.current;
    if (prev === slot) return;
    itemsRef.current[prev]?.classList.remove('centered');
    itemsRef.current[slot]?.classList.add('centered');
    slotRef.current = slot;
  }, []);

  const slotAt = useCallback((scrollLeft: number): number => {
    const stride = strideRef.current;
    if (!stride) return -1;
    return Math.max(0, Math.min(cycle * COPIES - 1, Math.round(scrollLeft / stride)));
  }, [cycle]);

  const scrollToSlot = useCallback((slot: number, smooth: boolean) => {
    const rail = railRef.current;
    if (!rail || !strideRef.current) return;
    rail.scrollTo({ left: slot * strideRef.current, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  // Start: wybrane emoji w ŚRODKOWEJ kopii, żeby dało się jechać w obie strony.
  useEffect(() => {
    const rail = railRef.current;
    const first = itemsRef.current[0];
    if (!rail || !first) return;
    // offsetWidth, NIE getBoundingClientRect(): boczne kafelki są pomniejszone
    // transformem, a rect zwraca rozmiar PO transformacji — stride wyszedłby
    // o jedną czwartą za mały i cała arytmetyka by się rozjechała.
    strideRef.current = first.offsetWidth;

    const found = HERO_CATEGORIES.findIndex((c) => c.emoji === value);
    const within = found >= 0 ? found : isOwn ? ownIndex : 0;
    const slot = cycle + within;
    scrollToSlot(slot, false);
    itemsRef.current[slot]?.classList.add('centered');
    slotRef.current = slot;
    setOnOwnTile(within === ownIndex);
    readyRef.current = true;
    // tylko na montowaniu — dalej pozycją rządzi palec
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onScroll() {
    if (!readyRef.current || rafRef.current) return;
    // Jedno wejście na klatkę — zdarzeń scroll jest znacznie więcej niż klatek.
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const rail = railRef.current;
      if (!rail) return;
      const slot = slotAt(rail.scrollLeft);
      if (slot < 0) return;
      if (slot !== slotRef.current) {
        markCentered(slot);
        haptic(); // Android; na iOS 26.5+ Apple zablokowało haptic ze skryptu
      }
      window.clearTimeout(settleRef.current);
      settleRef.current = window.setTimeout(settle, 120);
    });
  }

  function settle() {
    const rail = railRef.current;
    if (!rail) return;
    // Palec wciąż na ekranie → nie przestawiamy pozycji, bo to przerywa gest.
    if (touchingRef.current) {
      settleRef.current = window.setTimeout(settle, 120);
      return;
    }
    const slot = slotAt(rail.scrollLeft);
    if (slot < 0) return;
    const inCycle = slot % cycle;

    // Zapętlenie: cicho wracamy do środkowej kopii (ta sama pozycja w cyklu).
    if (Math.floor(slot / cycle) !== 1) {
      const target = cycle + inCycle;
      scrollToSlot(target, false);
      itemsRef.current[slot]?.classList.remove('centered');
      itemsRef.current[target]?.classList.add('centered');
      slotRef.current = target;
    }

    setOnOwnTile(inCycle === ownIndex);
    if (inCycle === ownIndex) return; // emoji wpisuje użytkownik
    const picked = HERO_CATEGORIES[inCycle].emoji;
    if (picked !== value) onChange(picked);
  }

  useEffect(
    () => () => {
      window.clearTimeout(settleRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  // React przy renderze przepisuje className i skasowałby klasę dodaną ręcznie.
  useEffect(() => {
    if (slotRef.current >= 0) itemsRef.current[slotRef.current]?.classList.add('centered');
  });

  const slots = Array.from({ length: cycle * COPIES }, (_, i) => i);

  return (
    <div className="emoji-wheel">
      <div className="wheel-frame" aria-hidden="true" />
      <div
        className="wheel-rail"
        ref={railRef}
        onScroll={onScroll}
        onTouchStart={() => {
          touchingRef.current = true;
        }}
        onTouchEnd={() => {
          touchingRef.current = false;
        }}
        onTouchCancel={() => {
          touchingRef.current = false;
        }}
      >
        {slots.map((slot) => {
          const i = slot % cycle;
          const own = i === ownIndex;
          return (
            <div
              key={slot}
              className="wheel-item"
              ref={(el) => {
                itemsRef.current[slot] = el;
              }}
            >
              <span className="wheel-emoji" aria-hidden="true">
                {own ? (isOwn ? value : '＋') : HERO_CATEGORIES[i].emoji}
              </span>
              {own && (
                <input
                  className="wheel-own-input"
                  type="text"
                  value=""
                  aria-label="Własne emoji"
                  title="Wybierz dowolne emoji z klawiatury (na komputerze: Win+. albo Ctrl+Cmd+Spacja)"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(e) => {
                    const picked = firstEmoji(e.target.value);
                    if (picked) onChange(picked);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Backspace' && isOwn) onChange(null);
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="wheel-label">
        {onOwnTile
          ? isOwn
            ? 'Własne'
            : 'Tap = swoje emoji'
          : HERO_CATEGORIES.find((c) => c.emoji === value)?.label ?? 'Bez ikonki'}
      </div>
    </div>
  );
}
