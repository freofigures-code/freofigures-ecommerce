/* FreoFigures — Black Friday na página do produto.
 * Lê a campanha em store_campaigns (ligada em /admin/black-friday.html).
 * O preço continua sendo o promotional_price; aqui só entra o visual e a urgência
 * (contador até o fim da campanha e estoque baixo REAL do produto).
 * produto-apple.js chama FreoBlackFriday.updatePrice(...) e .updateStock(...). */
(function () {
  'use strict';
  var campaign = null, live = false, priceState = null, stockState = 0, ticker = null, boundaryTimer = null;

  function el(id) { return document.getElementById(id); }
  function ms(iso) { return iso ? new Date(iso).getTime() : NaN; }
  function brl(n) { return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function pad(n) { return String(n).padStart(2, '0'); }

  function isLive(c) {
    if (!c || !c.is_active) return false;
    var now = Date.now(), start = ms(c.starts_at), end = ms(c.ends_at);
    if (isFinite(start) && now < start) return false;
    if (isFinite(end) && now >= end) return false;
    return true;
  }

  function preview(base) {
    if (new URLSearchParams(location.search).get('bf_preview') !== '1') return null;
    var c = Object.assign({ headline: 'Black Friday FreoFigures', low_stock_threshold: 5 }, base || {});
    c.is_active = true; c.starts_at = null;
    if (!(ms(c.ends_at) > Date.now())) c.ends_at = new Date(Date.now() + 3 * 864e5).toISOString();
    return c;
  }

  function countdownText() {
    var left = ms(campaign && campaign.ends_at) - Date.now();
    if (!isFinite(left)) return null;
    var s = Math.max(0, Math.floor(left / 1000));
    var d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    return (d > 0 ? d + 'd ' : '') + pad(h) + ':' + pad(m) + ':' + pad(s % 60);
  }

  function endLabel() {
    var end = ms(campaign && campaign.ends_at);
    if (!isFinite(end)) return 'Preço especial por tempo limitado.';
    var d = new Date(end);
    return 'Preço Black Friday válido até ' + d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '.';
  }

  function ensureNodes() {
    if (!el('bf-strip')) {
      var strip = document.createElement('div');
      strip.id = 'bf-strip'; strip.className = 'bf-strip'; strip.hidden = true;
      strip.innerHTML = '<span class="bf-chip">Black Friday</span><span class="bf-strip-copy"></span><span class="bf-strip-sep" aria-hidden="true">·</span><span>termina em <strong class="bf-clock" data-bf-clock></strong></span>';
      document.body.insertBefore(strip, document.body.firstChild);
    }
    var priceLine = document.querySelector('.price-line');
    if (priceLine && !el('bf-offer')) {
      var offer = document.createElement('div');
      offer.id = 'bf-offer'; offer.className = 'bf-offer'; offer.hidden = true;
      offer.innerHTML = '<div class="bf-offer-head"><span class="bf-chip">Black Friday</span><span class="bf-offer-timer" aria-live="off">Oferta termina em <strong class="bf-clock" data-bf-clock></strong></span></div>';
      priceLine.parentNode.insertBefore(offer, priceLine);
      var savings = document.createElement('p');
      savings.id = 'bf-savings'; savings.className = 'bf-savings-line'; savings.hidden = true;
      var caption = el('price-caption') || priceLine;
      caption.parentNode.insertBefore(savings, caption.nextSibling);
    }
    var stockBadge = el('estoque-badge');
    if (stockBadge && !el('bf-stock')) {
      var stock = document.createElement('div');
      stock.id = 'bf-stock'; stock.className = 'bf-stock'; stock.hidden = true;
      stock.innerHTML = '<div class="bf-stock-copy"><span class="bf-stock-dot" aria-hidden="true"></span><strong></strong></div><div class="bf-stock-bar" aria-hidden="true"><span></span></div>';
      stockBadge.parentNode.insertBefore(stock, stockBadge.nextSibling);
    }
    var actions = document.querySelector('.purchase-actions');
    if (actions && !el('bf-deadline')) {
      var deadline = document.createElement('p');
      deadline.id = 'bf-deadline'; deadline.className = 'bf-deadline'; deadline.hidden = true;
      actions.insertBefore(deadline, actions.firstChild);
    }
  }

  function tick() {
    var text = countdownText();
    document.querySelectorAll('[data-bf-clock]').forEach(function (n) { n.textContent = text || 'tempo limitado'; });
    if (campaign && !isLive(campaign) && live) render();
  }

  function render() {
    live = isLive(campaign);
    document.documentElement.classList.toggle('bf-live', live);
    ensureNodes();
    var hasClock = live && isFinite(ms(campaign.ends_at));
    var strip = el('bf-strip');
    if (strip) {
      strip.hidden = !live;
      if (live) {
        strip.querySelector('.bf-strip-copy').textContent = campaign.headline || 'Black Friday';
        strip.querySelectorAll('.bf-strip-sep, .bf-strip-sep + span').forEach(function (n) { n.hidden = !hasClock; });
      }
    }
    var onSale = live && priceState && priceState.promo;
    if (el('bf-offer')) {
      el('bf-offer').hidden = !onSale;
      el('bf-offer').querySelector('.bf-offer-timer').hidden = !hasClock;
    }
    if (el('bf-savings')) {
      el('bf-savings').hidden = !onSale;
      if (onSale) el('bf-savings').textContent = 'Você economiza ' + brl(priceState.oldPrice - priceState.effective) + ' nesta Black Friday';
    }
    if (el('bf-deadline')) {
      el('bf-deadline').hidden = !onSale;
      if (onSale) el('bf-deadline').textContent = endLabel();
    }
    var limit = campaign ? Number(campaign.low_stock_threshold) || 5 : 5;
    var low = live && stockState > 0 && stockState <= limit;
    if (el('bf-stock')) {
      el('bf-stock').hidden = !low;
      if (low) {
        el('bf-stock').querySelector('strong').textContent = stockState === 1 ? 'Última unidade disponível!' : 'Restam só ' + stockState + ' unidades';
        el('bf-stock').querySelector('.bf-stock-bar span').style.width = Math.max(8, Math.round(stockState / limit * 100)) + '%';
      }
    }
    if (el('estoque-badge')) el('estoque-badge').classList.toggle('bf-hidden', low);
    if (live && !ticker) { tick(); ticker = setInterval(tick, 1000); }
    if (!live && ticker) { clearInterval(ticker); ticker = null; }
    scheduleBoundary();
  }

  function scheduleBoundary() {
    clearTimeout(boundaryTimer);
    if (!campaign) return;
    var now = Date.now();
    var next = [ms(campaign.starts_at), ms(campaign.ends_at)].filter(function (t) { return isFinite(t) && t > now; }).sort(function (a, b) { return a - b; })[0];
    if (next !== undefined) boundaryTimer = setTimeout(render, Math.min(next - now + 50, 2147483647));
  }

  window.FreoBlackFriday = {
    isLive: function () { return live; },
    updatePrice: function (state) { priceState = state; if (campaign) render(); },
    updateStock: function (count) { stockState = Math.max(0, Math.floor(Number(count) || 0)); if (campaign) render(); },
  };

  async function load() {
    var data = null;
    try {
      var client = window.supabaseClient;
      if (client) {
        var r = await client.from('store_campaigns').select('*').eq('id', 'black_friday').maybeSingle();
        if (!r.error) data = r.data;
      }
    } catch (e) { /* sem campanha = sem visual */ }
    campaign = preview(data) || data;
    if (campaign) render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load); else load();
})();
