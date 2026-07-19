-- Planner — schemat bazy danych (Supabase / PostgreSQL)
-- Uruchom w panelu Supabase: SQL Editor → wklej całość → Run.
-- Skrypt jest idempotentny — można go bezpiecznie uruchomić ponownie po aktualizacji.
--
-- UWAGA (cutover): od tej wersji aplikacja wymaga logowania. Reguły RLS dają dostęp
-- tylko zalogowanym (rola `authenticated`), a każdy może edytować wyłącznie swoje
-- rekordy. Uruchomienie tego skryptu zatrzyma starą wersję bez logowania — rób to
-- razem z wdrożeniem nowego kodu. Zob. README / CLAUDE.md.

-- Wydarzenie / wypad. Identyfikator (id) jest jednocześnie kluczem w linku do wypadu.
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  location    text,
  description text,
  created_at  timestamptz not null default now()
);

-- Proponowany termin w ramach wydarzenia.
create table if not exists public.slots (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  starts_at  timestamptz not null,
  created_by text,
  created_at timestamptz not null default now()
);

-- Autor terminu (konto) — do uprawnień: usunąć termin może jego autor lub organizator.
alter table public.slots
  add column if not exists created_by_user_id uuid references auth.users(id) on delete set null;

-- Zakres dni i terminy całodniowe.
--  ends_at = koniec zakresu (null = jeden dzień/moment).
--  all_day = true → bez konkretnej godziny (cały dzień / kilka dni).
-- Kombinacje: moment (all_day=false, ends_at=null), cały dzień (true, null),
--  zakres dni (true, set), zakres z godziną wyjazdu (false, set).
alter table public.slots
  add column if not exists ends_at timestamptz;
alter table public.slots
  add column if not exists all_day boolean not null default false;

-- Ustalony (zatwierdzony) termin wypadu — wskazuje wybrany slot i jego datę.
alter table public.events
  add column if not exists confirmed_slot_id uuid references public.slots(id) on delete set null;
alter table public.events
  add column if not exists confirmed_at timestamptz;

-- Organizator wypadu: imię (migawka do wyświetlania) + konto (do egzekwowania uprawnień).
alter table public.events
  add column if not exists created_by text;
alter table public.events
  add column if not exists created_by_user_id uuid references auth.users(id) on delete set null;

-- Znacznik wysłania przypomnienia „nie dałeś znać" (Edge Function notify-reminders,
-- odpalana cyklicznie przez pg_cron). Ustawiany raz na wypad, żeby nie spamować.
alter table public.events
  add column if not exists reminded_at timestamptz;

-- Znacznik wysłania pusha „✓ GRAMY" (Edge Function notify-confirmed). Atomowy
-- stempel = jedno powiadomienie na wypad, niezależnie ilu klientów zawoła.
alter table public.events
  add column if not exists confirmed_notified_at timestamptz;

-- Znacznik przypomnienia „Jutro gramy!" (notify-reminders, przebieg 2) —
-- wysyłane raz, dzień przed klepniętym terminem, do całej paczki.
alter table public.events
  add column if not exists day_before_notified_at timestamptz;

-- Zdjęcie w tle karty wypadu (opcjonalne) — publiczny URL z bucketu event-images.
-- image_focus: punkt kadru dla object-position (np. „50% 30%"), ustawiany suwakami.
alter table public.events
  add column if not exists image_url text,
  add column if not exists image_focus text;

-- Kadr zdjęcia hero per kategoria (emoji). Zdjęcia są stałe (public/hero/<slug>.jpg),
-- a admin ustawia w apce zoom + pozycję każdego (panel „Kadrowanie zdjęć"). Wszyscy
-- czytają, zapisuje tylko admin (is_admin()). Brak wiersza → wartości domyślne z UI.
create table if not exists public.hero_crops (
  emoji      text primary key,
  zoom       int not null default 163,
  pos_x      int not null default 77,
  pos_y      int not null default 10,
  brightness int not null default 86,   -- jasność tła (86 = 0.86), suwak w edytorze
  updated_at timestamptz not null default now()
);
alter table public.hero_crops add column if not exists brightness int not null default 86;
alter table public.hero_crops enable row level security;
drop policy if exists "hero_crops read" on public.hero_crops;
create policy "hero_crops read" on public.hero_crops for select to authenticated using (true);
drop policy if exists "hero_crops write" on public.hero_crops;
create policy "hero_crops write" on public.hero_crops for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Współrzędne wybranej miejscowości (z geokodowania Open-Meteo) — do prognozy pogody.
-- Null gdy lokalizacja to wolny tekst bez wyboru z listy.
alter table public.events
  add column if not exists latitude double precision;
alter table public.events
  add column if not exists longitude double precision;

-- Emoji wypadu (ikona w kółku na karcie) — wybierane przy tworzeniu, opcjonalne.
alter table public.events
  add column if not exists emoji text;

-- Sprzątanie po wcześniejszym (porzuconym) pomyśle z „ekipami" — bezpieczne, jeśli nie istniały.
alter table public.events drop column if exists group_id;
drop table if exists public.groups cascade;

-- Głos uczestnika na dany termin: mogę / może / nie mogę.
-- participant_name to migawka nazwy; tożsamość/uprawnienia opierają się o user_id.
create table if not exists public.votes (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references public.events(id) on delete cascade,
  slot_id          uuid not null references public.slots(id) on delete cascade,
  participant_name text not null,
  availability     text not null check (availability in ('yes', 'maybe', 'no')),
  created_at       timestamptz not null default now()
);

alter table public.votes
  add column if not exists user_id uuid references auth.users(id) on delete set null;

-- Unikalność: jeden głos na (termin, konto). Stara unikalność po imieniu już nie pasuje.
alter table public.votes drop constraint if exists votes_slot_id_participant_name_key;
create unique index if not exists votes_slot_user_idx on public.votes(slot_id, user_id);

create index if not exists slots_event_id_idx on public.slots(event_id);
create index if not exists votes_event_id_idx on public.votes(event_id);
create index if not exists votes_slot_id_idx on public.votes(slot_id);

-- Komentarze pod wypadem (koordynacja: „kto bierze grilla" itp.).
-- author_name to migawka nazwy; tożsamość/uprawnienia po user_id.
create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  author_name text not null,
  body        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists comments_event_id_idx on public.comments(event_id);

-- Profile użytkownika = lista „paczki" (kto kiedykolwiek się zalogował i ustawił nazwę).
-- Pozwala policzyć „kto jeszcze nie zagłosował", bo klient z kluczem anon nie ma
-- dostępu do auth.users. Wiersz zapisuje sama aplikacja po zalogowaniu.
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Awatar wybrany przez użytkownika przy pierwszym logowaniu (emoji).
alter table public.profiles
  add column if not exists avatar text;

-- Admin aplikacji (właściciel) — rozpoznawany po zweryfikowanym e-mailu z tokenu.
-- Może działać jak organizator na KAŻDYM wypadzie (edycja, ustalanie terminu,
-- usuwanie wypadu/terminów). E-mail z JWT jest pewny (weryfikowany przez Supabase
-- Auth), więc nie da się podszyć. Trzymaj listę w synchronie z src/lib/admin.ts.
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(
    lower(auth.jwt() ->> 'email') = any (array['tomaszproblemx@gmail.com']),
    false
  );
$$;

-- RLS: dostęp tylko dla zalogowanych; każdy edytuje wyłącznie swoje rekordy.
alter table public.events   enable row level security;
alter table public.slots    enable row level security;
alter table public.votes    enable row level security;
alter table public.profiles enable row level security;
alter table public.comments enable row level security;

-- Usuń stare, otwarte polityki (i ewentualne wcześniejsze wersje nowych).
drop policy if exists "public access" on public.events;
drop policy if exists "public access" on public.slots;
drop policy if exists "public access" on public.votes;
drop policy if exists "events read"   on public.events;
drop policy if exists "events insert" on public.events;
drop policy if exists "events update" on public.events;
drop policy if exists "events delete" on public.events;
drop policy if exists "slots read"    on public.slots;
drop policy if exists "slots insert"  on public.slots;
drop policy if exists "slots delete"  on public.slots;
drop policy if exists "votes read"    on public.votes;
drop policy if exists "votes insert"  on public.votes;
drop policy if exists "votes update"  on public.votes;
drop policy if exists "votes delete"  on public.votes;
drop policy if exists "profiles read"   on public.profiles;
drop policy if exists "profiles insert" on public.profiles;
drop policy if exists "profiles update" on public.profiles;

-- events: każdy zalogowany czyta; tworzy jako on sam; ustala termin tylko twórca
-- (stare wypady bez twórcy zostają edytowalne — zgodność).
create policy "events read"   on public.events for select to authenticated using (true);
create policy "events insert" on public.events for insert to authenticated
  with check (created_by_user_id = auth.uid());
create policy "events update" on public.events for update to authenticated
  using (created_by_user_id = auth.uid() or created_by_user_id is null or public.is_admin())
  with check (created_by_user_id = auth.uid() or created_by_user_id is null or public.is_admin());
-- usuwa twórca, admin albo (zgodność) stare wypady bez właściciela.
create policy "events delete" on public.events for delete to authenticated
  using (created_by_user_id = auth.uid() or created_by_user_id is null or public.is_admin());

-- slots: każdy zalogowany czyta i może proponować termin; edytować/usunąć może
-- autor terminu lub organizator wypadu (lub admin).
create policy "slots read"   on public.slots for select to authenticated using (true);
create policy "slots insert" on public.slots for insert to authenticated with check (true);
drop policy if exists "slots update" on public.slots;
create policy "slots update" on public.slots for update to authenticated
  using (
    created_by_user_id = auth.uid()
    or created_by_user_id is null
    or public.is_admin()
    or exists (
      select 1 from public.events e
      where e.id = slots.event_id and e.created_by_user_id = auth.uid()
    )
  );
create policy "slots delete" on public.slots for delete to authenticated
  using (
    created_by_user_id = auth.uid()
    or created_by_user_id is null
    or public.is_admin()
    or exists (
      select 1 from public.events e
      where e.id = slots.event_id and e.created_by_user_id = auth.uid()
    )
  );

-- Zmiana terminu unieważnia oddane na niego głosy — stary głos na nową datę byłby
-- mylący. Trigger (security definer — RLS pozwala kasować tylko własne głosy, a tu
-- kasujemy wszystkie) czyści głosy przy KAŻDEJ zmianie czasu slotu; przy okazji
-- synchronizuje events.confirmed_at, jeśli edytowany slot był klepnięty.
create or replace function public.reset_votes_on_slot_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (old.starts_at, old.ends_at, old.all_day)
     is distinct from (new.starts_at, new.ends_at, new.all_day) then
    delete from public.votes where slot_id = new.id;
    update public.events
      set confirmed_at = new.starts_at
      where id = new.event_id and confirmed_slot_id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists slots_reset_votes on public.slots;
create trigger slots_reset_votes after update on public.slots
  for each row execute function public.reset_votes_on_slot_change();

-- votes: każdy zalogowany czyta; ale dodać/zmienić/usunąć można tylko swój głos.
create policy "votes read"   on public.votes for select to authenticated using (true);
create policy "votes insert" on public.votes for insert to authenticated
  with check (user_id = auth.uid());
create policy "votes update" on public.votes for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "votes delete" on public.votes for delete to authenticated
  using (user_id = auth.uid());

-- profiles: każdy zalogowany czyta listę paczki; edytować można tylko własny profil.
create policy "profiles read"   on public.profiles for select to authenticated using (true);
create policy "profiles insert" on public.profiles for insert to authenticated
  with check (id = auth.uid());
create policy "profiles update" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- comments: każdy zalogowany czyta i dodaje (jako on sam); edytuje tylko autor;
-- usuwa autor, organizator albo admin.
drop policy if exists "comments read"   on public.comments;
drop policy if exists "comments insert" on public.comments;
drop policy if exists "comments update" on public.comments;
drop policy if exists "comments delete" on public.comments;
create policy "comments read"   on public.comments for select to authenticated using (true);
create policy "comments insert" on public.comments for insert to authenticated
  with check (user_id = auth.uid());
create policy "comments update" on public.comments for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "comments delete" on public.comments for delete to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.events e
      where e.id = comments.event_id and e.created_by_user_id = auth.uid()
    )
  );

-- Reakcje emoji na komentarze (styl Messengera): JEDNA reakcja na osobę per
-- komentarz — wybór innej emoji podmienia poprzednią (upsert), tap w tę samą
-- zdejmuje (delete). event_id dublujemy z komentarza, żeby dało się tanio pobrać
-- reakcje całego wypadu jednym zapytaniem.
create table if not exists public.comment_reactions (
  comment_id uuid not null references public.comments(id) on delete cascade,
  event_id   uuid not null references public.events(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  emoji      text not null,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
create index if not exists comment_reactions_event_idx on public.comment_reactions(event_id);

-- Migracja z pierwszej wersji tabeli (PK zawierał emoji → wiele reakcji na osobę):
-- zostaw najświeższą reakcję każdej osoby i przełóż PK na (comment_id, user_id).
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.comment_reactions'::regclass
      and contype = 'p' and array_length(conkey, 1) = 3
  ) then
    delete from public.comment_reactions r
    using public.comment_reactions newer
    where newer.comment_id = r.comment_id
      and newer.user_id = r.user_id
      and newer.ctid <> r.ctid
      and (newer.created_at > r.created_at
           or (newer.created_at = r.created_at and newer.ctid > r.ctid));
    alter table public.comment_reactions drop constraint comment_reactions_pkey;
    alter table public.comment_reactions add primary key (comment_id, user_id);
  end if;
end $$;

alter table public.comment_reactions enable row level security;
drop policy if exists "reactions read"   on public.comment_reactions;
drop policy if exists "reactions insert" on public.comment_reactions;
drop policy if exists "reactions update" on public.comment_reactions;
drop policy if exists "reactions delete" on public.comment_reactions;
create policy "reactions read"   on public.comment_reactions for select to authenticated using (true);
create policy "reactions insert" on public.comment_reactions for insert to authenticated
  with check (user_id = auth.uid());
-- update potrzebny do podmiany emoji (upsert = insert … on conflict do update).
create policy "reactions update" on public.comment_reactions for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "reactions delete" on public.comment_reactions for delete to authenticated
  using (user_id = auth.uid());

-- Galeria wypadu: METADANE zdjęć — same pliki żyją w Cloudflare R2 (bucket
-- planner-photos; oryginał bajt-w-bajt + podgląd JPEG ~2048px generowany na
-- telefonie). Upload podpisuje Edge Function `gallery-sign` (presigned PUT,
-- tylko zalogowani), wiersz wstawia klient po udanym wgraniu. taken_at = data
-- zrobienia zdjęcia (z pliku). Usuwa autor, organizator wypadu albo admin.
create table if not exists public.event_photos (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete set null,
  preview_path  text not null,
  original_path text,
  taken_at      timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists event_photos_event_idx on public.event_photos(event_id);

alter table public.event_photos enable row level security;
drop policy if exists "photos read"   on public.event_photos;
drop policy if exists "photos insert" on public.event_photos;
drop policy if exists "photos delete" on public.event_photos;
create policy "photos read"   on public.event_photos for select to authenticated using (true);
create policy "photos insert" on public.event_photos for insert to authenticated
  with check (user_id = auth.uid());
create policy "photos delete" on public.event_photos for delete to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.events e
      where e.id = event_photos.event_id and e.created_by_user_id = auth.uid()
    )
  );

-- Subskrypcje Web Push (powiadomienia o nowych wypadach). Jeden wiersz = jedno
-- urządzenie/przeglądarka (klucz: endpoint). Wysyłką zajmuje się Edge Function
-- `notify-new-event` (rola service_role omija RLS); klient zarządza tylko swoimi.
create table if not exists public.push_subscriptions (
  endpoint   text primary key,
  user_id    uuid references auth.users(id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;
drop policy if exists "push read"   on public.push_subscriptions;
drop policy if exists "push insert" on public.push_subscriptions;
drop policy if exists "push update" on public.push_subscriptions;
drop policy if exists "push delete" on public.push_subscriptions;
create policy "push read"   on public.push_subscriptions for select to authenticated
  using (user_id = auth.uid());
create policy "push insert" on public.push_subscriptions for insert to authenticated
  with check (user_id = auth.uid());
create policy "push update" on public.push_subscriptions for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "push delete" on public.push_subscriptions for delete to authenticated
  using (user_id = auth.uid());

-- Realtime: aktualizacje na żywo (dashboard wypadów, terminy, głosy, paczka).
-- alter publication ... add table nie jest idempotentne, więc dodajemy warunkowo.
do $$
declare
  t text;
begin
  foreach t in array array['events', 'slots', 'votes', 'profiles', 'comments', 'comment_reactions', 'event_photos'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Storage: bucket na zdjęcia profilowe (publiczny odczyt; każdy zarządza tylko swoim folderem <uid>/...).
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars read"   on storage.objects;
drop policy if exists "avatars insert" on storage.objects;
drop policy if exists "avatars update" on storage.objects;
drop policy if exists "avatars delete" on storage.objects;

create policy "avatars read" on storage.objects for select
  using (bucket_id = 'avatars');
create policy "avatars insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Storage: bucket na zdjęcia w tle wypadów (publiczny odczyt; każdy zarządza tylko swoim folderem <uid>/...).
insert into storage.buckets (id, name, public)
values ('event-images', 'event-images', true)
on conflict (id) do nothing;

drop policy if exists "event-images read"   on storage.objects;
drop policy if exists "event-images insert" on storage.objects;
drop policy if exists "event-images update" on storage.objects;
drop policy if exists "event-images delete" on storage.objects;

create policy "event-images read" on storage.objects for select
  using (bucket_id = 'event-images');
create policy "event-images insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'event-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "event-images update" on storage.objects for update to authenticated
  using (bucket_id = 'event-images' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'event-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "event-images delete" on storage.objects for delete to authenticated
  using (bucket_id = 'event-images' and (storage.foldername(name))[1] = auth.uid()::text);
