import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('register_upload creates an image_ready preview without enqueuing, and refine/model still enqueue', async () => {
  const db = new PGlite();
  const owner = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';
  const as = async (user, sql) => {
    await db.exec(`select set_config('request.jwt.claim.sub','${user}',false)`);
    return (await db.query(sql)).rows;
  };
  try {
    await db.exec(`
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table auth.users(id uuid primary key, email text);
      insert into auth.users values('${owner}','dono@example.com'),('${other}','outro@example.com');
    `);
    await db.exec(await readFile(new URL('./fixtures/production-generation-jobs.sql', import.meta.url), 'utf8'));
    await db.exec(`
      create table public.enqueued(job_id uuid, operation text, operation_id uuid);
      create function public.generation_enqueue(p_job uuid, p_op text, p_op_id uuid, p_delay integer) returns void
        language sql as $$ insert into public.enqueued values (p_job, p_op, p_op_id) $$;
      create function public.start_generation(p_action text, p_generation_id uuid default null, p_prompt text default null,
        p_refinement_text text default null, p_input_image_path text default null, p_input_image_name text default null,
        p_input_image_type text default null, p_title text default null)
        returns public.generation_jobs language plpgsql security definer as $$ begin raise exception 'old'; end; $$;
    `);
    await db.exec(await readFile(new URL('../supabase/migrations/20261030120000_upload_preview.sql', import.meta.url), 'utf8'));

    const [preview] = await as(owner, `select * from public.start_generation('register_upload',
      p_input_image_path => '${owner}/x/upload.png', p_input_image_name => 'foto.png', p_input_image_type => 'image/png')`);
    assert.equal(preview.status, 'image_ready');
    assert.equal(preview.source_type, 'upload');
    assert.equal(preview.active_operation, null);
    assert.equal(preview.image_path, `${owner}/x/upload.png`);
    assert.equal((await db.query('select * from public.enqueued')).rows.length, 0);

    const [refined] = await as(owner, `select * from public.start_generation('refine_image',
      p_generation_id => '${preview.id}', p_refinement_text => '[modo:foto] estilo anime')`);
    assert.equal(refined.status, 'queued');
    assert.equal(refined.active_operation, 'refine_image');
    assert.equal(refined.refinement_text, '[modo:foto] estilo anime');

    const [model] = await as(owner, `select * from public.start_generation('generate_model', p_generation_id => '${preview.id}')`);
    assert.equal(model.active_operation, 'generate_model');
    assert.deepEqual((await db.query('select operation from public.enqueued order by operation')).rows.map(r => r.operation),
      ['generate_model', 'refine_image']);

    const [legacy] = await as(owner, `select * from public.start_generation('generate_model_from_upload',
      p_input_image_path => '${owner}/y/upload.jpg', p_input_image_type => 'image/jpeg')`);
    assert.equal(legacy.status, 'queued');
    assert.equal(legacy.active_operation, 'generate_model_from_upload');

    await assert.rejects(as(other, `select * from public.start_generation('register_upload',
      p_input_image_path => '${owner}/z/upload.png', p_input_image_type => 'image/png')`), /pertencer ao usuário/);
    await assert.rejects(as(other, `select * from public.start_generation('refine_image',
      p_generation_id => '${preview.id}', p_refinement_text => 'x')`), /não encontrada/);
  } finally {
    await db.close();
  }
});
