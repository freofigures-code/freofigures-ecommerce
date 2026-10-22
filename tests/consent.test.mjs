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
  runInNewContext(code, { window, document, localStorage, location: { reload() { reloads++; } }, Date, JSON, Event: class { constructor(type) { this.type = type; } }, encodeURIComponent });
  return { window, scripts, dataLayer, stored, localStorage, get reloads() { return reloads; } };
}

function consentCommands(dataLayer) {
  return dataLayer.filter(item => item[0] === 'consent').map(item => [item[1], item[2]]);
}

test('new visitor has denied defaults and no GTM until choosing a category', () => {
  const page = start();
  assert.equal(page.scripts.length, 0);
  assert.equal(consentCommands(page.dataLayer)[0][1].analytics_storage, 'denied');
  assert.equal(consentCommands(page.dataLayer)[0][1].ad_storage, 'denied');
  page.window.FreoConsent.save(false, false);
  assert.equal(page.scripts.length, 0);
  page.window.FreoConsent.save(true, false);
  assert.equal(page.scripts.length, 1);
  assert.match(page.scripts[0].src, /gtm\.js\?id=GTM-PSSBXMVL$/);
  assert.equal(consentCommands(page.dataLayer).at(-1)[1].analytics_storage, 'granted');
  assert.equal(consentCommands(page.dataLayer).at(-1)[1].ad_storage, 'denied');
  assert.ok(page.dataLayer.findIndex(item => item.event === 'gtm.js') > page.dataLayer.findIndex(item => item[0] === 'consent' && item[1] === 'update'));
});

test('saved preferences reach the data layer before GTM loads', () => {
  const page = start({ essential: true, analytics: false, marketing: true, at: '2026-10-22' });
  assert.equal(page.scripts.length, 1);
  assert.equal(consentCommands(page.dataLayer)[1][1].analytics_storage, 'denied');
  assert.equal(consentCommands(page.dataLayer)[1][1].ad_storage, 'granted');
  assert.equal(page.window.FreoConsent.allows('analytics'), false);
  assert.equal(page.window.FreoConsent.allows('marketing'), true);
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
