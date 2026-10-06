-- Run after the B2B category and quote migrations, before publishing the frontend.
-- A B2B order is a made-to-order purchase. It has no warehouse reservation.
alter table public.orders add column if not exists is_b2b boolean not null default false;
alter table public.orders add column if not exists b2b_validated boolean not null default false;

create or replace function public.guard_b2b_order() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.is_b2b is distinct from old.is_b2b then
      raise exception 'O tipo do pedido não pode ser alterado';
    end if;
    if coalesce(auth.role(), '') <> 'service_role' and (
      new.b2b_validated is distinct from old.b2b_validated or
      (old.b2b_validated and (new.items is distinct from old.items or
        new.total is distinct from old.total or
        new.frete_valor is distinct from old.frete_valor or
        new.shipping_address is distinct from old.shipping_address))
    ) then
      raise exception 'Pedido B2B validado não pode ser alterado';
    end if;
    if new.is_b2b and not new.b2b_validated and lower(btrim(new.status)) in ('pago', 'producao', 'enviado', 'entregue') then
      raise exception 'Pedido B2B precisa ser validado antes da confirmação';
    end if;
    return new;
  end if;
  if new.b2b_validated then raise exception 'Validação B2B é exclusiva do servidor'; end if;
  if new.is_b2b and coalesce(auth.role(), '') <> 'service_role' then
    if auth.uid() is null or new.user_id is distinct from auth.uid()
       or not exists (
         select 1 from public.profiles p where p.id = auth.uid()
           and ((p.account_type = 'pj' and length(regexp_replace(coalesce(p.cnpj, ''), '[^0-9]', '', 'g')) = 14) or p.is_admin = true)
       ) then
      raise exception 'Pedido B2B exige uma conta empresarial';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_b2b_order on public.orders;
create trigger guard_b2b_order before insert or update on public.orders
for each row execute function public.guard_b2b_order();

create or replace function public.mark_b2b_order_validated(p_order_id bigint) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('role', true) <> 'service_role' then
    raise exception 'Validação B2B disponível somente ao servidor' using errcode = '42501';
  end if;
  update public.orders set b2b_validated = true
    where id = p_order_id and is_b2b = true and status = 'pendente'
      and freo_verified_paid_amount is null;
  if not found then raise exception 'Pedido B2B indisponível'; end if;
  return true;
end $$;
revoke all on function public.mark_b2b_order_validated(bigint) from public, anon, authenticated;
grant execute on function public.mark_b2b_order_validated(bigint) to service_role;

-- Separate cart prevents an ordinary checkout from consuming a B2B order.
create table if not exists public.b2b_cart_items (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null,
  product_name text not null,
  price numeric(12,2) not null check (price > 0),
  quantity integer not null check (quantity between 1 and 1000000),
  total_price numeric(15,2) not null check (total_price > 0),
  image_url text,
  variant text,
  created_at timestamptz not null default now()
);
create index if not exists b2b_cart_items_user_idx on public.b2b_cart_items(user_id);
alter table public.b2b_cart_items enable row level security;
grant select, insert, update, delete on public.b2b_cart_items to authenticated;
grant usage, select on sequence public.b2b_cart_items_id_seq to authenticated;
create policy b2b_cart_owner on public.b2b_cart_items for all to authenticated
  using (user_id = (select auth.uid()) and exists (
    select 1 from public.profiles p where p.id = (select auth.uid())
      and ((p.account_type = 'pj' and length(regexp_replace(coalesce(p.cnpj, ''), '[^0-9]', '', 'g')) = 14) or p.is_admin = true)
  ))
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.profiles p where p.id = (select auth.uid())
      and ((p.account_type = 'pj' and length(regexp_replace(coalesce(p.cnpj, ''), '[^0-9]', '', 'g')) = 14) or p.is_admin = true)
  ));

-- Wholesale prices are private. Retail prices for regular shop products remain public.
alter table public.product_price_tiers enable row level security;
revoke select on public.product_price_tiers from public, anon;
grant select on public.product_price_tiers to authenticated;
create policy b2b_tiers_business_allow on public.product_price_tiers for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid())
    and ((p.account_type = 'pj' and length(regexp_replace(coalesce(p.cnpj, ''), '[^0-9]', '', 'g')) = 14) or p.is_admin = true)));
create policy b2b_tiers_business_read on public.product_price_tiers as restrictive
  for select to anon, authenticated using (
    exists (select 1 from public.profiles p where p.id = (select auth.uid())
      and ((p.account_type = 'pj' and length(regexp_replace(coalesce(p.cnpj, ''), '[^0-9]', '', 'g')) = 14) or p.is_admin = true))
  );
alter table public.products enable row level security;
grant select on public.products to anon, authenticated;
create policy b2b_products_public_allow on public.products for select to anon, authenticated
  using (is_active = true or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin = true));
create policy b2b_products_private_read on public.products as restrictive
  for select to anon, authenticated using (
    b2b_category = 'loja' or exists (
      select 1 from public.profiles p where p.id = (select auth.uid())
        and ((p.account_type = 'pj' and length(regexp_replace(coalesce(p.cnpj, ''), '[^0-9]', '', 'g')) = 14) or p.is_admin = true)
    )
  );

-- Preserve creator rewards for made-to-order quantities beyond the retail limit.
create or replace function public.prepare_community_order(p_order_id bigint,p_subtotal numeric,p_items jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_order public.orders; v_item jsonb; v_product public.products; v_owner uuid;
  v_id bigint; v_quantity integer; v_price numeric; v_sum numeric := 0; v_has_community boolean := false;
begin
  if current_setting('role',true)<>'service_role' then raise exception 'Validação disponível somente ao servidor' using errcode='42501'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or lower(btrim(v_order.status))<>'pendente' or v_order.freo_verified_paid_amount is not null then
    raise exception 'Pedido indisponível para validação';
  end if;
  if v_order.items is distinct from p_items then raise exception 'Itens mudaram durante a validação do pedido'; end if;
  if v_order.community_prepared then return true; end if;
  if jsonb_typeof(v_order.items)<>'array' or jsonb_array_length(v_order.items)=0 then raise exception 'Itens do pedido inválidos'; end if;
  for v_item in select value from jsonb_array_elements(v_order.items) loop
    if (v_item->>'quantity') !~ '^[0-9]{1,7}$' or (v_item->>'price') !~ '^[0-9]{1,8}(\.[0-9]{1,2})?$' then
      raise exception 'Quantidade ou preço inválido no pedido';
    end if;
    v_quantity := (v_item->>'quantity')::integer;
    v_price := (v_item->>'price')::numeric;
    if v_quantity<1 or v_quantity>1000000 then raise exception 'Quantidade inválida'; end if;
    v_sum := v_sum + v_quantity*v_price;
    if (v_item->>'product_id') ~ '^[0-9]{1,18}$' then
      v_id := (v_item->>'product_id')::bigint;
      select * into v_product from public.products where id=v_id;
      if found and v_product.category='feito_por_voces' then
        if v_product.is_active is not true or v_product.publication_id is null
           or not public.is_approved_publication(v_product.publication_id) then
          raise exception 'Criação da comunidade indisponível';
        end if;
        select user_id into v_owner from public.generation_publications where id=v_product.publication_id and status='approved';
        if v_owner is null then raise exception 'Criador indisponível'; end if;
        insert into public.community_order_lines(order_id,product_id,creator_id,quantity,gross_amount)
          values(p_order_id,v_id,v_owner,v_quantity,v_quantity*v_price)
          on conflict(order_id,product_id) do update set quantity=public.community_order_lines.quantity+excluded.quantity,
            gross_amount=public.community_order_lines.gross_amount+excluded.gross_amount;
        v_has_community := true;
      end if;
    end if;
  end loop;
  if v_sum<>p_subtotal or v_sum<0 or v_sum+coalesce(v_order.frete_valor,0)<v_order.total
     or p_subtotal is null then raise exception 'Subtotal do pedido diverge da validação'; end if;
  if v_has_community then
    update public.orders set community_prepared=true,community_subtotal=v_sum where id=p_order_id;
  end if;
  return v_has_community;
end $$;
