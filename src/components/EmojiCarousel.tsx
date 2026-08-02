'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { HERO_CATEGORIES } from '@/lib/heroImage';
import { firstEmoji } from '@/lib/emoji';
import { haptic } from '@/lib/haptics';

// Wybór emoji wypadu: karuzela w stylu pokrętła iOS. Ramka akcentu stoi
// nieruchomo na środku, emoji przesuwają się pod nią i snapują — wybrane jest
// zawsze to w ramce. Lista zapętla się w obie strony (bez końca).
//
// Zapętlenie: renderujemy listę trzy razy i po zatrzymaniu scrolla po cichu
// przestawiamy scrollLeft o szerokość jednej kopii, gdy zbliżamy się do skraju.
// Kopie są identyczne, więc przeskok jest niewidoczny, a przesunięcie o dokładną
// wielokrotność „stride" nie rozjeżdża snapowania.
//
// Ostatnia pozycja cyklu to kafelek „własne": przezroczyste pole tekstowe nad
// kafelkiem — tap podnosi klawiaturę, a wpisane znaki filtruje firstEmoji(),
// więc litera czy spacja nic nie robią. iOS nie pozwala otworzyć klawiatury od
// razu na emoji (nie ma takiego API), stąd karuzela jako główna droga wyboru.

const COPIES = 3;

export default function EmojiCarousel({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (emoji: string | null) => void;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<HTMLDivElement[]>([]);
  const centeredRef = useRef<number>(-1); // indeks w cyklu, ostatnio wyśrodkowany
  const slotRef = useRef<number>(-1); // konkretny kafelek (z kopią) pod ramką
  const settleRef = useRef<number>(0);
  const readyRef = useRef(false);
  // Czy ramka stoi na kafelku „własne" — tylko po to, by podpis nie kłamał
  // (emoji wpisuje użytkownik, więc value zostaje jeszcze poprzednie).
  const [onOwnTile, setOnOwnTile] = useState(false);

  // Podświetlenie kafelka pod ramką przestawiamy wprost na DOM: gdyby szło przez
  // stan Reacta, każdy piksel przewijania przerysowywałby całą karuzelę.
  const markCentered = useCallback((slot: number) => {
    itemsRef.current.forEach((el, i) => el?.classList.toggle('centered', i === slot));
  }, []);

  const cycle = HERO_CATEGORIES.length + 1; // + kafelek „własne"
  const ownIndex = cycle - 1;
  const isOwn = !!value && !HERO_CATEGORIES.some((c) => c.emoji === value);

  // Który kafelek jest teraz najbliżej środka szyny.
  const centerIndex = useCallback((): number => {
    const rail = railRef.current;
    if (!rail) return -1;
    const mid = rail.scrollLeft + rail.clientWidth / 2;
    let best = -1;
    let bestDist = Infinity;
    itemsRef.current.forEach((el, i) => {
      if (!el) return;
      const d = Math.abs(el.offsetLeft + el.offsetWidth / 2 - mid);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  }, []);

  // Przewinięcie tak, by kafelek o danym indeksie stanął na środku.
  const centerOn = useCallback((idx: number, smooth: boolean) => {
    const rail = railRef.current;
    const el = itemsRef.current[idx];
    if (!rail || !el) return;
    rail.scrollTo({
      left: el.offsetLeft + el.offsetWidth / 2 - rail.clientWidth / 2,
      behavior: smooth ? 'smooth' : 'auto',
    });
  }, []);

  // Start: ustawiamy się na wybranym emoji w ŚRODKOWEJ kopii, żeby od razu dało
  // się przewijać w obie strony.
  useEffect(() => {
    const start = HERO_CATEGORIES.findIndex((c) => c.emoji === value);
    const within = start >= 0 ? start : isOwn ? ownIndex : 0;
    centerOn(cycle + within, false);
    centeredRef.current = within;
    slotRef.current = cycle + within;
    markCentered(cycle + within);
    readyRef.current = true;
    // celowo tylko na montowaniu — dalej pozycją rządzi palec
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onScroll() {
    if (!readyRef.current) return;
    const idx = centerIndex();
    if (idx < 0) return;
    if (idx !== slotRef.current) {
      slotRef.current = idx;
      markCentered(idx); // natychmiastowy feedback, jeszcze w trakcie ruchu
    }
    const inCycle = idx % cycle;
    // Tick przy każdym minięciu kafelka — bez dotykania stanu Reacta, żeby
    // przewijanie zostało płynne.
    if (inCycle !== centeredRef.current) {
      centeredRef.current = inCycle;
      haptic();
    }
    // Stan (i podgląd tła w kreatorze) aktualizujemy dopiero po zatrzymaniu.
    window.clearTimeout(settleRef.current);
    settleRef.current = window.setTimeout(settle, 140);
  }

  function settle() {
    const rail = railRef.current;
    if (!rail) return;
    const idx = centerIndex();
    if (idx < 0) return;
    const inCycle = idx % cycle;

    // Zapętlenie: wracamy do środkowej kopii, gdy zawędrowaliśmy do skrajnej.
    const copy = Math.floor(idx / cycle);
    if (copy !== 1) {
      const target = cycle + inCycle;
      centerOn(target, false);
      slotRef.current = target;
      markCentered(target);
    }

    setOnOwnTile(inCycle === ownIndex);
    if (inCycle === ownIndex) {
      // Kafelek „własne" nie wybiera sam z siebie — emoji wpisuje użytkownik.
      return;
    }
    const picked = HERO_CATEGORIES[inCycle].emoji;
    if (picked !== value) onChange(picked);
  }

  useEffect(() => () => window.clearTimeout(settleRef.current), []);

  // React przy renderze przepisuje className i skasowałby klasę dodaną wyżej
  // ręcznie, więc po każdym renderze przywracamy podświetlenie.
  useEffect(() => {
    if (slotRef.current >= 0) markCentered(slotRef.current);
  });

  // Trzy kopie cyklu — środkowa jest tą „prawdziwą", skrajne dają zapas na
  // przewijanie w obie strony.
  const slots = Array.from({ length: cycle * COPIES }, (_, i) => i);

  return (
    <div className="emoji-wheel">
      {/* Ramka wyboru: stoi na środku, nie rusza się razem z emoji. */}
      <div className="wheel-frame" aria-hidden="true" />
      <div className="wheel-rail" ref={railRef} onScroll={onScroll}>
        {slots.map((slot) => {
          const i = slot % cycle;
          const own = i === ownIndex;
          const cat = own ? null : HERO_CATEGORIES[i];
          return (
            <div
              key={slot}
              className="wheel-item"
              ref={(el) => {
                if (el) itemsRef.current[slot] = el;
              }}
            >
              <span className="wheel-emoji" aria-hidden="true">
                {own ? (isOwn ? value : '＋') : cat!.emoji}
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
                  onFocus={() => centerOn(slot, true)}
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
        {onOwnTile && !isOwn
          ? 'Tap = swoje emoji'
          : isOwn
            ? 'Własne'
            : HERO_CATEGORIES.find((c) => c.emoji === value)?.label ?? 'Bez ikonki'}
      </div>
    </div>
  );
}
