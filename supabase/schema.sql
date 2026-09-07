-- ============================================================
-- 旅のしおり : データベース初期化（この1ファイルを実行すればOK）
-- Supabase ダッシュボード → SQL Editor に貼り付けて Run。
-- 何度実行しても安全（IF NOT EXISTS / DROP POLICY IF EXISTS）。
-- ============================================================

create extension if not exists pgcrypto;

-- ── テーブル ───────────────────────────────────────────────
create table if not exists public.itineraries (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  title          text not null default '旅のしおり',
  destination    jsonb not null default '[]'::jsonb,   -- string[]
  start_date     date not null,
  end_date       date not null,
  arrival_time   text,
  departure_time text,
  adults         integer not null default 1,
  children       jsonb not null default '[]'::jsonb,   -- number[]（年齢）
  packing_notes  text not null default '',
  plan_meta      jsonb not null default '{}'::jsonb,
  pin_hash       text,                                 -- 照合はこのハッシュで行う
  pin_salt       text,
  pin            text,                                 -- 作成者本人のみ RLS で閲覧可（共有APIは返さない）
  created_at     timestamptz not null default now()
);

create table if not exists public.days (
  id            uuid primary key default gen_random_uuid(),
  itinerary_id  uuid not null references public.itineraries (id) on delete cascade,
  day_index     integer not null,
  date          date not null,
  theme         text not null default ''
);

create table if not exists public.spots (
  id               uuid primary key default gen_random_uuid(),
  day_id           uuid not null references public.days (id) on delete cascade,
  "order"          integer not null,
  kind             text not null default 'spot',       -- 'spot' | 'hotel' | 'departure' | 'arrival'
  time             text not null default '',
  name             text not null default '',
  note             text not null default '',           -- 備考（編集画面で設定、しおりに表示）
  memo             text not null default '',           -- メモ（旅行中の記録）
  is_ai_suggested  boolean not null default false
);

create table if not exists public.transits (
  id        uuid primary key default gen_random_uuid(),
  day_id    uuid not null references public.days (id) on delete cascade,
  "order"   integer not null,
  mode      text not null default '',
  duration  text not null default '',
  note      text not null default '',                  -- 備考（列車番号・乗換など）
  memo      text not null default ''                   -- メモ（旅行中の記録）
);

-- PIN 試行回数の記録（レート制限用。クライアントからは触れない）
create table if not exists public.pin_attempts (
  itinerary_id  uuid not null references public.itineraries (id) on delete cascade,
  client_key    text not null,
  fail_count    integer not null default 0,
  locked_until  timestamptz,
  updated_at    timestamptz not null default now(),
  primary key (itinerary_id, client_key)
);

alter table public.spots
  drop constraint if exists spots_kind_check;
alter table public.spots
  add constraint spots_kind_check check (kind in ('spot', 'hotel', 'departure', 'arrival'));

create index if not exists idx_days_itinerary   on public.days (itinerary_id);
create index if not exists idx_spots_day        on public.spots (day_id);
create index if not exists idx_transits_day     on public.transits (day_id);
create index if not exists idx_itineraries_user on public.itineraries (user_id, created_at desc);

-- ── 権限（RLS は別途、行レベルで所有者判定する） ───────────
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on
  public.itineraries, public.days, public.spots, public.transits
  to authenticated;

-- ── Row Level Security ────────────────────────────────────
alter table public.itineraries  enable row level security;
alter table public.days         enable row level security;
alter table public.spots        enable row level security;
alter table public.transits     enable row level security;
alter table public.pin_attempts enable row level security;

drop policy if exists "own itineraries" on public.itineraries;
create policy "own itineraries" on public.itineraries
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own days" on public.days;
create policy "own days" on public.days
  for all to authenticated
  using (exists (select 1 from public.itineraries i where i.id = days.itinerary_id and i.user_id = auth.uid()))
  with check (exists (select 1 from public.itineraries i where i.id = days.itinerary_id and i.user_id = auth.uid()));

drop policy if exists "own spots" on public.spots;
create policy "own spots" on public.spots
  for all to authenticated
  using (exists (
    select 1 from public.days d join public.itineraries i on i.id = d.itinerary_id
    where d.id = spots.day_id and i.user_id = auth.uid()))
  with check (exists (
    select 1 from public.days d join public.itineraries i on i.id = d.itinerary_id
    where d.id = spots.day_id and i.user_id = auth.uid()));

drop policy if exists "own transits" on public.transits;
create policy "own transits" on public.transits
  for all to authenticated
  using (exists (
    select 1 from public.days d join public.itineraries i on i.id = d.itinerary_id
    where d.id = transits.day_id and i.user_id = auth.uid()))
  with check (exists (
    select 1 from public.days d join public.itineraries i on i.id = d.itinerary_id
    where d.id = transits.day_id and i.user_id = auth.uid()));

-- pin_attempts はポリシーを作らない ＝ 直接アクセス不可（Edge Function の service role のみ）

-- 確認用:
--   select tablename, rowsecurity from pg_tables where schemaname='public';
--   select tablename, policyname from pg_policies where schemaname='public';
