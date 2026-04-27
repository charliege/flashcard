alter table public.flashcards
  add column if not exists image_data text;

alter table public.flashcards
  add column if not exists image_side text not null default 'back';

alter table public.flashcards
  alter column image_side set default 'back';

update public.flashcards
set image_side = 'back'
where image_side is null or image_side not in ('front', 'back');

alter table public.flashcards
  alter column image_side set not null;

alter table public.flashcards
  drop constraint if exists flashcards_image_side_check;

alter table public.flashcards
  add constraint flashcards_image_side_check
  check (image_side in ('front', 'back'));
