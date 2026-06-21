-- Planner — schemat bazy danych (Supabase / PostgreSQL)
-- Uruchom w panelu Supabase: SQL Editor → wklej całość → Run.
-- Skrypt jest idempotentny — można go bezpiecznie uruchomić ponownie po aktualizacji.

-- Wydarzenie / wypad. Identyfikator (id) jest jednocześnie kluczem w linku do wypadu.
-- Jeden wspólny planer — wypady nie należą do żadnej „ekipy" (bez kont).
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

-- Ustalony (zatwierdzony) termin wypadu — wskazuje wybrany slot i jego datę.
alter table public.events
  add column if not exists confirmed_slot_id uuid references public.slots(id) on delete set null;
alter table public.events
  add column if not exists confirmed_at timestamptz;

-- Organizator wypadu (imię twórcy) — tylko on może ustalić/odznaczyć finalny termin.
alter table public.events
  add column if not exists created_by text;

-- Sprzątanie po wcześniejszym (porzuconym) pomyśle z „ekipami" — bezpieczne, jeśli nie istniały.
alter table public.events drop column if exists group_id;
drop table if exists public.groups cascade;

-- Głos uczestnika na dany termin: mogę / może / nie mogę.
-- Brak kont — uczestnik identyfikuje się imieniem (participant_name).
create table if not exists public.votes (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references public.events(id) on delete cascade,
  slot_id          uuid not null references public.slots(id) on delete cascade,
  participant_name text not null,
  availability     text not null check (availability in ('yes', 'maybe', 'no')),
  created_at       timestamptz not null default now(),
  unique (slot_id, participant_name)
);

create index if not exists slots_event_id_idx on public.slots(event_id);
create index if not exists votes_event_id_idx on public.votes(event_id);
create index if not exists votes_slot_id_idx on public.votes(slot_id);

-- RLS: aplikacja działa bez logowania (dostęp przez link), więc rola anon
-- ma pełny dostęp. To świadomy kompromis dla prywatnej apki dla znajomych —
-- kto zna link, ten może czytać i pisać. Zob. uwagi w README / CLAUDE.md.
alter table public.events enable row level security;
alter table public.slots  enable row level security;
alter table public.votes  enable row level security;

drop policy if exists "public access" on public.events;
drop policy if exists "public access" on public.slots;
drop policy if exists "public access" on public.votes;

create policy "public access" on public.events for all using (true) with check (true);
create policy "public access" on public.slots  for all using (true) with check (true);
create policy "public access" on public.votes  for all using (true) with check (true);

-- Realtime: aktualizacje na żywo (dashboard wypadów, terminy, głosy).
-- alter publication ... add table nie jest idempotentne, więc dodajemy warunkowo.
do $$
declare
  t text;
begin
  foreach t in array array['events', 'slots', 'votes'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
