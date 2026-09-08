create extension if not exists pgcrypto;

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  status text not null default 'lobby' check (status in ('lobby', 'guessing', 'results', 'finished')),
  round_index integer not null default 0,
  started_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.games add column if not exists started_at timestamptz;

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 24),
  team text not null check (team in ('braut', 'braeutigam')),
  created_at timestamptz not null default now()
);

create table if not exists public.guesses (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  round_index integer not null,
  month integer not null check (month between 1 and 12),
  year integer not null check (year between 1900 and 2100),
  latitude double precision not null,
  longitude double precision not null,
  points integer not null default 0,
  created_at timestamptz not null default now(),
  unique (game_id, player_id, round_index)
);

alter table public.games enable row level security;
alter table public.players enable row level security;
alter table public.guesses enable row level security;

drop policy if exists "public games read" on public.games;
drop policy if exists "public games insert" on public.games;
drop policy if exists "public games update" on public.games;
drop policy if exists "public players read" on public.players;
drop policy if exists "public players insert" on public.players;
drop policy if exists "public guesses read" on public.guesses;
drop policy if exists "public guesses insert" on public.guesses;
drop policy if exists "public games delete" on public.games;
drop policy if exists "public players delete" on public.players;
drop policy if exists "public guesses delete" on public.guesses;

create policy "public games read" on public.games for select to anon using (true);
create policy "public games insert" on public.games for insert to anon with check (true);
create policy "public games update" on public.games for update to anon using (true) with check (true);
create policy "public players read" on public.players for select to anon using (true);
create policy "public players insert" on public.players for insert to anon with check (true);
create policy "public guesses read" on public.guesses for select to anon using (true);
create policy "public guesses insert" on public.guesses for insert to anon with check (true);
create policy "public games delete" on public.games for delete to anon using (true);
create policy "public players delete" on public.players for delete to anon using (true);
create policy "public guesses delete" on public.guesses for delete to anon using (true);

do $$
begin
  if not exists (select 1 from pg_publication_rel where prpubid = (select oid from pg_publication where pubname = 'supabase_realtime') and prrelid = 'public.games'::regclass) then
    alter publication supabase_realtime add table public.games;
  end if;
  if not exists (select 1 from pg_publication_rel where prpubid = (select oid from pg_publication where pubname = 'supabase_realtime') and prrelid = 'public.players'::regclass) then
    alter publication supabase_realtime add table public.players;
  end if;
  if not exists (select 1 from pg_publication_rel where prpubid = (select oid from pg_publication where pubname = 'supabase_realtime') and prrelid = 'public.guesses'::regclass) then
    alter publication supabase_realtime add table public.guesses;
  end if;
end $$;
