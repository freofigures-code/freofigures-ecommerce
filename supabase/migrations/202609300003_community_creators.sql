-- Creator storefront, moderated public handles, likes and paid-sale rewards.
-- Apply after 202609300002_freo_credits.sql. Do not rerun.
begin;

do $$ begin
  if to_regclass('public.generation_publications') is null
     or to_regclass('public.freo_wallets') is null
     or to_regclass('public.freo_credit_ledger') is null
     or to_regprocedure('private.freo_change(uuid,text,text,integer)') is null
     or to_regprocedure('public.is_publication_admin()') is null then
    raise exception 'Aplique antes as migrações de publicações e Créditos Freo';
  end if;
  if to_regclass('public.creator_profiles') is not null
     or to_regclass('public.creator_handle_seq') is not null
     or to_regclass('public.community_product_likes') is not null
     or to_regclass('public.community_order_lines') is not null then
    raise exception 'Objetos de criadores já existem; confira o diagnóstico antes de executar novamente';
  end if;
end $$;

create sequence public.creator_handle_seq;
revoke all on sequence public.creator_handle_seq from public,anon,authenticated;

create table public.creator_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique check (handle ~ '^[a-z][a-z0-9_]{2,23}$'),
  pending_handle text check (pending_handle is null or pending_handle ~ '^[a-z][a-z0-9_]{2,23}$'),
  requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index creator_profiles_pending_handle_unique on public.creator_profiles(pending_handle) where pending_handle is not null;
alter table public.creator_profiles enable row level security;
revoke all on public.creator_profiles from public, anon, authenticated;
grant select on public.creator_profiles to authenticated;
create policy creator_profile_own_read on public.creator_profiles for select to authenticated
  using (user_id = (select auth.uid()) or public.is_publication_admin());

-- Creating the approved product turns its owner into a creator. Existing
-- approved publications are included, with a safe default public @handle.
create function private.ensure_creator_profile(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.creator_profiles(user_id,handle)
    values(p_user_id,'freo_' || nextval('public.creator_handle_seq'::regclass)::text) on conflict (user_id) do nothing;
end $$;
revoke all on function private.ensure_creator_profile(uuid) from public,anon,authenticated;
create function private.creator_on_publication_approval() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status='approved' and new.product_id is not null then
    perform private.ensure_creator_profile(new.user_id);
  end if;
  return new;
end $$;
revoke all on function private.creator_on_publication_approval() from public,anon,authenticated;
create trigger creator_on_publication_approval after insert or update of status,product_id
  on public.generation_publications for each row execute function private.creator_on_publication_approval();
insert into public.creator_profiles(user_id,handle)
  select user_id,'freo_' || nextval('public.creator_handle_seq'::regclass)::text
  from (select user_id from public.generation_publications where status='approved' and product_id is not null group by user_id) approved
  on conflict (user_id) do nothing;

-- The public handle is changed only after an admin reviews the request.
create function public.request_creator_handle(p_handle text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_handle text := lower(btrim(coalesce(p_handle,'')));
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
    raise exception 'Entre em uma conta cadastrada' using errcode='42501';
  end if;
  if v_handle !~ '^[a-z][a-z0-9_]{2,23}$' then
    raise exception 'Use 3 a 24 letras, números ou _, começando com uma letra';
  end if;
  if v_handle ~ '(porra|caralho|puta|puto|foda|foder|buceta|pinto|xota|vagina|penis|sexo|porn|nazi|hitler|racist|estupr|pedofil|merda|bosta|admin|suporte|oficial|freofigures)' then
    raise exception 'Nome de usuário indisponível';
  end if;
  if exists(select 1 from public.creator_profiles where (handle=v_handle or pending_handle=v_handle) and user_id<>auth.uid()) then
    raise exception 'Nome de usuário já está em uso ou análise';
  end if;
  update public.creator_profiles set pending_handle=case when handle=v_handle then null else v_handle end,
    requested_at=case when handle=v_handle then null else now() end,updated_at=now()
    where user_id=auth.uid();
  if not found then raise exception 'Perfil de criador disponível após aprovação de uma criação'; end if;
  return v_handle;
end $$;
revoke all on function public.request_creator_handle(text) from public,anon,authenticated;
grant execute on function public.request_creator_handle(text) to authenticated;

create function public.review_creator_handle(p_user_id uuid,p_approve boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare v_profile public.creator_profiles;
begin
  if not public.is_publication_admin() then raise exception 'Acesso restrito ao administrador' using errcode='42501'; end if;
  select * into v_profile from public.creator_profiles where user_id=p_user_id for update;
  if not found or v_profile.pending_handle is null then raise exception 'Solicitação não encontrada'; end if;
  update public.creator_profiles set handle=case when p_approve then pending_handle else handle end,
    pending_handle=null,requested_at=null,updated_at=now() where user_id=p_user_id returning * into v_profile;
  return v_profile.handle;
end $$;
revoke all on function public.review_creator_handle(uuid,boolean) from public,anon,authenticated;
grant execute on function public.review_creator_handle(uuid,boolean) to authenticated;

create table public.community_product_likes (
  product_id bigint not null references public.products(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(product_id,user_id)
);
create index community_product_likes_user on public.community_product_likes(user_id);
alter table public.community_product_likes enable row level security;
revoke all on public.community_product_likes from public,anon,authenticated;
grant select,insert,delete on public.community_product_likes to authenticated;
create policy community_likes_own_read on public.community_product_likes for select to authenticated using(user_id=(select auth.uid()));
create policy community_likes_own_insert on public.community_product_likes for insert to authenticated
  with check(user_id=(select auth.uid()) and not coalesce((select auth.jwt()->>'is_anonymous')::boolean,false)
    and exists(select 1 from public.products p where p.id=product_id and p.category='feito_por_voces'
      and p.is_active is true and public.is_approved_publication(p.publication_id)));
create policy community_likes_own_delete on public.community_product_likes for delete to authenticated using(user_id=(select auth.uid()));

-- Immutable pricing snapshot made only by the server after validating the
-- checkout. A cached or tampered browser cannot earn creator credits from
-- unverified order JSON.
alter table public.orders add column community_prepared boolean not null default false,
  add column community_subtotal numeric(12,2);
create table public.community_order_lines (
  order_id bigint not null references public.orders(id) on delete cascade,
  product_id bigint not null references public.products(id) on delete restrict,
  creator_id uuid not null references auth.users(id) on delete cascade,
  quantity integer not null check(quantity>0),
  gross_amount numeric(12,2) not null check(gross_amount>=0),
  primary key(order_id,product_id)
);
alter table public.community_order_lines enable row level security;
revoke all on public.community_order_lines from public,anon,authenticated;

create function public.prepare_community_order(p_order_id bigint,p_subtotal numeric,p_items jsonb) returns boolean
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
    if (v_item->>'quantity') !~ '^[0-9]{1,4}$' or (v_item->>'price') !~ '^[0-9]{1,8}(\.[0-9]{1,2})?$' then
      raise exception 'Quantidade ou preço inválido no pedido';
    end if;
    v_quantity := (v_item->>'quantity')::integer;
    v_price := (v_item->>'price')::numeric;
    if v_quantity<1 or v_quantity>1000 then raise exception 'Quantidade inválida'; end if;
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
revoke all on function public.prepare_community_order(bigint,numeric,jsonb) from public,anon,authenticated;
grant execute on function public.prepare_community_order(bigint,numeric,jsonb) to service_role;

create function private.guard_community_order() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op='UPDATE' then
    if old.community_prepared and new.items is distinct from old.items then
      raise exception 'Itens validados não podem ser alterados';
    end if;
    if current_user in ('anon','authenticated') and
      (new.community_prepared is distinct from old.community_prepared
       or new.community_subtotal is distinct from old.community_subtotal
       or (old.freo_verified_paid_amount is not null and new.items is distinct from old.items)) then
      raise exception 'Itens validados e dados do criador só podem ser alterados pelo servidor' using errcode='42501';
    end if;
  elsif current_user in ('anon','authenticated') and
    (new.community_prepared or new.community_subtotal is not null) then
    raise exception 'Validação disponível somente ao servidor' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function private.guard_community_order() from public,anon,authenticated;
create trigger guard_community_order before insert or update on public.orders
  for each row execute function private.guard_community_order();

create table public.community_sales (
  order_id bigint not null references public.orders(id) on delete cascade,
  product_id bigint not null references public.products(id) on delete restrict,
  creator_id uuid not null references auth.users(id) on delete cascade,
  quantity integer not null check(quantity>0),
  paid_product_amount numeric(12,2) not null check(paid_product_amount>=0),
  credits_awarded integer not null check(credits_awarded>=0),
  created_at timestamptz not null default now(),
  primary key(order_id,product_id)
);
create index community_sales_creator on public.community_sales(creator_id,created_at desc);
alter table public.community_sales enable row level security;
revoke all on public.community_sales from public,anon,authenticated;
grant select on public.community_sales to authenticated;
create policy community_sales_creator_read on public.community_sales for select to authenticated
  using(creator_id=(select auth.uid()) or public.is_publication_admin());

alter table public.freo_credit_ledger drop constraint freo_credit_ledger_reason_check;
alter table public.freo_credit_ledger add constraint freo_credit_ledger_reason_check
  check(reason in ('welcome','generation','order_discount','order_reward','order_refund','creator_reward'));
create or replace function private.freo_change(p_user_id uuid,p_reason text,p_reference_id text,p_delta integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_balance integer;
begin
  if p_delta=0 or p_reason not in ('generation','order_discount','order_reward','order_refund','creator_reward')
     or nullif(btrim(p_reference_id),'') is null then raise exception 'Movimentação de créditos inválida'; end if;
  perform private.freo_ensure_wallet(p_user_id);
  select balance into v_balance from public.freo_wallets where user_id=p_user_id for update;
  if exists(select 1 from public.freo_credit_ledger where user_id=p_user_id and reason=p_reason and reference_id=p_reference_id) then
    return v_balance;
  end if;
  if v_balance+p_delta<0 then raise exception 'Créditos Freo insuficientes' using errcode='P0001'; end if;
  update public.freo_wallets set balance=v_balance+p_delta,updated_at=now() where user_id=p_user_id;
  insert into public.freo_credit_ledger(user_id,reason,reference_id,delta,balance_after)
    values(p_user_id,p_reason,p_reference_id,p_delta,v_balance+p_delta);
  return v_balance+p_delta;
end $$;
revoke all on function private.freo_change(uuid,text,text,integer) from public,anon,authenticated;

create function private.reward_community_sale() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_line public.community_order_lines; v_paid_cents bigint; v_base_cents bigint;
  v_line_cents bigint; v_award integer; v_paid numeric(12,2);
begin
  if new.community_prepared and new.freo_rewards_eligible
     and new.freo_verified_paid_amount is not null and old.freo_verified_paid_amount is null
     and lower(btrim(new.status)) in ('pago','producao','enviado','entregue') then
    v_paid_cents := round(new.freo_verified_paid_amount*100)::bigint;
    v_base_cents := round((new.community_subtotal+coalesce(new.frete_valor,0))*100)::bigint;
    if v_base_cents<=0 or v_paid_cents<0 or v_paid_cents>v_base_cents then
      raise exception 'Base da recompensa do criador inválida';
    end if;
    for v_line in select * from public.community_order_lines where order_id=new.id order by product_id loop
      v_line_cents := floor(v_paid_cents*round(v_line.gross_amount*100)::bigint::numeric/v_base_cents)::bigint;
      v_paid := v_line_cents::numeric/100;
      v_award := case when v_line.creator_id=new.user_id then 0 else (floor(v_paid)*3)::integer end;
      insert into public.community_sales(order_id,product_id,creator_id,quantity,paid_product_amount,credits_awarded)
        values(new.id,v_line.product_id,v_line.creator_id,v_line.quantity,v_paid,v_award)
        on conflict do nothing;
      if found and v_award>0 then
        perform private.freo_change(v_line.creator_id,'creator_reward',new.id::text || ':' || v_line.product_id::text,v_award);
      end if;
    end loop;
  end if;
  return new;
end $$;
revoke all on function private.reward_community_sale() from public,anon,authenticated;
create trigger reward_community_sale after update of status,freo_verified_paid_amount on public.orders
  for each row execute function private.reward_community_sale();

-- These public RPCs expose only approved products and non-sensitive statistics.
create function public.community_catalog_info()
returns table(product_id bigint,creator_id uuid,creator_handle text,likes_count bigint,sales_count bigint)
language sql stable security definer set search_path = '' as $$
  select p.id,g.user_id,c.handle,
    (select count(*) from public.community_product_likes l where l.product_id=p.id),
    (select coalesce(sum(s.quantity),0) from public.community_sales s where s.product_id=p.id)
  from public.products p join public.generation_publications g on g.id=p.publication_id
    join public.creator_profiles c on c.user_id=g.user_id
  where p.category='feito_por_voces' and p.is_active is true and g.status='approved';
$$;
revoke all on function public.community_catalog_info() from public,anon,authenticated;
grant execute on function public.community_catalog_info() to anon,authenticated;

create function public.creator_public_profile(p_handle text)
returns table(product_id bigint,product_title text,product_image text,price numeric,likes_count bigint,sales_count bigint)
language sql stable security definer set search_path = '' as $$
  select p.id,p.title,p.images->>0,p.price,i.likes_count,i.sales_count
  from public.community_catalog_info() i join public.products p on p.id=i.product_id
  where i.creator_handle=p_handle order by p.created_at desc;
$$;
revoke all on function public.creator_public_profile(text) from public,anon,authenticated;
grant execute on function public.creator_public_profile(text) to anon,authenticated;

create function public.creator_handle_exists(p_handle text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.creator_profiles c where c.handle=p_handle);
$$;
revoke all on function public.creator_handle_exists(text) from public,anon,authenticated;
grant execute on function public.creator_handle_exists(text) to anon,authenticated;

commit;
