-- Word Drop global leaderboard (applied as migration "word_drop_leaderboard").
create table if not exists public.wd_players (
  id uuid primary key,
  secret_hash text not null,
  name text not null check (char_length(name) between 1 and 16),
  avatar text not null check (char_length(avatar) between 1 and 16),
  xp integer not null default 0 check (xp >= 0),
  week_xp integer not null default 0 check (week_xp >= 0),
  week text not null default '' check (week ~ '^([0-9]{4}-W[0-9]{2})?$'),
  trophies integer not null default 0 check (trophies between 0 and 1000),
  streak integer not null default 0 check (streak between 0 and 100000),
  updated_at timestamptz not null default now()
);
alter table public.wd_players enable row level security;
revoke all on table public.wd_players from anon, authenticated;
create index if not exists wd_players_xp on public.wd_players (xp desc);
create index if not exists wd_players_week on public.wd_players (week, week_xp desc);

create or replace function public.wd_submit(p_id uuid, p_secret text, p_name text, p_avatar text, p_xp integer, p_week_xp integer, p_week text, p_trophies integer, p_streak integer)
returns integer language plpgsql security definer set search_path = public as $$
declare cur public.wd_players; h text;
begin
  if p_secret is null or char_length(p_secret) < 20 then raise exception 'bad secret'; end if;
  if p_week_xp > p_xp then p_week_xp := p_xp; end if;
  h := encode(sha256(convert_to(p_secret, 'UTF8')), 'hex');
  select * into cur from public.wd_players where id = p_id;
  if not found then
    if p_xp > 20000 then raise exception 'xp too high'; end if;
    insert into public.wd_players (id, secret_hash, name, avatar, xp, week_xp, week, trophies, streak)
      values (p_id, h, p_name, p_avatar, p_xp, p_week_xp, p_week, p_trophies, p_streak);
    return p_xp;
  end if;
  if cur.secret_hash <> h then raise exception 'not your player'; end if;
  if p_xp - cur.xp > 3000 then raise exception 'xp jump too big'; end if;
  update public.wd_players set name = p_name, avatar = p_avatar, xp = greatest(cur.xp, p_xp), week_xp = p_week_xp, week = p_week,
    trophies = p_trophies, streak = p_streak, updated_at = now() where id = p_id;
  return greatest(cur.xp, p_xp);
end $$;

create or replace function public.wd_leave(p_id uuid, p_secret text)
returns void language sql security definer set search_path = public as $$
  delete from public.wd_players where id = p_id and secret_hash = encode(sha256(convert_to(p_secret, 'UTF8')), 'hex');
$$;

create or replace function public.wd_board(p_kind text, p_week text)
returns table (id uuid, name text, avatar text, score integer, trophies integer, streak integer)
language sql stable security definer set search_path = public as $$
  select id, name, avatar, case when p_kind = 'week' then week_xp else xp end, trophies, streak
  from public.wd_players
  where p_kind <> 'week' or (week = p_week and week_xp > 0)
  order by 4 desc, updated_at asc limit 100;
$$;

revoke all on function public.wd_submit(uuid, text, text, text, integer, integer, text, integer, integer) from public;
revoke all on function public.wd_leave(uuid, text) from public;
revoke all on function public.wd_board(text, text) from public;
grant execute on function public.wd_submit(uuid, text, text, text, integer, integer, text, integer, integer) to anon, authenticated;
grant execute on function public.wd_leave(uuid, text) to anon, authenticated;
grant execute on function public.wd_board(text, text) to anon, authenticated;
