-- Campanhas sazonais da loja (Black Friday).
-- Opção B: o preço continua vindo de products.promotional_price; esta tabela
-- só liga/desliga o visual de campanha (selos, contador, urgência) no site.
-- Leitura pública; escrita restrita a administradores (profiles.is_admin).

create table public.store_campaigns (
  id text primary key check (id ~ '^[a-z0-9_]{1,40}$'),
  is_active boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  headline text not null default 'Black Friday FreoFigures' check (char_length(headline) between 1 and 80),
  subheadline text not null default 'Os menores preços do ano em peças selecionadas. Só enquanto durar o estoque.'
    check (char_length(subheadline) <= 200),
  cta_label text not null default 'Ver ofertas' check (char_length(cta_label) between 1 and 30),
  low_stock_threshold integer not null default 5 check (low_stock_threshold between 1 and 100),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  check (starts_at is null or ends_at is null or ends_at > starts_at)
);

insert into public.store_campaigns (id) values ('black_friday') on conflict (id) do nothing;

alter table public.store_campaigns enable row level security;
revoke all on public.store_campaigns from public, anon, authenticated;
grant select on public.store_campaigns to anon, authenticated;
grant update (is_active, starts_at, ends_at, headline, subheadline, cta_label, low_stock_threshold)
  on public.store_campaigns to authenticated;

create policy store_campaigns_public_read on public.store_campaigns
  for select to anon, authenticated using (true);
create policy store_campaigns_admin_update on public.store_campaigns
  for update to authenticated
  using (public.is_publication_admin())
  with check (public.is_publication_admin());

create function public.store_campaigns_touch() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
revoke all on function public.store_campaigns_touch() from public;

create trigger store_campaigns_touch before update on public.store_campaigns
  for each row execute function public.store_campaigns_touch();
