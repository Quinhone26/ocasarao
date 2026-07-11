-- Adiciona a coluna "pago" (status de pagamento) na tabela deliveries.
-- Rode este SQL no Supabase (SQL Editor → New query → cole → Run).

alter table public.deliveries
  add column if not exists pago boolean not null default false;

-- Opcional: garantir que a coluna entre na publicação de realtime
-- (só precisa se ainda não estiver com REPLICA IDENTITY FULL).
-- alter table public.deliveries replica identity full;
