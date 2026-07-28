-- Cardápio público + pedidos do cliente
-- Rodar no SQL Editor do Supabase.

-- 1) Produtos do cardápio
create table if not exists public.produtos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text not null default '',
  categoria text not null default 'Geral',
  preco numeric(10,2) not null default 0,
  imagem_url text,
  ativo boolean not null default true,
  ordem integer not null default 0,
  criado_em timestamptz not null default now()
);

create index if not exists produtos_ativo_idx on public.produtos (ativo, ordem);

grant select on public.produtos to anon, authenticated;
grant insert, update, delete on public.produtos to authenticated;
grant all on public.produtos to service_role;

alter table public.produtos enable row level security;

-- Leitura pública: só produtos ativos aparecem para quem não está logado.
drop policy if exists "produtos select ativos" on public.produtos;
create policy "produtos select ativos"
  on public.produtos for select
  to anon
  using (ativo = true);

drop policy if exists "produtos select all auth" on public.produtos;
create policy "produtos select all auth"
  on public.produtos for select
  to authenticated
  using (true);

drop policy if exists "produtos write auth" on public.produtos;
create policy "produtos write auth"
  on public.produtos for all
  to authenticated
  using (true) with check (true);

-- OBS: este app usa a chave publishable sem login (role anon) no painel.
-- Se o painel administrativo também roda como anon, libere a escrita:
grant insert, update, delete on public.produtos to anon;
drop policy if exists "produtos write anon" on public.produtos;
create policy "produtos write anon"
  on public.produtos for all
  to anon
  using (true) with check (true);

-- 2) Permitir que o cliente crie o próprio pedido (entrega pendente)
grant insert on public.deliveries to anon;

drop policy if exists "deliveries insert pedido publico" on public.deliveries;
create policy "deliveries insert pedido publico"
  on public.deliveries for insert
  to anon
  with check (status = 'pendente');
