-- PSU Golf Trip — Supabase schema
-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query > paste > Run)

-- 1. A simple shared key-value store. Everything in the app (scores, mulligans,
--    beaver ball, expenses, settlements, chat, roster) is saved as one JSON blob
--    per key, the same shape the app already used — this just moves it from a
--    5MB single-artifact blob into real Postgres rows with no practical size limit.
create table if not exists kv_store (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Keep updated_at fresh on every write (used for last-write-wins + realtime diffing)
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_kv_store_updated_at on kv_store;
create trigger trg_kv_store_updated_at
before update on kv_store
for each row execute function set_updated_at();

-- 2. Turn on Row Level Security, then allow anyone with the anon key to
--    read/write. This app has no real user accounts (it uses lightweight
--    name-based sign-in like the original), so access control is: "if you
--    have the link, you're one of the guys." Do not put sensitive data here.
alter table kv_store enable row level security;

drop policy if exists "anyone can read kv_store" on kv_store;
create policy "anyone can read kv_store"
  on kv_store for select
  using (true);

drop policy if exists "anyone can write kv_store" on kv_store;
create policy "anyone can write kv_store"
  on kv_store for insert
  with check (true);

drop policy if exists "anyone can update kv_store" on kv_store;
create policy "anyone can update kv_store"
  on kv_store for update
  using (true);

-- 3. Enable realtime so open tabs update live when someone else posts a
--    score, a chat message, or an expense — no manual refresh needed.
alter publication supabase_realtime add table kv_store;

-- 4. Storage bucket for photos (chat posts + expense receipts).
--    This must also be created via the dashboard (Storage > New bucket > "photos" > Public),
--    but this statement sets it up the same way via SQL if you'd rather run it here.
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

drop policy if exists "anyone can upload photos" on storage.objects;
create policy "anyone can upload photos"
  on storage.objects for insert
  with check (bucket_id = 'photos');

drop policy if exists "anyone can view photos" on storage.objects;
create policy "anyone can view photos"
  on storage.objects for select
  using (bucket_id = 'photos');
