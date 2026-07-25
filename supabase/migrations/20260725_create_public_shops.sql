-- Public partner-shop discovery for Motolink Autoshop Clientele.
-- Run in Supabase SQL Editor or through the Supabase CLI before replacing demo data.

create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  description text not null default '',
  address text not null,
  city text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  phone text,
  email text,
  specialties text[] not null default '{}',
  operating_hours text not null default 'Hours unavailable',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shops_active_city_idx on public.shops (is_active, city);

alter table public.shops enable row level security;

drop policy if exists "Anyone can browse active shops" on public.shops;
create policy "Anyone can browse active shops"
on public.shops for select
using (is_active = true);

-- Shop administration should be added with tenant-aware policies once the
-- platform's server_admin/shop_admin migration is deployed.
