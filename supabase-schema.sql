create extension if not exists pgcrypto;

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  status text not null default 'lobby' check (status in ('lobby', 'guessing', 'results', 'finished')),
  round_index integer not null default 0,
  created_at timestamptz not null default now()
);

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

create policy "public games read" on public.games for select to anon using (true);
create policy "public games insert" on public.games for insert to anon with check (true);
create policy "public games update" on public.games for update to anon using (true) with check (true);
create policy "public players read" on public.players for select to anon using (true);
create policy "public players insert" on public.players for insert to anon with check (true);
create policy "public guesses read" on public.guesses for select to anon using (true);
create policy "public guesses insert" on public.guesses for insert to anon with check (true);

alter publication supabase_realtime add table public.games;
alter publication supabase_realtime add table public.players;
alter publication supabase_realtime add table public.guesses;
