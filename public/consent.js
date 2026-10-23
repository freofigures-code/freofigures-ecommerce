(function () {
  'use strict';

  var storageKey = 'ff_cookies';
  var containerId = document.currentScript && document.currentScript.dataset.gtm;
  var analyticsId = 'G-M6TC25ZLMD';
  var gtmLoaded = false;
  var analyticsLoaded = false;
  var reloading = false;
  var prefs = readPrefs();

  function readPrefs() {
    try {
      var value = JSON.parse(localStorage.getItem(storageKey));
      if (value && value.essential === true && typeof value.analytics === 'boolean' && typeof value.marketing === 'boolean') {
        return value;
      }
    } catch (_) { /* Storage can be unavailable in private browsing. */ }
    return null;
  }

  function consentState(value) {
    return {
      analytics_storage: value && value.analytics ? 'granted' : 'denied',
      ad_storage: value && value.marketing ? 'granted' : 'denied',
      ad_user_data: value && value.marketing ? 'granted' : 'denied',
      ad_personalization: value && value.marketing ? 'granted' : 'denied'
    };
  }

  // These commands must precede gtm.js, including on visits with saved consent.
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.gtag('consent', 'default', consentState(null));
  if (prefs) window.gtag('consent', 'update', consentState(prefs));

  function announce(eventName) {
    window.dataLayer.push({
      event: eventName,
      ff_analytics_consent: prefs && prefs.analytics ? 'granted' : 'denied',
      ff_marketing_consent: prefs && prefs.marketing ? 'granted' : 'denied'
    });
  }

  announce('ff_consent_state');

  function publicUrl(raw, keepCampaign) {
    if (!raw) return '';
    try {
      var source = new URL(raw);
      var safe = new URL(source.origin + source.pathname);
      if (keepCampaign) {
        ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(function (key) {
          if (source.searchParams.has(key)) safe.searchParams.set(key, source.searchParams.get(key));
        });
        if (prefs && prefs.marketing && source.searchParams.has('gclid')) safe.searchParams.set('gclid', source.searchParams.get('gclid'));
      }
      return safe.href;
    } catch (_) { return ''; }
  }

  function loadAnalytics() {
    if (analyticsLoaded || !prefs || !prefs.analytics || reloading) return;
    analyticsLoaded = true;
    var config = {
      page_location: publicUrl(location.href, true),
      allow_google_signals: false,
      allow_ad_personalization_signals: false
    };
    var referrer = publicUrl(document.referrer, false);
    if (referrer) config.page_referrer = referrer;
    window.gtag('js', new Date());
    window.gtag('config', analyticsId, config);
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + analyticsId;
    document.head.appendChild(script);
  }

  function items(rows) {
    return (Array.isArray(rows) ? rows : []).map(function (row) {
      if (!row) return null;
      var id = row.item_id || row.product_id || row.productId || row.id;
      var name = row.item_name || row.product_name || row.name || row.title;
      if (!id && !name) return null;
      // Personalized creations can contain a customer-written title and UUID.
      if (row.custom_product || /^custom-/i.test(String(id || '')) || /^Modelo 3D personalizado/i.test(String(name || ''))) {
        id = 'custom-model-3d';
        name = 'Modelo 3D personalizado';
      }
      var item = {};
      if (id) item.item_id = String(id);
      if (name) item.item_name = String(name);
      var rawPrice = row.priceValue !== undefined ? row.priceValue : row.price;
      var price = typeof rawPrice === 'string' && rawPrice.indexOf(',') !== -1
        ? Number(rawPrice.replace(/[^\d,]/g, '').replace(',', '.')) : Number(rawPrice);
      if (Number.isFinite(price) && price >= 0) item.price = price;
      var quantity = Number(row.quantity);
      if (Number.isFinite(quantity) && quantity > 0) item.quantity = quantity;
      if (row.item_category || row.category) item.item_category = String(row.item_category || row.category);
      return item;
    }).filter(Boolean);
  }

  var lastLocalPageView = '';
  function recordLocalEvent(name, productId, productName) {
    if (['page_view', 'view_item', 'add_to_cart', 'view_cart', 'begin_checkout', 'purchase'].indexOf(name) === -1) return;
    var db = window.supabaseClient;
    if (!db || !db.from) return;
    try {
      var page = location.pathname;
      if (name === 'page_view' && lastLocalPageView === page) return;
      var sid = sessionStorage.getItem('freo_sid');
      if (!sid) {
        sid = 'sid_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
        sessionStorage.setItem('freo_sid', sid);
      }
      Promise.resolve(db.from('analytics_events').insert({
        event_type: name === 'view_item' ? 'product_click' : name,
        product_id: productId || null, product_name: productName || null,
        page: page, session_id: sid
      })).catch(function () {});
      if (name === 'page_view') lastLocalPageView = page;
    } catch (_) { /* Optional measurement must never interrupt checkout. */ }
  }

  window.FreoAnalytics = {
    pageView: function () {
      if (reloading || !prefs || !prefs.analytics) return false;
      recordLocalEvent('page_view');
      return true;
    },
    event: function (name, parameters) {
      if (reloading || !prefs || !prefs.analytics) return false;
      loadAnalytics();
      window.gtag('event', name, Object.assign({}, parameters || {}, { send_to: analyticsId }));
      var firstItem = parameters && Array.isArray(parameters.items) && parameters.items[0];
      var productId = firstItem && /^\d+$/.test(String(firstItem.item_id || '')) ? String(firstItem.item_id) : null;
      recordLocalEvent(name, productId);
      return true;
    },
    items: items
  };

  // Static pages have no React tracker. Product pages add their product ID
  // through produto-apple.js, so they are measured there instead.
  function recordPageView() {
    if (location.pathname.indexOf('/produto') !== 0) window.FreoAnalytics.pageView();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', recordPageView);
  else recordPageView();

  function loadGtm() {
    // This container currently holds advertising tags. Analytics-only consent
    // must not load it until a consent-gated analytics tag is added to GTM.
    if (!containerId || gtmLoaded || !prefs || !prefs.marketing) return;
    gtmLoaded = true;
    window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(containerId);
    document.head.appendChild(script);
  }

  loadGtm();
  loadAnalytics();

  function save(analytics, marketing) {
    var previous = prefs;
    var wasGtmLoaded = gtmLoaded;
    var wasAnalyticsLoaded = analyticsLoaded;
    prefs = { essential: true, analytics: !!analytics, marketing: !!marketing, at: new Date().toISOString() };
    reloading = !!(previous && (wasGtmLoaded || wasAnalyticsLoaded) &&
      (previous.analytics !== prefs.analytics || previous.marketing !== prefs.marketing));
    try { localStorage.setItem(storageKey, JSON.stringify(prefs)); } catch (_) { /* Consent still applies to this page. */ }
    window.gtag('consent', 'update', consentState(prefs));
    announce('ff_consent_update');
    window.dispatchEvent(new Event('ff_consent_update'));
    recordPageView();
    if (typeof window.clarity === 'function') {
      window.clarity('consentv2', {
        analytics_Storage: prefs.analytics ? 'granted' : 'denied',
        ad_Storage: prefs.marketing ? 'granted' : 'denied'
      });
    }
    // Unload previously active tags before changing a granted category.
    if (reloading) {
      location.reload();
      return;
    }
    loadGtm();
    loadAnalytics();
    render();
  }

  window.FreoConsent = {
    allows: function (category) { return !!(prefs && prefs[category] === true); },
    get: function () { return prefs ? { analytics: prefs.analytics, marketing: prefs.marketing } : null; },
    save: save,
    open: function () { render(true); }
  };

  function render(forceOpen) {
    var panel = document.getElementById('ff-consent-panel');
    var settings = document.getElementById('ff-consent-settings');
    if (!panel || !settings) return;
    var open = !!forceOpen || !prefs;
    panel.hidden = !open;
    settings.hidden = open;
    if (open) {
      document.getElementById('ff-consent-analytics').checked = !!(prefs && prefs.analytics);
      document.getElementById('ff-consent-marketing').checked = !!(prefs && prefs.marketing);
    }
  }

  function mount() {
    var style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = '/consent.css';
    document.head.appendChild(style);

    var wrapper = document.createElement('div');
    wrapper.id = 'ff-consent';
    wrapper.innerHTML = '<button type="button" id="ff-consent-settings" aria-label="Rever preferências de privacidade" hidden>Privacidade</button>' +
      '<section id="ff-consent-panel" role="dialog" aria-label="Preferências de privacidade" hidden>' +
      '<div class="ff-consent-copy"><strong>Sua privacidade importa</strong><p>Usamos dados necessários para a loja funcionar. Análise de uso e marketing são opcionais. Leia a <a href="/politicas.html">Política de Privacidade</a>.</p></div>' +
      '<div class="ff-consent-options"><label><input id="ff-consent-analytics" type="checkbox"> Analíticos</label><label><input id="ff-consent-marketing" type="checkbox"> Marketing</label></div>' +
      '<div class="ff-consent-actions"><button type="button" id="ff-consent-reject">Recusar opcionais</button><button type="button" id="ff-consent-save">Salvar escolhas</button><button type="button" id="ff-consent-all">Aceitar todos</button></div>' +
      '</section>';
    document.body.appendChild(wrapper);
    document.getElementById('ff-consent-settings').addEventListener('click', function () { render(true); });
    document.getElementById('ff-consent-reject').addEventListener('click', function () { save(false, false); });
    document.getElementById('ff-consent-all').addEventListener('click', function () { save(true, true); });
    document.getElementById('ff-consent-save').addEventListener('click', function () {
      save(document.getElementById('ff-consent-analytics').checked, document.getElementById('ff-consent-marketing').checked);
    });
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
