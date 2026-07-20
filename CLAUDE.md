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
- **Zamknięta paczka (invite-only).** Apka nie zakłada kont sama
  (`signInWithOtp` z `shouldCreateUser: false`); dostęp mają tylko adresy zaproszone
  w panelu Supabase (Authentication → Users → Invite) przy wyłączonym „Allow new users
  to sign up". Allowlista żyje w Supabase, nie w kodzie — nowego znajomego dodaje się
  jednym zaproszeniem. Zob. README → „Logowanie".
- **Admin dodaje z apki.** Admin (właściciel) może dodać nowy adres bez wchodzenia do
  panelu — pole „Dodaj osobę" w menu ustawień (`SettingsMenu.tsx`) woła Edge Function
  `invite-user`, która przez Admin API (`service_role`, tylko serwer) tworzy konto
  z potwierdzonym mailem. Listę adminów w `invite-user/index.ts` trzymaj w synchronie
  z `is_admin()` i `src/lib/admin.ts`.
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
│   ├── schema.sql                # Schemat bazy + RLS + publikacja Realtime
│   └── functions/
│       ├── notify-new-event/     # Edge Function: Web Push przy nowym wypadzie (Deno)
│       ├── notify-reminders/     # Edge Function: cykl. push „nie dałeś znać" + „Jutro gramy!" (pg_cron)
│       ├── ping-user/            # Edge Function: „Pinguj kurwę" — celowany push z cytatem (verify JWT)
│       ├── notify-confirmed/     # Edge Function: push „✓ GRAMY" do paczki po klepnięciu terminu (verify JWT)
│       ├── invite-user/          # Edge Function: admin dodaje e-mail do paczki (Admin API, verify JWT)
│       ├── gallery-sign/    # Edge Function: presigned PUT do R2 dla galerii zdjęć (verify JWT)
│       └── gallery-gc/       # Edge Function: sprzątanie kosza galerii — po 30 dniach kasuje pliki z R2 + wpis (pg_cron, no-verify-jwt)
├── mockups/                      # Statyczne mockupy HTML konceptów designu (redesign „Lobby")
├── public/
│   ├── manifest.webmanifest      # Manifest PWA
│   ├── sw.js                     # Service worker (Web Push: push + notificationclick)
│   ├── icon.svg                  # Ikona aplikacji (+ icon-180/192/512.png dla PWA/iOS)
│   └── hero/                     # Kuratorowane zdjęcia tła kart hero per kategoria (emoji)
└── src/
    ├── app/
    │   ├── layout.tsx            # Root layout + AuthProvider (bramka logowania), metadata, analityka
    │   ├── globals.css           # Wszystkie style
    │   ├── page.tsx              # Strona główna = dashboard: hero + rozkład wypadów + „Nowe lobby"
    │   ├── error.tsx             # Granica błędów stron (komunikat w skórce apki + retry)
    │   ├── global-error.tsx      # Awaryjny ekran, gdy wysypie się sam root layout
    │   ├── event/[id]/page.tsx   # Strona wypadu: terminy, głosowanie, czat, ustalanie terminu
    │   ├── event/[id]/loading.tsx # Skeleton przejścia do wypadu
    │   ├── api/keepalive/route.ts # Endpoint pingowany cronem — utrzymuje bazę aktywną
    │   └── api/gallery-sign/route.ts # Same-origin proxy podpisu uploadu galerii → Edge Function (omija blokery/preflight iOS)
    ├── components/
    │   ├── SetupBanner.tsx       # Baner gdy brak konfiguracji Supabase
    │   ├── Avatar.tsx            # Avatar (zdjęcie/emoji/inicjały) + AvatarStack
    │   ├── ProfileMenu.tsx       # Avatar w rogu + menu: zmień zdjęcie / emoji / wyloguj
    │   ├── SettingsMenu.tsx      # Ustawienia: akcent, powiadomienia push, admin (zaproszenia, kadrowanie)
    │   ├── CreatorSheet.tsx      # Pełnoekranowy kreator „Nowe lobby" (karta = formularz, child-sheety)
    │   ├── ChildSheet.tsx        # Mały bottom sheet nad kreatorem (termin/miejsce/opis)
    │   ├── SlotRangeInput.tsx    # Wspólny input terminu: data + „Cały dzień" + link daty końca
    │   ├── RedesignNotice.tsx    # Jednorazowa notka po redesignie (localStorage)
    │   ├── DescriptionInput.tsx  # Pole opisu + pasek formatowania (B / lista / link)
    │   ├── LocationAutocomplete.tsx # Podpowiedzi miejscowości (Open-Meteo geocoding) + współrzędne
    │   ├── WeatherModal.tsx      # Prognoza godzinowa na dzień wypadu (tap w kafelek pogody w hero)
    │   ├── Dialogs.tsx           # appAlert/appConfirm + DialogHost (zamiast natywnych alertów)
    │   ├── GlassBackground.tsx   # Tło „frosted glass" pod całą apką
    │   ├── HeroCropEditor.tsx    # Admin: kadrowanie zdjęć hero per kategoria (zoom+pozycja)
    │   └── icons.tsx             # Lekkie ikony inline SVG (kalendarz, zegar, pin, pogoda…)
    └── lib/
        ├── supabaseClient.ts     # Klient Supabase + flaga isSupabaseConfigured
        ├── admin.ts              # E-maile adminów (właściciel) + isAdminEmail; trzymaj w synchronie z is_admin() w schema.sql
        ├── auth.tsx              # AuthProvider (logowanie e-mail/OTP, nazwa+awatar, flaga isAdmin) + hook useAuth
        ├── slotInput.ts          # Budowanie terminu (starts/ends/all_day) z pól Od/Do/Godzina (+ testy)
        ├── avatars.ts            # Lista emoji-awatarów + deterministyczne kolory/inicjały
        ├── eventImage.ts         # Upload własnego tła wypadu (skalowanie → bucket event-images)
        ├── gallery.ts            # Galeria wypadu: upload do R2 (oryginał+podgląd) + metadane event_photos; podpis przez /api/gallery-sign (same-origin)
        ├── accent.ts             # Kolor akcentu użytkownika (localStorage + skrypt bootujący)
        ├── ping.ts               # „Pinguj kurwę": wywołanie Edge Function ping-user + limit 12h
        ├── invite.ts             # Admin: dodanie e-maila do paczki (Edge Function invite-user)
        ├── notifyConfirmed.ts    # Fire-and-forget push „✓ GRAMY" (Edge Function notify-confirmed)
        ├── heroImage.ts          # Mapa emoji → zdjęcie tła karty hero (public/hero/*.jpg) + kategorie
        ├── heroCrops.ts          # Odczyt/zapis kadru hero per kategoria (tabela hero_crops)
        ├── push.ts               # Web Push po stronie klienta (subskrypcja, rejestracja SW)
        ├── weather.ts            # Prognoza Open-Meteo na dzień wypadu + geokodowanie (cache w pamięci)
        ├── calendar.ts           # Eksport ustalonego terminu do pliku .ics (Apple/Google Calendar)
        ├── markdown.tsx          # Mini-renderer markdownu opisu → elementy React (bez surowego HTML)
        ├── transition.tsx        # Animowane przejścia stron (forward/back) + useTransitionNavigate
        ├── dataCache.ts          # Cache danych w pamięci: dashboard ↔ strona wypadu bez „Wczytuję…"
        ├── eventPrefetch.ts      # Prefetch danych wypadu na pointerdown (przed nawigacją)
        ├── chatSeen.ts           # Lokalny znacznik „przeczytane" czatu (kropki nieprzeczytanych)
        ├── haptics.ts            # Haptic tick przy gestach (vibrate; iOS: trik z <input switch>)
        └── types.ts              # Typy + logika statusu wypadu (EventRow, Slot, Vote, Profile…) (+ testy)
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
  + `confirmed_at` (data zwycięskiego slotu). `reminded_at` — znacznik wysłanego
  przypomnienia „nie dałeś znać" (Edge Function `notify-reminders` + pg_cron).
  `confirmed_notified_at` — atomowy stempel pusha „✓ GRAMY" (Edge Function
  `notify-confirmed`, wołana z klienta po LOCK IN / kompletującym głosie).
- **slots** — proponowany termin powiązany z wypadem: `starts_at` + opcjonalnie `ends_at`
  (zakres dni) i `all_day` (cały dzień, bez godziny). Warianty: moment, cały dzień,
  zakres dni, zakres z godziną wyjazdu. Budowanie z pól Od/Do/Godzina: `src/lib/slotInput.ts`
  (`buildSlotTimes` ↔ `slotToRange` do edycji); formatowanie i logika końca terminu:
  `formatSlotRange` / `slotEndMs` w `src/lib/types.ts`. Edytować/usunąć termin może jego
  autor lub organizator. **Zmiana czasu terminu zeruje oddane na niego głosy** — pilnuje
  tego trigger `slots_reset_votes` w bazie (security definer), który przy okazji
  synchronizuje `events.confirmed_at`, jeśli edytowany slot był klepnięty.
- **votes** — głos uczestnika: `availability` ∈ `yes | maybe | no`; `user_id` (konto)
  + `participant_name` (migawka nazwy). Unikalność: `(slot_id, user_id)`.
- **profiles** — lista „paczki": `id` (= `auth.users.id`) + `display_name` + `avatar` (emoji
  albo URL wgranego zdjęcia). Zapisywana przez apkę po zalogowaniu (upsert w `auth.tsx`). Służy
  do pokazania „kto jeszcze nie zagłosował" i awatarów uczestników, bo klient z kluczem `anon`
  nie ma dostępu do `auth.users`.
- **Storage** — bucket `avatars` (publiczny) na zdjęcia profilowe; każdy zarządza tylko swoim
  folderem `<uid>/...` (RLS w `schema.sql`). Upload + skalowanie w `src/lib/avatars.ts`.
- **push_subscriptions** — subskrypcje Web Push (`endpoint` jako PK + `user_id` + klucze
  `p256dh`/`auth`). Klient zarządza tylko swoimi (RLS); Edge Function `notify-new-event`
  (rola service_role) rozsyła push o nowym wypadzie do wszystkich poza twórcą. Powiadomienia
  na iOS tylko w PWA dodanym do ekranu głównego (16.4+). Toast „na żywo" przy otwartej apce
  jest w `auth.tsx` (Realtime na INSERT `events`).
- **event_photos** — galeria wypadu: `event_id` + `user_id` + `preview_path`/`original_path`
  (klucze w R2) + `taken_at`. Upload przez presigned PUT (Edge Function `gallery-sign`,
  wołana z klienta przez same-origin proxy `/api/gallery-sign`). **Kosz:** „usuń" ustawia
  `deleted_at` (UPDATE — soft delete; znika z galerii, plik w R2 zostaje jako bufor), a
  Edge Function `gallery-gc` (pg_cron, raz dziennie) po 30 dniach kasuje pliki z R2 i sam
  wiersz. Zapytania galerii filtrują `deleted_at is null`. Realtime; RLS: czytają wszyscy
  zalogowani, wrzuca do kosza/usuwa autor, organizator albo admin.
- **comments** — komentarze pod wypadem (koordynacja): `event_id` + `user_id` (konto)
  + `author_name` (migawka) + `body`. RLS: każdy zalogowany czyta i dodaje swój; edytuje
  tylko autor; usuwa autor, organizator albo admin. Realtime + wątek pod terminami na
  stronie wypadu.
- **comment_reactions** — reakcje emoji na komentarze (styl Messengera): PK
  `(comment_id, user_id)` = JEDNA reakcja na osobę, wybór innej emoji podmienia (upsert),
  tap w tę samą zdejmuje. `event_id` zdublowany dla taniego pobrania per wypad.
  UX: long-press komentarza otwiera picker; tap w chipy pokazuje kto co dał.
  RLS: czytają wszyscy zalogowani, każdy zarządza tylko swoimi. Uwaga na Realtime:
  subskrypcja BEZ filtra (filtry działają tylko na INSERT/UPDATE, a zdjęcie reakcji to
  DELETE). Zestaw emoji: `REACTION_EMOJIS` na stronie wypadu.
- **hero_crops** — kadr zdjęcia hero per kategoria (emoji): `zoom` + `pos_x`/`pos_y`.
  Zdjęcia są stałe (`public/hero/<slug>.jpg`), admin ustawia kadr w apce
  (`HeroCropEditor`). Wszyscy czytają, zapisuje tylko admin (`is_admin()`).
- Nazwy wyświetlane trzymamy w `user_metadata` Supabase Auth oraz w `profiles`;
  przy głosach/wypadach/komentarzach zapisujemy dodatkowo migawkę nazwy.

Realtime włączony dla `events`, `slots`, `votes`, `profiles`, `comments`,
`comment_reactions` (publikacja `supabase_realtime`).
**RLS:** dostęp tylko dla zalogowanych (`authenticated`); każdy edytuje wyłącznie swoje
rekordy (głos po `user_id`, ustalanie terminu tylko twórca wypadu). To realna ochrona
przed podszywaniem. Stare rekordy bez właściciela (`null`) zostają dla zgodności.
**Admin (właściciel):** funkcja `public.is_admin()` (rozpoznaje po e-mailu z JWT) daje
uprawnienia organizatora na KAŻDYM wypadzie — edycja, ustalanie terminu, usuwanie wypadu
i terminów. Listę e-maili trzymaj zsynchronizowaną w `is_admin()` (schema.sql) **oraz**
`src/lib/admin.ts` (UI). Po zmianie listy uruchom ponownie `schema.sql`.

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
- **Testy:** `npm test` (vitest) — unit-testy czystej logiki w `src/lib`
  (`types.test.ts`: reguły klepania terminu/prowadzącego, końce zakresów,
  formaty dat; `slotInput.test.ts`: budowanie slotu z pól Od/Do/Godzina).
  Odpalane z `TZ=Europe/Warsaw` dla powtarzalności dat. Brak testów UI/E2E —
  zachowanie sprawdzamy na preview. Lint: brak konfiguracji.
- **Sanity check:** `next build` weryfikuje typy TypeScript (strict). Po
  zmianach uruchom `npm run build` + `npm test`.

## Conventions

- **Tryb ponytail (domyślnie):** pracuj wg skilla `ponytail` (full) — najprostsze
  działające rozwiązanie, YAGNI, stdlib/native przed zależnościami, najkrótszy diff.
  Wyłączasz słowami „stop ponytail" / „normal mode".
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
