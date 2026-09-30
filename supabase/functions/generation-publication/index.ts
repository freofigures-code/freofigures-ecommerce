import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const respond = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const check = <T,>(result: { data: T; error: unknown }): T => { if (result.error) throw result.error; return result.data; };

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return respond({ error: 'Método inválido.' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authorization = req.headers.get('Authorization') || '';
    const client = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
    const auth = await client.auth.getUser();
    const user = auth.data?.user;
    if (auth.error || !user || user.is_anonymous) return respond({ error: 'Entre na sua conta para continuar.' }, 401);
    const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const body = await req.json();
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (body.action === 'submit') {
      if (body.consent !== true || !uuid.test(body.generation_id)) return respond({ error: 'Confirme a autorização de publicação.' }, 400);
      // Ownership checked before privileged access or requesting a price.
      const job = check(await client.from('generation_jobs').select('id,user_id,status,image_path,rendered_image_path,model_path').eq('id', body.generation_id).single());
      if (!job || job.user_id !== user.id || job.status !== 'completed') return respond({ error: 'A criação precisa estar concluída e pertencer à sua conta.' }, 403);
      const existing = check(await service.from('generation_publications').select('*').eq('generation_id', job.id).maybeSingle());
      if (existing) return respond({ publication: existing });
      const quoteResponse = await fetch(`${url}/functions/v1/generation-price-quote`, { method: 'POST', headers: { Authorization: authorization, apikey: anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ generation_id: job.id }) });
      const quote = await quoteResponse.json();
      const price = Number(quote.valor_final);
      if (!quoteResponse.ok || quote.success !== true || quote.ready !== true || quote.generation_id !== job.id || !Number.isFinite(price) || price < 0.01 || price > 99999999.99) throw new Error('Não foi possível validar o preço desta criação.');
      const imagePath = job.rendered_image_path || job.image_path;
      if (!imagePath || !job.model_path) throw new Error('Os arquivos desta criação ainda não estão disponíveis para publicação.');
      // Copy immutable snapshots; later edits to a generation cannot silently
      // change the artwork that was consented to and reviewed.
      const prefix = `${job.id}/${crypto.randomUUID()}`;
      const copied: string[] = [];
      try {
        for (const [source, target] of [[imagePath, `${prefix}/cover`], [job.model_path, `${prefix}/model`]]) {
          // Use the caller's Storage RLS: generation paths can be edited by their owner.
          const file = check(await client.storage.from('generations').download(source));
          if (!file) throw new Error('Arquivo da criação indisponível.');
          check(await service.storage.from('generation-publications').upload(target, file, { contentType: file.type || 'application/octet-stream', upsert: false }));
          copied.push(target);
        }
        const publication = check(await service.rpc('submit_generation_publication', { p_generation_id: job.id, p_user_id: user.id, p_price: price, p_image_path: copied[0], p_model_path: copied[1] }));
        // A simultaneous retry may have won the unique generation_id lock.
        if (publication.image_path !== copied[0]) await service.storage.from('generation-publications').remove(copied);
        return respond({ publication });
      } catch (error) {
        // An RPC response may be lost after commit. Keep committed snapshots.
        const lookup = await service.from('generation_publications').select('*').eq('generation_id', job.id).maybeSingle();
        if (!lookup.error && lookup.data) {
          if (lookup.data.image_path !== copied[0]) await service.storage.from('generation-publications').remove(copied);
          return respond({ publication: lookup.data });
        }
        if (!lookup.error && copied.length) await service.storage.from('generation-publications').remove(copied);
        throw error;
      }
    }

    if (body.action === 'review') {
      const profile = check(await service.from('profiles').select('is_admin').eq('id', user.id).single());
      if (!profile?.is_admin) return respond({ error: 'Acesso restrito ao administrador.' }, 403);
      if (!uuid.test(body.publication_id) || typeof body.approve !== 'boolean') return respond({ error: 'Decisão inválida.' }, 400);
      const item = check(await service.from('generation_publications').select('*').eq('id', body.publication_id).single());
      if (item.status !== 'pending') return respond({ publication: item });
      let imageUrl: string | null = null;
      let coverPath: string | null = null;
      const stock = Number(body.stock);
      if (body.approve) {
        if (!Number.isSafeInteger(stock) || stock < 1 || stock > 100000) return respond({ error: 'Informe o estoque disponível (1 a 100000).' }, 400);
        const file = check(await service.storage.from('generation-publications').download(item.image_path));
        if (!file) throw new Error('Imagem da criação indisponível.');
        // Unique cover per review attempt prevents concurrent decisions from
        // overwriting the winning product's cover.
        coverPath = `comunidade/${item.id}/${crypto.randomUUID()}`;
        check(await service.storage.from('imagens').upload(coverPath, file, { contentType: file.type || 'image/png' }));
        imageUrl = service.storage.from('imagens').getPublicUrl(coverPath).data.publicUrl;
      }
      const result = await service.rpc('review_generation_publication', { p_id: item.id, p_admin_id: user.id, p_approve: body.approve, p_image_url: imageUrl, p_stock: body.approve ? stock : 1, p_reason: typeof body.reason === 'string' ? body.reason : null });
      if (coverPath) {
        // Re-read after either success or an ambiguous network error before
        // cleaning up a cover which might already be attached to a product.
        const saved = await service.from('products').select('images').eq('publication_id', item.id).maybeSingle();
        if (!saved.error && !saved.data?.images?.includes(imageUrl)) await service.storage.from('imagens').remove([coverPath]);
      }
      return respond({ publication: check(result) });
    }
    return respond({ error: 'Ação inválida.' }, 400);
  } catch (error) {
    console.error('generation-publication failed', error);
    return respond({ error: 'Não foi possível concluir a solicitação. Tente novamente; seu checkout continua disponível.' }, 400);
  }
});
