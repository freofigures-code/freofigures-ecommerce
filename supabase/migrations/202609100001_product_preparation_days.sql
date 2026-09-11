-- Prazo interno de preparação antes da postagem de cada produto.
-- Produtos existentes e futuros usam um dia útil quando não houver configuração específica.
begin;

alter table public.products
  add column if not exists preparation_days integer;

update public.products
set preparation_days = 1
where preparation_days is null or preparation_days < 1;

alter table public.products
  alter column preparation_days set default 1,
  alter column preparation_days set not null;

alter table public.products
  add constraint products_preparation_days_positive check (preparation_days >= 1);

commit;
