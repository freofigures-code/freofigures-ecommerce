/**
 * auth-listener.js — FreoFigures
 *
 * ATENÇÃO: Este arquivo NÃO declara SUPABASE_URL nem SUPABASE_ANON_KEY com const/let.
 * Esses valores são declarados nos HTMLs individuais antes deste script ser carregado.
 * Usar const duas vezes no mesmo escopo causa SyntaxError e quebra toda a página.
 */
(function () {
  // Pega as credenciais já declaradas nos HTMLs, ou usa fallback
  var _url = (typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : null)
          || "https://rrmxqpvxrpcqqxsgccqw.supabase.co";
  var _key = (typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY : null)
          || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJybXhxcHZ4cnBjcXF4c2djY3F3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1OTc5MjcsImV4cCI6MjA4ODE3MzkyN30.v4IoG2wln2-4T-DZ9CKdrftEu4oI6-bLfE8gRlWzDYM";

  // Inicializa o cliente Supabase se ainda não foi inicializado
  if (!window.supabaseClient) {
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      window.supabaseClient = window.supabase.createClient(_url, _key);
    } else if (window.supabase) {
      window.supabaseClient = window.supabase;
    }
  }

  var db = window.supabaseClient;

  if (!db) {
    console.error("❌ Supabase SDK não encontrado. Inclua o CDN do Supabase ANTES do auth-listener.js");
    var p = window.location.pathname;
    if (['dashboard','meus-pedidos','checkout','admin'].some(function(x){ return p.includes(x); })) {
      window.location.href = '/login.html';
    }
    return;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function isProtected() {
    var p = window.location.pathname;
    return p.includes('dashboard') || p.includes('meus-pedidos') || p.includes('checkout') || p.includes('admin');
  }
  function isLogin() {
    return window.location.pathname.includes('login');
  }
  function el(id) { return document.getElementById(id); }

  // Formatador de moeda global
  window.formatCurrency = function(value) {
    var num = parseFloat(value);
    if (isNaN(num)) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num);
  };

  // ── Busca de dados (cada uma falha silenciosamente) ────────────────────────
  async function safeQuery(fn, label) {
    try {
      return await fn();
    } catch (e) {
      console.warn('⚠️ ' + label + ':', e.message);
      return null;
    }
  }

  async function fetchProfile(userId) {
    var result = await safeQuery(async function() {
      var r = await db.from('profiles').select('*').eq('id', userId).single();
      return r.data;
    }, 'profiles');
    return result;
  }

  async function fetchCartItems(userId) {
    var result = await safeQuery(async function() {
      var r = await db.from('cart_items').select('*').eq('user_id', userId);
      return r.data || [];
    }, 'cart_items');
    return result || [];
  }

  async function fetchAddresses(userId) {
    var result = await safeQuery(async function() {
      var r = await db.from('addresses').select('*').eq('user_id', userId);
      return r.data || [];
    }, 'addresses');
    return result || [];
  }

  async function fetchPaymentMethods(userId) {
    var result = await safeQuery(async function() {
      var r = await db.from('payment_methods').select('*').eq('user_id', userId);
      return r.data || [];
    }, 'payment_methods');
    return result || [];
  }

  // ── Atualiza DOM ───────────────────────────────────────────────────────────
  function showPageContent(user, profile) {
    if (el('loading-state'))     el('loading-state').classList.add('hidden');
    if (el('dashboard-content')) el('dashboard-content').classList.remove('hidden');
    if (el('logout-btn'))        el('logout-btn').classList.remove('hidden');
    if (el('my-orders-btn')) {
      el('my-orders-btn').classList.remove('hidden');
      el('my-orders-btn').classList.add('flex');
    }

    var name = (profile && (profile.full_name || profile.name))
      || (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name))
      || user.email.split('@')[0];

    if (el('user-name'))     el('user-name').innerText = 'Bem-vindo, ' + name + '!';
    if (el('user-email'))    el('user-email').innerText = user.email;
    if (el('user-greeting')) el('user-greeting').innerText = name;

    var avatarUrl = (profile && profile.avatar_url)
      || (user.user_metadata && user.user_metadata.avatar_url);
    if (avatarUrl && el('user-avatar')) {
      el('user-avatar').src = avatarUrl;
      el('user-avatar').classList.remove('hidden');
      if (el('user-avatar-placeholder')) el('user-avatar-placeholder').classList.add('hidden');
    } else if (el('user-avatar-placeholder')) {
      el('user-avatar-placeholder').innerText = name.charAt(0).toUpperCase();
    }

    var isAdmin = profile && profile.is_admin === true;
    if (isAdmin && el('user-name') && !document.getElementById('admin-badge')) {
      var badge = document.createElement('span');
      badge.id = 'admin-badge';
      badge.className = 'ml-4 align-middle inline-flex items-center px-3 py-1 rounded-full text-xs font-bold font-mono bg-freo-orange text-freo-black uppercase tracking-widest cursor-pointer';
      badge.innerText = 'ADMIN';
      badge.onclick = function() { window.location.href = '/admin/pedidos.html'; };
      el('user-name').appendChild(badge);
    }

    if (isAdmin && window.location.pathname.includes('/admin/') === false) {
      // ok, admin pode ver páginas normais
    }
    if (!isAdmin && window.location.pathname.includes('/admin/')) {
      alert('Acesso negado: área restrita a administradores');
      window.location.href = '/dashboard.html';
    }
  }

  function renderAddresses(addresses) {
    var container = el('addresses');
    var empty = el('addresses-empty');
    if (!container || !empty) return;
    if (addresses && addresses.length > 0) {
      container.innerHTML = addresses.map(function(addr) {
        return '<div class="p-4 border border-white/5 bg-freo-black relative">'
          + (addr.is_main || addr.is_default ? '<span class="absolute top-0 right-0 bg-freo-orange text-freo-black text-[10px] font-bold px-2 py-1 uppercase">Principal</span>' : '')
          + '<p class="font-body text-sm font-bold mb-1">' + (addr.street || addr.logradouro || 'Endereço') + ', ' + (addr.number || addr.numero || 'S/N') + '</p>'
          + '<p class="font-mono text-xs text-freo-light/50">' + (addr.city || addr.cidade || '') + ' - ' + (addr.state || addr.estado || '') + '</p>'
          + '<p class="font-mono text-xs text-freo-light/50 mt-1">CEP: ' + (addr.zip_code || addr.cep || '') + '</p>'
          + '</div>';
      }).join('');
    } else {
      empty.classList.remove('hidden');
    }
  }

  function renderPaymentMethods(methods) {
    var container = el('payment-methods');
    var empty = el('payments-empty');
    if (!container || !empty) return;
    if (methods && methods.length > 0) {
      container.innerHTML = methods.map(function(card) {
        return '<div class="p-4 border border-white/5 bg-freo-black flex items-center gap-3">'
          + '<div class="w-10 h-6 bg-white/10 rounded flex items-center justify-center text-[10px] font-bold uppercase">' + (card.brand || card.bandeira || 'CARD') + '</div>'
          + '<div>'
          + '<p class="font-mono text-sm">•••• •••• •••• ' + (card.last4 || card.ultimos_digitos || '****') + '</p>'
          + '<p class="font-mono text-[10px] text-freo-light/50">Exp: ' + (card.exp_month || '**') + '/' + (card.exp_year || '**') + '</p>'
          + '</div></div>';
      }).join('');
    } else {
      empty.classList.remove('hidden');
    }
  }

  window.renderCartUI = function(items) {
    var cartContainer = el('cart-items');
    var cartEmpty = el('cart-empty');
    var cartCount = el('cart-count');
    var cartTotalSection = el('cart-total-section');
    var cartTotalPrice = el('cart-total-price');
    if (!cartContainer || !cartEmpty || !cartCount) return;
    if (items && items.length > 0) {
      cartCount.innerText = items.length + ' item(s)';
      cartEmpty.classList.add('hidden');
      var total = 0;
      cartContainer.innerHTML = items.map(function(item) {
        var price = item.price || 0;
        var qty = item.quantity || 1;
        var subtotal = price * qty;
        total += subtotal;
        return '<div class="flex items-center gap-4 p-4 border border-white/5 bg-freo-black hover:border-freo-orange/50 transition-colors">'
          + '<div class="w-16 h-16 bg-white/5 flex-shrink-0 flex items-center justify-center overflow-hidden">'
          + (item.image_url ? '<img src="' + item.image_url + '" class="w-full h-full object-cover">' : '<svg class="w-6 h-6 text-white/20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>')
          + '</div>'
          + '<div class="flex-1 min-w-0">'
          + '<h3 class="font-display font-bold text-lg truncate">' + (item.product_name || item.name || 'Figura 3D') + '</h3>'
          + '<p class="font-mono text-xs text-freo-light/50">Qtd: ' + qty + ' × ' + window.formatCurrency(price) + '</p>'
          + '</div>'
          + '<div class="text-right flex flex-col items-end gap-2">'
          + '<p class="font-mono font-bold text-freo-orange">' + window.formatCurrency(subtotal) + '</p>'
          + '<button onclick="window.removeFromCart(\'' + item.id + '\')" class="text-xs font-mono text-red-500 hover:text-red-400 uppercase tracking-wider">Remover</button>'
          + '</div></div>';
      }).join('');
      if (cartTotalSection && cartTotalPrice) {
        cartTotalSection.classList.remove('hidden');
        cartTotalPrice.innerText = window.formatCurrency(total);
      }
    } else {
      cartContainer.innerHTML = '';
      cartCount.innerText = '0 itens';
      cartEmpty.classList.remove('hidden');
      if (cartTotalSection) cartTotalSection.classList.add('hidden');
    }
  };

  // ── FLUXO PRINCIPAL ────────────────────────────────────────────────────────
  async function init() {
    var sessionResult = await safeQuery(async function() {
      var r = await db.auth.getSession();
      return r.data && r.data.session;
    }, 'getSession');

    var session = sessionResult || null;

    if (!session) {
      // Sem sessão
      console.log('⚪ Sem sessão ativa.');
      if (isProtected()) {
        window.location.href = '/login.html';
        return;
      }
      window.dispatchEvent(new CustomEvent('auth-not-logged-in'));
      return;
    }

    // Com sessão
    var user = session.user;
    console.log('✅ Sessão ativa:', user.email);

    if (isLogin()) {
      window.location.href = '/dashboard.html';
      return;
    }

    // Mostra a UI IMEDIATAMENTE (não espera os dados)
    if (isProtected()) {
      showPageContent(user, null);
    }

    // Busca todos os dados EM PARALELO — qualquer erro individual não bloqueia
    var results = await Promise.allSettled([
      fetchProfile(user.id),
      fetchCartItems(user.id),
      fetchAddresses(user.id),
      fetchPaymentMethods(user.id)
    ]);

    var profile        = results[0].status === 'fulfilled' ? results[0].value : null;
    var cartItems      = results[1].status === 'fulfilled' ? results[1].value : [];
    var addresses      = results[2].status === 'fulfilled' ? results[2].value : [];
    var paymentMethods = results[3].status === 'fulfilled' ? results[3].value : [];

    // Atualiza UI com dados reais (nome, avatar)
    if (isProtected()) {
      showPageContent(user, profile);
      window.renderCartUI(cartItems);
      renderAddresses(addresses);
      renderPaymentMethods(paymentMethods);
    }

    // Dispara evento para páginas que precisam (meus-pedidos, checkout)
    window.dispatchEvent(new CustomEvent('auth-data-loaded', {
      detail: { user: user, profile: profile, cartItems: cartItems, paymentMethods: paymentMethods, addresses: addresses }
    }));
  }

  // Roda imediatamente
  init();

  // Listener para SIGNED_OUT e login via OAuth (Google)
  db.auth.onAuthStateChange(function(event, session) {
    if (event === 'SIGNED_OUT') {
      if (isProtected()) window.location.href = '/login.html';
    }
    if (event === 'SIGNED_IN' && isLogin()) {
      window.location.href = '/dashboard.html';
    }
  });

  // Remover item do carrinho
  window.removeFromCart = async function(itemId) {
    try {
      var r = await db.from('cart_items').delete().eq('id', itemId);
      if (r.error) throw r.error;
      var sessionR = await db.auth.getSession();
      var s = sessionR.data && sessionR.data.session;
      if (s) {
        var cartR = await db.from('cart_items').select('*').eq('user_id', s.user.id);
        window.renderCartUI(cartR.data || []);
      }
    } catch (e) {
      console.error('Erro ao remover item:', e);
      alert('Erro ao remover item do carrinho.');
    }
  };

})(); // IIFE — tudo encapsulado, sem poluir o escopo global com const/let
