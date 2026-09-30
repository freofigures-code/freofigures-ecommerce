-- SOMENTE LEITURA. Execute no SQL Editor do seu projeto Supabase.
-- Retorna estrutura, políticas e metadados; não retorna clientes, tokens ou modelos.
-- Copie o JSON da coluna diagnostico para confirmar a compatibilidade da migração.
select jsonb_pretty(jsonb_build_object(
  'columns', (select jsonb_agg(jsonb_build_object(
    'table', n.nspname || '.' || c.relname, 'column', a.attname,
    'type', pg_catalog.format_type(a.atttypid,a.atttypmod),
    'not_null', a.attnotnull, 'default', pg_get_expr(d.adbin,d.adrelid),
    'identity', a.attidentity, 'generated', a.attgenerated
  ) order by n.nspname,c.relname,a.attnum)
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
  left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
  where n.nspname='public' and c.relname in ('products','generation_jobs','profiles','generation_publications')),
  'constraints', (select jsonb_agg(jsonb_build_object(
    'table', conrelid::regclass::text, 'name', conname, 'definition', pg_get_constraintdef(oid)
  )) from pg_constraint where conrelid in (
    to_regclass('public.products'),to_regclass('public.generation_jobs'),
    to_regclass('public.profiles'),to_regclass('public.generation_publications'))),
  'rls', (select jsonb_agg(jsonb_build_object(
    'table',n.nspname||'.'||c.relname,'enabled',c.relrowsecurity,'forced',c.relforcerowsecurity
  )) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where (n.nspname='public' and c.relname in ('products','generation_jobs','profiles','generation_publications'))
       or (n.nspname='storage' and c.relname='objects')),
  'policies', (select jsonb_agg(to_jsonb(p)) from pg_policies p
    where (schemaname='public' and tablename in ('products','generation_jobs','profiles','generation_publications'))
       or (schemaname='storage' and tablename='objects')),
  'triggers', (select jsonb_agg(jsonb_build_object(
    'table',t.tgrelid::regclass::text,'name',t.tgname,'enabled',t.tgenabled,
    'function',t.tgfoid::regprocedure::text
  )) from pg_trigger t where not t.tgisinternal and t.tgrelid in (
    to_regclass('public.products'),to_regclass('public.generation_jobs'),to_regclass('public.profiles'))),
  'grants', (select jsonb_agg(jsonb_build_object(
    'table',table_schema||'.'||table_name,'role',grantee,'privilege',privilege_type
  )) from information_schema.role_table_grants
    where grantee in ('anon','authenticated','service_role','PUBLIC')
      and ((table_schema='public' and table_name in ('products','generation_jobs','profiles','generation_publications'))
        or (table_schema='storage' and table_name='objects'))),
  'publication_objects', jsonb_build_object(
    'table',to_regclass('public.generation_publications')::text,
    'category_backup',to_regclass('private.product_categories_before_community')::text,
    'admin_guard',to_regprocedure('private.protect_review_admin_flag()')::text
  ),
  'buckets', (select jsonb_agg(jsonb_build_object(
    'id',b.id,'public',b.public,
    'file_size_limit',to_jsonb(b)->'file_size_limit',
    'allowed_mime_types',to_jsonb(b)->'allowed_mime_types'
  )) from storage.buckets b where b.id in ('imagens','generations','generation-publications'))
)) as diagnostico;
