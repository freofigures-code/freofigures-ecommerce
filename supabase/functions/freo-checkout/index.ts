import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const cents = (n: unknown) => Math.round(Number(n) * 100);
const money = (n: number) => Math.max(0, Math.round(n * 100) / 100);
const value = (r: { data: any; error: unknown }): any => { if (r.error) throw r.error; return r.data; };
const discount = (sum: number, type: string | null, amount: unknown) => money(type === 'fixed' ? sum - Number(amount || 0) : sum * (1 - Number(amount || 0) / 100));

async function itemPrice(service: any, authHeader: string, anonKey: string, url: string, item: any): Promise<number> {
  const quantity = Number(item.quantity);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000) throw new Error('Quantidade do produto inválida');
  if (item.custom_product === true) {
    if (quantity !== 1 || typeof item.generation_id !== 'string' || item.product_id !== `custom-${item.generation_id}`) throw new Error('Criação personalizada inválida');
    const r = await fetch(`${url}/functions/v1/generation-price-quote`, {
      method: 'POST', headers: { Authorization: authHeader, apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ generation_id: item.generation_id }),
    });
    const quote = await r.json();
    if (!r.ok || quote.success !== true || quote.generation_id !== item.generation_id) throw new Error('Preço da criação indisponível');
    if (cents(quote.valor_final) !== cents(item.price)) throw new Error('Preço da criação foi alterado');
    return Number(quote.valor_final);
  }
  const id = Number(item.product_id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Produto inválido');
  const product = value(await service.from('products').select('*').eq('id', id).eq('is_active', true).single());
  if (!product || product.sale_mode === 'quote_only') throw new Error('Produto indisponível');
  let price = Number(product.promotional_price);
  const gross = Number(product.price);
  if (product.promotional_price === null || !Number.isFinite(price) || price >= gross || price < 0) price = gross;
  if (product.is_kit) {
    const links = value(await service.from('product_kit_items').select('child_product_id').eq('kit_product_id', id));
    const ids = links.map((x: any) => x.child_product_id);
    const children = ids.length ? value(await service.from('products').select('id,title,price,stock,is_active').in('id', ids)) : [];
    if (product.kit_type === 'fixed') {
      if (!ids.length || children.length !== ids.length || children.some((x: any) => !x.is_active || Number(x.stock) < quantity)) throw new Error('Kit indisponível');
      price = discount(children.reduce((sum: number, x: any) => sum + Number(x.price), 0), product.kit_discount_type, product.kit_discount_value);
    } else if (product.kit_type === 'configurable') {
      const label = String(item.variant || '');
      if (!label.startsWith('Kit: ')) throw new Error('Composição do kit inválida');
      const combinations: any[][] = [];
      const find = (remaining: string, selected: any[]) => {
        if (selected.length === Number(product.kit_slots)) {
          if (!remaining) combinations.push(selected);
          return;
        }
        for (const child of children) {
          if (!child.is_active || Number(child.stock) < quantity || selected.some(x => x.id === child.id)) continue;
          if (remaining === child.title) find('', [...selected, child]);
          else if (remaining.startsWith(`${child.title}, `)) find(remaining.slice(child.title.length + 2), [...selected, child]);
          if (combinations.length > 1) return;
        }
      };
      find(label.slice(5), []);
      if (combinations.length !== 1) throw new Error('Composição do kit não pôde ser validada');
      const sum = combinations[0].reduce((acc, child) => acc + Number(child.price), 0);
      price = discount(sum, product.kit_discount_type, product.kit_discount_value);
    } else throw new Error('Tipo de kit inválido');
  } else {
    const groups = Array.isArray(product.variants) ? product.variants.filter((x: any) => x?.name && Array.isArray(x.options) && x.options.length) : [];
    const choices = String(item.variant || '').split(' | ').filter(Boolean);
    if (groups.length !== choices.length) throw new Error('Variação do produto inválida');
    let optionPrice: number | null = null;
    for (let i = 0; i < groups.length; i++) {
      const selected = choices[i].split(': ');
      if (selected.length !== 2 || selected[0] !== groups[i].name) throw new Error('Variação do produto inválida');
      const option = groups[i].options.find((x: any) => String(typeof x === 'object' ? x.name : x) === selected[1]);
      if (option === undefined) throw new Error('Opção do produto indisponível');
      if (optionPrice === null && groups[i].per_option_price && typeof option === 'object' && option.price !== null && option.price !== '') {
        optionPrice = Number(option.price);
      }
    }
    if (optionPrice !== null) price = optionPrice;
  }
  if (!Number.isFinite(price) || price < 0 || cents(price) !== cents(item.price)) throw new Error('Preço do produto foi alterado');
  if (!product.is_kit && Number(product.stock) < quantity) throw new Error('Produto sem estoque suficiente');
  return price * quantity;
}

async function shippingPrice(service: any, order: any, subtotal: number, quantity: number): Promise<number> {
  const address = JSON.parse(order.shipping_address || '{}');
  const zip = String(address.zip_code || '').replace(/\D/g, '');
  const state = String(address.state || '').trim().toUpperCase();
  if (zip.length !== 8 || !/^[A-Z]{2}$/.test(state)) throw new Error('Endereço de entrega inválido');
  const response = await fetch('https://n8nwebhook.solviaoficial.com/webhook/calcular-frete', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cep_origem: '09691000', cep_destino: zip, produtos: [{ altura: 8, largura: 15, comprimento: 20, peso: Math.max(0.1, 0.5 * quantity), quantidade: quantity, valor_declarado: subtotal }] }),
  });
  if (!response.ok) throw new Error('Não foi possível validar o frete');
  const raw = await response.json();
  const options = Array.isArray(raw) ? raw : (raw.opcoes || raw.fretes || raw.services || []);
  const option = options.find((x: any) => {
    const id = String(x.id || x.service_id || x.service || x.service_code || '');
    const name = String(x.name || x.service_name || x.servico || x.delivery_method || x.service_title || 'Entrega');
    return id === String(order.frete_service_id || '') && name === String(order.frete_service_name || '');
  });
  if (!option || !Number.isFinite(Number(option.price)) || Number(option.price) <= 0) throw new Error('Opção de frete indisponível');
  let price = Number(option.price);
  const rules = value(await service.from('shipping_promotions').select('*').eq('is_active', true));
  const specific = rules.find((x: any) => Array.isArray(x.uf_list) && x.uf_list.length && x.uf_list.includes(state));
  const fallback = rules.find((x: any) => !x.uf_list || !x.uf_list.length);
  const rule = specific || fallback;
  if (rule) {
    if (rule.min_order_value_free !== null && subtotal >= Number(rule.min_order_value_free)) price = 0;
    else if (rule.subsidy_type !== 'none' && rule.min_order_value_subsidy !== null && subtotal >= Number(rule.min_order_value_subsidy)) {
      if (rule.subsidy_type === 'fixed') price = money(price - Number(rule.subsidy_value || 0));
      if (rule.subsidy_type === 'percent') price = money(price * (1 - Number(rule.subsidy_value || 0) / 100));
    }
  }
  if (cents(price) !== cents(order.frete_valor)) throw new Error('O frete mudou. Recalcule antes de pagar');
  return price;
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return respond({ error: 'Método inválido' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authorization = request.headers.get('Authorization') || '';
    const client = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
    const auth = await client.auth.getUser();
    const user = auth.data?.user;
    if (auth.error || !user || user.is_anonymous) return respond({ error: 'Entre na sua conta para usar Créditos Freo' }, 401);
    const body = await request.json();
    const orderId = Number(body.order_id);
    const credits = Number(body.credits);
    if (!Number.isSafeInteger(orderId) || orderId <= 0 || !Number.isSafeInteger(credits) || credits <= 0) return respond({ error: 'Pedido ou créditos inválidos' }, 400);
    const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const order = value(await service.from('orders').select('*').eq('id', orderId).single());
    if (!order || order.user_id !== user.id || order.status !== 'pendente' || !Array.isArray(order.items) || !order.items.length) return respond({ error: 'Pedido indisponível' }, 403);
    const subtotal = money((await Promise.all(order.items.map((item: any) => itemPrice(service, authorization, anonKey, url, item)))).reduce((a, b) => a + b, 0));
    const quantity = order.items.reduce((sum: number, x: any) => sum + Number(x.quantity), 0);
    const shipping = await shippingPrice(service, order, subtotal, quantity);
    let couponDiscount = 0;
    const couponCode = String(body.coupon_code || '').trim().toUpperCase();
    if (couponCode) {
      const coupon = value(await service.from('coupons').select('*').eq('code', couponCode).eq('is_active', true).single());
      if (!coupon || (coupon.max_uses !== null && Number(coupon.used_count) >= Number(coupon.max_uses))
          || (coupon.expires_at && Date.parse(coupon.expires_at) < Date.now())) throw new Error('Cupom inválido ou esgotado');
      if (coupon.type === 'free_product') couponDiscount = subtotal;
      else if (coupon.type === 'percent') couponDiscount = subtotal * Number(coupon.discount_value) / 100;
      else if (coupon.type === 'fixed') couponDiscount = Number(coupon.discount_value);
      else throw new Error('Tipo de cupom inválido');
      couponDiscount = Math.min(subtotal, couponDiscount);
      if (coupon.max_discount_value !== null) couponDiscount = Math.min(couponDiscount, Number(coupon.max_discount_value));
    }
    const expectedCents = cents(Math.max(0, subtotal - couponDiscount) + shipping);
    const baseCents = cents(order.total) + Number(order.freo_credits_used) * 10;
    if (expectedCents !== baseCents) throw new Error('O valor do pedido diverge dos preços, cupom ou frete atuais');
    if (credits > expectedCents / 10) throw new Error('Créditos acima do valor do pedido');
    const amount = value(await service.rpc('freo_apply_order_credits', { p_order_id: orderId, p_credits: credits, p_user_id: user.id }));
    if (Number(amount) === 0) {
      value(await service.rpc('freo_confirm_paid_order', { p_order_id: orderId, p_payment_id: `freo-only:${orderId}`, p_paid_amount: 0 }));
    }
    return respond({ amount: Number(amount), covered: Number(amount) === 0 });
  } catch (error) {
    console.error('freo-checkout failed', error);
    return respond({ error: error instanceof Error ? error.message : 'Não foi possível validar o pedido' }, 400);
  }
});
