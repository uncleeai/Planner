# Planner

Prosty planer dla znajomych: tworzysz wypad, proponujesz terminy, wysyłasz link,
a każdy zaznacza kiedy może. Wynik („kto może i który termin wygrywa") aktualizuje
się na żywo. Bez zakładania kont — wystarczy link.

## Stack

- **Next.js 16** (App Router, TypeScript) + **React 19** — frontend i hosting (Vercel).
- **Supabase** — baza PostgreSQL, dostęp przez API oraz aktualizacje na żywo (Realtime).
- **PWA** — manifest pozwala dodać stronę do ekranu głównego telefonu.

Wszystko mieści się w darmowych planach Vercela i Supabase przy skali „grupka znajomych".

## Jak uruchomić lokalnie

1. **Załóż projekt Supabase** na <https://supabase.com> (darmowy plan).
2. **Utwórz tabele:** w panelu Supabase otwórz *SQL Editor*, wklej zawartość
   [`supabase/schema.sql`](supabase/schema.sql) i kliknij *Run*.
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

- Każdy **wypad** ma unikalny identyfikator w adresie (`/event/<id>`). Ten link
  jest jednocześnie zaproszeniem — kto go ma, ten wchodzi.
- Uczestnik podaje **imię**, które zapisuje się w przeglądarce (`localStorage`).
  Brak haseł i kont.
- Każdy może **dodać termin** i przy każdym terminie zaznaczyć: *Mogę / Może / Nie*.
- Dzięki **Supabase Realtime** głosy i nowe terminy pojawiają się u wszystkich
  natychmiast.

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
