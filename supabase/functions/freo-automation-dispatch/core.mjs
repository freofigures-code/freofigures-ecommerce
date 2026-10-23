import { tokenMatches } from '../freo-automation-api/core.mjs';

function reply(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

async function signature(secret, timestamp, body) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const hash = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(timestamp + '.' + body));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function createDispatchHandler({ db, workerToken, webhookUrl, signingSecret, fetchImpl = fetch, now = () => new Date() }) {
  return async request => {
    if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
    const credential = /^Bearer (\S+)$/i.exec(request.headers.get('authorization') || '')?.[1] || '';
    if (!await tokenMatches(credential, workerToken)) return reply({ error: 'unauthorized' }, 401);
    let destination;
    try { destination = new URL(webhookUrl); } catch { return reply({ error: 'not_configured' }, 503); }
    if (!signingSecret || signingSecret.length < 32 || destination.protocol !== 'https:' || destination.username || destination.password) return reply({ error: 'not_configured' }, 503);
    const claimed = await db.rpc('automation_claim_outbox', { p_limit: 20 });
    if (claimed.error) return reply({ error: 'claim_failed' }, 502);
    let delivered = 0, failed = 0;
    for (const event of claimed.data || []) {
      const body = JSON.stringify({ id: event.id, type: event.event_type, occurred_at: event.created_at, data: event.payload });
      const timestamp = String(Math.floor(now().getTime() / 1000));
      try {
        const response = await fetchImpl(webhookUrl, {
          method: 'POST', signal: AbortSignal.timeout(10000),
          headers: {
            'content-type': 'application/json',
            'x-freo-event-id': String(event.id),
            'x-freo-timestamp': timestamp,
            'x-freo-signature': 'sha256=' + await signature(signingSecret, timestamp, body),
          },
          body,
        });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const saved = await db.from('automation_outbox').update({ delivered_at: now().toISOString(), leased_until: null, last_error: null }).eq('id', event.id).eq('attempts', event.attempts);
        if (saved.error) throw new Error('delivery_state_update_failed');
        delivered++;
      } catch (error) {
        const delay = Math.min(3600, 15 * 2 ** Math.max(0, event.attempts - 1));
        const next = new Date(now().getTime() + delay * 1000).toISOString();
        const saved = await db.from('automation_outbox').update({ next_attempt_at: next, leased_until: null, last_error: String(error?.message || 'delivery_failed').slice(0, 200) }).eq('id', event.id).eq('attempts', event.attempts);
        if (saved.error) console.error('automation outbox retry update failed', event.id);
        failed++;
      }
    }
    return reply({ claimed: (claimed.data || []).length, delivered, failed });
  };
}
