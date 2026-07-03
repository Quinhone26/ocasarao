-- PENDENTE — não aplicado ainda. Rode via Lovable Cloud (Cloud → Database →
-- New migration) quando os créditos da workspace voltarem. Enquanto isso, a
-- normalização/validação de CEP fica garantida no cliente (Zod +
-- useDeliveries).
--
-- Esta migração adiciona validação e normalização de CEP direto no Postgres,
-- protegendo contra qualquer requisição fora da interface (SQL direto, API
-- REST/PostgREST, Edge Functions, imports em massa, etc.).

-- 1. Normaliza para 00000-000 (ou string vazia).
create or replace function public.normalize_cep(v text)
returns text
language sql
immutable
as $$
  select case
    when v is null or length(regexp_replace(v, '\D', '', 'g')) = 0 then ''
    else regexp_replace(regexp_replace(v, '\D', '', 'g'),
                        '^(\d{5})(\d{3})$', '\1-\2')
  end
$$;

-- 2. Trigger BEFORE INSERT/UPDATE.
create or replace function public.deliveries_normalize_cep()
returns trigger
language plpgsql
as $$
begin
  new.cep := public.normalize_cep(new.cep);
  return new;
end;
$$;

drop trigger if exists trg_deliveries_normalize_cep on public.deliveries;
create trigger trg_deliveries_normalize_cep
  before insert or update on public.deliveries
  for each row execute function public.deliveries_normalize_cep();

-- 3. Backfill.
update public.deliveries
set cep = public.normalize_cep(cep)
where cep is not null and cep <> public.normalize_cep(cep);

-- 4. CHECK: vazio OU 8 dígitos formatados, sem sequência trivial.
alter table public.deliveries drop constraint if exists deliveries_cep_format_chk;
alter table public.deliveries
  add constraint deliveries_cep_format_chk
  check (
    cep = ''
    or (
      cep ~ '^\d{5}-\d{3}$'
      and regexp_replace(cep, '\D', '', 'g') !~ '^(\d)\1{7}$'
    )
  );
