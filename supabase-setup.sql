create extension if not exists pgcrypto;

create table if not exists public.flashcards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  question text not null check (char_length(trim(question)) > 0),
  answer text not null check (char_length(trim(answer)) > 0),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists flashcards_user_id_created_at_idx
  on public.flashcards (user_id, created_at);

alter table public.flashcards enable row level security;

drop policy if exists "Users can view their own flashcards" on public.flashcards;
create policy "Users can view their own flashcards"
  on public.flashcards
  for select
  to authenticated
  using (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "Users can create their own flashcards" on public.flashcards;
create policy "Users can create their own flashcards"
  on public.flashcards
  for insert
  to authenticated
  with check (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "Users can update their own flashcards" on public.flashcards;
create policy "Users can update their own flashcards"
  on public.flashcards
  for update
  to authenticated
  using (auth.uid() is not null and auth.uid() = user_id)
  with check (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "Users can delete their own flashcards" on public.flashcards;
create policy "Users can delete their own flashcards"
  on public.flashcards
  for delete
  to authenticated
  using (auth.uid() is not null and auth.uid() = user_id);
