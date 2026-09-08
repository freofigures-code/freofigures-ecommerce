import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/produto', import.meta.url), 'utf8');
const section = html.slice(html.indexOf('    var allReviews'), html.indexOf('    // ── Integra ao renderProduct'));
function setup({ session = { user: { id: 'buyer', email: 'buyer@example.com' } }, eligibility = 'eligible', error = null } = {}) {
  const calls = [];
  const elements = new Map();
  const context = vm.createContext({
    URL, console: { error() {} }, setTimeout() {},
    document: { getElementById(id) {
      if (!elements.has(id)) elements.set(id, { value: 'Produto recebido', style: {}, classList: { remove() {} } });
      return elements.get(id);
    } },
    window: { supabaseClient: {
      auth: { async getSession() { return { data: { session } }; } },
      async rpc(name, args) { calls.push({ name, args }); return { data: eligibility, error }; },
      from(table) { return { async insert(row) { calls.push({ table, row }); return {}; } }; }
    } }
  });
  vm.runInContext(section, context);
  context.reviewProductId = 15;
  return { context, calls, elements };
}

test('all inline product scripts parse', () => {
  for (const [, attributes, code] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (!attributes.includes('application/ld+json')) new vm.Script(code);
  }
});

test('guests and anonymous checkout sessions cannot review', async () => {
  for (const session of [null, { user: { id: 'guest', is_anonymous: true } }]) {
    const { context, calls } = setup({ session });
    assert.equal((await context.checkVerifiedBuyer(15)).verified, false);
    assert.equal(calls.length, 0);
  }
});

test('eligibility uses the exact product ID and server response', async () => {
  const { context, calls } = setup();
  assert.equal((await context.checkVerifiedBuyer(15)).verified, true);
  assert.equal(calls[0].name, 'product_review_eligibility');
  assert.equal(calls[0].args.p_product_id, '15');
});

test('duplicates, non-delivered purchases and database errors fail closed', async () => {
  for (const options of [{ eligibility: 'not_delivered' }, { eligibility: 'already_reviewed' }, { error: { message: 'offline' } }]) {
    const { context, calls, elements } = setup(options);
    const buyer = await context.checkVerifiedBuyer(15);
    assert.equal(buyer.verified, false);
    await context.submitReview();
    assert.equal(calls.some(c => c.table === 'product_reviews'), false);
    assert.equal(elements.get('btn-submit-review').disabled, false);
  }
});

test('a verified buyer can publish a real review', async () => {
  const { context, calls } = setup();
  await context.submitReview();
  const write = calls.find(c => c.table === 'product_reviews');
  assert.equal(write.row.product_id, '15');
  assert.equal(write.row.user_id, 'buyer');
  assert.equal(write.row.is_artificial, false);
  assert.equal(write.row.rating, 5);
});

test('artificial reviews are excluded from the list and rating average', async () => {
  const { context, elements } = setup({ eligibility: 'not_delivered' });
  const filters = [];
  context.window.supabaseClient.from = () => ({ select() { return this; }, eq(...args) { filters.push(args); return this; },
    async order() { return { data: [
      { is_artificial: true, rating: 5, comment: 'Fake' },
      { is_artificial: false, rating: 3, comment: 'Real' },
      { rating: 5, comment: 'Unknown' }
    ] }; }
  });
  await context.loadReviews(15);
  assert.equal(context.allReviews.length, 1);
  assert.equal(elements.get('rating-avg-num').textContent, '3.0');
  assert.match(elements.get('reviews-list').innerHTML, /Real/);
  assert.doesNotMatch(elements.get('reviews-list').innerHTML, /Fake|Unknown/);
  assert.ok(filters.some(([k, v]) => k === 'is_artificial' && v === false));
});

test('review names, comments and media cannot inject markup or event handlers', () => {
  const { context } = setup();
  const markup = context.reviewCardHTML({ reviewer_name: '<img onerror=alert(1)>', rating: 5,
    comment: '<script>alert(1)</script>', media_urls: ['javascript:alert(1)', 'https://example.com/a\" onerror=\"alert(1).jpg'] });
  assert.doesNotMatch(markup, /<script>|<img onerror|src="javascript:| onerror="/);
  assert.match(markup, /&lt;img/);
});
