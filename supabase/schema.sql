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

-- slots: każdy zalogowany czyta i może proponować termin; usunąć może autor lub organizator.
create policy "slots read"   on public.slots for select to authenticated using (true);
create policy "slots insert" on public.slots for insert to authenticated with check (true);
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
  foreach t in array array['events', 'slots', 'votes', 'profiles'] loop
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
