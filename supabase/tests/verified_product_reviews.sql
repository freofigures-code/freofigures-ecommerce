-- Run after the migration within the SAME transaction; roll back all fixtures.
savepoint review_test_fixtures;
select set_config('request.jwt.claims', jsonb_build_object('sub', (
  select u.id from auth.users u left join public.profiles p on p.id=u.id
  where not coalesce(p.is_admin,false) and not coalesce(u.is_anonymous,false) limit 1
), 'role','authenticated','is_anonymous',false)::text, true);
do $$ begin
  if auth.uid() is null then raise exception 'No customer available for transaction-only tests'; end if;
end $$;
insert into public.orders (id,user_id,status,total,items) values
  (-908000001,auth.uid(),'entregue',1,'[{"product_id":"review-test-115","product_name":"review-test-15"}]'),
  (-908000002,auth.uid(),'pendente',1,'[{"product_id":"review-test-pending"}]'),
  (-908000003,auth.uid(),'não entregue',1,'[{"product_id":"review-test-negative"}]'),
  (-908000004,auth.uid(),'entregue',1,'[{"product_id":"review-test-delivered"}]');
set local role authenticated;
do $$
declare n integer;
begin
  -- Visibility: seeded artificial reviews must disappear even through the API.
  select count(*) into n from public.product_reviews where is_artificial is true;
  if n <> 0 then raise exception 'Artificial reviews visible'; end if;
  if public.product_review_eligibility('review-test-15') <> 'not_delivered' then raise exception 'Substring matched'; end if;
  if public.product_review_eligibility('review-test-115') <> 'eligible' then raise exception 'Exact product blocked'; end if;
  if public.product_review_eligibility('review-test-pending') <> 'not_delivered' then raise exception 'Pending order eligible'; end if;
  if public.product_review_eligibility('review-test-negative') <> 'not_delivered' then raise exception 'Negative delivery status eligible'; end if;
  if public.product_review_eligibility('review-test-delivered') <> 'eligible' then raise exception 'Delivered order blocked'; end if;

  -- Customer cannot manufacture delivery or change the item in an existing order.
  begin
    update public.orders set status='entregue' where id=-908000002;
    raise exception 'Customer changed delivery';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.orders(id,user_id,status,total,items) values
      (-908000005,auth.uid(),'entregue',1,'[{"product_id":"forged"}]');
    raise exception 'Customer inserted delivered order';
  exception when insufficient_privilege then null; end;
  begin
    update public.orders set items='[{"product_id":"forged"}]' where id=-908000002;
    raise exception 'Customer changed ordered product';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set is_admin=true where id=auth.uid();
    if found then raise exception 'Customer became admin'; end if;
  exception when insufficient_privilege then null; end;

  -- Normal checkout's pending -> paid update remains functional.
  update public.orders set status='pago',payment_id='transaction-only-test' where id=-908000002;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Checkout update blocked'; end if;

  begin
    insert into public.product_reviews(product_id,user_id,reviewer_name,rating,comment,is_artificial)
      values('review-test-pending',auth.uid(),'Test',5,'Transaction-only test',false);
    raise exception 'Undelivered review accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.product_reviews(product_id,user_id,reviewer_name,rating,comment,is_artificial)
      values('review-test-wrong-product',auth.uid(),'Test',5,'Transaction-only test',false);
    raise exception 'Wrong product accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.product_reviews(product_id,user_id,reviewer_name,rating,comment,is_artificial)
      values('review-test-delivered',auth.uid(),'Test',5,'Transaction-only test',true);
    raise exception 'Artificial review accepted';
  exception when insufficient_privilege then null; end;

  insert into public.product_reviews(product_id,user_id,reviewer_name,rating,comment,is_artificial)
    values('review-test-delivered',auth.uid(),'Test',5,'Transaction-only test',false);
  if public.product_review_eligibility('review-test-delivered') <> 'already_reviewed' then raise exception 'Duplicate state missing'; end if;
  begin
    insert into public.product_reviews(product_id,user_id,reviewer_name,rating,comment,is_artificial)
      values('review-test-delivered',auth.uid(),'Test',5,'Transaction-only test',false);
    raise exception 'Duplicate accepted';
  exception when insufficient_privilege or unique_violation then null; end;
end $$;
reset role;
do $$ begin
  -- These IDs isolate the exact-match cases from existing customer orders.
  if private.review_has_delivered_product(auth.uid(),'review-test-delivere') then raise exception 'Substring matched'; end if;
  if private.review_has_delivered_product(gen_random_uuid(),'review-test-delivered') then raise exception 'Other buyer matched'; end if;
end $$;
-- No fixture, review, status change or claim survives this rollback.
rollback to savepoint review_test_fixtures;
