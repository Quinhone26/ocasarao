-- Rastreio ao vivo do entregador
-- Rodar no SQL Editor do Supabase.

-- 1) coluna curta para identificar entregas em links públicos
alter table public.deliveries
  add column if not exists track_code text unique;

create index if not exists deliveries_track_code_idx
  on public.deliveries (track_code);

-- 2) localização do entregador (uma linha compartilhada por empresa)
create table if not exists public.driver_locations (
  id text primary key,
  lat double precision not null,
  lng double precision not null,
  accuracy double precision,
  heading double precision,
  speed double precision,
  updated_at timestamptz not null default now()
);

grant select on public.driver_locations to anon, authenticated;
grant insert, update on public.driver_locations to anon, authenticated;
grant all on public.driver_locations to service_role;

alter table public.driver_locations enable row level security;

drop policy if exists "driver_locations select all" on public.driver_locations;
create policy "driver_locations select all"
  on public.driver_locations for select
  to anon, authenticated
  using (true);

drop policy if exists "driver_locations upsert all" on public.driver_locations;
create policy "driver_locations upsert all"
  on public.driver_locations for insert
  to anon, authenticated
  with check (true);

drop policy if exists "driver_locations update all" on public.driver_locations;
create policy "driver_locations update all"
  on public.driver_locations for update
  to anon, authenticated
  using (true) with check (true);

alter publication supabase_realtime add table public.driver_locations;

-- 3) função pública para leitura da entrega pelo track_code
-- (evita expor colunas sensíveis como telefone/observações no cliente anônimo)
create or replace function public.get_track(_code text)
returns table (
  cliente text,
  endereco text,
  numero text,
  bairro text,
  cidade text,
  lat double precision,
  lng double precision,
  status text,
  empresa text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    split_part(coalesce(d.cliente, ''), ' ', 1) as cliente,
    d.endereco,
    d.numero,
    d.bairro,
    d.cidade,
    d.lat,
    d.lng,
    d.status::text,
    (select nome from public.company_settings where id = 'default') as empresa
  from public.deliveries d
  where d.track_code = _code
  limit 1;
$$;

grant execute on function public.get_track(text) to anon, authenticated;
