-- Existing products stay in "Produtos da loja em quantidade".
-- Personalized B2B products can be assigned to either quotation section by admin.
alter table public.products
  add column if not exists b2b_category text not null default 'loja';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.products'::regclass
      and conname = 'products_b2b_category_check'
  ) then
    alter table public.products
      add constraint products_b2b_category_check
      check (b2b_category in ('loja', 'eventos', 'sob_medida'));
  end if;
end $$;

create index if not exists products_b2b_category_active_idx
  on public.products (b2b_category, created_at desc)
  where is_active = true;
