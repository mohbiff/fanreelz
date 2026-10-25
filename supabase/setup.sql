-- Fanreelz database setup. Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to run again: it only creates what is missing.

-- 1. Public profile per signed-in user (name and picture from Google or Discord; never the email)
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text,
  avatar_url text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "profiles are public" on public.profiles;
create policy "profiles are public" on public.profiles for select using (true);
drop policy if exists "users edit their own profile" on public.profiles;
create policy "users edit their own profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, avatar_url)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'user_name', 'Fan'), 60),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- 2. Everything fans save: ratings, comments, votes, playlists, follows, requests, tips, submissions.
--    One row per user per collection; everyone can read, only the owner can write their own row.
create table if not exists public.docs (
  col text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (col, id),
  constraint docs_known_col check (
    col in ('ratings','submissions','votes','tips','comments','commentlikes','requests','upvotes','claims','playlists','follows')
    or col like 'data/users/%'),
  constraint docs_size check (pg_column_size(data) < 300000)
);
alter table public.docs replica identity full;
alter table public.docs enable row level security;

drop policy if exists "read shared docs" on public.docs;
create policy "read shared docs" on public.docs for select
  using (col not like 'data/users/%' or owner = auth.uid());

drop policy if exists "write own docs" on public.docs;
create policy "write own docs" on public.docs for insert
  with check (owner = auth.uid() and (id = auth.uid()::text or col = 'data/users/' || auth.uid()::text));

drop policy if exists "update own docs" on public.docs;
create policy "update own docs" on public.docs for update
  using (owner = auth.uid())
  with check (owner = auth.uid() and (id = auth.uid()::text or col = 'data/users/' || auth.uid()::text));

drop policy if exists "delete own docs" on public.docs;
create policy "delete own docs" on public.docs for delete using (owner = auth.uid());

-- 3. Live updates (new ratings and comments show up without reloading)
do $$ begin
  alter publication supabase_realtime add table public.docs;
exception when duplicate_object then null; end $$;

-- 4. Access for the website (needed on newer Supabase projects, harmless on older ones)
grant usage on schema public to anon, authenticated;
grant select on public.docs, public.profiles to anon, authenticated;
grant insert, update, delete on public.docs to authenticated;
grant update on public.profiles to authenticated;

-- 5. Saving goes through this function: the database itself works out who is signed in,
--    and reports clearly if it can't see a signed-in user.
create or replace function public.save_doc(p_col text, p_id text, p_data jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'The database does not see you as signed in (role: %)', coalesce(auth.role(), 'none');
  end if;
  if not (p_id = uid::text or p_col = 'data/users/' || uid::text) then
    raise exception 'You can only save your own data';
  end if;
  insert into public.docs (col, id, data, owner, updated_at)
  values (p_col, p_id, coalesce(p_data, '{}'::jsonb), uid, now())
  on conflict (col, id) do update set data = excluded.data, updated_at = now()
  where public.docs.owner = uid;
end $$;
revoke all on function public.save_doc(text, text, jsonb) from public;
grant execute on function public.save_doc(text, text, jsonb) to anon, authenticated;

-- 6. The film catalogue filled by the YouTube importer (Netlify function import-youtube).
--    Everyone can read it; only the importer (service role key, kept in Netlify) can write.
create table if not exists public.catalog (
  id text primary key,
  platform text not null default 'YouTube',
  video_id text not null,
  title text not null,
  channel text,
  channel_id text,
  cat text not null,
  char text,
  lore text,
  format text not null default 'film',
  duration int,
  views bigint default 0,
  published_at timestamptz,
  added_at timestamptz not null default now(),
  hidden boolean not null default false,
  age_restricted boolean not null default false
);
alter table public.catalog add column if not exists age_restricted boolean not null default false;
create index if not exists catalog_views on public.catalog (views desc);
alter table public.catalog enable row level security;
drop policy if exists "catalog is public" on public.catalog;
create policy "catalog is public" on public.catalog for select using (not hidden);
grant select on public.catalog to anon, authenticated;

create table if not exists public.catalog_channels (
  channel_id text primary key,
  title text,
  uploads text,
  status text not null default 'new',
  next_page text,
  ai_count int not null default 0,
  seen_count int not null default 0,
  checked_at timestamptz
);
alter table public.catalog_channels enable row level security;

create table if not exists public.import_state (key text primary key, value jsonb);
alter table public.import_state enable row level security;

create or replace function public.requeue_done_channels() returns void
language sql security definer set search_path = public as $$
  update public.catalog_channels set status = 'reading', next_page = null
  where status = 'done' and checked_at < now() - interval '7 days';
$$;
revoke all on function public.requeue_done_channels() from public, anon, authenticated;
