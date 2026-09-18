create table public.matches (
  id text primary key,
  game text not null default 'guandan',
  seed integer,
  opponent_policy text not null default 'danzero',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  winner_team text,
  your_level text,
  opponent_level text,
  game_over boolean not null default false,
  review jsonb not null default '{}'::jsonb
);

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  match_id text not null references public.matches(id) on delete cascade,
  number integer not null,
  level_rank text,
  your_level text,
  opponent_level text,
  winner_team text,
  your_team_won boolean,
  kind text,
  level_gain integer not null default 0,
  match_over boolean not null default false,
  your_finish text,
  finished jsonb not null default '[]'::jsonb,
  opening_hands jsonb not null default '{}'::jsonb,
  history jsonb not null default '[]'::jsonb,
  your_turns jsonb not null default '[]'::jsonb,
  is_open boolean not null default false,
  unique (match_id, number)
);

create index matches_created_at_idx on public.matches (created_at desc);
create index deals_match_id_idx on public.deals (match_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger matches_updated_at
before update on public.matches
for each row execute function public.set_updated_at();

alter table public.matches enable row level security;
alter table public.deals enable row level security;

revoke all on table public.matches from anon, authenticated;
revoke all on table public.deals from anon, authenticated;
grant all on table public.matches to service_role;
grant all on table public.deals to service_role;
