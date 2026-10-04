import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from 'motion/react';
import {
  ShoppingCart,
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
  ArrowRight,
  PartyPopper,
  Shapes,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type CartItem = {
  cartItemId?: number;
  name: string;
  price: string;
  priceValue?: number;
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
  b2b_category?: B2BCategory | null;
  is_kit?: boolean;
  kit_type?: string | null;
  variants?: { name: string; options: unknown[] }[] | null;
  stock?: number;
};

type B2BCategory = 'loja' | 'eventos' | 'sob_medida';

const B2B_SECTIONS: { id: B2BCategory; title: string; cardTitle: string; description: string; image: string; icon: typeof Box }[] = [
  { id: 'loja', title: 'Produtos da loja em quantidade', cardTitle: 'Comprar em quantidade', description: 'Escolha produtos do catálogo e ajuste a quantidade do pedido.', image: '/b2b/quantity.jpg', icon: ShoppingCart },
  { id: 'eventos', title: 'Personalizados para eventos', cardTitle: 'Personalizados para eventos', description: 'Peças para escolas, festas, ações e eventos, como chaveiros personalizados.', image: '/b2b/events.jpg', icon: PartyPopper },
  { id: 'sob_medida', title: 'Novo produto sob medida', cardTitle: 'Novo produto sob medida', description: 'Desenvolva uma peça exclusiva, como esculturas e brindes para sua empresa.', image: '/b2b/bespoke.jpg', icon: Shapes },
];

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
const cartUnitPrice = (item: CartItem) => item.priceValue ?? Number(item.price.replace(/[^\d,.]/g, '').replace(/\./g, '').replace(',', '.'));

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
  const totalCartItems = cartItems.reduce((total: number, item: CartItem) => total + item.quantity, 0);

  return (
    <nav className="sticky top-0 z-50 bg-[#061524]/95 backdrop-blur-md border-b border-white/10">
      <div className="max-w-[1500px] mx-auto px-5 sm:px-8 lg:px-12 h-[72px] md:h-[92px] flex items-center justify-between gap-5">
        <a href="/b2b.html" className="flex-shrink-0 leading-none" aria-label="FreoFigures Corporativo">
          <span className="block font-display font-black text-xl sm:text-2xl lg:text-[30px] tracking-[-0.065em] text-white">FREO<span className="text-[#397eac]">FIGURES</span></span>
          <span className="block mt-2 text-[9px] sm:text-xs uppercase tracking-[0.28em] text-white/75">Corporativo</span>
        </a>

        <label className="hidden md:flex items-center flex-1 max-w-[545px] relative">
          <Search className="w-6 h-6 absolute left-5 pointer-events-none text-white/70" />
          <span className="sr-only">Buscar no catálogo B2B</span>
          <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar no catálogo B2B..." className="w-full rounded-[10px] bg-white/[0.055] border border-white/15 pl-14 pr-4 py-3.5 text-base text-white placeholder:text-white/55 outline-none focus:border-[#eab956]" />
        </label>

        <div className="flex items-center gap-5 sm:gap-7 flex-shrink-0 text-white">
          <details className="relative hidden sm:block group">
            <summary className="list-none cursor-pointer flex items-center gap-2 text-sm font-medium uppercase tracking-wide [&::-webkit-details-marker]:hidden">CNPJ <ChevronDown className="w-5 h-5" /></summary>
            <div className="absolute right-0 top-full mt-5 w-64 bg-[#0d2234] border border-white/15 rounded-lg p-4 shadow-xl text-sm z-50">
              <p className="font-semibold text-white truncate">{profile?.company_name || 'Conta empresarial'}</p>
              {profile?.cnpj && <p className="text-white/60 mt-1">CNPJ: {profile.cnpj}</p>}
              <a href="/b2b-conta.html" className="block mt-4 text-[#f0bf5d] hover:underline">Área da empresa</a>
            </div>
          </details>
          <span className="hidden sm:block h-8 w-px bg-white/15" />
          <a href="/b2b-conta.html" className="hover:text-[#f0bf5d] transition-colors" aria-label="Área da empresa"><User className="w-6 h-6 sm:w-7 sm:h-7" strokeWidth={1.8} /></a>
          <button onClick={onOpenCart} className="relative hover:text-[#f0bf5d] transition-colors" aria-label="Carrinho">
            <ShoppingCart className="w-6 h-6 sm:w-8 sm:h-8" strokeWidth={1.8} />
            {totalCartItems > 0 && <span className="absolute -top-2 -right-2 text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center bg-[#f0bf5d] text-black">{totalCartItems}</span>}
          </button>
        </div>
      </div>
      <label className="md:hidden flex items-center relative mx-5 sm:mx-8 mb-3">
        <Search className="w-4 h-4 absolute left-4 pointer-events-none text-white/60" />
        <span className="sr-only">Buscar no catálogo B2B</span>
        <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar no catálogo B2B..." className="w-full rounded-lg bg-white/[0.055] border border-white/15 pl-11 pr-4 py-2.5 text-sm text-white placeholder:text-white/55 outline-none focus:border-[#eab956]" />
      </label>
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

  return (
    <div>
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between text-left"
      >
        <div>
          <span className="font-mono text-[10px] uppercase tracking-widest block mb-0.5" style={{ color: B2B_MUTED }}>Preço da loja</span>
          <span className="font-mono text-sm font-bold text-white">{formatPrice(basePrice)} / un.</span>
          <span className="font-mono text-[10px] block mt-1" style={{ color: B2B_GOLD }}>Ver faixas para cotação</span>
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
  product, tiers, onAddToCart, onRequestQuote, section,
}: { product: Product; tiers: PriceTier[]; onAddToCart: (p: Product) => void; onRequestQuote: (p: Product) => void; section: B2BCategory }) => {
  const thumb = product.images && product.images.length > 0 ? product.images[0] : null;
  const hasPromo = product.promotional_price !== null && product.promotional_price < product.price;
  const basePrice = hasPromo ? product.promotional_price! : product.price;
  const isQuoteOnly = product.sale_mode === 'quote_only' || section !== 'loja';
  const needsConfiguration = !!product.is_kit || (Array.isArray(product.variants) && product.variants.some(group => Array.isArray(group.options) && group.options.length > 0));
  const detailHref = product.is_kit && product.kit_type === 'configurable' ? `/montar-kit.html?id=${encodeURIComponent(product.id)}` : `/produto?id=${encodeURIComponent(product.id)}`;

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
          <span className="font-mono text-[10px] uppercase tracking-wider block mb-1" style={{ color: B2B_ACCENT }}>{section === 'loja' ? product.category || 'Geral' : section === 'eventos' ? 'Eventos' : 'Sob medida'}</span>
          <h3 className="font-display font-bold text-sm text-white leading-tight line-clamp-2">{product.title}</h3>
        </div>

        <div className="mt-auto flex flex-col gap-3">
          {isQuoteOnly ? (
            <p className="font-mono text-xs" style={{ color: B2B_MUTED }}>Preço definido após avaliarmos quantidade e especificações.</p>
          ) : (
            <>
              {needsConfiguration ? <p className="font-mono text-xs" style={{ color: B2B_MUTED }}>Escolha as opções e confira o preço na página do produto.</p> : <PriceTierTable tiers={tiers} basePrice={basePrice} />}
              {tiers.length > 0 && <p className="font-mono text-[10px] leading-relaxed" style={{ color: B2B_MUTED }}>As faixas são referenciais. O checkout usa o preço da loja; solicite cotação para preço por volume.</p>}
            </>
          )}

          {isQuoteOnly ? (
            <button type="button" onClick={() => onRequestQuote(product)} className="w-full flex items-center justify-center gap-2 font-display font-bold uppercase tracking-wider py-2.5 text-xs transition-colors" style={{ background: '#25D366', color: '#000' }}>
              <MessageCircle className="w-4 h-4" />Descrever pedido e cotar
            </button>
          ) : (
            <div className="space-y-2">
            {needsConfiguration ? <a href={detailHref} className="w-full flex items-center justify-center gap-2 font-display font-bold uppercase tracking-wider py-2.5 text-xs transition-colors" style={{ background: B2B_ACCENT, color: '#fff' }}>Ver opções e comprar</a> : <button
              onClick={() => {
                trackEvent('add_to_cart', String(product.id), product.title);
                onAddToCart(product);
              }}
              disabled={Number(product.stock || 0) < 1}
              className="w-full flex items-center justify-center gap-2 font-display font-bold uppercase tracking-wider py-2.5 text-xs transition-colors disabled:opacity-40"
              style={{ background: B2B_ACCENT, color: '#fff' }}
            >
              <ShoppingCart className="w-4 h-4" />
              {Number(product.stock || 0) < 1 ? 'Indisponível' : 'Comprar pelo preço da loja'}
            </button>}
            {tiers.length > 0 && <button type="button" onClick={() => onRequestQuote(product)} className="w-full flex items-center justify-center gap-2 border py-2.5 font-display font-bold uppercase tracking-wider text-xs" style={{ borderColor: B2B_GOLD, color: B2B_GOLD }}><MessageCircle className="w-4 h-4" />Solicitar preço por volume</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const B2BProjectBrief = ({ section, userId, companyName, selectedProduct }: { section: B2BCategory; userId: string; companyName?: string | null; selectedProduct: Product | null }) => {
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('');
  const [deadline, setDeadline] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const subject = section === 'eventos' ? 'personalizados para eventos' : section === 'sob_medida' ? 'novo produto sob medida' : 'preço por volume';

  useEffect(() => {
    if (selectedProduct) setDescription(`Tenho interesse em ${selectedProduct.title} (ID ${selectedProduct.id}). `);
  }, [selectedProduct]);

  const requestQuote = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const db = (window as any).supabaseClient;
      const { data: authData, error: authError } = await db.auth.getUser();
      if (authError || authData.user?.id !== userId) {
        setError('Sua sessão expirou. Entre novamente para solicitar a cotação.');
        return;
      }
      const { data, error: insertError } = await db.from('b2b_quote_requests').insert({
        user_id: userId,
        category: section,
        product_id: selectedProduct?.id ?? null,
        description: description.trim(),
        quantity: Number(quantity),
        deadline: deadline.trim() || null,
      }).select('id').single();
      if (insertError || !data) throw insertError || new Error('Sem confirmação');
      const message = [
        `Olá! Gostaria de solicitar uma cotação B2B para ${subject}.`,
        `Protocolo: ${data.id}`,
        companyName ? `Empresa: ${companyName}` : '',
        `Projeto: ${description.trim()}`,
        `Quantidade estimada: ${quantity.trim()}`,
        deadline.trim() ? `Prazo desejado: ${deadline.trim()}` : '',
      ].filter(Boolean).join('\n');
      trackEvent('b2b_quote_click', undefined, subject);
      setSuccess(`Solicitação registrada. Protocolo ${data.id}. Continue a conversa no WhatsApp ou acompanhe na área da empresa.`);
      window.location.assign(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`);
    } catch {
      setError('Não foi possível confirmar a cotação. Confira suas solicitações na área da empresa antes de tentar novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  return <form id="b2b-brief" onSubmit={requestQuote} className="mt-8 border bg-[#111316] p-5 md:p-7 scroll-mt-24" style={{ borderColor: `${B2B_ACCENT}35` }}>
    <h2 className="font-display font-black text-xl uppercase text-white">Conte seu projeto</h2>
    <p className="font-body text-sm mt-1 mb-5" style={{ color: B2B_MUTED }}>Registre o pedido para acompanhá-lo na área da empresa e continue a conversa pelo WhatsApp.</p>
    {error && <p role="alert" className="mb-4 text-sm text-red-400">{error} <a href="/b2b-conta.html" className="underline">Ver solicitações</a></p>}
    {success && <p role="status" className="mb-4 text-sm text-green-400">{success} <a href="/b2b-conta.html" className="underline">Ver solicitações</a></p>}
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <label className="sm:col-span-2 block font-mono text-xs text-white/70">O que você quer criar?
        <textarea required minLength={10} maxLength={1000} value={description} onChange={e => setDescription(e.target.value)} placeholder={section === 'eventos' ? 'Ex.: chaveiros com o símbolo da escola para a formatura' : 'Ex.: escultura exclusiva para presentear clientes da empresa'} className="mt-2 w-full min-h-28 bg-[#0A0A0A] border p-3 text-sm text-white outline-none" style={{ borderColor: `${B2B_ACCENT}35` }} />
      </label>
      <label className="block font-mono text-xs text-white/70">Quantidade estimada
        <input required type="number" min="1" step="1" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="Ex.: 100" className="mt-2 w-full bg-[#0A0A0A] border p-3 text-sm text-white outline-none" style={{ borderColor: `${B2B_ACCENT}35` }} />
      </label>
      <label className="block font-mono text-xs text-white/70">Prazo desejado (opcional)
        <input type="text" maxLength={100} value={deadline} onChange={e => setDeadline(e.target.value)} placeholder="Ex.: até novembro" className="mt-2 w-full bg-[#0A0A0A] border p-3 text-sm text-white outline-none" style={{ borderColor: `${B2B_ACCENT}35` }} />
      </label>
    </div>
    <button type="submit" disabled={submitting} className="mt-5 inline-flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 font-display font-bold uppercase text-sm disabled:opacity-50" style={{ background: B2B_ACCENT, color: '#fff' }}><MessageCircle className="w-4 h-4" />{submitting ? 'Registrando...' : 'Solicitar cotação'}</button>
  </form>;
};

const B2BInformation = ({ onSelect }: { onSelect: (section: B2BCategory) => void }) => (
  <div className="bg-[#f6f3ed] text-[#071827]">
    <div className="max-w-[1500px] mx-auto px-5 sm:px-8 lg:px-12 py-16 md:py-20">
      <div className="grid lg:grid-cols-[0.85fr_1.15fr] gap-10 lg:gap-20">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-[#397eac] mb-3">Seu projeto, do começo ao fim</p>
          <h2 className="font-display font-black text-3xl md:text-5xl leading-tight tracking-tight">Da ideia à peça pronta para sua empresa.</h2>
          <p className="font-body text-base text-[#425361] mt-5 leading-relaxed">Conte o que você precisa e receba uma proposta adequada ao tipo de peça, à quantidade e ao prazo do seu projeto.</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          {[
            ['01', 'Conte sua ideia', 'Envie o objetivo, referências, quantidade e onde as peças serão usadas.'],
            ['02', 'Receba uma proposta', 'Avaliamos dimensões, materiais, acabamento e volume antes de definir o valor.'],
            ['03', 'Aprove o projeto', 'Alinhamos os detalhes visuais e as condições de produção antes de começar.'],
            ['04', 'Produção e entrega', 'Prazo, embalagem e envio são combinados conforme a proposta aprovada.'],
          ].map(([number, title, description]) => <div key={number} className="bg-white border border-[#dfe5e7] rounded-xl p-5">
            <span className="font-display font-black text-2xl text-[#d0a346]">{number}</span>
            <h3 className="font-display font-bold text-lg mt-3">{title}</h3>
            <p className="font-body text-sm text-[#586772] mt-2 leading-relaxed">{description}</p>
          </div>)}
        </div>
      </div>

      <div className="mt-14 grid lg:grid-cols-2 gap-5">
        <div className="bg-[#071827] text-white rounded-xl p-7 md:p-9">
          <h3 className="font-display font-black text-2xl">O que enviar para cotar</h3>
          <ul className="font-body text-sm text-white/75 mt-5 space-y-3 list-disc pl-5 leading-relaxed">
            <li>Quantidade estimada e tipo de peça: chaveiro, miniatura, escultura ou outra ideia.</li>
            <li>Logo, desenho, foto ou referência visual que você tenha autorização para usar.</li>
            <li>Tamanho, cores, acabamento e embalagem desejados, se já souber.</li>
            <li>Data necessária e CEP de entrega para avaliarmos prazo e envio.</li>
          </ul>
        </div>
        <div className="bg-white border border-[#dfe5e7] rounded-xl p-7 md:p-9">
          <h3 className="font-display font-black text-2xl">Dúvidas comuns</h3>
          <div className="mt-4 divide-y divide-[#dfe5e7]">
            <details className="py-3 group"><summary className="cursor-pointer font-semibold text-sm">Existe quantidade mínima?</summary><p className="font-body text-sm text-[#586772] mt-2">Ela depende do produto e do processo. Informe a quantidade desejada para avaliarmos a viabilidade.</p></details>
            <details className="py-3 group"><summary className="cursor-pointer font-semibold text-sm">Posso pedir uma peça que ainda não está no catálogo?</summary><p className="font-body text-sm text-[#586772] mt-2">Sim. Use a opção “Novo produto sob medida” e descreva a ideia para receber uma proposta.</p></details>
            <details className="py-3 group"><summary className="cursor-pointer font-semibold text-sm">Como são definidos preço e prazo?</summary><p className="font-body text-sm text-[#586772] mt-2">Eles dependem da quantidade, dimensões, acabamento e entrega. Informamos as condições na cotação.</p></details>
          </div>
        </div>
      </div>
      <div className="mt-10 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between border-t border-[#d7dfdf] pt-8">
        <p className="font-display font-bold text-xl">Pronto para conversar sobre o seu projeto?</p>
        <div className="flex flex-col sm:flex-row gap-3">
          <button type="button" onClick={() => onSelect('eventos')} className="rounded-lg bg-[#071827] text-white px-5 py-3 font-display font-bold text-sm hover:bg-[#15394f]">Personalizados para eventos</button>
          <button type="button" onClick={() => onSelect('sob_medida')} className="rounded-lg border border-[#071827] text-[#071827] px-5 py-3 font-display font-bold text-sm hover:bg-white">Novo produto sob medida</button>
        </div>
      </div>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// CART DRAWER (reaproveita mesma cart_items / mesmo checkout.html do site)
// ─────────────────────────────────────────────────────────────────────────────

const B2BCartDrawer = ({ isOpen, onClose, cartItems, updateQuantity, removeItem, error, busyItem }: any) => {
  const total = cartItems.reduce((acc: number, item: CartItem) => acc + cartUnitPrice(item) * item.quantity, 0);

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
              {error && <p role="alert" className="text-xs text-red-400 border border-red-500/30 p-3">{error}</p>}
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
                          <button disabled={busyItem !== null} onClick={() => updateQuantity(item, -1)} className="text-white/60 hover:text-white p-0.5 disabled:opacity-30" aria-label={`Diminuir quantidade de ${item.name}`}><Minus className="w-3 h-3" /></button>
                          <span className="font-mono text-xs text-white w-4 text-center">{item.quantity}</span>
                          <button disabled={busyItem !== null} onClick={() => updateQuantity(item, 1)} className="text-white/60 hover:text-white p-0.5 disabled:opacity-30" aria-label={`Aumentar quantidade de ${item.name}`}><Plus className="w-3 h-3" /></button>
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
                  disabled={busyItem !== null}
                  onClick={() => { window.location.href = '/checkout.html'; }}
                  className="w-full font-bold font-display uppercase tracking-widest py-3.5 text-sm transition-colors disabled:opacity-50"
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
  const [catalogError, setCatalogError] = useState('');
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeSection, setActiveSection] = useState<B2BCategory>('loja');
  const [quoteProduct, setQuoteProduct] = useState<Product | null>(null);
  const [cartError, setCartError] = useState('');
  const [busyCartItem, setBusyCartItem] = useState<number | null>(null);

  const openSection = (section: B2BCategory) => {
    setActiveSection(section);
    setSearchTerm('');
    setQuoteProduct(null);
    document.getElementById('b2b-catalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

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
          priceValue: Number(item.price),
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
      setCatalogError('');
      try {
        // @ts-ignore
        const supabase = window.supabaseClient || window.supabase;
        if (!supabase) throw new Error('Conexão com o catálogo indisponível.');

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
        setCatalogError(err instanceof Error ? err.message : 'Não foi possível carregar o catálogo.');
      } finally {
        setLoadingProducts(false);
      }
    };
    load();
  }, [authState]);

  const filtered = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const sectionProducts = products.filter(p => (p.b2b_category || 'loja') === activeSection);
    if (!query) return sectionProducts;
    return sectionProducts.filter(p =>
      p.title.toLowerCase().includes(query) ||
      (p.category || '').toLowerCase().includes(query)
    );
  }, [products, searchTerm, activeSection]);

  const addToCart = async (product: Product) => {
    // @ts-ignore
    const supabase = window.supabaseClient || window.supabase;
    if (!supabase) { setCartError('Conexão com o carrinho indisponível.'); setIsCartOpen(true); return; }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setCartError('Sua sessão expirou. Entre novamente.'); setIsCartOpen(true); return; }

    try {
      setCartError('');
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
        priceValue: priceNum,
        img: thumb,
        quantity: 1,
        variant: null,
      }]);
      setIsCartOpen(true);
    } catch (err) {
      console.error('[B2B] erro ao adicionar ao carrinho:', err);
      setCartError(err instanceof Error ? err.message : 'Não foi possível adicionar o produto.');
      setIsCartOpen(true);
    }
  };

  const updateQuantity = async (product: CartItem, delta: number) => {
    if (!product.cartItemId || busyCartItem !== null) return;
    const nextQuantity = Math.max(1, product.quantity + delta);
    if (nextQuantity === product.quantity) return;
    setCartError('');
    setBusyCartItem(product.cartItemId);
    try {
      // @ts-ignore
      const supabase = window.supabaseClient || window.supabase;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sua sessão expirou. Entre novamente.');
      const { data, error } = await supabase.from('cart_items')
        .update({ quantity: nextQuantity, total_price: Math.round(cartUnitPrice(product) * nextQuantity * 100) / 100 })
        .eq('id', product.cartItemId).eq('user_id', session.user.id).select('id,quantity').single();
      if (error || !data) throw error || new Error('Item do carrinho não encontrado');
      setCartItems(prev => prev.map(item => item.cartItemId === product.cartItemId ? { ...item, quantity: Number(data.quantity) } : item));
    } catch (error) {
      setCartError(error instanceof Error ? error.message : 'Não foi possível atualizar a quantidade.');
    } finally {
      setBusyCartItem(null);
    }
  };

  const removeItem = async (product: CartItem) => {
    try {
      // @ts-ignore
      const supabase = window.supabaseClient || window.supabase;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !product.cartItemId) throw new Error('Sua sessão expirou. Entre novamente.');
      const { error } = await supabase.from('cart_items').delete().eq('id', product.cartItemId).eq('user_id', session.user.id);
      if (error) throw error;
      setCartItems(prev => prev.filter(item => item.cartItemId !== product.cartItemId));
      setCartError('');
    } catch (error) {
      setCartError(error instanceof Error ? error.message : 'Não foi possível remover o item.');
    }
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

      <section className="relative isolate min-h-[500px] md:min-h-[495px] overflow-hidden">
        <img src="/b2b/hero.jpg" alt="Exemplos ilustrativos de miniaturas personalizadas" className="absolute inset-0 w-full h-full object-cover object-[68%_center] md:object-center" fetchPriority="high" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#041523] via-[#041523]/85 to-[#041523]/10 md:via-[#041523]/55" />
        <div className="relative max-w-[1500px] mx-auto px-5 sm:px-8 lg:px-12 min-h-[500px] md:min-h-[495px] flex flex-col justify-center items-start py-12">
          <h1 className="font-display font-black text-[clamp(3.1rem,6.2vw,5.9rem)] leading-[0.99] tracking-[-0.055em] text-white max-w-[780px]">
            Soluções <span className="text-[#f0bf5d]">B2B</span><br />para sua empresa
          </h1>
          <p className="font-body text-lg sm:text-xl md:text-[25px] text-[#d4dce5] max-w-[420px] leading-snug mt-5">Colecionáveis personalizados para fortalecer a sua marca.</p>
          <button type="button" onClick={() => openSection('loja')} className="mt-8 inline-flex items-center justify-between gap-5 min-w-[250px] sm:min-w-[390px] rounded-[11px] bg-gradient-to-b from-[#ffdc8c] to-[#e8b34f] px-6 sm:px-8 py-4 sm:py-5 text-[#10151a] font-display font-bold text-lg sm:text-xl shadow-lg shadow-black/20 hover:brightness-110 transition-all">
            Comprar em quantidade <ArrowRight className="w-6 h-6" />
          </button>
        </div>
      </section>

      <section className="bg-[#f6f3ed]" aria-label="Escolha uma solução B2B">
        <nav className="max-w-[1600px] mx-auto px-5 sm:px-8 lg:px-12 py-5 md:py-6 grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6" aria-label="Soluções B2B">
          {B2B_SECTIONS.map(({ id, cardTitle, image, icon: Icon }) => <button key={id} type="button" aria-pressed={activeSection === id} onClick={() => openSection(id)} className="group relative overflow-hidden rounded-xl text-left h-[235px] md:h-[275px] lg:h-[285px] border border-white/10 bg-[#061827] focus-visible:outline focus-visible:outline-3 focus-visible:outline-[#f0bf5d]">
            <img src={image} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500" />
            <span className="absolute inset-0 bg-gradient-to-r from-[#061827]/95 via-[#061827]/65 to-transparent" />
            <span className="relative z-10 flex flex-col items-start h-full p-6 sm:p-7 text-white">
              <Icon className="w-9 h-9 text-[#f2c363]" strokeWidth={1.8} aria-hidden="true" />
              <span className="font-display font-bold text-[27px] lg:text-[31px] leading-tight tracking-tight max-w-[270px] mt-5">{cardTitle}</span>
              <span className="mt-auto inline-flex w-12 h-12 rounded-full items-center justify-center bg-gradient-to-b from-[#ffda87] to-[#e4ad45] text-[#081827] group-hover:translate-x-1 transition-transform"><ArrowRight className="w-6 h-6" /></span>
            </span>
          </button>)}
        </nav>
        <p className="max-w-[1500px] mx-auto px-5 sm:px-8 lg:px-12 pb-5 text-xs text-[#73808a]">Imagens ilustrativas. Modelos, materiais e acabamento são definidos conforme cada pedido.</p>
      </section>

      <B2BInformation onSelect={openSection} />

      <section id="b2b-catalog" className="scroll-mt-32 max-w-[1500px] mx-auto px-5 sm:px-8 lg:px-12 py-14 md:py-20">

        <div className="mb-8">
          <p className="font-mono text-xs tracking-[0.2em] uppercase text-[#e3b653] mb-2">Catálogo e cotação</p>
          <h2 className="font-display font-black text-3xl md:text-4xl text-white">{B2B_SECTIONS.find(section => section.id === activeSection)?.title}</h2>
          <p className="font-body text-sm md:text-base mt-2" style={{ color: B2B_MUTED }}>
            {activeSection === 'loja' ? 'Compre itens já disponíveis no catálogo. Para negociar faixas por volume, peça uma cotação antes de finalizar.' : activeSection === 'eventos' ? 'Veja os produtos para eventos ou conte o que precisa. Cada projeto é orçado de acordo com os detalhes e a quantidade.' : 'Sua empresa tem uma ideia que ainda não existe no catálogo? Descreva a peça e receba uma proposta.'}
          </p>
          {!loadingProducts && <p className="font-mono text-xs mt-2" style={{ color: B2B_ACCENT_LIGHT }}>{filtered.length} produto{filtered.length !== 1 ? 's' : ''} nesta categoria</p>}
        </div>

        {catalogError ? (
          <div role="alert" className="border p-6 text-center" style={{ borderColor: '#a33', color: '#ff8a8a' }}>
            <p>Não foi possível carregar o catálogo B2B: {catalogError}</p>
            <button type="button" onClick={() => window.location.reload()} className="mt-3 underline text-sm">Tentar novamente</button>
          </div>
        ) : loadingProducts ? (
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
          <div className="text-center py-12">
            <p className="font-display font-bold text-lg uppercase text-white/30 mb-2">
              {searchTerm ? 'Nenhum resultado para essa busca' : activeSection === 'loja' ? 'Nenhum produto disponível no momento' : 'Novos produtos serão adicionados aqui em breve'}
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
                onRequestQuote={product => { setQuoteProduct(product); window.setTimeout(() => document.getElementById('b2b-brief')?.scrollIntoView({ behavior: 'smooth' }), 0); }}
                section={activeSection}
              />
            ))}
          </div>
        )}
        {(activeSection !== 'loja' || quoteProduct) && <B2BProjectBrief key={activeSection} section={activeSection} userId={profile!.id} companyName={profile?.company_name} selectedProduct={quoteProduct} />}
      </section>

      <B2BCartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cartItems={cartItems}
        updateQuantity={updateQuantity}
        removeItem={removeItem}
        error={cartError}
        busyItem={busyCartItem}
      />
    </div>
  );
}
