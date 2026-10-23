const PRODUCT_FIELDS = 'id,title,description,price,promotional_price,stock,preparation_days,category,images,tags,variants,seo_title,seo_description,is_active,created_at,sale_mode,b2b_category,is_kit,publication_id';
const ORDER_FIELDS = 'id,status,total,items,created_at,is_b2b,frete_valor,frete_nome,shipping_address,customer_name,customer_email,customer_phone';
const WRITABLE_FIELDS = new Set(['title', 'description', 'price', 'promotional_price', 'stock', 'preparation_days', 'category', 'images', 'tags', 'variants', 'seo_title', 'seo_description', 'is_active']);
const IMAGE_TYPES = new Map([['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp']]);

export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  });
}

function result(response) {
  if (response.error) throw new ApiError(502, 'database_error', 'Não foi possível concluir a operação no banco.');
  return response.data;
}

export async function tokenMatches(candidate, expected) {
  if (!candidate || !expected || expected.length < 32) return false;
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([candidate, expected].map(value => crypto.subtle.digest('SHA-256', encoder.encode(value))));
  const left = new Uint8Array(a), right = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}

async function authorize(request, secrets, writing) {
  const provided = /^Bearer (\S+)$/i.exec(request.headers.get('authorization') || '')?.[1] || '';
  const write = await tokenMatches(provided, secrets.writeToken);
  const read = write || await tokenMatches(provided, secrets.readToken);
  if (!read) throw new ApiError(401, 'unauthorized', 'Credencial de API inválida.');
  if (writing && !write) throw new ApiError(403, 'forbidden', 'Esta credencial permite somente leitura.');
}

function pathOf(url) {
  const path = new URL(url).pathname;
  const marker = '/freo-automation-api';
  if (path.includes(marker)) return path.slice(path.indexOf(marker) + marker.length) || '/';
  if (path.startsWith('/api/v1')) return path.slice('/api/v1'.length) || '/';
  return path;
}

function positiveInt(raw, fallback, max) {
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new ApiError(400, 'invalid_parameter', 'Parâmetro numérico inválido.');
  return value;
}

function dateRange(url) {
  const to = url.searchParams.get('to') || new Date().toISOString();
  const from = url.searchParams.get('from') || new Date(Date.parse(to) - 7 * 86400000).toISOString();
  const start = Date.parse(from), end = Date.parse(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || end - start > 31 * 86400000 || end > Date.now() + 86400000) {
    throw new ApiError(400, 'invalid_range', 'Informe um intervalo válido de até 31 dias.');
  }
  return { p_from: new Date(start).toISOString(), p_to: new Date(end).toISOString() };
}

function stringField(value, max, optional = false) {
  if (value === null && optional) return null;
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new ApiError(400, 'invalid_product', 'Campo de texto do produto inválido.');
  return value.trim();
}

function priceField(value, nullable = false) {
  if (value === null && nullable) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1000000) throw new ApiError(400, 'invalid_product', 'Preço inválido.');
  return Math.round(value * 100) / 100;
}

function validVariants(value) {
  if (!Array.isArray(value) || value.length > 10) throw new ApiError(400, 'invalid_product', 'Variações inválidas.');
  return value.map(group => {
    if (!group || typeof group !== 'object' || !Array.isArray(group.options) || group.options.length > 30 || !group.options.length) throw new ApiError(400, 'invalid_product', 'Grupo de variações inválido.');
    return {
      name: stringField(group.name, 80), per_option_price: group.per_option_price === true,
      options: group.options.map(option => {
        if (typeof option === 'string') return { name: stringField(option, 100), price: null };
        if (!option || typeof option !== 'object') throw new ApiError(400, 'invalid_product', 'Opção de variação inválida.');
        return { name: stringField(option.name, 100), price: option.price == null ? null : priceField(option.price) };
      }),
    };
  });
}

export function validateProduct(input, { creating = false, existing = null, storageOrigin = '' } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ApiError(400, 'invalid_product', 'Envie um objeto JSON de produto.');
  if (existing && (existing.is_kit || existing.publication_id || (existing.b2b_category && existing.b2b_category !== 'loja') || (existing.sale_mode && existing.sale_mode !== 'normal'))) {
    throw new ApiError(409, 'special_product', 'Este tipo de produto deve ser editado pelo painel especializado.');
  }
  for (const key of Object.keys(input)) if (!WRITABLE_FIELDS.has(key)) throw new ApiError(400, 'unsupported_field', `Campo não permitido: ${key}`);
  if (!creating && !Object.keys(input).length) throw new ApiError(400, 'invalid_product', 'Informe ao menos um campo.');
  const value = {};
  if ('title' in input || creating) value.title = stringField(input.title, 200);
  if ('description' in input) value.description = input.description === null ? null : stringField(input.description, 10000);
  if ('price' in input || creating) value.price = priceField(input.price);
  if ('promotional_price' in input) value.promotional_price = priceField(input.promotional_price, true);
  if ('stock' in input) {
    if (!Number.isSafeInteger(input.stock) || input.stock < 0 || input.stock > 1000000) throw new ApiError(400, 'invalid_product', 'Estoque inválido.');
    value.stock = input.stock;
  }
  if ('preparation_days' in input) {
    if (!Number.isSafeInteger(input.preparation_days) || input.preparation_days < 1 || input.preparation_days > 365) throw new ApiError(400, 'invalid_product', 'Prazo de preparação inválido.');
    value.preparation_days = input.preparation_days;
  }
  if ('category' in input || creating) {
    if (!['games', 'religioso'].includes(input.category)) throw new ApiError(400, 'invalid_product', 'Categoria indisponível para esta API.');
    value.category = input.category;
  }
  if ('images' in input) {
    if (!Array.isArray(input.images) || input.images.length > 12) throw new ApiError(400, 'invalid_product', 'Lista de imagens inválida.');
    value.images = input.images.map(image => {
      if (typeof image !== 'string' || image.length > 1000 || !image.startsWith(storageOrigin + '/storage/v1/object/public/imagens/')) throw new ApiError(400, 'invalid_product', 'Use imagens enviadas ao bucket imagens desta loja.');
      return image;
    });
  }
  if ('tags' in input) {
    if (input.tags !== null && (!Array.isArray(input.tags) || input.tags.length > 20)) throw new ApiError(400, 'invalid_product', 'Tags inválidas.');
    value.tags = input.tags === null ? null : input.tags.map(tag => stringField(tag, 60));
  }
  if ('variants' in input) value.variants = validVariants(input.variants);
  for (const key of ['seo_title', 'seo_description']) if (key in input) value[key] = input[key] === null ? null : stringField(input[key], key === 'seo_title' ? 200 : 400);
  if ('is_active' in input) {
    if (typeof input.is_active !== 'boolean') throw new ApiError(400, 'invalid_product', 'is_active deve ser booleano.');
    value.is_active = input.is_active;
  }
  const effectivePrice = value.price ?? existing?.price;
  const promotion = 'promotional_price' in value ? value.promotional_price : existing?.promotional_price;
  if (promotion != null && promotion >= effectivePrice) throw new ApiError(400, 'invalid_product', 'Preço promocional deve ser menor que o preço normal.');
  if (creating) return { ...value, promotional_price: value.promotional_price ?? null, stock: value.stock ?? 0, images: value.images ?? [], variants: value.variants ?? [], is_active: value.is_active ?? false, sale_mode: 'normal', b2b_category: 'loja', is_kit: false };
  return value;
}

function imageExtension(bytes, type) {
  if (type === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (type === 'image/png' && [137, 80, 78, 71, 13, 10, 26, 10].every((part, i) => bytes[i] === part)) return 'png';
  if (type === 'image/webp' && new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP') return 'webp';
  return null;
}

async function readJson(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new ApiError(415, 'unsupported_media_type', 'Use application/json.');
  if (Number(request.headers.get('content-length') || 0) > 65536) throw new ApiError(413, 'too_large', 'JSON excede 64 KB.');
  const text = await request.text();
  if (new TextEncoder().encode(text).length > 65536) throw new ApiError(413, 'too_large', 'JSON excede 64 KB.');
  try { return JSON.parse(text); } catch { throw new ApiError(400, 'invalid_json', 'JSON inválido.'); }
}

export function createApiHandler({ db, readToken, writeToken, storageOrigin }) {
  return async request => {
    try {
      if (!readToken || !writeToken || readToken.length < 32 || writeToken.length < 32 || readToken === writeToken) throw new ApiError(503, 'not_configured', 'Credenciais da API não configuradas.');
      const url = new URL(request.url), path = pathOf(request.url), method = request.method.toUpperCase();
      await authorize(request, { readToken, writeToken }, !['GET', 'HEAD'].includes(method));
      if (method === 'GET' && path === '/products') {
        const limit = positiveInt(url.searchParams.get('limit'), 50, 100);
        const before = url.searchParams.get('before_id');
        let query = db.from('products').select(PRODUCT_FIELDS).order('id', { ascending: false }).limit(limit);
        if (before !== null) query = query.lt('id', positiveInt(before, null, Number.MAX_SAFE_INTEGER));
        return json({ data: result(await query) });
      }
      if (method === 'GET' && /^\/products\/\d+$/.test(path)) {
        const id = positiveInt(path.split('/')[2], null, Number.MAX_SAFE_INTEGER);
        const row = result(await db.from('products').select(PRODUCT_FIELDS).eq('id', id).maybeSingle());
        if (!row) throw new ApiError(404, 'not_found', 'Produto não encontrado.');
        return json({ data: row });
      }
      if (method === 'POST' && path === '/products') {
        const value = validateProduct(await readJson(request), { creating: true, storageOrigin });
        const row = result(await db.from('products').insert(value).select(PRODUCT_FIELDS).single());
        return json({ data: row }, 201);
      }
      if (['PATCH', 'DELETE'].includes(method) && /^\/products\/\d+$/.test(path)) {
        const id = positiveInt(path.split('/')[2], null, Number.MAX_SAFE_INTEGER);
        const existing = result(await db.from('products').select(PRODUCT_FIELDS).eq('id', id).maybeSingle());
        if (!existing) throw new ApiError(404, 'not_found', 'Produto não encontrado.');
        const value = method === 'DELETE' ? validateProduct({ is_active: false }, { existing, storageOrigin }) : validateProduct(await readJson(request), { existing, storageOrigin });
        const row = result(await db.from('products').update(value).eq('id', id).select(PRODUCT_FIELDS).single());
        return json({ data: row, meta: method === 'DELETE' ? { archived: true } : undefined });
      }
      if (method === 'POST' && path === '/images') {
        const type = request.headers.get('content-type')?.split(';')[0].trim();
        if (!IMAGE_TYPES.has(type)) throw new ApiError(415, 'unsupported_media_type', 'Envie JPEG, PNG ou WebP.');
        if (Number(request.headers.get('content-length') || 0) > 8 * 1024 * 1024) throw new ApiError(413, 'too_large', 'Imagem excede 8 MB.');
        const bytes = new Uint8Array(await request.arrayBuffer());
        if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new ApiError(413, 'too_large', 'Imagem vazia ou acima de 8 MB.');
        const ext = imageExtension(bytes, type);
        if (!ext) throw new ApiError(400, 'invalid_image', 'Conteúdo da imagem não corresponde ao tipo informado.');
        const imagePath = `produtos/api/${crypto.randomUUID()}.${ext}`;
        result(await db.storage.from('imagens').upload(imagePath, bytes, { contentType: type, upsert: false }));
        const publicUrl = db.storage.from('imagens').getPublicUrl(imagePath).data.publicUrl;
        return json({ data: { path: imagePath, url: publicUrl } }, 201);
      }
      if (method === 'GET' && path === '/orders') {
        const limit = positiveInt(url.searchParams.get('limit'), 50, 100);
        const after = url.searchParams.get('after_id'), before = url.searchParams.get('before_id');
        if (after && before) throw new ApiError(400, 'invalid_parameter', 'Use after_id ou before_id.');
        let query = db.from('orders').select(ORDER_FIELDS).order('id', { ascending: !before }).limit(limit);
        if (after !== null) query = query.gt('id', positiveInt(after, null, Number.MAX_SAFE_INTEGER));
        if (before !== null) query = query.lt('id', positiveInt(before, null, Number.MAX_SAFE_INTEGER));
        return json({ data: result(await query) });
      }
      if (method === 'GET' && /^\/orders\/\d+$/.test(path)) {
        const id = positiveInt(path.split('/')[2], null, Number.MAX_SAFE_INTEGER);
        const row = result(await db.from('orders').select(ORDER_FIELDS).eq('id', id).maybeSingle());
        if (!row) throw new ApiError(404, 'not_found', 'Pedido não encontrado.');
        return json({ data: row });
      }
      if (method === 'GET' && ['/analytics/funnel', '/analytics/pages'].includes(path)) {
        const fn = path.endsWith('funnel') ? 'automation_analytics_funnel' : 'automation_analytics_pages';
        return json({ data: result(await db.rpc(fn, dateRange(url))) });
      }
      if (method === 'GET' && path === '/webhooks/events') {
        const rows = result(await db.from('automation_outbox').select('id,event_type,order_id,attempts,created_at,delivered_at,next_attempt_at,last_error').order('id', { ascending: false }).limit(50));
        return json({ data: rows });
      }
      if (method === 'POST' && /^\/webhooks\/events\/\d+\/retry$/.test(path)) {
        const id = positiveInt(path.split('/')[3], null, Number.MAX_SAFE_INTEGER);
        const row = result(await db.from('automation_outbox').select('id,delivered_at,leased_until').eq('id', id).maybeSingle());
        if (!row) throw new ApiError(404, 'not_found', 'Evento não encontrado.');
        if (row.delivered_at || (row.leased_until && Date.parse(row.leased_until) > Date.now())) throw new ApiError(409, 'event_in_progress', 'Evento entregue ou em processamento.');
        const now = new Date().toISOString();
        const updated = result(await db.from('automation_outbox').update({ attempts: 0, next_attempt_at: now, leased_until: null, last_error: null })
          .eq('id', id).is('delivered_at', null).or(`leased_until.is.null,leased_until.lt.${now}`).select('id').maybeSingle());
        if (!updated) throw new ApiError(409, 'event_in_progress', 'Evento entregue ou em processamento.');
        return json({ data: { id, queued: true } });
      }
      throw new ApiError(404, 'not_found', 'Rota não encontrada.');
    } catch (error) {
      if (error instanceof ApiError) return json({ error: { code: error.code, message: error.message } }, error.status);
      console.error('freo-automation-api error', error);
      return json({ error: { code: 'internal_error', message: 'Erro interno.' } }, 500);
    }
  };
}
