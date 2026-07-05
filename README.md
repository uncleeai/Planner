# Planner

Jeden wspólny planer dla paczki znajomych. Logujesz się raz (e-mail + kod), potem
widzisz **oś czasu wypadów** i dodajesz nowe. Dla każdego wypadu proponujecie terminy,
każdy zaznacza kiedy może, a organizator (twórca wypadu) „ustala" zwycięski termin —
wtedy wypad ląduje na osi czasu jako nadchodzący. Wynik aktualizuje się na żywo.
Logowanie pilnuje, że każdy działa tylko jako on sam (nikt nie zagłosuje za kogoś).

## Stack

- **Next.js 16** (App Router, TypeScript) + **React 19** — frontend i hosting (Vercel).
- **Supabase** — baza PostgreSQL, aktualizacje na żywo (Realtime) oraz **logowanie**
  (Auth, e-mail + kod OTP, trwała sesja).
- **PWA** — manifest pozwala dodać stronę do ekranu głównego telefonu.

Wszystko mieści się w darmowych planach Vercela i Supabase przy skali „grupka znajomych".

## Jak uruchomić lokalnie

1. **Załóż projekt Supabase** na <https://supabase.com> (darmowy plan).
2. **Utwórz tabele:** w panelu Supabase otwórz *SQL Editor*, wklej zawartość
   [`supabase/schema.sql`](supabase/schema.sql) i kliknij *Run*. Skrypt jest
   idempotentny — po aktualizacji schematu uruchamiasz go po prostu ponownie.
   Schemat włącza logowanie i zacieśnione reguły RLS (zob. „Logowanie" niżej).
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

## Środowiska: produkcja vs preview (osobne bazy)

Żeby testy na podglądach (preview) nie zaśmiecały produkcyjnej bazy, użyj **dwóch
projektów Supabase** i przypisz zmienne **per środowisko** w Vercelu
(*Settings → Environment Variables*). Apka czyta bazę wyłącznie z
`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`, więc wystarczy je
rozdzielić — bez zmian w kodzie:

| Zmienna | Production | Preview |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL projektu **produkcyjnego** | URL projektu **dev** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | klucz anon produkcyjny | klucz anon dev |

- **Production** = deploy z gałęzi produkcyjnej (`main`) → oryginalna baza.
- **Preview** = pozostałe branche → baza dev.
- `NEXT_PUBLIC_*` są **wkompilowywane przy buildzie** — po zmianie zmiennych zrób
  **redeploy** danego środowiska, inaczej stary build trzyma starą bazę.
- W projekcie **dev** też uruchom `supabase/schema.sql` i skonfiguruj logowanie OTP
  (Edge Functions/push opcjonalnie). Lokalnie (`.env.local`) wskazuj na dev.
- **Przy wdrożeniu na produkcję** uruchom `supabase/schema.sql` na **oryginalnej**
  bazie — schemat jest idempotentny, dodaje brakujące kolumny/funkcje (np. zakresy
  terminów, `is_admin()`) bez ruszania danych.

## Skrypty

- `npm run dev` — serwer deweloperski.
- `npm run build` — build produkcyjny.
- `npm start` — uruchomienie buildu produkcyjnego.

## Jak to działa

- **Logowanie na wejściu.** Podajesz e-mail, dostajesz 6-cyfrowy kod, a przy
  pierwszym razie ustawiasz nazwę (widoczną przy Twoich głosach). Sesja jest trwała —
  na danym urządzeniu logujesz się praktycznie raz.
- **Strona główna = dashboard:** wspólna oś czasu wypadów (Do ustalenia / Nadchodzące /
  Minione) i przycisk **„Nowy wypad"**.
- Każdy **wypad** (`/event/<id>`) ma swój link. Uczestnik dodaje terminy
  i przy każdym zaznacza: *Mogę / Może / Nie*.
- **Organizator** (twórca wypadu) „ustala" zwycięski termin — wypad dostaje konkretną
  datę i przechodzi na osi czasu do „Nadchodzące", a po dacie do „Minione".
- Dzięki **Supabase Realtime** głosy, nowe wypady i ustalenia pojawiają się
  u wszystkich natychmiast.
- Reguły bazy pilnują, że **każdy edytuje tylko swoje** (głos, ustalanie terminu) —
  nikt nie podszyje się pod kogoś innego.

## Logowanie

Logowanie to **e-mail + jednorazowy kod** (Supabase Auth). Konfiguracja w panelu:

1. *Authentication → Providers → Email* — włączone (domyślnie jest).
2. *Authentication → Email Templates* — dodaj **kod** `{{ .Token }}` do treści w **obu**
   szablonach (domyślne pokazują tylko link, a my logujemy się kodem wpisywanym w apce):
   - **Magic Link** — używany dla **istniejących** kont. Np. `Twój kod logowania: {{ .Token }}`.
   - **Confirm signup** — używany przy **pierwszym** logowaniu nowego adresu. Też dodaj
     `{{ .Token }}`, inaczej nowi użytkownicy dostaną link zamiast kodu.
   (Alternatywa: wyłączyć *Confirm email* w ustawieniach providera Email — wtedy nowe
   adresy też idą szablonem Magic Link.)
3. Uruchom (lub uruchom ponownie) `supabase/schema.sql` — włącza reguły RLS „tylko
   zalogowani; każdy edytuje swoje".

Wbudowana wysyłka maili Supabase jest limitowana (kilka/godz.) — dla paczki znajomych
wystarcza; docelowo można podpiąć własny SMTP. Sesja trzymana jest w przeglądarce
i odświeżana automatycznie, więc logujesz się rzadko.

## Powiadomienia (Web Push)

Powiadomienie „ktoś dodał nowy wypad" działa nawet przy zamkniętej apce.

- **Toast na żywo** (gdy apka jest otwarta) działa od razu, bez konfiguracji.
- **Push systemowy** wymaga kroków niżej. Na iPhonie działa **tylko** w apce dodanej
  do ekranu głównego (standalone, iOS 16.4+); w zwykłej karcie Safari — nie.

Konfiguracja push:

1. **Wygeneruj klucze VAPID** (raz):
   ```bash
   npx web-push generate-vapid-keys
   ```
2. **Klucz publiczny** dodaj do env (lokalnie i na Vercelu):
   ```
   NEXT_PUBLIC_VAPID_PUBLIC_KEY=BModerate...   # publiczny
   ```
3. **Uruchom `supabase/schema.sql`** — tworzy tabelę `push_subscriptions` + RLS.
4. **Wdróż Edge Function** (Supabase CLI):
   ```bash
   supabase functions deploy notify-new-event --no-verify-jwt
   ```
5. **Sekrety funkcji** (*Edge Functions → Secrets*): `VAPID_PUBLIC_KEY`,
   `VAPID_PRIVATE_KEY` (z kroku 1), `VAPID_SUBJECT` (np. `mailto:ty@example.com`) oraz
   `WEBHOOK_SECRET` (dowolny losowy ciąg). `SUPABASE_URL` i `SUPABASE_SERVICE_ROLE_KEY`
   są dostarczane automatycznie.
6. **Database Webhook** (*Database → Webhooks → Create*): tabela `public.events`,
   zdarzenie **Insert**, typ **HTTP Request → POST** na URL funkcji
   (`https://<projekt>.functions.supabase.co/notify-new-event`), z nagłówkiem
   `x-webhook-secret: <WEBHOOK_SECRET>`.
7. W apce (dodanej do ekranu głównego): *Profil → Powiadomienia → włącz* i zaakceptuj
   zgodę. Każdy robi to u siebie. Twórca wypadu nie dostaje powiadomienia o własnym.

Bez kroku 2 (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`) przełącznik powiadomień się nie pokazuje —
działa wtedy sam toast na żywo.

### Przypomnienia „nie dałeś znać" (cykliczny push)

Osobna funkcja `notify-reminders` raz na jakiś czas wysyła push do osób, które ~24h
po utworzeniu wypadu wciąż nie oddały głosu (a wypad ma termin w przyszłości). Każdy
wypad jest przypominany **raz** (znacznik `events.reminded_at`).

1. **Uruchom `supabase/schema.sql`** — dodaje kolumnę `events.reminded_at`.
2. **Wdróż funkcję:**
   ```bash
   supabase functions deploy notify-reminders --no-verify-jwt
   ```
   (albo panel: *Edge Functions → Code → Deploy*, **Verify JWT = off**). Używa tych
   samych sekretów VAPID co `notify-new-event`.
3. **Włącz rozszerzenia** *Database → Extensions*: **`pg_cron`** i **`pg_net`**.
4. **Zaplanuj zadanie** (*SQL Editor*) — odpala funkcję co godzinę:
   ```sql
   select cron.schedule(
     'notify-reminders-hourly',
     '0 * * * *',
     $$ select net.http_post(
          url := 'https://<projekt>.functions.supabase.co/notify-reminders',
          headers := '{"Content-Type":"application/json"}'::jsonb
        ); $$
   );
   ```
   Jeśli ustawiłeś `WEBHOOK_SECRET`, dopisz do URL `?key=<sekret>`. Wyłączenie:
   `select cron.unschedule('notify-reminders-hourly');`.

### „Pinguj kurwę" (celowany ping do jednej osoby)

Na stronie wypadu, przy osobach ze statusem AFK (bez głosu), organizator ma przycisk
**„Pinguj kurwę”** — wysyła Web Push do tej jednej osoby z losowym cytatem Majora.
Obsługuje to funkcja `ping-user`:

```bash
supabase functions deploy ping-user
```

**Uwaga:** w odróżnieniu od funkcji webhookowych **bez** `--no-verify-jwt` —
wywołać ją może tylko zalogowany użytkownik apki (klient przekazuje token sam,
przez `supabase.functions.invoke`). Używa tych samych sekretów VAPID.
Limit: klient pozwala pingować tę samą osobę w tym samym wypadzie raz na 12h.

### Push „✓ GRAMY" po klepnięciu terminu

Gdy termin zostaje ustalony (ręczny LOCK IN organizatora **albo** automat przy
komplecie głosów), cała paczka dostaje Web Push „✓ GRAMY: <wypad> — <data>".
Obsługuje to funkcja `notify-confirmed`:

```bash
supabase functions deploy notify-confirmed
```

Jak `ping-user`: **bez** `--no-verify-jwt` (woła ją klient po klepnięciu /
kompletującym głosie), te same sekrety VAPID. Idempotencja po stronie serwera —
atomowy stempel `events.confirmed_notified_at` gwarantuje jedno powiadomienie
na wypad, niezależnie ilu klientów zawoła. **Wymaga ponownego uruchomienia
`supabase/schema.sql`** (dochodzi kolumna `confirmed_notified_at`).

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

## Świadome kompromisy

- **Wspólna baza / cutover.** Włączenie nowego `schema.sql` (logowanie + RLS) sprawia,
  że stara wersja bez logowania przestaje działać na tej samej bazie. Uruchamiaj nowy
  schemat **razem** z wdrożeniem nowego kodu na produkcję.
- **Każdy zweryfikowany ma dostęp.** Nie ma listy zaproszonych — kto się zaloguje, ten
  korzysta (ale tylko jako on sam). Jeśli zajdzie potrzeba trzymania obcych z daleka,
  dochodzi allowlista e-maili.
- **Migawki nazw.** Nazwę wyświetlaną zapisujemy przy głosie/wypadzie w chwili akcji;
  zmiana nazwy nie aktualizuje wstecz starych wpisów.
- **`npm audit`** zgłasza jedną podatność *moderate* w pakiecie `postcss`
  (zależność pośrednia, używana tylko przy budowaniu CSS — nie dotyczy runtime).
  Podpowiadany „fix" downgrade'uje Next do prehistorycznej wersji, więc go **nie**
  stosujemy.

## Pomysły na dalej (poza MVP)

- **Rozbudowane powiadomienia / przypomnienia.** Np. „za tydzień wyjazd" i „jutro
  wyjazd" liczone od `confirmed_at` — Supabase Scheduled Function (pg_cron) raz dziennie
  sprawdza nadchodzące ustalone wypady i wysyła push przez ten sam mechanizm VAPID.
- **Ping od organizatora.** Twórca wypadu klika „przypomnij, żeby zagłosowali" → push
  tylko do tych z paczki, którzy jeszcze nie oddali głosu (Edge Function liczy brakujących
  jak `missingVoters` i wysyła do ich subskrypcji).
- Logowanie przez Google (jedno kliknięcie) obok kodu e-mail; allowlista e-maili.
- Mentiony / powiadomienia z komentarzy (komentarze pod wypadem i feed „Ostatnia
  aktywność" na dashboardzie już są).
- **Interaktywna lista „co kto bierze".** Współdzielona checklista, którą każdy
  może odhaczać (osobny stan + RLS + realtime). Statyczne formatowanie opisu
  (pogrubienie / listy / linki przez markdown) już jest — to byłby krok dalej.
