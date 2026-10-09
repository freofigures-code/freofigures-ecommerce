import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return respond({ error: 'Método inválido' }, 405);
  try {
    const { order_id } = await request.json();
    if (!Number.isSafeInteger(order_id) || order_id <= 0) return respond({ error: 'Pedido inválido' }, 400);
    const url = Deno.env.get('SUPABASE_URL')!;
    const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data: order, error } = await service.from('orders')
      .select('id,user_id,status,total,payment_id,freo_verified_paid_amount,freo_credits_used,freo_rewards_eligible,is_digital')
      .eq('id', order_id).single();
    if (error || !order || !order.freo_rewards_eligible || !['pago', 'pendente', 'producao', 'enviado', 'entregue'].includes(String(order.status).toLowerCase())) return respond({ confirmed: false });
    if (order.freo_verified_paid_amount !== null) return respond({ confirmed: true });
    const paymentId = String(order.payment_id || '');
    if (!/^\d{5,30}$/.test(paymentId)) return respond({ confirmed: false });
    const token = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN');
    if (!token) throw new Error('MERCADOPAGO_ACCESS_TOKEN não configurado');
    const result = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!result.ok) throw new Error(`Consulta de pagamento falhou: ${result.status}`);
    const payment = await result.json();
    const paidCents = Math.round(Number(payment.transaction_amount) * 100);
    const orderCents = Math.round(Number(order.total) * 100);
    if (String(payment.id) !== paymentId
        || String(payment.metadata?.user_id || '') !== order.user_id
        || (order.is_digital && (String(payment.metadata?.digital_order_id || '') !== String(order.id)
          || String(payment.external_reference || '') !== 'digital:' + order.id))
        || !Number.isSafeInteger(paidCents) || paidCents !== orderCents) {
      return respond({ confirmed: false });
    }
    if (['rejected', 'cancelled'].includes(payment.status) && order.status === 'pendente') {
      if (Number(order.freo_credits_used) > 0) {
        const refund = await service.rpc('freo_release_order_credits', { p_order_id: order.id, p_payment_id: paymentId });
        if (refund.error) throw refund.error;
      } else if (order.is_digital) {
        const cancelled = await service.from('orders').update({ status: 'cancelado' }).eq('id', order.id).eq('status', 'pendente');
        if (cancelled.error) throw cancelled.error;
      }
      return respond({ confirmed: false, rejected: true });
    }
    if (payment.status !== 'approved' || payment.status_detail === 'partially_refunded') return respond({ confirmed: false });
    const { error: confirmError } = await service.rpc('freo_confirm_paid_order', {
      p_order_id: order.id, p_payment_id: paymentId, p_paid_amount: paidCents / 100,
    });
    if (confirmError) throw confirmError;
    return respond({ confirmed: true });
  } catch (error) {
    console.error('freo-payment-sync failed', error);
    return respond({ confirmed: false }, 500);
  }
});
