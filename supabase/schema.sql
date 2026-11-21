-- Run in Supabase: Dashboard → SQL Editor → New query → paste this → Run.
-- Safe to run again after changes: it only adds what's missing.
-- Shared feed: anyone with the site can view, post, cheer and delete (no logins yet).

create table if not exists public.posts (
  id          uuid primary key,
  user_name   text not null check (char_length(user_name) between 1 and 24),
  time_ms     integer not null check (time_ms > 0),
  max_angle   integer,
  started_by  text[] not null default '{}',
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
