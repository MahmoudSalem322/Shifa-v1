-- شفاء — Supabase schema
-- ------------------------------------------------------------------
-- lib/server/store.js talks to a single table: one JSON array per
-- "collection" (appointments, donations, notifications, medicine
-- demands, help requests, sessions, ...). This mirrors the old
-- ./data/<collection>.json files one-for-one, so every route handler
-- that already calls store.read()/store.update() keeps working with
-- zero changes — only the storage backend underneath it changed.
--
-- Run this once in the Supabase SQL editor (or `supabase db push`).

create table if not exists public.kv_store (
  key text primary key,
  value jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- Revision counter used for safe concurrent writes (compare-and-swap).
-- Safe to run on an existing database: it only adds the column if missing.
alter table public.kv_store add column if not exists rev bigint not null default 0;

-- Keep updated_at current on every write.
create or replace function public.kv_store_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists kv_store_touch on public.kv_store;
create trigger kv_store_touch
  before update on public.kv_store
  for each row execute function public.kv_store_touch();

-- The app talks to this table only with the service_role key from the
-- server (never from the browser), so RLS can stay locked down.
alter table public.kv_store enable row level security;

-- Private object storage for medical/financial evidence.
-- The application uploads through the server using service_role and issues
-- short-lived signed URLs only to authorized administrators.
insert into storage.buckets (id, name, public)
values ('shifaa-evidence', 'shifaa-evidence', false)
on conflict (id) do update set public = false;
