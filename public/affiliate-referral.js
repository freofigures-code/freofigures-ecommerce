(function () {
  'use strict';
  var key = 'freo_affiliate_visitor';
  var uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  function getToken() {
    try {
      var saved = localStorage.getItem(key);
      if (!saved) return null;
      var data = JSON.parse(saved);
      if (data && uuid.test(data.token) && Number(data.expires) > Date.now()) return data.token;
      localStorage.removeItem(key);
      return null;
    } catch (_) { return null; }
  }
  async function capture(productId) {
    var code = new URLSearchParams(location.search).get('af');
    if (!code) return true;
    if (!uuid.test(code) || !Number.isSafeInteger(Number(productId))) return false;
    var token = getToken() || crypto.randomUUID();
    var result = await window.supabaseClient.rpc('affiliate_record_click', {
      p_link_id: code, p_product_id: Number(productId), p_visitor_token: token
    });
    if (result.error || result.data !== true) return false;
    try { localStorage.setItem(key, JSON.stringify({ token: token, expires: Date.now() + 30 * 86400000 })); }
    catch (_) { return false; }
    return true;
  }
  window.FreoAffiliate = { getToken: getToken, capture: capture };
})();
