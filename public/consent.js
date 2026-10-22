(function () {
  'use strict';

  var storageKey = 'ff_cookies';
  var containerId = document.currentScript && document.currentScript.dataset.gtm;
  var gtmLoaded = false;
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

  function save(analytics, marketing) {
    var previous = prefs;
    var wasGtmLoaded = gtmLoaded;
    prefs = { essential: true, analytics: !!analytics, marketing: !!marketing, at: new Date().toISOString() };
    try { localStorage.setItem(storageKey, JSON.stringify(prefs)); } catch (_) { /* Consent still applies to this page. */ }
    window.gtag('consent', 'update', consentState(prefs));
    announce('ff_consent_update');
    window.dispatchEvent(new Event('ff_consent_update'));
    if (typeof window.clarity === 'function') {
      window.clarity('consentv2', {
        analytics_Storage: prefs.analytics ? 'granted' : 'denied',
        ad_Storage: prefs.marketing ? 'granted' : 'denied'
      });
    }
    loadGtm();
    // Existing tags need a fresh page to apply a changed choice immediately.
    if (wasGtmLoaded && previous && (previous.analytics !== prefs.analytics || previous.marketing !== prefs.marketing)) {
      location.reload();
      return;
    }
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
