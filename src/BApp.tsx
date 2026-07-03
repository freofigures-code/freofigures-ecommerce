import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from 'motion/react';
import {
  ShoppingCart,
  Menu,
  X,
  Box,
  Search,
  User,
  Trash2,
  Plus,
  Minus,
  MessageCircle,
  Building2,
  ChevronDown,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type CartItem = {
  cartItemId?: number;
  name: string;
  price: string;
  img: string;
  quantity: number;
  variant?: string | null;
};

type PriceTier = {
  id: number;
  product_id: number;
  min_qty: number;
  max_qty: number | null;
  unit_price: number;
  is_active: boolean;
};

type Product = {
  id: number;
  title: string;
  price: number;
  promotional_price: number | null;
  category: string | null;
  images: string[];
  tags: string[] | string | null;
  is_active: boolean;
  sale_mode: 'normal' | 'quote_only';
};

type Profile = {
  id: string;
  account_type: 'pf' | 'pj';
  company_name: string | null;
  cnpj: string | null;
  full_name?: string | null;
  name?: string | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// DESIGN TOKENS — tema B2B (azul-aço/grafite sobre preto, dourado como selo)
// ─────────────────────────────────────────────────────────────────────────────

const B2B_ACCENT = '#3B6E8F';
const B2B_ACCENT_LIGHT = '#5A8FB0';
const B2B_MUTED = '#B8BCC4';
const B2B_GOLD = '#DDAF34';

const formatPrice = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const WHATSAPP_NUMBER = '5511946454111';

function getSessionId(): string {
  const key = 'freo_sid';
  let sid = sessionStorage.getItem(key);
  if (!sid) {
    sid = 'sid_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
    sessionStorage.setItem(key, sid);
  }
  return sid;
}

function trackEvent(eventType: string, productId?: string, productName?: string): void {
  try {
    // @ts-ignore
    const supabase = window.supabaseClient || window.supabase;
    if (!supabase) return;
    const payload = {
      event_type:   eventType,
      product_id:   productId   || null,
      product_name: productName || null,
      page:         window.location.pathname + window.location.search,
      session_id:   getSessionId(),
      referrer:     document.referrer || null,
      user_agent:   navigator.userAgent ? navigator.userAgent.substring(0, 200) : null,
    };
    supabase.from('analytics_events').insert(payload).then((res: any) => {
      if (res?.error) console.warn('[Analytics]', res.error.message);
    });
  } catch (e) {
    console.warn('[Analytics] silenced:', e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TELA DE ACESSO NEGADO (PF ou deslogado tentando ver /b2b.html)
// ─────────────────────────────────────────────────────────────────────────────

const B2BAccessGate = ({ reason }: { reason: 'not_logged' | 'not_pj' }) => (
  <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center px-5">
    <div className="max-w-md w-full text-center">
      <div className="w-16 h-16 mx-auto mb-6 rounded-full flex items-center justify-center" style={{ background: `${B2B_ACCENT}15`, border: `1px solid ${B2B_ACCENT}40` }}>
        <Building2 className="w-7 h-7" style={{ color: B2B_ACCENT }} />
      </div>
      <h1 className="font-display font-black text-2xl uppercase tracking-tight text-white mb-3">
        Área exclusiva para contas empresariais
      </h1>
      <p className="font-body text-sm text-white/50 leading-relaxed mb-8">
        {reason === 'not_logged'
          ? 'Faça login com uma conta CNPJ para acessar preços e condições B2B.'
          : 'Sua conta atual é pessoa física. Cadastre os dados da sua empresa para desbloquear preços por volume, condições especiais e catálogo B2B.'}
      </p>
      <div className="flex flex-col gap-3">
        <a
          href="/dashboard.html"
          className="font-mono text-xs uppercase tracking-widest px-6 py-3.5 transition-colors"
          style={{ background: B2B_ACCENT, color: '#fff' }}
        >
          {reason === 'not_logged' ? 'Fazer login' : 'Completar cadastro empresarial'}
        </a>
        <a href="/" className="font-mono text-xs uppercase tracking-widest px-6 py-3 text-white/40 hover:text-white/70 transition-colors">
          Voltar para a loja
        </a>
      </div>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// NAVBAR B2B
// ─────────────────────────────────────────────────────────────────────────────

const B2BNavbar = ({ profile, cartItems, onOpenCart, searchTerm, setSearchTerm }: any) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const totalCartItems = cartItems.reduce((total: number, item: CartItem) => total + item.quantity, 0);

  return (
    <nav className="sticky top-0 z-50 bg-[#0d0f12]/95 backdrop-blur-md border-b" style={{ borderColor: `${B2B_ACCENT}25` }}>
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-3.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-shrink-0">
          <img
            src="https://rrmxqpvxrpcqqxsgccqw.supabase.co/storage/v1/object/public/imagens/logo.jpg"
            alt="Logo"
            className="w-9 h-9 rounded-full object-cover border-2"
            style={{ borderColor: B2B_ACCENT }}
          />
          <div className="hidden sm:block">
            <span className="font-display font-black text-lg tracking-tighter uppercase text-white leading-none block">
              Freo<span style={{ color: B2B_ACCENT }}>Figures</span>
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.2em]" style={{ color: B2B_MUTED }}>Corporativo</span>
          </div>
        </div>

        <div className="hidden md:flex items-center flex-1 max-w-md relative">
          <Search className="w-4 h-4 absolute left-3 pointer-events-none" style={{ color: `${B2B_MUTED}80` }} />
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar no catálogo B2B..."
            className="w-full bg-[#141618] border pl-9 pr-3 py-2 text-sm font-mono text-white outline-none transition-colors"
            style={{ borderColor: `${B2B_ACCENT}30` }}
          />
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {profile && (
            <div className="hidden lg:flex flex-col items-end mr-1">
              <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: B2B_MUTED }}>CNPJ</span>
              <span className="font-mono text-xs text-white truncate max-w-[160px]">{profile.company_name || '—'}</span>
            </div>
          )}
          <a href="/dashboard.html" className="text-white/50 hover:text-white transition-colors" aria-label="Minha conta">
            <User className="w-5 h-5" />
          </a>
          <button onClick={onOpenCart} className="relative text-white/50 hover:text-white transition-colors" aria-label="Carrinho">
            <ShoppingCart className="w-5 h-5" />
            {totalCartItems > 0 && (
              <span className="absolute -top-2 -right-2 text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center" style={{ background: B2B_ACCENT, color: '#fff' }}>
                {totalCartItems}
              </span>
            )}
          </button>
          <button className="md:hidden text-white/50" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="Menu">
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden px-4 pb-4">
          <div className="flex items-center relative">
            <Search className="w-4 h-4 absolute left-3 pointer-events-none" style={{ color: `${B2B_MUTED}80` }} />
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar no catálogo B2B..."
              className="w-full bg-[#141618] border pl-9 pr-3 py-2.5 text-sm font-mono text-white outline-none"
              style={{ borderColor: `${B2B_ACCENT}30` }}
            />
          </div>
        </div>
      )}
    </nav>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// TABELA DE FAIXAS DE PREÇO
// ─────────────────────────────────────────────────────────────────────────────

const PriceTierTable = ({ tiers, basePrice }: { tiers: PriceTier[]; basePrice: number }) => {
  const [expanded, setExpanded] = useState(false);

  if (tiers.length === 0) {
    return (
      <div className="font-mono text-sm font-bold text-white">
        {formatPrice(basePrice)} <span className="text-[10px] font-normal" style={{ color: B2B_MUTED }}>/ unidade</span>
      </div>
    );
  }

  const sorted = [...tiers].sort((a, b) => a.min_qty - b.min_qty);
  const cheapest = sorted[sorted.length - 1];

  return (
    <div>
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between text-left"
      >
        <div>
          <span className="font-mono text-[10px] uppercase tracking-widest block mb-0.5" style={{ color: B2B_MUTED }}>A partir de</span>
          <span className="font-mono text-sm font-bold" style={{ color: B2B_GOLD }}>
            {formatPrice(cheapest.unit_price)} <span className="text-[10px] font-normal text-white/40">/ un. ({cheapest.min_qty}+)</span>
          </span>
        </div>
        <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} style={{ color: B2B_ACCENT }} />
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <table className="w-full mt-3 text-xs font-mono">
              <thead>
                <tr style={{ color: B2B_MUTED }}>
                  <th className="text-left font-normal pb-1.5 uppercase tracking-wider text-[10px]">Qtd.</th>
                  <th className="text-right font-normal pb-1.5 uppercase tracking-wider text-[10px]">Preço/un.</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(tier => (
                  <tr key={tier.id} className="border-t" style={{ borderColor: `${B2B_ACCENT}20` }}>
                    <td className="py-1.5 text-white/70">
                      {tier.min_qty}{tier.max_qty ? `–${tier.max_qty}` : '+'}
                    </td>
                    <td className="py-1.5 text-right font-bold text-white">{formatPrice(tier.unit_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT CARD B2B
// ─────────────────────────────────────────────────────────────────────────────

const B2BProductCard = ({
  product, tiers, onAddToCart,
}: { product: Product; tiers: PriceTier[]; onAddToCart: (p: Product) => void }) => {
  const thumb = product.images && product.images.length > 0 ? product.images[0] : null;
  const hasPromo = product.promotional_price !== null && product.promotional_price < product.price;
  const basePrice = hasPromo ? product.promotional_price! : product.price;
  const isQuoteOnly = product.sale_mode === 'quote_only';

  const whatsappHref = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
    `Olá! Gostaria de uma cotação B2B para: ${product.title} (ID ${product.id})`
  )}`;

  return (
    <div className="flex flex-col bg-[#111316] border transition-colors" style={{ borderColor: `${B2B_ACCENT}20` }}>
      <div className="relative aspect-square bg-[#0A0A0A] overflow-hidden">
        {isQuoteOnly && (
          <div className="absolute top-2 left-2 z-10 font-mono text-[9px] font-bold uppercase tracking-widest px-2 py-1" style={{ background: B2B_GOLD, color: '#000' }}>
            Sob cotação
          </div>
        )}
        {thumb ? (
          <img src={thumb} alt={product.title} className="w-full h-full object-cover opacity-85" />
        ) : (
          <div className="w-full h-full flex items-center justify-center"><Box className="w-10 h-10 text-white/10" /></div>
        )}
      </div>
      <div className="p-4 flex flex-col flex-grow gap-3">
        <div>
          <span className="font-mono text-[10px] uppercase tracking-wider block mb-1" style={{ color: B2B_ACCENT }}>{product.category || 'Geral'}</span>
          <h3 className="font-display font-bold text-sm text-white leading-tight line-clamp-2">{product.title}</h3>
        </div>

        <div className="mt-auto flex flex-col gap-3">
          {isQuoteOnly ? (
            <p className="font-mono text-xs" style={{ color: B2B_MUTED }}>Preço definido por volume e especificação. Fale com nosso time.</p>
          ) : (
            <PriceTierTable tiers={tiers} basePrice={basePrice} />
          )}

          {isQuoteOnly ? (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackEvent('b2b_quote_click', String(product.id), product.title)}
              className="w-full flex items-center justify-center gap-2 font-display font-bold uppercase tracking-wider py-2.5 text-xs transition-colors"
              style={{ background: '#25D366', color: '#000' }}
            >
              <MessageCircle className="w-4 h-4" />
              Pedir cotação
            </a>
          ) : (
            <button
              onClick={() => {
                trackEvent('add_to_cart', String(product.id), product.title);
                onAddToCart(product);
              }}
              className="w-full flex items-center justify-center gap-2 font-display font-bold uppercase tracking-wider py-2.5 text-xs transition-colors"
              style={{ background: B2B_ACCENT, color: '#fff' }}
            >
              <ShoppingCart className="w-4 h-4" />
              Adicionar
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// CART DRAWER (reaproveita mesma cart_items / mesmo checkout.html do site)
// ─────────────────────────────────────────────────────────────────────────────

const B2BCartDrawer = ({ isOpen, onClose, cartItems, updateQuantity, removeItem }: any) => {
  const total = cartItems.reduce((acc: number, item: CartItem) => {
    const price = item.price.replace('R$', '').replace(/\s/g, '').replace(',', '.');
    return acc + parseFloat(price) * item.quantity;
  }, 0);

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm" />
          <motion.div
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.3 }}
            className="fixed top-0 right-0 h-full w-full sm:w-[420px] bg-[#0d0f12] border-l z-[101] shadow-2xl flex flex-col"
            style={{ borderColor: `${B2B_ACCENT}30` }}
          >
            <div className="p-5 border-b flex justify-between items-center" style={{ borderColor: `${B2B_ACCENT}20` }}>
              <h2 className="text-lg font-display font-black uppercase flex items-center gap-2 text-white">
                <ShoppingCart className="w-5 h-5" style={{ color: B2B_ACCENT }} />
                Pedido B2B
              </h2>
              <button onClick={onClose} className="text-white/50 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-grow overflow-y-auto p-5 space-y-3">
              {cartItems.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-white/40 font-body">
                  <ShoppingCart className="w-14 h-14 mb-4 opacity-20" />
                  <p className="text-sm">Nenhum item adicionado ainda.</p>
                </div>
              ) : (
                cartItems.map((item: CartItem, i: number) => (
                  <div key={item.cartItemId ?? i} className="flex gap-3 bg-[#141618] p-3 border relative" style={{ borderColor: `${B2B_ACCENT}15` }}>
                    <img src={item.img} alt={item.name} className="w-16 h-16 object-cover flex-shrink-0" />
                    <div className="flex flex-col flex-grow justify-between min-w-0">
                      <h4 className="font-display font-bold text-xs text-white leading-tight line-clamp-2 pr-5">{item.name}</h4>
                      <div className="flex justify-between items-center mt-2">
                        <span className="font-mono text-sm font-bold" style={{ color: B2B_GOLD }}>{item.price}</span>
                        <div className="flex items-center gap-2 bg-[#0A0A0A] border px-2 py-1" style={{ borderColor: `${B2B_ACCENT}25` }}>
                          <button onClick={() => updateQuantity(item, -1)} className="text-white/60 hover:text-white p-0.5"><Minus className="w-3 h-3" /></button>
                          <span className="font-mono text-xs text-white w-4 text-center">{item.quantity}</span>
                          <button onClick={() => updateQuantity(item, 1)} className="text-white/60 hover:text-white p-0.5"><Plus className="w-3 h-3" /></button>
                        </div>
                      </div>
                    </div>
                    <button onClick={() => removeItem(item)} className="absolute top-2 right-2 text-white/25 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))
              )}
            </div>
            {cartItems.length > 0 && (
              <div className="p-5 border-t" style={{ borderColor: `${B2B_ACCENT}20` }}>
                <div className="flex justify-between items-center mb-4 font-mono">
                  <span className="text-white/50 uppercase text-xs">Total</span>
                  <span className="text-xl font-bold" style={{ color: B2B_GOLD }}>R$ {total.toFixed(2).replace('.', ',')}</span>
                </div>
                <button
                  onClick={() => { window.location.href = '/checkout.html'; }}
                  className="w-full font-bold font-display uppercase tracking-widest py-3.5 text-sm transition-colors"
                  style={{ background: B2B_ACCENT, color: '#fff' }}
                >
                  Finalizar Pedido
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// APP B2B PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

export default function BApp() {
  const [authState, setAuthState] = useState<'loading' | 'not_logged' | 'not_pj' | 'ok'>('loading');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [tiersByProduct, setTiersByProduct] = useState<Record<number, PriceTier[]>>({});
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // ── Auth gate: só account_type === 'pj' passa ──────────────────────────
  useEffect(() => {
    const handleAuthData = (e: any) => {
      const p = e.detail.profile;
      const isAdmin = !!(p && p.is_admin === true);
      if (!p || (p.account_type !== 'pj' && !isAdmin)) {
        setAuthState('not_pj');
        return;
      }
      setProfile(p);
      setAuthState('ok');
      if (e.detail.cartItems) {
        setCartItems(e.detail.cartItems.map((item: any) => ({
          cartItemId: item.id,
          name: item.product_name,
          price: formatPrice(item.price),
          img: item.image_url,
          quantity: item.quantity,
          variant: item.variant ?? null,
        })));
      }
    };
    const handleNotLoggedIn = () => setAuthState('not_logged');

    window.addEventListener('auth-data-loaded', handleAuthData);
    window.addEventListener('auth-not-logged-in', handleNotLoggedIn);
    return () => {
      window.removeEventListener('auth-data-loaded', handleAuthData);
      window.removeEventListener('auth-not-logged-in', handleNotLoggedIn);
    };
  }, []);

  // ── Carrega produtos + faixas de preço só depois de confirmado PJ ──────
  useEffect(() => {
    if (authState !== 'ok') return;
    const load = async () => {
      setLoadingProducts(true);
      try {
        // @ts-ignore
        const supabase = window.supabaseClient || window.supabase;
        if (!supabase) return;

        const { data: productsData, error: productsError } = await supabase
          .from('products')
          .select('*')
          .eq('is_active', true)
          .order('created_at', { ascending: false });
        if (productsError) throw productsError;

        const { data: tiersData, error: tiersError } = await supabase
          .from('product_price_tiers')
          .select('*')
          .eq('is_active', true);
        if (tiersError) throw tiersError;

        const grouped: Record<number, PriceTier[]> = {};
        (tiersData || []).forEach((tier: PriceTier) => {
          if (!grouped[tier.product_id]) grouped[tier.product_id] = [];
          grouped[tier.product_id].push(tier);
        });

        setProducts(productsData || []);
        setTiersByProduct(grouped);
      } catch (err) {
        console.error('[B2B] erro ao carregar catálogo:', err);
      } finally {
        setLoadingProducts(false);
      }
    };
    load();
  }, [authState]);

  const filtered = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return products;
    return products.filter(p =>
      p.title.toLowerCase().includes(query) ||
      (p.category || '').toLowerCase().includes(query)
    );
  }, [products, searchTerm]);

  const addToCart = async (product: Product) => {
    // @ts-ignore
    const supabase = window.supabaseClient || window.supabase;
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    try {
      const thumb = product.images && product.images.length > 0 ? product.images[0] : '';
      const priceNum = product.promotional_price !== null && product.promotional_price < product.price
        ? product.promotional_price
        : product.price;
      const { data, error } = await supabase.from('cart_items').insert({
        user_id: session.user.id,
        product_id: String(product.id),
        product_name: product.title,
        quantity: 1,
        price: priceNum,
        total_price: priceNum,
        image_url: thumb,
        variant: null,
      }).select().single();
      if (error) throw error;
      setCartItems(prev => [...prev, {
        cartItemId: data.id,
        name: product.title,
        price: formatPrice(priceNum),
        img: thumb,
        quantity: 1,
        variant: null,
      }]);
      setIsCartOpen(true);
    } catch (err) {
      console.error('[B2B] erro ao adicionar ao carrinho:', err);
    }
  };

  const updateQuantity = (product: CartItem, delta: number) => {
    setCartItems(prev => prev.map(item =>
      item.cartItemId === product.cartItemId ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item
    ));
  };

  const removeItem = async (product: CartItem) => {
    // @ts-ignore
    const supabase = window.supabaseClient || window.supabase;
    if (supabase && product.cartItemId) await supabase.from('cart_items').delete().eq('id', product.cartItemId);
    setCartItems(prev => prev.filter(item => item.cartItemId !== product.cartItemId));
  };

  if (authState === 'loading') {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="w-10 h-10 border-2 rounded-full animate-spin" style={{ borderColor: `${B2B_ACCENT}40`, borderTopColor: B2B_ACCENT }} />
      </div>
    );
  }

  if (authState === 'not_logged' || authState === 'not_pj') {
    return <B2BAccessGate reason={authState} />;
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <B2BNavbar profile={profile} cartItems={cartItems} onOpenCart={() => setIsCartOpen(true)} searchTerm={searchTerm} setSearchTerm={setSearchTerm} />

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-8">
        <div className="mb-8 pb-5 border-b flex items-center justify-between flex-wrap gap-3" style={{ borderColor: `${B2B_ACCENT}25` }}>
          <div>
            <h1 className="font-display font-black text-2xl md:text-3xl uppercase tracking-tight text-white">
              Catálogo Corporativo
            </h1>
            <p className="font-mono text-xs mt-1" style={{ color: B2B_MUTED }}>
              {profile?.company_name} · {loadingProducts ? 'Carregando...' : `${filtered.length} produto${filtered.length !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>

        {loadingProducts ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="animate-pulse bg-[#111316] border" style={{ borderColor: `${B2B_ACCENT}15` }}>
                <div className="aspect-square bg-[#0A0A0A]" />
                <div className="p-4 space-y-3">
                  <div className="h-3 bg-white/5 rounded w-1/3" />
                  <div className="h-4 bg-white/5 rounded w-3/4" />
                  <div className="h-9 bg-white/5 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24">
            <p className="font-display font-bold text-lg uppercase text-white/30 mb-2">
              {products.length === 0 ? 'Nenhum produto cadastrado ainda' : 'Nenhum resultado para essa busca'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map(product => (
              <B2BProductCard
                key={product.id}
                product={product}
                tiers={tiersByProduct[product.id] || []}
                onAddToCart={addToCart}
              />
            ))}
          </div>
        )}
      </div>

      <B2BCartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cartItems={cartItems}
        updateQuantity={updateQuantity}
        removeItem={removeItem}
      />
    </div>
  );
}
