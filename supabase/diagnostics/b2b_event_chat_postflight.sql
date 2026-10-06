-- Run in the Supabase SQL editor after 202610060001_b2b_event_quotes_chat.sql.
-- Every value must be true before publishing the frontend.
select jsonb_build_object(
  'event_pricing_table', to_regclass('public.b2b_event_pricing') is not null,
  'event_pricing_rls', coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.b2b_event_pricing')), false),
  'quote_price_snapshot', exists (
    select 1 from information_schema.columns where table_schema='public'
      and table_name='b2b_quote_requests' and column_name='estimated_total'
  ),
  'quote_price_server_guard', exists (
    select 1 from pg_trigger where tgrelid=to_regclass('public.b2b_quote_requests')
      and tgname='b2b_quote_before_insert' and not tgisinternal
  ),
  'messages_table', to_regclass('public.b2b_quote_messages') is not null,
  'messages_rls', coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.b2b_quote_messages')), false),
  'message_insert_guard', exists (
    select 1 from pg_trigger where tgrelid=to_regclass('public.b2b_quote_messages')
      and tgname='b2b_quote_message_guard' and not tgisinternal
  ),
  'private_image_bucket', exists (
    select 1 from storage.buckets where id='b2b-quote-images' and public=false
      and file_size_limit=5242880 and allowed_mime_types @> array['image/jpeg','image/png','image/webp']::text[]
  ),
  'image_read_guard', exists (
    select 1 from pg_policies where schemaname='storage' and tablename='objects'
      and policyname='b2b_quote_images_read_guard' and permissive='RESTRICTIVE'
  ),
  'image_write_guard', exists (
    select 1 from pg_policies where schemaname='storage' and tablename='objects'
      and policyname='b2b_quote_images_insert_guard' and permissive='RESTRICTIVE'
  ),
  'anonymous_chat_blocked', not has_table_privilege('anon','public.b2b_quote_messages','SELECT')
    and not has_table_privilege('anon','public.b2b_quote_messages','INSERT')
) as verificacao_eventos_chat;
