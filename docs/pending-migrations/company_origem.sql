-- Endereço da empresa (origem das entregas) para o rastreio público.
-- Rode este SQL no editor do Supabase.

alter table public.company_settings
  add column if not exists endereco_origem text,
  add column if not exists lat_origem double precision,
  add column if not exists lng_origem double precision;

-- Atualiza a função pública de rastreio para retornar a origem da empresa.
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
  empresa text,
  origem_lat double precision,
  origem_lng double precision,
  origem_endereco text
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
    cs.nome as empresa,
    cs.lat_origem,
    cs.lng_origem,
    cs.endereco_origem
  from public.deliveries d
  left join public.company_settings cs on cs.id = 'default'
  where d.track_code = _code
  limit 1;
$$;

grant execute on function public.get_track(text) to anon, authenticated;
