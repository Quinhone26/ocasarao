-- Cria a tabela de configurações da empresa (singleton por enquanto).
-- Rode este SQL no Supabase (SQL Editor) antes de usar a nova versão do app.

create table if not exists public.company_settings (
  id text primary key default 'default',
  nome text not null default 'RotaExpress',
  saudacao text not null default 'Obrigado pela preferência!',
  atualizado_em timestamptz not null default now()
);

-- Permissões para o app (usa a chave publishable/anon — sem login).
grant select, insert, update on public.company_settings to anon;
grant select, insert, update on public.company_settings to authenticated;
grant all on public.company_settings to service_role;

alter table public.company_settings enable row level security;

drop policy if exists "company_settings_select_all" on public.company_settings;
create policy "company_settings_select_all"
  on public.company_settings for select
  to anon, authenticated
  using (true);

drop policy if exists "company_settings_upsert_all" on public.company_settings;
create policy "company_settings_upsert_all"
  on public.company_settings for insert
  to anon, authenticated
  with check (true);

drop policy if exists "company_settings_update_all" on public.company_settings;
create policy "company_settings_update_all"
  on public.company_settings for update
  to anon, authenticated
  using (true)
  with check (true);

-- Linha padrão (idempotente).
insert into public.company_settings (id, nome, saudacao)
values ('default', 'RotaExpress', 'Obrigado pela preferência!')
on conflict (id) do nothing;
