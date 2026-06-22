# CLAUDE.md

Guidance for AI assistants (and humans) working in this repository.

## Project

- **Name:** Planner
- **Remote:** `uncleeai/planner`
- **Purpose:** Lekki planer dla grupy znajomych do ustalania wspólnych terminów
  (wypady, spotkania). Tworzysz wydarzenie, proponujesz terminy, wysyłasz link,
  a każdy zaznacza kiedy może; wynik aktualizuje się na żywo. Bez kont — dostęp
  przez link.

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**.
- **Supabase** (PostgreSQL + Realtime + **Auth**) jako backend/baza, używane przez
  przeglądarkę z kluczem `anon`.
- **Logowanie** e-mailem (kod OTP) przez Supabase Auth; trwała sesja (zaloguj raz na
  urządzeniu). Cała apka jest za bramką logowania — zob. `src/lib/auth.tsx`.
- **PWA** przez `public/manifest.webmanifest` (możliwość dodania do ekranu głównego).
- Styl: zwykły CSS w `src/app/globals.css` (bez Tailwind/UI-frameworka).
- Hosting docelowy: Vercel (frontend) + Supabase (dane) — oba w darmowych planach.
- **Analityka:** `@vercel/analytics` i `@vercel/speed-insights` w `layout.tsx`
  (trzeba je też włączyć przełącznikami w panelu Vercela).
- **Keepalive:** Vercel Cron (`vercel.json`) odpytuje raz dziennie
  `/api/keepalive`, by darmowy Supabase nie zapauzował się po ~7 dniach bezczynności.

## Repository structure

```
.
├── CLAUDE.md                     # Ten plik
├── README.md                     # Instrukcja uruchomienia i wdrożenia
├── package.json                  # Skrypty i zależności
├── next.config.mjs               # Konfiguracja Next.js
├── vercel.json                   # Vercel Cron: codzienny ping keepalive bazy
├── tsconfig.json                 # Konfiguracja TypeScript (alias @/* → src/*)
├── .env.example                  # Wzór zmiennych środowiskowych (skopiuj do .env.local)
├── supabase/
│   └── schema.sql                # Schemat bazy + RLS + publikacja Realtime
├── public/
│   ├── manifest.webmanifest      # Manifest PWA
│   └── icon.svg                  # Ikona aplikacji
└── src/
    ├── app/
    │   ├── layout.tsx            # Root layout + AuthProvider (bramka logowania), metadata, analityka
    │   ├── globals.css           # Wszystkie style
    │   ├── page.tsx              # Strona główna = dashboard: oś czasu wypadów + „Nowy wypad"
    │   ├── event/[id]/page.tsx   # Strona wypadu: terminy, głosowanie, wynik na żywo, ustalanie terminu
    │   └── api/keepalive/route.ts # Endpoint pingowany cronem — utrzymuje bazę aktywną
    ├── components/
    │   ├── SetupBanner.tsx       # Baner gdy brak konfiguracji Supabase
    │   ├── Avatar.tsx            # Avatar (emoji/inicjały) + AvatarStack
    │   └── icons.tsx             # Lekkie ikony inline SVG (kalendarz, zegar, pin…)
    └── lib/
        ├── supabaseClient.ts     # Klient Supabase + flaga isSupabaseConfigured
        ├── auth.tsx              # AuthProvider (logowanie e-mail/OTP, nazwa+awatar) + hook useAuth
        ├── slotPresets.ts        # Szybkie presety terminów (chipy)
        ├── avatars.ts            # Lista emoji-awatarów + deterministyczne kolory/inicjały
        └── types.ts              # Typy: EventRow, Slot, Vote, Profile, Availability
```

**Punkty wejścia:** `src/app/page.tsx` (`/`, dashboard wszystkich wypadów) oraz
`src/app/event/[id]/page.tsx` (`/event/<id>`, pojedynczy wypad). Oba to komponenty
klienckie (`'use client'`) — całość logiki dzieje się w przeglądarce, brak warstwy
serwerowej poza renderowaniem stron i endpointem keepalive.

**Model produktu:** jeden wspólny planer dla jednej (stałej) paczki znajomych — bez
„ekip". Wejście wymaga **logowania** (e-mail + kod OTP, Supabase Auth); po pierwszym
logowaniu użytkownik ustawia nazwę i wybiera awatar (w `user_metadata`). Sesja jest trwała.

## Model danych

Zdefiniowany w `supabase/schema.sql` (skrypt idempotentny — można uruchomić ponownie):

- **events** — wypad; `id` jest kluczem w linku do wypadu. Organizator: `created_by`
  (nazwa, migawka) + `created_by_user_id` (konto). Ustalony termin: `confirmed_slot_id`
  + `confirmed_at` (data zwycięskiego slotu).
- **slots** — proponowany termin (`starts_at`) powiązany z wypadem.
- **votes** — głos uczestnika: `availability` ∈ `yes | maybe | no`; `user_id` (konto)
  + `participant_name` (migawka nazwy). Unikalność: `(slot_id, user_id)`.
- **profiles** — lista „paczki": `id` (= `auth.users.id`) + `display_name` + `avatar` (emoji).
  Zapisywana przez apkę po zalogowaniu (upsert w `auth.tsx`). Służy do pokazania „kto jeszcze
  nie zagłosował" i awatarów uczestników, bo klient z kluczem `anon` nie ma dostępu do `auth.users`.
- Nazwy wyświetlane trzymamy w `user_metadata` Supabase Auth oraz w `profiles`;
  przy głosach/wypadach zapisujemy dodatkowo migawkę nazwy.

Realtime włączony dla `events`, `slots`, `votes`, `profiles` (publikacja `supabase_realtime`).
**RLS:** dostęp tylko dla zalogowanych (`authenticated`); każdy edytuje wyłącznie swoje
rekordy (głos po `user_id`, ustalanie terminu tylko twórca wypadu). To realna ochrona
przed podszywaniem. Stare rekordy bez właściciela (`null`) zostają dla zgodności.

## Development workflow

### Branching

- Pracuj na wyznaczonym branchu zadania — **nie commituj bezpośrednio na branch
  domyślny.** Utwórz branch lokalnie jeśli nie istnieje, pracuj na nim, potem push.
- Nie pushuj na inny branch niż przypisany do zadania bez wyraźnej zgody.

### Committing

- Czytelne, opisowe komunikaty commitów (tryb rozkazujący, np. „Add vote upsert").
- Trzymaj commity skupione; grupuj powiązane zmiany.

### Pushing

- `git push -u origin <branch-name>`.
- Przy błędach sieci ponów do 4 razy z narastającym odstępem (2s, 4s, 8s, 16s).
- **Nie otwieraj pull requesta, jeśli nie ma o to wyraźnej prośby.**

## Build, run, and test

- **Instalacja:** `npm install`
- **Dev:** `npm run dev` → <http://localhost:3000>
- **Build:** `npm run build`
- **Start (produkcja):** `npm start`
- **Konfiguracja:** skopiuj `.env.example` do `.env.local` i uzupełnij
  `NEXT_PUBLIC_SUPABASE_URL` oraz `NEXT_PUBLIC_SUPABASE_ANON_KEY`; uruchom
  `supabase/schema.sql` w panelu Supabase. Pełna instrukcja w `README.md`.
- **Testy/lint:** brak zautomatyzowanych testów i konfiguracji lintera w tym
  szkielecie. `next build` weryfikuje typy TypeScript. Po zmianach uruchom
  `npm run build` jako minimalny sanity check.

## Conventions

- **Język/wersje:** TypeScript w trybie `strict`; React 19; Next 16 App Router.
- **Alias importów:** `@/...` wskazuje na `src/...` (zob. `tsconfig.json`).
- **`params` jest asynchroniczne** (Next 15+): w stronach odpakowuj przez
  `use(params)` (zob. `src/app/event/[id]/page.tsx`).
- **Backend tylko przez `supabase` z `src/lib/supabaseClient.ts`** — nie twórz
  klienta w wielu miejscach. Sprawdzaj `isSupabaseConfigured` zanim wykonasz
  zapytania, by uniknąć cichych błędów bez `.env.local`.
- **Tożsamość i logowanie** wyłącznie przez `src/lib/auth.tsx` — `AuthProvider`
  opakowuje apkę, a strony pobierają `{ userId, displayName }` hookiem `useAuth()`
  (gwarantowane, bo bramka renderuje dzieci dopiero po zalogowaniu i ustawieniu nazwy).
  Nie czytaj sesji bezpośrednio w stronach.
- **Teksty UI po polsku** — to apka dla polskojęzycznych znajomych autora.
- **Style** dopisuj do `src/app/globals.css`, korzystając z istniejących zmiennych
  CSS (`--primary`, `--yes`, `--maybe`, `--no` itd.); brak biblioteki UI.

---

_Aktualizuj ten plik wraz ze zmianami struktury, workflow czy narzędzi — w tym
samym commicie, w którym je wprowadzasz._
