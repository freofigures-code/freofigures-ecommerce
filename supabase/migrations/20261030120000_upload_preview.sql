-- Upload com prévia: a imagem enviada fica como 'image_ready' em vez de ir
-- direto para o Tripo. Assim o cliente pode ajustá-la por texto (refine_image)
-- ou, se for foto real, convertê-la em figure antes de gerar o 3D.
--
-- Mantém o corpo de start_generation copiado da produção em 2026-10-30 e
-- acrescenta apenas a ação 'register_upload'. 'generate_model_from_upload'
-- continua aceita para clientes antigos ainda abertos no navegador.
begin;
do $$
begin
  if to_regprocedure('public.start_generation(text,uuid,text,text,text,text,text,text)') is null then
    raise exception 'Migração cancelada: start_generation com a assinatura esperada não existe';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'generation_enqueue'
  ) then
    raise exception 'Migração cancelada: generation_enqueue não existe';
  end if;
end;
$$;

create or replace function public.start_generation(
  p_action text,
  p_generation_id uuid default null::uuid,
  p_prompt text default null::text,
  p_refinement_text text default null::text,
  p_input_image_path text default null::text,
  p_input_image_name text default null::text,
  p_input_image_type text default null::text,
  p_title text default null::text
)
returns public.generation_jobs
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_user_email text;
  v_operation_id uuid := gen_random_uuid();
  v_job public.generation_jobs%rowtype;
  v_title text;
begin
  if v_user_id is null then
    raise exception 'É necessário estar autenticado.';
  end if;

  select u.email
    into v_user_email
  from auth.users as u
  where u.id = v_user_id;

  if p_action = 'generate_image' then
    if nullif(btrim(coalesce(p_prompt, '')), '') is null then
      raise exception 'O prompt é obrigatório.';
    end if;

    v_title := left(
      coalesce(nullif(btrim(p_title), ''), btrim(p_prompt)),
      120
    );

    insert into public.generation_jobs (
      user_id,
      user_email,
      title,
      source_type,
      status,
      active_operation,
      active_operation_id,
      prompt,
      progress,
      retry_count,
      error_message
    ) values (
      v_user_id,
      v_user_email,
      v_title,
      'prompt',
      'queued',
      'generate_image',
      v_operation_id,
      btrim(p_prompt),
      0,
      0,
      null
    )
    returning * into v_job;

  elsif p_action in ('generate_model_from_upload', 'register_upload') then
    if nullif(btrim(coalesce(p_input_image_path, '')), '') is null then
      raise exception 'O caminho da imagem é obrigatório.';
    end if;

    -- Impede referenciar arquivo de outro usuário.
    if split_part(btrim(p_input_image_path), '/', 1) <> v_user_id::text then
      raise exception 'A imagem precisa pertencer ao usuário autenticado.';
    end if;

    if p_input_image_type not in ('image/png', 'image/jpeg') then
      raise exception 'Formato não suportado. Use PNG ou JPEG.';
    end if;

    v_title := left(
      coalesce(
        nullif(btrim(p_title), ''),
        nullif(btrim(p_input_image_name), ''),
        'Imagem enviada'
      ),
      120
    );

    insert into public.generation_jobs (
      user_id,
      user_email,
      title,
      source_type,
      status,
      active_operation,
      active_operation_id,
      input_image_name,
      input_image_type,
      image_path,
      progress,
      retry_count,
      error_message
    ) values (
      v_user_id,
      v_user_email,
      v_title,
      'upload',
      case when p_action = 'register_upload' then 'image_ready' else 'queued' end,
      case when p_action = 'register_upload' then null else 'generate_model_from_upload' end,
      case when p_action = 'register_upload' then null else v_operation_id end,
      nullif(btrim(p_input_image_name), ''),
      p_input_image_type,
      btrim(p_input_image_path),
      0,
      0,
      null
    )
    returning * into v_job;

    -- A prévia não tem trabalho a processar: o próximo passo é refine_image
    -- ou generate_model, pedidos pelo cliente.
    if p_action = 'register_upload' then
      return v_job;
    end if;

  elsif p_action in ('generate_model', 'refine_image') then
    if p_generation_id is null then
      raise exception 'generation_id é obrigatório.';
    end if;

    select *
      into v_job
    from public.generation_jobs
    where id = p_generation_id
      and user_id = v_user_id
    for update;

    if not found then
      raise exception 'Geração não encontrada.';
    end if;

    if v_job.image_path is null then
      raise exception 'Esta geração ainda não possui uma imagem pronta.';
    end if;

    if p_action = 'refine_image' then
      if nullif(btrim(coalesce(p_refinement_text, '')), '') is null then
        raise exception 'Descreva o que deseja mudar.';
      end if;

      update public.generation_jobs
      set status = 'queued',
          active_operation = 'refine_image',
          active_operation_id = v_operation_id,
          refinement_text = btrim(p_refinement_text),
          model_path = null,
          model_url = null,
          rendered_image_path = null,
          tripo_task_id = null,
          tripo_status = null,
          progress = 0,
          retry_count = 0,
          error_message = null,
          operation_started_at = null,
          completed_at = null
      where id = p_generation_id
      returning * into v_job;

    else
      update public.generation_jobs
      set status = 'queued',
          active_operation = 'generate_model',
          active_operation_id = v_operation_id,
          model_path = null,
          model_url = null,
          rendered_image_path = null,
          tripo_task_id = null,
          tripo_status = null,
          progress = 0,
          retry_count = 0,
          error_message = null,
          operation_started_at = null,
          completed_at = null
      where id = p_generation_id
      returning * into v_job;
    end if;

  else
    raise exception 'Ação inválida.';
  end if;

  perform public.generation_enqueue(
    v_job.id,
    v_job.active_operation,
    v_job.active_operation_id,
    0
  );

  return v_job;
end;
$function$;
commit;
