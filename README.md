# Planner

Jeden wspólny planer dla paczki znajomych. Po wejściu widzisz **oś czasu wypadów**
i dodajesz nowe. Dla każdego wypadu proponujecie terminy, każdy zaznacza kiedy może,
a ktokolwiek może „ustalić" zwycięski termin — wtedy wypad ląduje na osi czasu jako
nadchodzący. Wynik aktualizuje się na żywo. Bez zakładania kont — każdy podaje tylko
imię (logowanie w planach na później).

## Stack

- **Next.js 16** (App Router, TypeScript) + **React 19** — frontend i hosting (Vercel).
- **Supabase** — baza PostgreSQL, dostęp przez API oraz aktualizacje na żywo (Realtime).
- **PWA** — manifest pozwala dodać stronę do ekranu głównego telefonu.

Wszystko mieści się w darmowych planach Vercela i Supabase przy skali „grupka znajomych".

## Jak uruchomić lokalnie

1. **Załóż projekt Supabase** na <https://supabase.com> (darmowy plan).
2. **Utwórz tabele:** w panelu Supabase otwórz *SQL Editor*, wklej zawartość
   [`supabase/schema.sql`](supabase/schema.sql) i kliknij *Run*. Skrypt jest
   idempotentny — po aktualizacji schematu uruchamiasz go po prostu ponownie.
3. **Skopiuj klucze:** *Project Settings → API* → potrzebujesz `Project URL`
   oraz klucza `anon public`.
4. **Skonfiguruj zmienne środowiskowe:**
   ```bash
   cp .env.example .env.local
   ```
   i uzupełnij:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://twoj-projekt.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=twoj-klucz-anon
   ```
5. **Zainstaluj i uruchom:**
   ```bash
   npm install
   npm run dev
   ```
   Aplikacja działa na <http://localhost:3000>.

Bez kroków 1–4 strona się otworzy, ale pokaże baner z prośbą o konfigurację.

## Wdrożenie (darmowe)

1. Wrzuć repo na GitHub.
2. Na <https://vercel.com> wybierz *Import Project* i wskaż repozytorium.
3. W ustawieniach projektu Vercel dodaj te same dwie zmienne środowiskowe
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
4. Deploy. Dostajesz darmowy adres `nazwa.vercel.app`, który wysyłasz znajomym.

## Skrypty

- `npm run dev` — serwer deweloperski.
- `npm run build` — build produkcyjny.
- `npm start` — uruchomienie buildu produkcyjnego.

## Jak to działa

- **Strona główna = dashboard.** Przy pierwszym wejściu apka pyta o **imię**
  (zapisywane w `localStorage`), potem pokazuje wspólną oś czasu wypadów
  (Do ustalenia / Nadchodzące / Minione) i przycisk **„Nowy wypad"**.
- Każdy **wypad** (`/event/<id>`) ma swój link. Uczestnik dodaje terminy
  i przy każdym zaznacza: *Mogę / Może / Nie*.
- Gdy termin jest jasny, ktokolwiek może go **„ustalić"** — wypad dostaje
  konkretną datę i przechodzi na osi czasu do „Nadchodzące", a po dacie do „Minione".
- Dzięki **Supabase Realtime** głosy, nowe wypady i ustalenia pojawiają się
  u wszystkich natychmiast.
- Brak kont (dostęp przez link) — proste logowanie planowane na później.

## Utrzymanie i analityka

### Keepalive bazy (żeby Supabase nie zasypiało)

Darmowy plan Supabase **pauzuje projekt po ~7 dniach bezczynności**. Żeby tego
uniknąć, `vercel.json` definiuje **Vercel Cron**, który raz dziennie odpytuje
endpoint [`/api/keepalive`](src/app/api/keepalive/route.ts) — ten robi lekkie
zapytanie do bazy i utrzymuje ją aktywną. Działa automatycznie po wdrożeniu na
Vercela (widoczne w *Settings → Cron Jobs*). Cron na planie Hobby uruchamia się
raz na dobę — to wystarcza wobec 7-dniowego okna pauzy.

Można też sprawdzić ręcznie: wejście na `https://<twoja-domena>/api/keepalive`
zwraca `{"ok":true,...}`.

> **Fallback:** gdyby cron z jakiegoś powodu nie działał, ten sam efekt da
> darmowy zewnętrzny pinger (np. <https://cron-job.org>) ustawiony na codzienne
> odpytywanie `/api/keepalive`.

### Analityka (Vercel)

W `src/app/layout.tsx` podpięte są `@vercel/analytics` i `@vercel/speed-insights`.
Żeby zaczęły zbierać dane, włącz je jeszcze w panelu Vercela:

1. Projekt → zakładka **Analytics** → *Enable*.
2. Projekt → zakładka **Speed Insights** → *Enable*.

Dane pojawią się po pierwszych wejściach (z niewielkim opóźnieniem).

## Świadome kompromisy (skeleton)

- **Brak autoryzacji.** Dostęp przez link, a reguły RLS w Supabase pozwalają roli
  `anon` na odczyt i zapis. Dla prywatnej apki dla znajomych to wystarcza, ale
  każdy z linkiem może edytować dane wydarzenia (w tym głosować „jako ktoś inny").
  Jeśli kiedyś będzie potrzeba — dochodzi logowanie i zawężenie reguł RLS.
- **`npm audit`** zgłasza jedną podatność *moderate* w pakiecie `postcss`
  (zależność pośrednia, używana tylko przy budowaniu CSS — nie dotyczy runtime).
  Podpowiadany „fix" downgrade'uje Next do prehistorycznej wersji, więc go **nie**
  stosujemy.

## Pomysły na dalej (poza MVP)

- **Powiadomienia push** (Web Push / VAPID, darmowe). Działają na Androidzie;
  na iPhonie tylko od iOS 16.4+ i pod warunkiem dodania strony do ekranu głównego.
- Logowanie (magic link / Google) i zawężone reguły RLS.
- Lista nadchodzących i minionych wypadów, komentarze przy wydarzeniu.
- Ikony PNG (192/512) i `apple-touch-icon` dla pełnego wsparcia instalacji PWA.
