-- Run in Supabase: Dashboard → SQL Editor → New query → paste this → Run.
-- Safe to run again after changes: it only adds what's missing.
-- Shared feed: anyone with the site can view, post, comment, rate and cheer (no logins yet).
-- Only the poster can delete their post (delete_post() checks the secret in their browser).

-- Profiles: one per browser (no passwords yet). Usernames are unique, lowercase,
-- letters/numbers/_/. only. Visitors can read profiles but only change them through
-- save_profile(), which checks the secret kept in the owner's browser.
create table if not exists public.profiles (
  id          uuid primary key,
  username    text not null unique check (username ~ '^[a-z0-9_.]{3,24}$'),
  avatar_path text,                -- path inside the "avatars" storage bucket
  created_at  timestamptz not null default now()
);

-- McGill faculty (optional). Keep the list in sync with FACULTIES in app/src/feed/posts.ts.
alter table public.profiles add column if not exists faculty text check (faculty in ('Arts', 'Science', 'Arts & Science', 'Engineering', 'Business', 'Music', 'Education', 'Law', 'Dental Medicine', 'Environmental Sciences', 'Continuing Studies', 'Health Sciences'));

alter table public.profiles enable row level security;

drop policy if exists "anyone can read profiles" on public.profiles;
create policy "anyone can read profiles" on public.profiles for select using (true);

-- No policies at all: nobody can read this from the site.
create table if not exists public.profile_secrets (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  secret     uuid not null
);

alter table public.profile_secrets enable row level security;

-- p_faculty has a default so callers that don't send it (older app versions) still work.
drop function if exists public.save_profile(uuid, uuid, text, text);
create or replace function public.save_profile(p_id uuid, p_secret uuid, p_username text, p_avatar_path text, p_faculty text default null)
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
    update profiles set username = p_username, avatar_path = p_avatar_path, faculty = p_faculty where id = p_id;
  else
    insert into profiles (id, username, avatar_path, faculty) values (p_id, p_username, p_avatar_path, p_faculty);
    insert into profile_secrets (profile_id, secret) values (p_id, p_secret);
  end if;
end;
$$;
grant execute on function public.save_profile(uuid, uuid, text, text, text) to anon, authenticated;

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
-- No delete policy: posts are deleted only through delete_post() below.
drop policy if exists "anyone can delete posts" on public.posts;

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
-- A clip can only be deleted once its post is gone (delete_post() runs first).
drop policy if exists "anyone can delete clips" on storage.objects;
drop policy if exists "delete clips of deleted posts" on storage.objects;
create policy "delete clips of deleted posts" on storage.objects for delete
  using (bucket_id = 'clips' and not exists (select 1 from public.posts where video_path = name));

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

-- Table access for the website (newer Supabase projects don't grant this by default).
-- Row level security above still decides which rows; these decide which actions.
grant usage on schema public to anon, authenticated;
grant select                 on public.profiles to anon, authenticated;
grant select, insert         on public.posts    to anon, authenticated;
revoke delete                on public.posts    from anon, authenticated;
grant select, insert         on public.comments to anon, authenticated;
grant select                 on public.ratings  to anon, authenticated;
-- profile_secrets: deliberately no grants.

-- Delete your own post (and, via cascade, its comments and ratings).
create or replace function public.delete_post(p_post_id uuid, p_profile_id uuid, p_secret uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from profile_secrets where profile_id = p_profile_id and secret = p_secret) then
    raise exception 'not your profile';
  end if;
  delete from posts where id = p_post_id and profile_id = p_profile_id;
  if not found then
    raise exception 'not your post';
  end if;
end;
$$;
grant execute on function public.delete_post(uuid, uuid, uuid) to anon, authenticated;

-- Runs must be 1–120 seconds (stops fake 0.01 s "chugs" posted straight to the database).
alter table public.posts drop constraint if exists posts_time_range;
alter table public.posts add constraint posts_time_range check (time_ms between 1000 and 120000);

-- Uploads: clips are videos up to 50 MB, profile photos are images up to 2 MB.
update storage.buckets set file_size_limit = 52428800, allowed_mime_types = '{video/*}' where id = 'clips';
update storage.buckets set file_size_limit = 2097152, allowed_mime_types = '{image/*}' where id = 'avatars';

-- Comment cheers, through a function so visitors can't edit anything else.
alter table public.comments add column if not exists cheers integer not null default 0;

create or replace function public.cheer_comment(p_comment_id uuid, delta integer)
returns void
language sql
security definer
set search_path = public
as $$
  update comments set cheers = greatest(0, cheers + sign(delta)::integer) where id = p_comment_id;
$$;
grant execute on function public.cheer_comment(uuid, integer) to anon, authenticated;

-- Delete your own comment (checks the secret in your browser, like delete_post).
create or replace function public.delete_comment(p_comment_id uuid, p_profile_id uuid, p_secret uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from profile_secrets where profile_id = p_profile_id and secret = p_secret) then
    raise exception 'not your profile';
  end if;
  delete from comments where id = p_comment_id and profile_id = p_profile_id;
  if not found then
    raise exception 'not your comment';
  end if;
end;
$$;
grant execute on function public.delete_comment(uuid, uuid, uuid) to anon, authenticated;

-- Delete your own account: your posts (and, by cascade, the comments and ratings on them),
-- your comments elsewhere, your ratings, then the profile and its secret. The app removes
-- the video and photo files afterwards (storage rules below only allow that once the rows are gone).
create or replace function public.delete_account(p_profile_id uuid, p_secret uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from profile_secrets where profile_id = p_profile_id and secret = p_secret) then
    raise exception 'not your profile';
  end if;
  delete from posts where profile_id = p_profile_id;
  delete from comments where profile_id = p_profile_id;
  delete from ratings where profile_id = p_profile_id;
  delete from profiles where id = p_profile_id;
end;
$$;
grant execute on function public.delete_account(uuid, uuid) to anon, authenticated;

-- A profile photo can only be deleted once no profile uses it (delete_account runs first).
drop policy if exists "delete avatars of deleted profiles" on storage.objects;
create policy "delete avatars of deleted profiles" on storage.objects for delete
  using (bucket_id = 'avatars' and not exists (select 1 from public.profiles where avatar_path = name));

-- Passwords: log back into your profile on a new phone or after clearing the browser.
-- Stored only as a bcrypt hash (pgcrypto), in profile_secrets, which nobody can read.
create extension if not exists pgcrypto with schema extensions;
alter table public.profile_secrets add column if not exists password_hash text;

-- Set or change your password (proves it's you with the secret in your browser).
create or replace function public.set_password(p_profile_id uuid, p_secret uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if char_length(p_password) < 6 then
    raise exception 'password must be at least 6 characters';
  end if;
  update profile_secrets set password_hash = crypt(p_password, gen_salt('bf'))
  where profile_id = p_profile_id and secret = p_secret;
  if not found then
    raise exception 'not your profile';
  end if;
end;
$$;
grant execute on function public.set_password(uuid, uuid, text) to anon, authenticated;

-- Does this profile have a password yet? (for the "Set a password" prompt)
create or replace function public.has_password(p_profile_id uuid, p_secret uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce((select password_hash is not null from profile_secrets where profile_id = p_profile_id and secret = p_secret), false);
$$;
grant execute on function public.has_password(uuid, uuid) to anon, authenticated;

-- Log in with username + password: hands back the profile and its secret, so this browser
-- can act as that profile again. Wrong guesses wait a moment, to slow down guessing.
create or replace function public.login(p_username text, p_password text)
returns table (id uuid, secret uuid, username text, avatar_path text, faculty text)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  return query
    select p.id, s.secret, p.username, p.avatar_path, p.faculty
    from profiles p join profile_secrets s on s.profile_id = p.id
    where p.username = lower(trim(p_username))
      and s.password_hash is not null
      and s.password_hash = crypt(p_password, s.password_hash);
  if not found then
    perform pg_sleep(0.5);
    raise exception 'wrong username or password';
  end if;
end;
$$;
grant execute on function public.login(text, text) to anon, authenticated;
