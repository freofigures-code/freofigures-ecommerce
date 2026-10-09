import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const value = (result: { data: any; error: any }) => {
  if (result.error) throw result.error;
  return result.data;
};
const paidStatus = (status: string) => ['pago', 'producao', 'enviado', 'entregue'].includes(status.toLowerCase());
const cents = (amount: unknown) => Math.round(Number(amount) * 100);

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return reply({ error: 'Método inválido' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const authorization = request.headers.get('Authorization') || '';
    const client = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
    });
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user || auth.user.is_anonymous) return reply({ error: 'Entre em uma conta cadastrada' }, 401);
    const user = auth.user;
    const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const body = await request.json();
    const action = String(body.action || '');

    if (action === 'start') {
      const productId = Number(body.product_id);
      const requestId = String(body.request_id || '');
      if (!Number.isSafeInteger(productId) || productId <= 0 ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
        return reply({ error: 'Produto ou solicitação inválida' }, 400);
      }
      const orderId = value(await service.rpc('digital_create_order', {
        p_product_id: productId, p_user_id: user.id, p_request_id: requestId,
      }));
      const order = value(await service.from('orders').select('id,total,status').eq('id', orderId).single());
      return reply({ order_id: order.id, amount: Number(order.total), status: order.status });
    }

    if (action === 'library') {
      const pending = value(await service.from('orders').select('id,payment_id')
        .eq('user_id', user.id).eq('is_digital', true).eq('status', 'pendente')
        .is('freo_verified_paid_amount', null).order('created_at', { ascending: false }).limit(10));
      await Promise.allSettled(pending.filter((o: any) => /^\d{5,30}$/.test(String(o.payment_id || '')))
        .map((o: any) => fetch(url + '/functions/v1/freo-payment-sync', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order_id: o.id }),
        })));
      const entitlements = value(await service.from('digital_order_entitlements')
        .select('order_id,product_id,title,price,created_at')
        .eq('user_id', user.id).order('created_at', { ascending: false }));
      if (!entitlements.length) return reply({ items: [], pending: [] });
      const orders = value(await service.from('orders')
        .select('id,is_digital,status,freo_verified_paid_amount,payment_id,total,freo_credits_used')
        .in('id', entitlements.map((item: any) => item.order_id)));
      const valid = new Set(orders.filter((o: any) => o.is_digital === true &&
        o.freo_verified_paid_amount !== null && paidStatus(String(o.status))).map((o: any) => o.id));
      const pendingOrders = orders.filter((o: any) => o.is_digital === true && o.status === 'pendente'
        && o.freo_verified_paid_amount === null).map((o: any) => {
          const item = entitlements.find((e: any) => e.order_id === o.id);
          return { order_id: o.id, product_id: item.product_id, title: item.title, total: Number(o.total),
            freo_credits_used: o.freo_credits_used, payment_id: o.payment_id };
        });
      return reply({ items: entitlements.filter((item: any) => valid.has(item.order_id)), pending: pendingOrders });
    }

    const orderId = Number(body.order_id);
    if (!Number.isSafeInteger(orderId) || orderId <= 0) return reply({ error: 'Pedido inválido' }, 400);
    const order = value(await service.from('orders').select('*').eq('id', orderId).single());
    if (order.user_id !== user.id || !order.is_digital || !order.digital_validated || order.is_b2b) {
      return reply({ error: 'Pedido digital indisponível' }, 403);
    }

    if (action === 'status') {
      if (order.freo_verified_paid_amount === null && /^\d{5,30}$/.test(String(order.payment_id || ''))) {
        await fetch(url + '/functions/v1/freo-payment-sync', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order_id: orderId }),
        });
      }
      const fresh = value(await service.from('orders')
        .select('status,payment_id,freo_verified_paid_amount').eq('id', orderId).single());
      return reply({ confirmed: fresh.freo_verified_paid_amount !== null && paidStatus(String(fresh.status)),
        status: fresh.status });
    }

    if (action === 'pay') {
      if (order.freo_verified_paid_amount !== null && paidStatus(String(order.status))) return reply({ confirmed: true });
      if (order.status !== 'pendente') return reply({ error: 'Pedido não está pendente' }, 409);
      if (order.payment_id) {
        return reply({ order_id: orderId, payment_id: order.payment_id, qr_code: order.pix_qr_code,
          qr_code_base64: order.pix_qr_code_base64, ticket_url: order.pix_ticket_url });
      }
      const credits = Number(body.credits ?? 0);
      if (!Number.isSafeInteger(credits) || credits < 0 || credits > cents(Number(order.total) + Number(order.freo_credits_used || 0) / 10) / 10) {
        return reply({ error: 'Créditos inválidos para este pedido' }, 400);
      }
      if (order.freo_credits_used && order.freo_credits_used !== credits) {
        return reply({ error: 'Os créditos deste pedido já foram definidos' }, 409);
      }
      const expectedAmount = Number(order.total) - (order.freo_credits_used ? 0 : credits / 10);
      const cpf = String(body.cpf || '').replace(/\D/g, '');
      if (expectedAmount > 0 && !/^\d{11}$/.test(cpf)) return reply({ error: 'Informe um CPF válido para gerar o Pix' }, 400);
      let amount = Number(order.total);
      if (credits > 0 && !order.freo_credits_used) {
        amount = Number(value(await service.rpc('freo_apply_order_credits', {
          p_order_id: orderId, p_credits: credits, p_user_id: user.id,
        })));
      }
      if (amount === 0) {
        value(await service.rpc('freo_confirm_paid_order', {
          p_order_id: orderId, p_payment_id: 'freo-only:' + orderId, p_paid_amount: 0,
        }));
        return reply({ confirmed: true, order_id: orderId });
      }

      const token = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN');
      if (!token) throw new Error('Pagamento digital não configurado no servidor');
      const profile = value(await service.from('profiles').select('name').eq('id', user.id).maybeSingle());
      const parts = String(profile?.name || '').trim().split(/\s+/).filter(Boolean);
      const payment = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'X-Idempotency-Key': 'freo-digital-' + order.digital_request_id,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transaction_amount: amount,
          payment_method_id: 'pix',
          description: String(order.items?.[0]?.product_name || 'Arquivo 3D FreoFigures').slice(0, 100),
          external_reference: 'digital:' + orderId,
          notification_url: 'https://n8nwebhook.solviaoficial.com/webhook/notificacao-pagamento',
          payer: { email: user.email, first_name: parts[0] || 'Cliente',
            last_name: parts.slice(1).join(' ') || 'FreoFigures',
            identification: { type: 'CPF', number: cpf } },
          metadata: { user_id: user.id, digital_order_id: orderId },
        }),
      });
      const data = await payment.json();
      if (!payment.ok || !/^\d{5,30}$/.test(String(data.id || ''))) {
        return reply({ error: 'Não foi possível gerar o Pix. Tente novamente.' }, 502);
      }
      const transaction = data.point_of_interaction?.transaction_data || {};
      value(await service.from('orders').update({
        payment_id: String(data.id), pix_qr_code: transaction.qr_code || null,
        pix_qr_code_base64: transaction.qr_code_base64 || null,
        pix_ticket_url: transaction.ticket_url || null,
      }).eq('id', orderId).eq('user_id', user.id));
      let confirmed = false;
      if (data.status === 'approved' || data.status === 'rejected') {
        await fetch(url + '/functions/v1/freo-payment-sync', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order_id: orderId }),
        });
        const fresh = value(await service.from('orders')
          .select('status,freo_verified_paid_amount').eq('id', orderId).single());
        confirmed = fresh.freo_verified_paid_amount !== null && paidStatus(String(fresh.status));
      }
      return reply({ order_id: orderId, payment_id: String(data.id), qr_code: transaction.qr_code || null,
        qr_code_base64: transaction.qr_code_base64 || null, ticket_url: transaction.ticket_url || null, confirmed });
    }

    if (action === 'download') {
      const format = String(body.format || '');
      if (format !== 'stl' && format !== '3mf') return reply({ error: 'Formato inválido' }, 400);
      if (!paidStatus(String(order.status)) || order.freo_verified_paid_amount === null) {
        return reply({ error: 'O download será liberado após a confirmação do pagamento' }, 403);
      }
      if (!String(order.payment_id).startsWith('freo-only:')) {
        const token = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN');
        if (!token || !/^\d{5,30}$/.test(String(order.payment_id || ''))) return reply({ error: 'Pagamento indisponível' }, 403);
        const response = await fetch('https://api.mercadopago.com/v1/payments/' + order.payment_id, {
          headers: { Authorization: 'Bearer ' + token },
        });
        if (!response.ok) return reply({ error: 'Não foi possível conferir o pagamento agora' }, 503);
        const payment = await response.json();
        if (String(payment.id) !== String(order.payment_id) || payment.status !== 'approved' || payment.status_detail === 'partially_refunded' ||
            String(payment.metadata?.user_id || '') !== user.id ||
            cents(payment.transaction_amount) !== cents(order.freo_verified_paid_amount)) {
          return reply({ error: 'Pagamento não está ativo para download' }, 403);
        }
      }
      const entitlement = value(await service.from('digital_order_entitlements')
        .select('stl_path,mf3_path,product_id').eq('order_id', orderId).eq('user_id', user.id).single());
      const path = format === 'stl' ? entitlement.stl_path : entitlement.mf3_path;
      const filename = 'freofigures-' + entitlement.product_id + '.' + format;
      const signed = value(await service.storage.from('digital-print-files')
        .createSignedUrl(path, 60, { download: filename }));
      return reply({ url: signed.signedUrl, expires_in: 60 });
    }

    return reply({ error: 'Ação inválida' }, 400);
  } catch (error) {
    console.error('freo-digital-store failed', error);
    return reply({ error: error instanceof Error ? error.message : 'Não foi possível processar a compra digital' }, 400);
  }
});
