-- Run in Supabase: Dashboard → SQL Editor → New query → paste this → Run.
-- Safe to run again after changes: it only adds what's missing.
-- Shared feed: anyone with the site can view, post, cheer and delete (no logins yet).

-- Profiles: one per browser (no passwords yet). Usernames are unique, lowercase,
-- letters/numbers/_/. only. Visitors can read profiles but only change them through
-- save_profile(), which checks the secret kept in the owner's browser.
create table if not exists public.profiles (
  id          uuid primary key,
  username    text not null unique check (username ~ '^[a-z0-9_.]{3,24}$'),
  avatar_path text,                -- path inside the "avatars" storage bucket
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "anyone can read profiles" on public.profiles;
create policy "anyone can read profiles" on public.profiles for select using (true);

-- No policies at all: nobody can read this from the site.
create table if not exists public.profile_secrets (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  secret     uuid not null
);

alter table public.profile_secrets enable row level security;

create or replace function public.save_profile(p_id uuid, p_secret uuid, p_username text, p_avatar_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from profiles where id = p_id) then
    if not exists (select 1 from profile_secrets where profile_id = p_id and secret = p_secret) then
      raise exception 'not your profile';
    end if;
    update profiles set username = p_username, avatar_path = p_avatar_path where id = p_id;
  else
    insert into profiles (id, username, avatar_path) values (p_id, p_username, p_avatar_path);
    insert into profile_secrets (profile_id, secret) values (p_id, p_secret);
  end if;
end;
$$;
grant execute on function public.save_profile(uuid, uuid, text, text) to anon, authenticated;

create table if not exists public.posts (
  id          uuid primary key,
  user_name   text not null check (char_length(user_name) between 1 and 24),
  time_ms     integer not null check (time_ms > 0),
  max_angle   integer,
  started_by  text[] not null default '{}',
  title       text not null default '' check (char_length(title) <= 40), -- the shotgun's name
  description text not null default '' check (char_length(description) <= 300),
  video_path  text,                -- path inside the "clips" storage bucket
  cheers      integer not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.posts enable row level security;

drop policy if exists "anyone can read posts" on public.posts;
create policy "anyone can read posts"   on public.posts for select using (true);
drop policy if exists "anyone can add posts" on public.posts;
create policy "anyone can add posts"    on public.posts for insert with check (true);
drop policy if exists "anyone can delete posts" on public.posts;
create policy "anyone can delete posts" on public.posts for delete using (true);

-- Cheers go through this function so visitors can't edit any other column.
create or replace function public.cheer(post_id uuid, delta integer)
returns void
language sql
security definer
set search_path = public
as $$
  update posts set cheers = greatest(0, cheers + sign(delta)::integer) where id = post_id;
$$;
grant execute on function public.cheer(uuid, integer) to anon, authenticated;

-- Video clips: a public bucket, so videos play from a plain URL.
insert into storage.buckets (id, name, public)
values ('clips', 'clips', true)
on conflict (id) do nothing;

drop policy if exists "anyone can read clips" on storage.objects;
create policy "anyone can read clips"   on storage.objects for select using (bucket_id = 'clips');
drop policy if exists "anyone can upload clips" on storage.objects;
create policy "anyone can upload clips" on storage.objects for insert with check (bucket_id = 'clips');
drop policy if exists "anyone can delete clips" on storage.objects;
create policy "anyone can delete clips" on storage.objects for delete using (bucket_id = 'clips');

-- Comments on posts. Deleting a post deletes its comments.
create table if not exists public.comments (
  id         uuid primary key,
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_name  text not null check (char_length(user_name) between 1 and 24),
  body       text not null check (char_length(body) between 1 and 200),
  created_at timestamptz not null default now()
);

alter table public.comments enable row level security;

drop policy if exists "anyone can read comments" on public.comments;
create policy "anyone can read comments" on public.comments for select using (true);
drop policy if exists "anyone can add comments" on public.comments;
create policy "anyone can add comments"  on public.comments for insert with check (true);

-- Added after the first version (no-op on a fresh setup).
alter table public.posts add column if not exists title text not null default '' check (char_length(title) <= 40);

-- Link posts and comments to the profile that made them (shows their current name/photo).
alter table public.posts    add column if not exists profile_id uuid references public.profiles (id) on delete set null;
alter table public.comments add column if not exists profile_id uuid references public.profiles (id) on delete set null;

-- Profile photos: a public bucket, small square JPEGs.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "anyone can read avatars" on storage.objects;
create policy "anyone can read avatars"   on storage.objects for select using (bucket_id = 'avatars');
drop policy if exists "anyone can upload avatars" on storage.objects;
create policy "anyone can upload avatars" on storage.objects for insert with check (bucket_id = 'avatars');

-- Ratings: 1 to 5 stars (5 = best), one per person per post, final once given.
-- Saved through rate_post(), which checks the rater's secret and blocks rating your own post.
create table if not exists public.ratings (
  post_id    uuid not null references public.posts (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  stars      smallint not null check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  primary key (post_id, profile_id)
);

alter table public.ratings enable row level security;

drop policy if exists "anyone can read ratings" on public.ratings;
create policy "anyone can read ratings" on public.ratings for select using (true);

create or replace function public.rate_post(p_post_id uuid, p_profile_id uuid, p_secret uuid, p_stars integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from profile_secrets where profile_id = p_profile_id and secret = p_secret) then
    raise exception 'not your profile';
  end if;
  if exists (select 1 from posts where id = p_post_id and profile_id = p_profile_id) then
    raise exception 'you can''t rate your own post';
  end if;
  if exists (select 1 from ratings where post_id = p_post_id and profile_id = p_profile_id) then
    raise exception 'you already rated this';
  end if;
  insert into ratings (post_id, profile_id, stars) values (p_post_id, p_profile_id, p_stars);
end;
$$;
grant execute on function public.rate_post(uuid, uuid, uuid, integer) to anon, authenticated;
