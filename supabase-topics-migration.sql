alter table public.flashcards
  add column if not exists topic text not null default 'General';

update public.flashcards
set topic = 'General'
where topic is null or char_length(trim(topic)) = 0;

create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, name)
);

insert into public.topics (user_id, name)
select distinct user_id, topic
from public.flashcards
on conflict (user_id, name) do nothing;

create index if not exists flashcards_user_id_topic_created_at_idx
  on public.flashcards (user_id, topic, created_at);

create index if not exists topics_user_id_created_at_idx
  on public.topics (user_id, created_at);

alter table public.topics enable row level security;

drop policy if exists "Users can view their own topics" on public.topics;
create policy "Users can view their own topics"
  on public.topics
  for select
  to authenticated
  using (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "Users can create their own topics" on public.topics;
create policy "Users can create their own topics"
  on public.topics
  for insert
  to authenticated
  with check (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "Users can update their own topics" on public.topics;
create policy "Users can update their own topics"
  on public.topics
  for update
  to authenticated
  using (auth.uid() is not null and auth.uid() = user_id)
  with check (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "Users can delete their own topics" on public.topics;
create policy "Users can delete their own topics"
  on public.topics
  for delete
  to authenticated
  using (auth.uid() is not null and auth.uid() = user_id);
