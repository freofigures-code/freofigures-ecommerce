(function () {
  var _url = (typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : null)
          || "https://rrmxqpvxrpcqqxsgccqw.supabase.co";

  var _key = (typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY : null)
          || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJybXhxcHZ4cnBjcXF4c2djY3F3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1OTc5MjcsImV4cCI6MjA4ODE3MzkyN30.v4IoG2wln2-4T-DZ9CKdrftEu4oI6-bLfE8gRlWzDYM";

  if (!window.supabaseClient) {
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      window.supabaseClient = window.supabase.createClient(_url, _key);
    } else if (window.supabase) {
      window.supabaseClient = window.supabase;
    }
  }

  var db = window.supabaseClient;

  if (!db) {
    console.error("❌ Supabase SDK não encontrado.");

    var p = window.location.pathname;

    if (['dashboard', 'meus-pedidos', 'checkout', 'admin'].some(function(x) {
      return p.includes(x);
    })) {
      window.location.href = '/login.html';
    }

    return;
  }

  function isProtected() {
    var p = window.location.pathname;

    return p.includes('dashboard')
      || p.includes('meus-pedidos')
      || p.includes('checkout')
      || p.includes('admin');
  }

  function isAdminPage() {
    return window.location.pathname.includes('/admin/');
  }

  function isLogin() {
    return window.location.pathname.includes('login');
  }

  function el(id) {
    return document.getElementById(id);
  }

  function escapeHTML(value) {
    if (value === null || value === undefined) return '';

    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  window.formatCurrency = function(value) {
    var num = parseFloat(value);

    if (isNaN(num)) return 'R$ 0,00';

    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(num);
  };

  // ── Queries individuais — falham silenciosamente ───────────────────────────
  async function fetchProfile(userId) {
    try {
      var r = await db
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (r.error) {
        console.warn('⚠️ profiles:', r.error.message, r.error.code);
        return null;
      }

      return r.data;
    } catch(e) {
      console.warn('⚠️ fetchProfile:', e.message);
      return null;
    }
  }

  async function fetchCartItems(userId) {
    try {
      var r = await db
        .from('cart_items')
        .select('*')
        .eq('user_id', userId);

      return r.data || [];
    } catch(e) {
      return [];
    }
  }

  async function fetchAddresses(userId) {
    try {
      var r = await db
        .from('addresses')
        .select('*')
        .eq('user_id', userId);

      return r.data || [];
    } catch(e) {
      return [];
    }
  }

  async function fetchPaymentMethods(userId) {
    try {
      var r = await db
        .from('payment_methods')
        .select('*')
        .eq('user_id', userId);

      return r.data || [];
    } catch(e) {
      return [];
    }
  }

  // ── Atualiza DOM dashboard/cliente ─────────────────────────────────────────
  function showPageContent(user, profile) {
    if (el('loading-state')) {
      el('loading-state').classList.add('hidden');
    }

    if (el('dashboard-content')) {
      el('dashboard-content').classList.remove('hidden');
    }

    if (el('logout-btn')) {
      el('logout-btn').classList.remove('hidden');
    }

    if (el('my-orders-btn')) {
      el('my-orders-btn').classList.remove('hidden');
      el('my-orders-btn').classList.add('flex');
    }

    var name = (profile && (profile.full_name || profile.name))
      || (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name))
      || user.email.split('@')[0];

    if (el('user-name')) {
      el('user-name').innerText = 'Bem-vindo, ' + name + '!';
    }

    if (el('user-email')) {
      el('user-email').innerText = user.email;
    }

    if (el('user-greeting')) {
      el('user-greeting').innerText = name;
    }

    var avatarUrl = (profile && profile.avatar_url)
      || (user.user_metadata && user.user_metadata.avatar_url);

    if (avatarUrl && el('user-avatar')) {
      el('user-avatar').src = avatarUrl;
      el('user-avatar').classList.remove('hidden');

      if (el('user-avatar-placeholder')) {
        el('user-avatar-placeholder').classList.add('hidden');
      }
    } else if (el('user-avatar-placeholder')) {
      var name2 = (profile && (profile.full_name || profile.name))
        || (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name))
        || user.email.split('@')[0];

      el('user-avatar-placeholder').innerText = name2.charAt(0).toUpperCase();
    }
  }

  function renderAddresses(addresses) {
    var container = el('addresses');
    var empty = el('addresses-empty');

    if (!container || !empty) return;

    if (addresses && addresses.length > 0) {
      empty.classList.add('hidden');

      container.innerHTML = addresses.map(function(addr) {
        return '<div class="p-4 border border-white/5 bg-freo-black relative">'
          + ((addr.is_main || addr.is_default)
            ? '<span class="absolute top-0 right-0 bg-freo-orange text-freo-black text-[10px] font-bold px-2 py-1 uppercase">Principal</span>'
            : '')
          + '<p class="font-body text-sm font-bold mb-1">'
          + escapeHTML(addr.street || '')
          + ', '
          + escapeHTML(addr.number || 'S/N')
          + '</p>'
          + '<p class="font-mono text-xs text-freo-light/50">'
          + escapeHTML(addr.city || '')
          + ' - '
          + escapeHTML(addr.state || '')
          + '</p>'
          + '<p class="font-mono text-xs text-freo-light/50 mt-1">CEP: '
          + escapeHTML(addr.zip_code || '')
          + '</p>'
          + '</div>';
      }).join('');
    } else {
      container.innerHTML = '';
      empty.classList.remove('hidden');
    }
  }

  function renderPaymentMethods(methods) {
    var container = el('payment-methods');
    var empty = el('payments-empty');

    if (!container || !empty) return;

    if (methods && methods.length > 0) {
      empty.classList.add('hidden');

      container.innerHTML = methods.map(function(card) {
        return '<div class="p-4 border border-white/5 bg-freo-black flex items-center gap-3">'
          + '<div class="w-10 h-6 bg-white/10 rounded flex items-center justify-center text-[10px] font-bold uppercase">'
          + escapeHTML(card.brand || 'CARD')
          + '</div>'
          + '<div>'
          + '<p class="font-mono text-sm">•••• •••• •••• '
          + escapeHTML(card.last4 || '****')
          + '</p>'
          + '<p class="font-mono text-[10px] text-freo-light/50">Exp: '
          + escapeHTML(card.exp_month || '**')
          + '/'
          + escapeHTML(card.exp_year || '**')
          + '</p>'
          + '</div>'
          + '</div>';
      }).join('');
    } else {
      container.innerHTML = '';
      empty.classList.remove('hidden');
    }
  }

  // ── Ir para checkout ───────────────────────────────────────────────────────
  window.goToCheckout = function() {
    window.location.href = '/checkout.html';
  };

  // ── Renderiza carrinho na dashboard ────────────────────────────────────────
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

      var itemsHTML = items.map(function(item) {
        var price = parseFloat(item.price) || 0;
        var qty = parseInt(item.quantity, 10) || 1;
        var subtotal = price * qty;

        total += subtotal;

        var variantHTML = '';

        if (item.variant) {
          variantHTML = '<p class="font-mono text-[10px] text-freo-orange/80 mt-1 uppercase tracking-wider">'
            + escapeHTML(item.variant)
            + '</p>';
        }

        return '<div class="flex items-center gap-4 p-4 border border-white/5 bg-freo-black hover:border-freo-orange/50 transition-colors">'
          + '<div class="w-16 h-16 bg-white/5 flex-shrink-0 flex items-center justify-center overflow-hidden">'
          + (item.image_url
            ? '<img src="' + escapeHTML(item.image_url) + '" class="w-full h-full object-cover" onerror="this.style.display=\'none\'">'
            : '')
          + '</div>'

          + '<div class="flex-1 min-w-0">'
          + '<h3 class="font-display font-bold text-lg truncate">'
          + escapeHTML(item.product_name || item.name || 'Figura 3D')
          + '</h3>'
          + variantHTML
          + '<p class="font-mono text-xs text-freo-light/50 mt-1">Qtd: '
          + qty
          + ' × '
          + window.formatCurrency(price)
          + '</p>'
          + '</div>'

          + '<div class="text-right flex flex-col items-end gap-2">'
          + '<p class="font-mono font-bold text-freo-orange">'
          + window.formatCurrency(subtotal)
          + '</p>'
          + '<button onclick="window.removeFromCart(\''
          + escapeHTML(item.id)
          + '\')" class="text-xs font-mono text-red-500 hover:text-red-400 uppercase tracking-wider">Remover</button>'
          + '</div>'
          + '</div>';
      }).join('');

      var checkoutButtonHTML = ''
        + '<div class="mt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">'
        + '<p class="font-mono text-xs text-freo-light/35 uppercase tracking-widest">Pronto para finalizar seu pedido?</p>'
        + '<button onclick="window.goToCheckout()" class="w-full md:w-auto bg-freo-orange text-freo-black font-display font-black uppercase tracking-widest px-8 py-4 hover:bg-white transition-colors flex items-center justify-center gap-3">'
        + '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">'
        + '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>'
        + '</svg>'
        + 'Comprar agora'
        + '</button>'
        + '</div>';

      cartContainer.innerHTML = itemsHTML + checkoutButtonHTML;

      if (cartTotalSection && cartTotalPrice) {
        cartTotalSection.classList.remove('hidden');
        cartTotalPrice.innerText = window.formatCurrency(total);
      }

    } else {
      cartContainer.innerHTML = '';
      cartCount.innerText = '0 itens';
      cartEmpty.classList.remove('hidden');

      if (cartTotalSection) {
        cartTotalSection.classList.add('hidden');
      }
    }
  };

  // ── Fluxo principal ────────────────────────────────────────────────────────
  async function init() {
    try {
      var sessionResult = await db.auth.getSession();
      var session = sessionResult.data && sessionResult.data.session;

      if (!session) {
        console.log('⚪ Sem sessão.');

        if (isProtected()) {
          window.location.href = '/login.html';
        }

        window.dispatchEvent(new CustomEvent('auth-not-logged-in'));
        return;
      }

      var user = session.user;

      console.log('✅ Sessão:', user.email);

      if (isLogin()) {
        window.location.href = '/dashboard.html';
        return;
      }

      var profile = await fetchProfile(user.id);

      console.log('👤 Perfil:', profile);

      var isAdmin = profile && profile.is_admin === true;

      console.log('🔑 isAdmin:', isAdmin);

      if (isAdminPage() && !isAdmin) {
        console.warn('🚫 Acesso negado à área admin');
        alert('Acesso negado: área restrita a administradores');
        window.location.href = '/dashboard.html';
        return;
      }

      if (isProtected() && !isAdminPage()) {
        showPageContent(user, profile);
      }

      var results = await Promise.allSettled([
        fetchCartItems(user.id),
        fetchAddresses(user.id),
        fetchPaymentMethods(user.id)
      ]);

      var cartItems = results[0].status === 'fulfilled' ? results[0].value : [];
      var addresses = results[1].status === 'fulfilled' ? results[1].value : [];
      var paymentMethods = results[2].status === 'fulfilled' ? results[2].value : [];

      if (isProtected() && !isAdminPage()) {
        window.renderCartUI(cartItems);
        renderAddresses(addresses);
        renderPaymentMethods(paymentMethods);
      }

      window.dispatchEvent(new CustomEvent('auth-data-loaded', {
        detail: {
          user: user,
          profile: profile,
          cartItems: cartItems,
          paymentMethods: paymentMethods,
          addresses: addresses
        }
      }));

    } catch(e) {
      console.error('❌ Erro no auth-listener:', e);

      if (el('loading-state')) {
        el('loading-state').classList.add('hidden');
      }

      if (el('dashboard-content')) {
        el('dashboard-content').classList.remove('hidden');
      }
    }
  }

  init();

  db.auth.onAuthStateChange(function(event, session) {
    if (event === 'SIGNED_OUT') {
      if (isProtected()) {
        window.location.href = '/login.html';
      }
    }

    if (event === 'SIGNED_IN' && isLogin()) {
      window.location.href = '/dashboard.html';
    }
  });

  // ── Remover item do carrinho ───────────────────────────────────────────────
  window.removeFromCart = async function(itemId) {
    try {
      var r = await db
        .from('cart_items')
        .delete()
        .eq('id', itemId);

      if (r.error) throw r.error;

      var s = await db.auth.getSession();
      var session = s.data && s.data.session;

      if (session) {
        var cartR = await db
          .from('cart_items')
          .select('*')
          .eq('user_id', session.user.id);

        window.renderCartUI(cartR.data || []);
      }

    } catch(e) {
      console.error('Erro ao remover item:', e);
      alert('Erro ao remover item do carrinho.');
    }
  };

})();
