-- A loja de arquivos digitais é isolada do catálogo físico e não reserva estoque.
begin;

create table public.digital_products (
  id bigint generated always as identity primary key,
  title text not null check (char_length(btrim(title)) between 3 and 150),
  description text not null default '',
  cover_url text,
  price numeric(12,2) not null check (price between 0.01 and 999999.99),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index digital_products_active_idx on public.digital_products(created_at desc) where is_active;
alter table public.digital_products enable row level security;
grant select on public.digital_products to anon, authenticated;
grant insert, update on public.digital_products to authenticated;
grant usage, select on sequence public.digital_products_id_seq to authenticated, service_role;
grant all on public.digital_products to service_role;
create policy digital_products_catalog on public.digital_products for select to anon, authenticated
  using (is_active or public.is_publication_admin());
create policy digital_products_admin_insert on public.digital_products for insert to authenticated
  with check (public.is_publication_admin());
create policy digital_products_admin_update on public.digital_products for update to authenticated
  using (public.is_publication_admin()) with check (public.is_publication_admin());

create table public.digital_product_assets (
  product_id bigint primary key references public.digital_products(id) on delete restrict,
  stl_path text not null unique,
  mf3_path text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint digital_stl_path check (stl_path ~ '^stl/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.stl$'),
  constraint digital_3mf_path check (mf3_path ~ '^3mf/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.3mf$')
);
alter table public.digital_product_assets enable row level security;
grant select, insert, update on public.digital_product_assets to authenticated;
grant all on public.digital_product_assets to service_role;
create policy digital_assets_admin on public.digital_product_assets for all to authenticated
  using (public.is_publication_admin()) with check (public.is_publication_admin());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('digital-print-files','digital-print-files',false,52428800,array['application/octet-stream'])
on conflict(id) do nothing;
do $$ begin
  if not exists(select 1 from storage.buckets where id='digital-print-files' and public=false
    and file_size_limit <= 52428800) then
    raise exception 'O bucket digital precisa ser privado e limitado a 50 MiB';
  end if;
end $$;
create policy digital_files_admin_read on storage.objects for select to authenticated
  using (bucket_id='digital-print-files' and public.is_publication_admin());
create policy digital_files_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id='digital-print-files' and public.is_publication_admin()
    and name ~ '^(stl|3mf)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(stl|3mf)$');
-- Guardas restritivas prevalecem mesmo se houver políticas amplas antigas.
create policy digital_files_read_guard on storage.objects as restrictive for select to anon, authenticated
  using (bucket_id <> 'digital-print-files' or public.is_publication_admin());
create policy digital_files_insert_guard on storage.objects as restrictive for insert to anon, authenticated
  with check (bucket_id <> 'digital-print-files' or public.is_publication_admin());
create policy digital_files_update_guard on storage.objects as restrictive for update to anon, authenticated
  using (bucket_id <> 'digital-print-files') with check (bucket_id <> 'digital-print-files');
create policy digital_files_delete_guard on storage.objects as restrictive for delete to anon, authenticated
  using (bucket_id <> 'digital-print-files');

create function private.digital_product_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.title := btrim(new.title);
  new.description := btrim(new.description);
  if new.cover_url is not null and new.cover_url !~ '^https://[^[:space:]]+$' then
    raise exception 'Imagem de capa inválida';
  end if;
  if new.is_active and not exists (
    select 1 from public.digital_product_assets a
    join storage.objects s on s.bucket_id='digital-print-files' and s.name=a.stl_path
    join storage.objects m on m.bucket_id='digital-print-files' and m.name=a.mf3_path
    where a.product_id=new.id
  ) then raise exception 'Envie STL e 3MF antes de ativar o produto digital'; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger digital_product_guard before insert or update on public.digital_products
  for each row execute function private.digital_product_guard();
revoke all on function private.digital_product_guard() from public, anon, authenticated;

create function private.digital_assets_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from storage.objects where bucket_id='digital-print-files' and name=new.stl_path)
     or not exists(select 1 from storage.objects where bucket_id='digital-print-files' and name=new.mf3_path) then
    raise exception 'Os dois arquivos precisam existir no armazenamento privado';
  end if;
  if exists(select 1 from public.digital_products where id=new.product_id and is_active) then
    raise exception 'Desative o produto antes de trocar os arquivos';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger digital_assets_guard before insert or update on public.digital_product_assets
  for each row execute function private.digital_assets_guard();
revoke all on function private.digital_assets_guard() from public, anon, authenticated;

alter table public.orders add column is_digital boolean not null default false,
  add column digital_validated boolean not null default false,
  add column digital_request_id uuid unique,
  add constraint digital_order_request check (is_digital = (digital_request_id is not null)),
  add constraint digital_order_not_b2b check (not (is_digital and is_b2b));

create table public.digital_order_entitlements (
  order_id bigint primary key references public.orders(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id bigint not null references public.digital_products(id) on delete restrict,
  title text not null,
  price numeric(12,2) not null check (price > 0),
  stl_path text not null,
  mf3_path text not null,
  created_at timestamptz not null default now()
);
create index digital_entitlements_user_idx on public.digital_order_entitlements(user_id,created_at desc);
alter table public.digital_order_entitlements enable row level security;
grant select on public.digital_order_entitlements to authenticated;
grant all on public.digital_order_entitlements to service_role;
create policy digital_entitlements_owner_read on public.digital_order_entitlements for select to authenticated
  using (user_id=(select auth.uid()) or public.is_publication_admin());

create function private.digital_order_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op='INSERT' then
    if new.is_digital and (current_user not in ('postgres','service_role') or not new.digital_validated
      or new.is_b2b or new.frete_valor is distinct from 0) then
      raise exception 'Pedido digital só pode ser criado pelo servidor';
    end if;
  else
    if new.is_digital is distinct from old.is_digital
       or new.digital_request_id is distinct from old.digital_request_id
       or new.digital_validated is distinct from old.digital_validated then
      raise exception 'Tipo e validação do pedido não podem ser alterados';
    end if;
    if old.is_digital and current_user in ('anon','authenticated') then
      raise exception 'Pedido digital só pode ser alterado pelo servidor';
    end if;
  end if;
  if new.is_digital and lower(btrim(new.status)) in ('pago','producao','enviado','entregue')
     and not new.digital_validated then raise exception 'Pedido digital não validado'; end if;
  return new;
end $$;
create trigger digital_order_guard before insert or update on public.orders
  for each row execute function private.digital_order_guard();
revoke all on function private.digital_order_guard() from public, anon, authenticated;

create function public.digital_create_order(p_product_id bigint,p_user_id uuid,p_request_id uuid)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_product public.digital_products; v_assets public.digital_product_assets;
  v_order_id bigint; v_existing public.orders;
begin
  if current_setting('role',true)<>'service_role' then
    raise exception 'Compra digital disponível somente ao servidor' using errcode='42501';
  end if;
  if p_user_id is null or p_request_id is null or not exists (
    select 1 from auth.users where id=p_user_id and is_anonymous is false
  ) then raise exception 'Entre em uma conta cadastrada para comprar arquivos'; end if;
  select * into v_product from public.digital_products where id=p_product_id and is_active for share;
  select * into v_assets from public.digital_product_assets where product_id=p_product_id;
  if v_product.id is null or v_assets.product_id is null then raise exception 'Produto digital indisponível'; end if;
  if exists (select 1 from public.digital_order_entitlements e join public.orders o on o.id=e.order_id
    where e.user_id=p_user_id and e.product_id=p_product_id and o.freo_verified_paid_amount is not null
      and lower(btrim(o.status)) in ('pago','producao','enviado','entregue')) then
    raise exception 'Este arquivo já está na sua biblioteca';
  end if;
  select * into v_existing from public.orders where digital_request_id=p_request_id for update;
  if found then
    if v_existing.user_id<>p_user_id or not exists (
      select 1 from public.digital_order_entitlements where order_id=v_existing.id and product_id=p_product_id
    ) then raise exception 'Solicitação de compra inválida'; end if;
    return v_existing.id;
  end if;
  insert into public.orders(user_id,status,total,items,frete_valor,is_digital,digital_validated,digital_request_id,customer_email)
    values(p_user_id,'pendente',v_product.price,
      jsonb_build_array(jsonb_build_object('product_id','digital:'||v_product.id,
        'product_name',v_product.title,'quantity',1,'price',v_product.price)),
      0,true,true,p_request_id,(select email from auth.users where id=p_user_id))
    on conflict(digital_request_id) do nothing returning id into v_order_id;
  if v_order_id is null then
    select * into v_existing from public.orders where digital_request_id=p_request_id;
    if v_existing.user_id<>p_user_id or not exists (
      select 1 from public.digital_order_entitlements where order_id=v_existing.id and product_id=p_product_id
    ) then raise exception 'Solicitação de compra inválida'; end if;
    return v_existing.id;
  end if;
  insert into public.digital_order_entitlements(order_id,user_id,product_id,title,price,stl_path,mf3_path)
    values(v_order_id,p_user_id,p_product_id,v_product.title,v_product.price,v_assets.stl_path,v_assets.mf3_path);
  return v_order_id;
end $$;
revoke all on function public.digital_create_order(bigint,uuid,uuid) from public, anon, authenticated;
grant execute on function public.digital_create_order(bigint,uuid,uuid) to service_role;

-- Concilia Pix digital pendente mesmo se o comprador fechar o navegador.
-- A função de sincronização consulta o Mercado Pago; este job nunca concede
-- acesso apenas com o status informado pelo navegador ou por um webhook.
do $$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    perform cron.schedule('freo-digital-payment-sync', '*/5 * * * *', $job$
      select net.http_post(
        url := 'https://rrmxqpvxrpcqqxsgccqw.supabase.co/functions/v1/freo-payment-sync',
        body := jsonb_build_object('order_id',o.id),
        headers := '{"Content-Type":"application/json"}'::jsonb
      )
      from public.orders o
      where o.is_digital and o.status='pendente'
        and o.freo_verified_paid_amount is null and o.payment_id ~ '^[0-9]{5,30}$'
        and o.created_at >= now() - interval '30 days'
      order by o.id desc limit 50
    $job$);
  end if;
end $$;

commit;
