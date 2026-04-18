const SUPABASE_URL = "https://rrmxqpvxrpcqqxsgccqw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJybXhxcHZ4cnBjcXF4c2djY3F3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1OTc5MjcsImV4cCI6MjA4ODE3MzkyN30.v4IoG2wln2-4T-DZ9CKdrftEu4oI6-bLfE8gRlWzDYM";
 
// ─── BUG 2 CORRIGIDO: lógica de inicialização estava invertida ───────────────
if (!window.supabaseClient) {
  if (window.supabase && typeof window.supabase.createClient === 'function') {
    // SDK carregado via CDN normalmente (objeto global `supabase`)
    window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } else if (window.supabase) {
    // Já era uma instância pronta (edge case)
    window.supabaseClient = window.supabase;
  }
}
 
if (!window.supabaseClient) {
  console.error("❌ Cliente Supabase não encontrado. Certifique-se de incluir o script do Supabase ANTES do auth-listener.js");
} else {
 
  const isProtectedPage = () =>
    window.location.pathname.includes('dashboard') ||
    window.location.pathname.includes('checkout') ||
    window.location.pathname.includes('admin') ||
    window.location.pathname.includes('meus-pedidos');
 
  // ─── BUG 1 CORRIGIDO: carrega dados e dispara evento de forma confiável ────
  // Esta função centraliza toda a busca de dados e atualização de DOM.
  // É chamada tanto pelo onAuthStateChange quanto pelo getSession inicial,
  // garantindo que o evento auth-data-loaded SEMPRE seja disparado quando há sessão.
  async function handleAuthSession(session) {
    if (!session) {
      console.log("⚪ Usuário não está logado.");
      if (isProtectedPage()) {
        window.location.href = '/login.html';
        return;
      }
      const nameEl = document.getElementById('user-name');
      if (nameEl) nameEl.innerText = "";
      window.dispatchEvent(new CustomEvent('auth-not-logged-in'));
      return;
    }
 
    const user = session.user;
    console.log("✅ Usuário logado:", user.email);
 
    try {
      // Redireciona login se já estiver logado
      if (window.location.pathname.includes('login.html')) {
        window.location.href = '/dashboard.html';
        return;
      }
 
      // 1. Perfil
      let currentProfile = null;
      const { data: profile, error: profileError } = await window.supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
 
      if (profileError && profileError.code === 'PGRST116') {
        // Perfil não existe → cria automaticamente (Google login, etc.)
        const newProfile = {
          id: user.id,
          full_name: user.user_metadata?.full_name || user.email.split('@')[0],
          avatar_url: user.user_metadata?.avatar_url || ''
        };
        const { data: createdProfile, error: createError } = await window.supabaseClient
          .from('profiles')
          .insert(newProfile)
          .select()
          .single();
        if (createError) {
          console.error("❌ Erro ao criar perfil automático:", createError);
        } else {
          console.log("✅ Perfil automático criado:", createdProfile);
          currentProfile = createdProfile;
        }
      } else if (profileError) {
        console.error("❌ Erro ao buscar perfil:", profileError);
      } else {
        console.log("👤 Perfil do usuário:", profile);
        currentProfile = profile;
      }
 
      // 2. Carrinho
      const { data: cartItems, error: cartError } = await window.supabaseClient
        .from('cart_items')
        .select('*')
        .eq('user_id', user.id);
      if (cartError) console.error("❌ Erro ao buscar carrinho:", cartError);
      else console.log("🛒 Carrinho:", cartItems);
 
      // 3. Métodos de pagamento
      const { data: paymentMethods, error: paymentError } = await window.supabaseClient
        .from('payment_methods')
        .select('*')
        .eq('user_id', user.id);
      if (paymentError) console.error("❌ Erro ao buscar pagamentos:", paymentError);
      else console.log("💳 Pagamentos:", paymentMethods);
 
      // 4. Endereços
      const { data: addresses, error: addressError } = await window.supabaseClient
        .from('addresses')
        .select('*')
        .eq('user_id', user.id);
      if (addressError) console.error("❌ Erro ao buscar endereços:", addressError);
      else console.log("📍 Endereços:", addresses);
 
      // ── Admin check ──────────────────────────────────────────────────────
      const isAdmin = currentProfile?.is_admin === true;
      if (window.location.pathname.includes('/admin/') && !isAdmin) {
        alert("Acesso negado: área restrita a administradores");
        window.location.href = '/dashboard.html';
        return;
      }
 
      // ── Atualiza DOM nas páginas protegidas ──────────────────────────────
      if (isProtectedPage()) {
        const loadingState = document.getElementById('loading-state');
        const dashboardContent = document.getElementById('dashboard-content');
        const logoutBtn = document.getElementById('logout-btn');
        const myOrdersBtn = document.getElementById('my-orders-btn');
 
        if (loadingState) loadingState.classList.add('hidden');
        if (dashboardContent) dashboardContent.classList.remove('hidden');
        if (logoutBtn) logoutBtn.classList.remove('hidden');
        if (myOrdersBtn) {
          myOrdersBtn.classList.remove('hidden');
          myOrdersBtn.classList.add('flex');
        }
 
        // Nome e avatar
        const nameEl = document.getElementById('user-name');
        const emailEl = document.getElementById('user-email');
        const greetingEl = document.getElementById('user-greeting');
        const name = currentProfile?.name || currentProfile?.full_name || user.user_metadata?.name || user.email.split('@')[0];
 
        if (nameEl) {
          nameEl.innerText = `Bem-vindo, ${name}!`;
          if (isAdmin && !document.getElementById('admin-badge')) {
            const badge = document.createElement('span');
            badge.id = 'admin-badge';
            badge.className = 'ml-4 align-middle inline-flex items-center px-3 py-1 rounded-full text-xs font-bold font-mono bg-freo-orange text-freo-black uppercase tracking-widest shadow-[0_0_10px_rgba(212,175,55,0.4)] cursor-pointer';
            badge.innerText = 'ADMIN';
            badge.title = 'Acessar Painel Admin';
            badge.onclick = () => window.location.href = '/admin/pedidos.html';
            nameEl.appendChild(badge);
          }
        }
        if (emailEl) emailEl.innerText = user.email;
        if (greetingEl) greetingEl.innerText = name;
 
        const avatarUrl = currentProfile?.avatar_url || user.user_metadata?.avatar_url;
        const avatarImg = document.getElementById('user-avatar');
        const avatarPlaceholder = document.getElementById('user-avatar-placeholder');
 
        if (avatarUrl && avatarImg && avatarPlaceholder) {
          avatarImg.src = avatarUrl;
          avatarImg.classList.remove('hidden');
          avatarPlaceholder.classList.add('hidden');
        } else if (avatarPlaceholder) {
          avatarPlaceholder.innerText = name.charAt(0).toUpperCase();
        }
 
        // Formatador de moeda global
        window.formatCurrency = (value) => {
          const num = parseFloat(value);
          if (isNaN(num)) return 'R$ 0,00';
          return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num);
        };
 
        // Renderizador do carrinho global
        window.renderCartUI = (items) => {
          const cartContainer = document.getElementById('cart-items');
          const cartEmpty = document.getElementById('cart-empty');
          const cartCount = document.getElementById('cart-count');
          const cartTotalSection = document.getElementById('cart-total-section');
          const cartTotalPrice = document.getElementById('cart-total-price');
 
          if (!cartContainer || !cartEmpty || !cartCount) return;
 
          if (items && items.length > 0) {
            cartCount.innerText = `${items.length} item(s)`;
            cartEmpty.classList.add('hidden');
 
            let totalGeral = 0;
            cartContainer.innerHTML = items.map(item => {
              const price = item.price || 0;
              const qty = item.quantity || 1;
              const subtotal = price * qty;
              totalGeral += subtotal;
              return `
                <div class="flex items-center gap-4 p-4 border border-white/5 bg-freo-black hover:border-freo-orange/50 transition-colors">
                  <div class="w-16 h-16 bg-white/5 flex-shrink-0 flex items-center justify-center">
                    ${item.image_url ? `<img src="${item.image_url}" class="w-full h-full object-cover">` : `<svg class="w-6 h-6 text-white/20" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>`}
                  </div>
                  <div class="flex-1 min-w-0">
                    <h3 class="font-display font-bold text-lg truncate">${item.product_name || item.name || 'Figura 3D'}</h3>
                    <p class="font-mono text-xs text-freo-light/50">Qtd: ${qty} x ${window.formatCurrency(price)}</p>
                  </div>
                  <div class="text-right flex flex-col items-end gap-2">
                    <p class="font-mono font-bold text-freo-orange">${window.formatCurrency(subtotal)}</p>
                    <button onclick="removeFromCart('${item.id}')" class="text-xs font-mono text-red-500 hover:text-red-400 uppercase tracking-wider flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                      Remover
                    </button>
                  </div>
                </div>
              `;
            }).join('');
 
            if (cartTotalSection && cartTotalPrice) {
              cartTotalSection.classList.remove('hidden');
              cartTotalPrice.innerText = window.formatCurrency(totalGeral);
            }
          } else {
            cartContainer.innerHTML = '';
            cartCount.innerText = '0 itens';
            cartEmpty.classList.remove('hidden');
            if (cartTotalSection) cartTotalSection.classList.add('hidden');
          }
        };
 
        window.renderCartUI(cartItems);
 
        // Endereços
        const addrContainer = document.getElementById('addresses');
        const addrEmpty = document.getElementById('addresses-empty');
        if (addrContainer && addrEmpty) {
          if (addresses && addresses.length > 0) {
            addrContainer.innerHTML = addresses.map(addr => `
              <div class="p-4 border border-white/5 bg-freo-black relative">
                ${addr.is_main || addr.is_default ? '<span class="absolute top-0 right-0 bg-freo-orange text-freo-black text-[10px] font-bold px-2 py-1 uppercase">Principal</span>' : ''}
                <p class="font-body text-sm font-bold mb-1">${addr.street || addr.logradouro || 'Endereço'}, ${addr.number || addr.numero || 'S/N'}</p>
                <p class="font-mono text-xs text-freo-light/50">${addr.city || addr.cidade || ''} - ${addr.state || addr.estado || ''}</p>
                <p class="font-mono text-xs text-freo-light/50 mt-1">CEP: ${addr.zip_code || addr.cep || ''}</p>
              </div>
            `).join('');
          } else {
            addrEmpty.classList.remove('hidden');
          }
        }
 
        // Cartões
        const payContainer = document.getElementById('payment-methods');
        const payEmpty = document.getElementById('payments-empty');
        if (payContainer && payEmpty) {
          if (paymentMethods && paymentMethods.length > 0) {
            payContainer.innerHTML = paymentMethods.map(card => `
              <div class="p-4 border border-white/5 bg-freo-black flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-6 bg-white/10 rounded flex items-center justify-center text-[10px] font-bold uppercase tracking-wider">
                    ${card.brand || card.bandeira || 'CARD'}
                  </div>
                  <div>
                    <p class="font-mono text-sm">•••• •••• •••• ${card.last4 || card.ultimos_digitos || '****'}</p>
                    <p class="font-mono text-[10px] text-freo-light/50">Exp: ${card.exp_month || card.mes_exp || '**'}/${card.exp_year || card.ano_exp || '**'}</p>
                  </div>
                </div>
              </div>
            `).join('');
          } else {
            payEmpty.classList.remove('hidden');
          }
        }
      }
 
      // ── BUG 1 CORRIGIDO: dispara evento SEMPRE que há sessão ─────────────
      window.dispatchEvent(new CustomEvent('auth-data-loaded', {
        detail: { user, profile: currentProfile, cartItems, paymentMethods, addresses }
      }));
 
    } catch (err) {
      console.error("❌ Erro inesperado ao buscar dados do usuário:", err);
      // Garante que a tela nunca fique presa no loading mesmo em caso de erro
      const loadingState = document.getElementById('loading-state');
      const dashboardContent = document.getElementById('dashboard-content');
      const ordersLoading = document.getElementById('orders-loading');
      const ordersEmpty = document.getElementById('orders-empty');
      if (loadingState) loadingState.classList.add('hidden');
      if (dashboardContent) dashboardContent.classList.remove('hidden');
      if (ordersLoading) ordersLoading.classList.add('hidden');
      if (ordersEmpty) ordersEmpty.classList.remove('hidden');
    }
  }
 
  // ─── BUG 3 CORRIGIDO: getSession inicial chama handleAuthSession ──────────
  // Isso garante que páginas que já têm sessão ativa carregam imediatamente,
  // sem depender do onAuthStateChange (que pode ter delay).
  window.supabaseClient.auth.getSession().then(({ data: { session } }) => {
    console.log("🔄 Verificação inicial de sessão...");
    handleAuthSession(session);
  });
 
  // onAuthStateChange como backup para mudanças de estado (login/logout em tempo real)
  // Evita dupla execução com o getSession usando uma flag
  let sessionHandledByGetSession = false;
  window.supabaseClient.auth.onAuthStateChange(async (event, session) => {
    // INITIAL_SESSION é disparado logo após o getSession, pode ignorar para evitar duplicidade
    if (event === 'INITIAL_SESSION') return;
    console.log("🔔 Auth state changed:", event);
    handleAuthSession(session);
  });
 
  // ── Função global para remover item do carrinho ───────────────────────────
  window.removeFromCart = async (itemId) => {
    if (!window.supabaseClient) return;
    try {
      const { error } = await window.supabaseClient
        .from('cart_items')
        .delete()
        .eq('id', itemId);
      if (error) throw error;
 
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      if (session) {
        const { data: newCartItems } = await window.supabaseClient
          .from('cart_items')
          .select('*')
          .eq('user_id', session.user.id);
        if (window.renderCartUI) window.renderCartUI(newCartItems);
      }
    } catch (err) {
      console.error('Erro ao remover item:', err);
      alert('Erro ao remover item do carrinho.');
    }
  };
 
}
