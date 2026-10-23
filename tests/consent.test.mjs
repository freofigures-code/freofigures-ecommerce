import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const code = readFileSync(new URL('../public/consent.js', import.meta.url), 'utf8');

function start(saved = null, containerId = 'GTM-PSSBXMVL') {
  const scripts = [];
  const dataLayer = [];
  const stored = new Map(saved ? [['ff_cookies', JSON.stringify(saved)]] : []);
  let reloads = 0;
  const document = {
    currentScript: { dataset: { gtm: containerId } },
    readyState: 'loading',
    referrer: '',
    head: { appendChild(node) { scripts.push(node); } },
    createElement() { return {}; },
    addEventListener() {},
    getElementById() { return null; }
  };
  const listeners = new Map();
  const window = {
    dataLayer,
    addEventListener(name, listener) { listeners.set(name, listener); },
    dispatchEvent(event) { listeners.get(event.type)?.(event); }
  };
  const localStorage = {
    getItem(key) { return stored.get(key) ?? null; },
    setItem(key, value) { stored.set(key, value); },
    removeItem(key) { stored.delete(key); }
  };
  const session = new Map();
  const sessionStorage = { getItem(key) { return session.get(key) ?? null; }, setItem(key, value) { session.set(key, value); } };
  runInNewContext(code, { window, document, localStorage, sessionStorage, location: { href: 'https://freofigures.com.br/checkout.html?payment_id=private', pathname: '/checkout.html', reload() { reloads++; } }, URL, Date, JSON, Math, Promise, Event: class { constructor(type) { this.type = type; } }, encodeURIComponent });
  return { window, scripts, dataLayer, stored, localStorage, get reloads() { return reloads; } };
}

function consentCommands(dataLayer) {
  return dataLayer.filter(item => item[0] === 'consent').map(item => [item[1], item[2]]);
}

test('new visitor loads analytics only after consent and advertising only after marketing', () => {
  const page = start();
  assert.equal(page.scripts.length, 0);
  assert.equal(consentCommands(page.dataLayer)[0][1].analytics_storage, 'denied');
  assert.equal(consentCommands(page.dataLayer)[0][1].ad_storage, 'denied');
  page.window.FreoConsent.save(false, false);
  assert.equal(page.scripts.length, 0);
  page.window.FreoConsent.save(true, false);
  assert.equal(page.scripts.length, 1);
  assert.match(page.scripts[0].src, /gtag\/js\?id=G-M6TC25ZLMD$/);
  assert.equal(page.dataLayer.find(item => item[0] === 'config')[2].page_location, 'https://freofigures.com.br/checkout.html');
  page.window.FreoConsent.save(true, true);
  assert.equal(page.reloads, 1);
  const reloaded = start(JSON.parse(page.stored.get('ff_cookies')));
  assert.equal(reloaded.scripts.length, 2);
  assert.ok(reloaded.scripts.some(script => /gtm\.js\?id=GTM-PSSBXMVL$/.test(script.src)));
  assert.equal(consentCommands(page.dataLayer).at(-1)[1].analytics_storage, 'granted');
  assert.equal(consentCommands(page.dataLayer).at(-1)[1].ad_storage, 'granted');
  assert.ok(reloaded.dataLayer.findIndex(item => item.event === 'gtm.js') > reloaded.dataLayer.findIndex(item => item[0] === 'consent' && item[1] === 'update'));
});

test('first-party page and checkout stages require analytics consent and omit URL parameters', async () => {
  const page = start();
  const inserted = [];
  page.window.supabaseClient = { from(table) {
    assert.equal(table, 'analytics_events');
    return { insert(row) { inserted.push(row); return Promise.resolve({ error: null }); } };
  } };
  page.window.FreoAnalytics.pageView();
  assert.equal(inserted.length, 0);
  page.window.FreoConsent.save(true, false);
  page.window.FreoAnalytics.pageView();
  page.window.FreoAnalytics.event('begin_checkout', {});
  page.window.FreoAnalytics.event('view_item', { items: [{ item_id: '42', item_name: 'Figure' }] });
  await Promise.resolve();
  assert.deepEqual(inserted.map(row => row.event_type), ['page_view', 'begin_checkout', 'product_click']);
  assert.ok(inserted.every(row => row.page === '/checkout.html'));
  assert.equal(inserted[2].product_id, '42');
  assert.equal(inserted[2].product_name, null);
  assert.equal(inserted[0].session_id, inserted[1].session_id);
});

test('saved preferences reach the data layer before GTM loads', () => {
  const page = start({ essential: true, analytics: false, marketing: true, at: '2026-10-22' });
  assert.equal(page.scripts.length, 1);
  assert.equal(consentCommands(page.dataLayer)[1][1].analytics_storage, 'denied');
  assert.equal(consentCommands(page.dataLayer)[1][1].ad_storage, 'granted');
  assert.equal(page.window.FreoConsent.allows('analytics'), false);
  assert.equal(page.window.FreoConsent.allows('marketing'), true);
});

test('saved analytics-only consent does not load the advertising container', () => {
  const page = start({ essential: true, analytics: true, marketing: false, at: '2026-10-22' });
  assert.equal(page.scripts.length, 1);
  assert.match(page.scripts[0].src, /gtag\/js\?id=G-M6TC25ZLMD$/);
  assert.equal(consentCommands(page.dataLayer)[1][1].analytics_storage, 'granted');
  assert.equal(consentCommands(page.dataLayer)[1][1].ad_storage, 'denied');
});

test('GA4 events require analytics consent and target only the GA4 property', () => {
  const page = start();
  assert.equal(page.window.FreoAnalytics.event('view_cart', { currency: 'BRL', value: 10 }), false);
  assert.equal(page.dataLayer.filter(item => item[0] === 'event').length, 0);
  page.window.FreoConsent.save(true, false);
  assert.equal(page.window.FreoAnalytics.event('view_cart', { currency: 'BRL', value: 10 }), true);
  const command = page.dataLayer.find(item => item[0] === 'event');
  assert.equal(command[1], 'view_cart');
  assert.equal(command[2].send_to, 'G-M6TC25ZLMD');
  page.window.FreoConsent.save(false, false);
  assert.equal(page.reloads, 1);
  assert.equal(page.window.FreoAnalytics.event('view_cart', {}), false);
});

test('GA4 ecommerce items omit customer-written creation titles and identifiers', () => {
  const page = start({ essential: true, analytics: true, marketing: false });
  const items = page.window.FreoAnalytics.items([
    { product_id: 'custom-11111111-1111-4111-8111-111111111111', product_name: 'Modelo 3D personalizado — Nome privado', price: 42, quantity: 1, custom_product: true },
    { product_id: '25', product_name: 'Figure', price: 'R$ 1.234,50', quantity: 2 }
  ]);
  assert.equal(items[0].item_id, 'custom-model-3d');
  assert.equal(items[0].item_name, 'Modelo 3D personalizado');
  assert.equal(items[1].price, 1234.5);
  assert.equal(items[1].quantity, 2);
});

test('changing consent after GTM loaded reloads to stop old tags', () => {
  const page = start({ essential: true, analytics: true, marketing: true, at: '2026-10-22' });
  page.window.FreoConsent.save(false, false);
  assert.equal(page.reloads, 1);
  assert.equal(page.window.FreoConsent.allows('analytics'), false);
  assert.equal(JSON.parse(page.stored.get('ff_cookies')).marketing, false);
  assert.equal(consentCommands(page.dataLayer).at(-1)[1].ad_storage, 'denied');
});

test('extensionless product route uses the consent loader', () => {
  const product = readFileSync(new URL('../public/produto', import.meta.url), 'utf8');
  assert.match(product, /<script src="\/consent\.js" data-gtm="GTM-PSSBXMVL"><\/script>/);
  assert.doesNotMatch(product, /googletagmanager\.com\/gtm\.js/);
});

test('affiliate attribution waits for marketing consent and clears on revocation', async () => {
  const page = start();
  let clicks = 0;
  page.window.supabaseClient = { rpc: async () => { clicks++; return { data: true }; } };
  const affiliate = readFileSync(new URL('../public/affiliate-referral.js', import.meta.url), 'utf8');
  const ref = '11111111-1111-4111-8111-111111111111';
  runInNewContext(affiliate, {
    window: page.window,
    localStorage: page.localStorage,
    location: { search: `?af=${ref}` },
    crypto: { randomUUID: () => ref },
    URLSearchParams, Date, JSON, Number
  });
  assert.equal(await page.window.FreoAffiliate.capture(1), true);
  assert.equal(clicks, 0);
  page.window.FreoConsent.save(false, true);
  assert.equal(clicks, 1);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.window.FreoAffiliate.getToken(), ref);
  page.window.FreoConsent.save(false, false);
  assert.equal(page.window.FreoAffiliate.getToken(), null);
  assert.equal(page.stored.has('freo_affiliate_visitor'), false);
});
