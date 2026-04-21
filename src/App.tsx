import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShoppingCart, Menu, X, ChevronRight, Box, Layers, Zap, Hexagon, Search, User, Trash2, Plus, Minus } from 'lucide-react';

// --- Types ---
type CartItem = {
  name: string;
  price: string;
  img: string;
  quantity: number;
};

type Product = {
  id: number;
  title: string;
  price: number;
  promotional_price: number | null;
  category: string | null;
  images: string[];
  tags: string[] | null;
  is_active: boolean;
};

// --- Components ---

const Navbar = ({ currentView, setCurrentView, onOpenAuth, cartItems, onOpenCart, user }: any) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav className={`fixed top-0 left-0 w-full z-50 transition-all duration-300 ${isScrolled ? 'bg-freo-black/80 backdrop-blur-md border-b border-white/10 py-4' : 'bg-transparent py-6'}`}>
      <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
        <div className="flex items-center gap-3 z-50 cursor-pointer" onClick={() => setCurrentView('home')}>
          <img src="https://rrmxqpvxrpcqqxsgccqw.supabase.co/storage/v1/object/public/imagens/logo.jpg" alt="Freo Figures Logo" className="w-10 h-10 rounded-full object-cover border-2 border-freo-orange shadow-[0_0_10px_rgba(221,175,52,0.5)]" />
          <span className="font-display font-black text-2xl tracking-tighter uppercase">
            Freo<span className="text-freo-orange font-light">Figures</span>
          </span>
        </div>

        <div className="hidden md:flex items-center gap-8 font-body text-sm font-semibold tracking-widest uppercase text-freo-light">
          {currentView === 'home' ? (
            <>
              <a href="#categorias" className="hover:text-freo-orange transition-colors">Categorias</a>
              <a href="#destaques" className="hover:text-freo-orange transition-colors">Destaques</a>
              <a href="#sobre" className="hover:text-freo-orange transition-colors">O Processo</a>
              <a href="#sobre-nos" className="hover:text-freo-orange transition-colors">A Origem</a>
              <button onClick={() => { setCurrentView('shop'); window.scrollTo(0, 0); }} className="text-freo-orange hover:text-white transition-colors">Catálogo</button>
            </>
          ) : (
            <>
              <button onClick={() => { setCurrentView('home'); window.scrollTo(0, 0); }} className="hover:text-freo-orange transition-colors">Início</button>
              <span className="text-freo-orange">Catálogo</span>
            </>
          )}
        </div>

        <div className="hidden md:flex items-center gap-6">
          {user && (
            <a href="/meus-pedidos.html" className="flex items-center gap-2 text-xs font-mono text-freo-orange hover:text-white transition-colors border border-freo-orange/30 hover:border-white/30 bg-freo-orange/10 px-3 py-1.5 rounded">
              <Box className="w-4 h-4" />
              Meus Pedidos
            </a>
          )}
          <button className="text-freo-light hover:text-freo-orange transition-colors"><Search className="w-5 h-5" /></button>
          <button onClick={onOpenAuth} className="text-freo-light hover:text-freo-orange transition-colors"><User className="w-5 h-5" /></button>
          <button onClick={onOpenCart} className="text-freo-light hover:text-freo-orange transition-colors relative">
            <ShoppingCart className="w-5 h-5" />
            {cartItems.length > 0 && (
              <span className="absolute -top-2 -right-2 bg-freo-orange text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {cartItems.reduce((acc: number, item: any) => acc + item.quantity, 0)}
              </span>
            )}
          </button>
        </div>

        <button className="md:hidden text-freo-white z-50" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
          {mobileMenuOpen ? <X /> : <Menu />}
        </button>
      </div>

      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-0 left-0 w-full h-screen bg-freo-black flex flex-col items-center justify-center gap-8 text-2xl font-display font-bold uppercase"
          >
            {currentView === 'home' ? (
              <>
                <a href="#categorias" onClick={() => setMobileMenuOpen(false)} className="hover:text-freo-orange">Categorias</a>
                <a href="#destaques" onClick={() => setMobileMenuOpen(false)} className="hover:text-freo-orange">Destaques</a>
                <a href="#sobre" onClick={() => setMobileMenuOpen(false)} className="hover:text-freo-orange">O Processo</a>
                <a href="#sobre-nos" onClick={() => setMobileMenuOpen(false)} className="hover:text-freo-orange">A Origem</a>
                <button onClick={() => { setCurrentView('shop'); setMobileMenuOpen(false); window.scrollTo(0, 0); }} className="text-freo-orange">Catálogo</button>
              </>
            ) : (
              <>
                <button onClick={() => { setCurrentView('home'); setMobileMenuOpen(false); window.scrollTo(0, 0); }} className="hover:text-freo-orange">Início</button>
                <span className="text-freo-orange">Catálogo</span>
              </>
            )}
            {user && (
              <a href="/meus-pedidos.html" className="text-freo-orange flex items-center gap-2 mt-4 text-lg border border-freo-orange/30 px-6 py-2 rounded bg-freo-orange/10">
                <Box className="w-6 h-6" /> Meus Pedidos
              </a>
            )}
            <button onClick={() => { onOpenAuth(); setMobileMenuOpen(false); }} className="text-freo-light hover:text-freo-orange flex items-center gap-2 mt-4 text-lg">
              <User className="w-6 h-6" /> {user ? 'Minha Conta' : 'Entrar / Criar Conta'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

const Hero = ({ setCurrentView }: any) => {
  return (
    <section className="relative min-h-screen flex items-center pt-20 overflow-hidden">
      <div className="absolute inset-0 bg-printer-bed z-0"></div>
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-freo-orange/20 rounded-full blur-[120px] z-0"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-freo-cyan/10 rounded-full blur-[120px] z-0"></div>

      <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-12 items-center relative z-10 w-full">
        <motion.div
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="flex flex-col items-start gap-6"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 border border-freo-orange/30 bg-freo-orange/10 rounded-full text-freo-orange text-xs font-bold tracking-widest uppercase">
            <Zap className="w-3 h-3" /> Nova Coleção Cyberpunk
          </div>
          <h1 className="text-6xl md:text-8xl font-display font-black leading-[0.85] uppercase">
            Materialize <br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-freo-orange to-freo-cyan text-layered" data-text="Sua Visão">Sua Visão</span>
          </h1>
          <p className="text-freo-light/70 text-lg md:text-xl max-w-md font-body">
            Arte, utilidade e cultura pop esculpidas camada por camada. Impressão 3D de alta precisão com design exclusivo FreoFigures.
          </p>
          <div className="flex gap-4 mt-4">
            <button onClick={() => { setCurrentView('shop'); window.scrollTo(0, 0); }} className="bg-freo-orange text-freo-black font-bold font-display uppercase tracking-widest px-8 py-4 hover:bg-white transition-colors flex items-center gap-2 group">
              Explorar Loja <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
            <a
              href="https://wa.me/5511961789176?text=Olá,%20gostaria%20de%20falar%20sobre%20um%20projeto%20customizado!"
              target="_blank"
              rel="noopener noreferrer"
              className="border border-white/20 text-white font-bold font-display uppercase tracking-widest px-8 py-4 hover:bg-white/10 transition-colors flex items-center justify-center"
            >
              Projetos Custom
            </a>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 0.2 }}
          className="relative h-[600px] w-full hidden lg:block"
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative w-full max-w-md aspect-square">
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 20, repeat: Infinity, ease: "linear" }} className="absolute inset-0 border border-freo-orange/30 rounded-full border-dashed"></motion.div>
              <motion.div animate={{ rotate: -360 }} transition={{ duration: 30, repeat: Infinity, ease: "linear" }} className="absolute inset-4 border border-freo-cyan/20 rounded-full"></motion.div>
              <img src="https://images.unsplash.com/photo-1612196808214-b8e1d6145a8c?q=80&w=800&auto=format&fit=crop" alt="3D Printed" className="absolute inset-8 object-cover rounded-full z-10 shadow-[0_0_50px_rgba(255,77,0,0.3)]" referrerPolicy="no-referrer" />
              <motion.div animate={{ y: [-10, 10, -10] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} className="absolute top-10 -right-10 bg-freo-dark border border-white/10 p-4 rounded-xl z-20 backdrop-blur-md flex items-center gap-3 shadow-xl">
                <Layers className="text-freo-orange w-6 h-6" />
                <div><div className="text-xs text-freo-light/50 uppercase font-bold tracking-wider">Resolução</div><div className="font-display font-bold">0.05mm</div></div>
              </motion.div>
              <motion.div animate={{ y: [10, -10, 10] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }} className="absolute bottom-20 -left-10 bg-freo-dark border border-white/10 p-4 rounded-xl z-20 backdrop-blur-md flex items-center gap-3 shadow-xl">
                <Box className="text-freo-cyan w-6 h-6" />
                <div><div className="text-xs text-freo-light/50 uppercase font-bold tracking-wider">Material</div><div className="font-display font-bold">PLA Silk Premium</div></div>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </div>
      <div className="absolute bottom-0 left-0 w-full layer-line"></div>
    </section>
  );
};

const Marquee = () => (
  <div className="bg-freo-orange text-freo-black py-3 overflow-hidden flex whitespace-nowrap border-y border-freo-orange/50">
    <motion.div animate={{ x: [0, -1035] }} transition={{ duration: 20, repeat: Infinity, ease: "linear" }} className="flex gap-8 font-display font-black text-xl uppercase tracking-widest">
      {[...Array(10)].map((_, i) => (
        <span key={i} className="flex items-center gap-8">
          <span>Impressão 3D</span><Hexagon className="w-4 h-4" fill="currentColor" />
          <span>Action Figures</span><Hexagon className="w-4 h-4" fill="currentColor" />
          <span>Arte Religiosa</span><Hexagon className="w-4 h-4" fill="currentColor" />
          <span>Utensílios</span><Hexagon className="w-4 h-4" fill="currentColor" />
        </span>
      ))}
    </motion.div>
  </div>
);

const Categories = ({ setCurrentView }: any) => {
  const cats = [
    { name: "Action Figures", img: "https://images.unsplash.com/photo-1608889825103-eb5ed706fc64?q=80&w=800&auto=format&fit=crop", desc: "Heróis, vilões e cultura pop." },
    { name: "Religioso", img: "https://images.unsplash.com/photo-1544383835-bca2bc6f5fc4?q=80&w=800&auto=format&fit=crop", desc: "Fé materializada com respeito." },
    { name: "Utensílios", img: "https://images.unsplash.com/photo-1584362917165-526a968579e8?q=80&w=800&auto=format&fit=crop", desc: "Design funcional para o dia a dia." },
    { name: "Decoração", img: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?q=80&w=800&auto=format&fit=crop", desc: "Geometria e arte para seu espaço." }
  ];

  return (
    <section id="categorias" className="py-24 px-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-6">
        <div>
          <h2 className="text-4xl md:text-6xl font-display font-black uppercase tracking-tighter">Nossos <span className="text-freo-orange">Domínios</span></h2>
          <p className="text-freo-light/60 mt-2 font-body max-w-md">Explore nossas categorias de produtos criados com precisão milimétrica.</p>
        </div>
        <button onClick={() => { setCurrentView('shop'); window.scrollTo(0, 0); }} className="text-sm font-bold uppercase tracking-widest border-b border-freo-orange pb-1 hover:text-freo-orange transition-colors">Ver todas as categorias</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {cats.map((cat, i) => (
          <div key={i} className="group relative h-[400px] overflow-hidden bg-freo-dark card-3d cursor-pointer border border-white/5">
            <img src={cat.img} alt={cat.name} className="absolute inset-0 w-full h-full object-cover opacity-50 group-hover:opacity-80 transition-opacity duration-500 grayscale group-hover:grayscale-0" referrerPolicy="no-referrer" />
            <div className="absolute inset-0 bg-gradient-to-t from-freo-black via-freo-black/50 to-transparent"></div>
            <div className="absolute bottom-0 left-0 p-6 w-full transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
              <div className="text-freo-orange font-mono text-xs mb-2 opacity-0 group-hover:opacity-100 transition-opacity delay-100">// CATEGORIA_0{i+1}</div>
              <h3 className="text-2xl font-display font-bold uppercase tracking-wide mb-1">{cat.name}</h3>
              <p className="text-sm text-freo-light/70 font-body opacity-0 group-hover:opacity-100 transition-opacity delay-150">{cat.desc}</p>
            </div>
            <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-freo-orange opacity-0 group-hover:opacity-100 transition-opacity m-4"></div>
            <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-freo-orange opacity-0 group-hover:opacity-100 transition-opacity m-4"></div>
          </div>
        ))}
      </div>
    </section>
  );
};

// ── Helper para formatar preço ─────────────────────────────────────────────
const formatPrice = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

// ── Card de produto reutilizável ───────────────────────────────────────────
const ProductCard = ({ product, onAddToCart, compact = false }: { product: Product; onAddToCart: (p: Product) => void; compact?: boolean }) => {
  const thumb = product.images && product.images.length > 0 ? product.images[0] : null;
  const hasPromo = product.promotional_price && product.promotional_price < product.price;
  const displayPrice = hasPromo ? product.promotional_price! : product.price;
  const tag = product.tags && product.tags.length > 0 ? product.tags[0] : null;

  return (
    <div className={`group flex flex-col ${compact ? '' : 'bg-freo-dark border border-white/5 hover:border-freo-orange/50 transition-colors'}`}>
      <div className={`relative ${compact ? 'aspect-square' : 'aspect-square bg-freo-black'} overflow-hidden ${compact ? 'border border-white/5 group-hover:border-freo-orange/50 transition-colors' : ''} mb-4`}>
        {tag && (
          <div className="absolute top-3 left-3 z-10 bg-freo-orange text-freo-black text-[10px] font-bold uppercase tracking-widest px-2 py-1">
            {tag}
          </div>
        )}
        {thumb ? (
          <img src={thumb} alt={product.title} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all duration-700" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-freo-dark">
            <Box className="w-12 h-12 text-white/10" />
          </div>
        )}
        {!compact && <div className="absolute inset-0 bg-freo-orange/20 opacity-0 group-hover:opacity-100 mix-blend-overlay transition-opacity duration-300"></div>}
      </div>

      <div className={`flex flex-col flex-grow ${compact ? '' : 'p-5'}`}>
        <span className="text-freo-orange text-[10px] font-mono uppercase mb-1 tracking-wider">{product.category || 'Geral'}</span>
        <h3 className={`font-display font-bold leading-tight mb-2 group-hover:text-freo-orange transition-colors ${compact ? 'text-lg' : 'text-lg'}`}>{product.title}</h3>
        <div className="mt-auto flex flex-col gap-3">
          <div className="flex items-end gap-2">
            {hasPromo && <span className="font-mono text-sm text-white/30 line-through">{formatPrice(product.price)}</span>}
            <span className="font-mono text-xl font-bold text-freo-orange">{formatPrice(displayPrice)}</span>
          </div>
          <button
            onClick={() => onAddToCart(product)}
            className="w-full bg-freo-orange text-freo-black font-display font-bold uppercase tracking-wider py-3 hover:bg-white transition-colors flex items-center justify-center gap-2"
          >
            <ShoppingCart className="w-5 h-5" />
            Adicionar ao carrinho
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Seção de destaques — busca os 4 primeiros produtos ativos do Supabase ──
const FeaturedProducts = ({ addToCart }: any) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFeatured = async () => {
      try {
        // @ts-ignore
        const sb = window.supabaseClient || window.supabase;
        if (!sb) return;
        const { data, error } = await sb
          .from('products')
          .select('*')
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(4);
        if (!error && data) setProducts(data);
      } catch (e) {
        console.error('FeaturedProducts fetch error:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchFeatured();
  }, []);

  return (
    <section id="destaques" className="py-24 bg-freo-dark relative border-y border-white/5">
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-freo-orange/50 to-transparent"></div>
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-display font-black uppercase tracking-tighter inline-block relative">
            Destaques da <span className="text-freo-orange">Forja</span>
            <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-24 h-1 bg-freo-orange"></div>
          </h2>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-square bg-freo-dark/80 mb-4"></div>
                <div className="h-3 bg-freo-dark/80 rounded w-1/3 mb-2"></div>
                <div className="h-5 bg-freo-dark/80 rounded w-3/4 mb-4"></div>
                <div className="h-10 bg-freo-dark/80 rounded"></div>
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-16">
            <p className="font-mono text-white/30 text-sm">Nenhum produto cadastrado ainda.</p>
            <a href="/admin/produto.html" className="inline-block mt-4 text-freo-orange font-mono text-xs border border-freo-orange/30 px-4 py-2 hover:bg-freo-orange hover:text-freo-black transition-colors">Cadastrar produtos →</a>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {products.map(p => (
              <ProductCard key={p.id} product={p} onAddToCart={addToCart} compact />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

const ProcessSection = () => (
  <section id="sobre" className="py-24 px-6 max-w-7xl mx-auto">
    <div className="grid lg:grid-cols-2 gap-16 items-center">
      <div className="order-2 lg:order-1 relative">
        <div className="aspect-[4/5] bg-freo-dark border border-white/10 relative overflow-hidden">
          <img src="https://images.unsplash.com/photo-1631541909061-71e34ddde0de?q=80&w=800&auto=format&fit=crop" alt="3D Printing Process" className="w-full h-full object-cover opacity-60 mix-blend-luminosity" referrerPolicy="no-referrer" />
          <motion.div animate={{ top: ['0%', '100%', '0%'] }} transition={{ duration: 4, repeat: Infinity, ease: "linear" }} className="absolute left-0 w-full h-1 bg-freo-orange shadow-[0_0_20px_rgba(255,77,0,0.8)] z-10"></motion.div>
        </div>
        <div className="absolute -bottom-8 -right-8 bg-freo-black border border-freo-orange p-6 max-w-xs">
          <div className="font-mono text-freo-orange text-sm mb-2">// QUALIDADE_FREO</div>
          <div className="font-display font-black text-4xl mb-1">100%</div>
          <div className="text-sm text-freo-light/70 font-body">Inspecionado manualmente antes do envio.</div>
        </div>
      </div>
      <div className="order-1 lg:order-2">
        <h2 className="text-4xl md:text-5xl font-display font-black uppercase tracking-tighter mb-8">A Arte da <br/><span className="text-freo-orange">Manufatura Aditiva</span></h2>
        <div className="space-y-8">
          {[
            { num: "01", title: "Design & Modelagem", desc: "Criamos ou curamos modelos 3D exclusivos, otimizados para a melhor resolução possível." },
            { num: "02", title: "Fatiamento de Precisão", desc: "Configuramos cada camada no software para garantir resistência estrutural e acabamento impecável." },
            { num: "03", title: "Impressão Camada a Camada", desc: "Nossas máquinas de última geração derretem e depositam o material com precisão microscópica." },
            { num: "04", title: "Pós-Processamento", desc: "Limpeza, lixamento (quando necessário) e controle de qualidade rigoroso." }
          ].map((step, i) => (
            <div key={i} className="flex gap-6 group">
              <div className="font-display font-black text-4xl text-freo-gray group-hover:text-freo-orange transition-colors">{step.num}</div>
              <div>
                <h4 className="text-xl font-bold font-display uppercase tracking-wide mb-2">{step.title}</h4>
                <p className="text-freo-light/60 font-body">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </section>
);

const AboutSection = () => (
  <section id="sobre-nos" className="py-32 px-6 bg-freo-black relative overflow-hidden border-t border-white/5">
    <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-freo-orange/5 rounded-full blur-[150px] pointer-events-none"></div>
    <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-freo-cyan/5 rounded-full blur-[100px] pointer-events-none"></div>
    <div className="max-w-4xl mx-auto relative z-10">
      <div className="flex flex-col md:flex-row gap-16 items-start">
        <div className="md:w-1/3 md:sticky md:top-32">
          <div className="font-mono text-freo-orange text-sm mb-4 tracking-widest uppercase">// A ORIGEM</div>
          <h2 className="text-4xl md:text-5xl font-display font-black uppercase tracking-tighter leading-none mb-6">Sobre <br/><span className="text-freo-orange">Nós?</span></h2>
          <div className="w-12 h-1 bg-freo-orange mb-8"></div>
          <div className="relative w-32 h-32 md:w-48 md:h-48 grayscale hover:grayscale-0 transition-all duration-500 border border-white/10">
            <img src="https://rrmxqpvxrpcqqxsgccqw.supabase.co/storage/v1/object/public/imagens/logo.jpg" alt="Freo Figures Creator" className="w-full h-full object-cover opacity-80" referrerPolicy="no-referrer" />
            <div className="absolute inset-0 border border-freo-orange/30 translate-x-2 translate-y-2 -z-10"></div>
          </div>
        </div>
        <div className="md:w-2/3 space-y-8 font-body text-lg text-freo-light/80 leading-relaxed">
          <p className="text-2xl font-display font-medium text-white">É mais sobre por que eu comecei.</p>
          <p>A Freo Figures começou com uma máquina, um rolo de filamento e uma inquietação:<br/><span className="text-freo-orange font-medium italic">"E se eu puder criar exatamente o que eu imagino?"</span></p>
          <p>Eu não comecei isso pensando em abrir empresa.<br/>Eu comecei porque não me conformava em só consumir o que já existia.</p>
          <div className="pl-6 border-l-2 border-freo-orange/50 py-2 space-y-1 font-mono text-sm uppercase tracking-wider text-freo-light/60">
            <p>Eu queria fazer.</p><p>Errar.</p><p>Aprender.</p><p>Melhorar.</p><p className="text-freo-orange">Fazer de novo.</p>
          </div>
          <p>No começo deu errado várias vezes. Peça que não saía como eu queria. Ideia que na cabeça era incrível e na prática não funcionava. Gente dizendo que era melhor vender coisa pronta, mais fácil, mais seguro.</p>
          <p className="font-bold text-white">Mas nunca foi sobre o mais fácil.</p>
          <p>Foi sobre olhar pra algo que não existe ainda e pensar: <br/><span className="text-freo-cyan font-medium italic">"Eu consigo criar isso."</span></p>
          <p>A Freo Figures é pequena. E eu gosto disso.</p>
          <p>Porque aqui nada é automático. Nada é feito no piloto automático. Cada produto que você vê aqui passou pela minha mão. Passou por dúvida. Passou por ajuste. Passou por insistência.</p>
          <p>Eu poderia ter escolhido algo mais simples. Mas escolhi criar. E criar dá trabalho. Mas também dá orgulho.</p>
          <div className="bg-freo-dark p-8 border border-white/5 mt-12 relative">
            <div className="absolute top-0 left-0 w-2 h-full bg-freo-orange"></div>
            <p className="mb-6">Se você está aqui, talvez você também seja do tipo que valoriza quem faz, não só quem vende.</p>
            <p className="font-display text-xl text-white">Então, mais do que comprar uma peça, você está apoiando alguém que decidiu construir algo do zero.<br/><span className="text-freo-orange">Camada por camada. Sem atalho.</span></p>
          </div>
          <div className="pt-8">
            <p className="font-display font-bold uppercase tracking-widest text-sm">Essa é a Freo Figures.<br/><span className="text-freo-light/50">E esse sou eu por trás dela.</span></p>
          </div>
        </div>
      </div>
    </div>
  </section>
);

const Footer = () => (
  <footer className="bg-freo-dark pt-20 pb-10 border-t border-white/10 relative overflow-hidden">
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[15vw] font-display font-black text-white/[0.02] whitespace-nowrap pointer-events-none select-none">FREO FIGURES</div>
    <div className="max-w-7xl mx-auto px-6 relative z-10">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">
        <div className="col-span-1 md:col-span-2 lg:col-span-1">
          <div className="flex items-center gap-3 mb-6">
            <img src="https://rrmxqpvxrpcqqxsgccqw.supabase.co/storage/v1/object/public/imagens/logo.jpg" alt="Logo" className="w-10 h-10 rounded-full object-cover border-2 border-freo-orange" />
            <span className="font-display font-black text-2xl tracking-tighter uppercase">Freo<span className="text-freo-orange font-light">Figures</span></span>
          </div>
          <p className="text-freo-light/60 font-body text-sm mb-6">Transformando filamento em arte. Especialistas em impressão 3D de alta qualidade para colecionadores, devotos e amantes do design.</p>
          <div className="flex gap-4">
            <div className="w-10 h-10 border border-white/20 flex items-center justify-center hover:bg-freo-orange hover:border-freo-orange transition-colors cursor-pointer">IG</div>
            <div className="w-10 h-10 border border-white/20 flex items-center justify-center hover:bg-freo-orange hover:border-freo-orange transition-colors cursor-pointer">TT</div>
            <div className="w-10 h-10 border border-white/20 flex items-center justify-center hover:bg-freo-orange hover:border-freo-orange transition-colors cursor-pointer">YT</div>
          </div>
        </div>
        <div>
          <h4 className="font-display font-bold uppercase tracking-widest mb-6 text-freo-orange">Loja</h4>
          <ul className="space-y-3 text-sm text-freo-light/70 font-body">
            <li><a href="#" className="hover:text-white transition-colors">Action Figures</a></li>
            <li><a href="#" className="hover:text-white transition-colors">Artigos Religiosos</a></li>
            <li><a href="#" className="hover:text-white transition-colors">Utensílios & Casa</a></li>
            <li><a href="#" className="hover:text-white transition-colors">Decoração</a></li>
            <li><a href="https://wa.me/5511961789176?text=Olá,%20gostaria%20de%20falar%20sobre%20um%20projeto%20sob%20medida!" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Projetos Sob Medida</a></li>
          </ul>
        </div>
        <div>
          <h4 className="font-display font-bold uppercase tracking-widest mb-6 text-freo-orange">Suporte</h4>
          <ul className="space-y-3 text-sm text-freo-light/70 font-body">
            <li><a href="#" className="hover:text-white transition-colors">FAQ</a></li>
            <li><a href="#" className="hover:text-white transition-colors">Envio e Prazos</a></li>
            <li><a href="#" className="hover:text-white transition-colors">Trocas e Devoluções</a></li>
            <li><a href="#" className="hover:text-white transition-colors">Cuidados com a Peça</a></li>
            <li><a href="https://wa.me/5511961789176?text=Olá,%20vim%20pelo%20site%20da%20FreoFigures!" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Contato</a></li>
          </ul>
        </div>
        <div>
          <h4 className="font-display font-bold uppercase tracking-widest mb-6 text-freo-orange">Newsletter</h4>
          <p className="text-sm text-freo-light/70 font-body mb-4">Receba novidades sobre novos modelos e descontos exclusivos.</p>
          <div className="flex">
            <input type="email" placeholder="SEU E-MAIL" className="bg-freo-black border border-white/20 px-4 py-2 w-full text-sm font-mono focus:outline-none focus:border-freo-orange" />
            <button className="bg-freo-orange text-freo-black px-4 font-bold hover:bg-white transition-colors"><ChevronRight className="w-5 h-5" /></button>
          </div>
        </div>
      </div>
      <div className="border-t border-white/10 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-freo-light/40 font-mono">
        <div>&copy; {new Date().getFullYear()} FREO FIGURES. TODOS OS DIREITOS RESERVADOS.</div>
        <div className="flex gap-4"><a href="#" className="hover:text-white">TERMOS</a><a href="#" className="hover:text-white">PRIVACIDADE</a></div>
      </div>
    </div>
  </footer>
);

const StoreCTA = ({ setCurrentView }: any) => (
  <section className="py-24 px-6 bg-freo-orange text-freo-black relative overflow-hidden border-y border-freo-orange/50">
    <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
    <div className="max-w-4xl mx-auto text-center relative z-10 flex flex-col items-center">
      <img src="https://rrmxqpvxrpcqqxsgccqw.supabase.co/storage/v1/object/public/imagens/logo.jpg" alt="Logo" className="w-24 h-24 rounded-full object-cover border-4 border-freo-black mb-6 shadow-2xl" />
      <h2 className="text-5xl md:text-7xl font-display font-black uppercase tracking-tighter mb-6 leading-none">Acesse o <br/> Catálogo Completo</h2>
      <p className="font-body text-xl mb-10 font-medium max-w-2xl">Filtre por categorias, explore detalhes e encontre a peça perfeita para o seu setup, altar ou estante.</p>
      <button onClick={() => { setCurrentView('shop'); window.scrollTo(0, 0); }} className="bg-freo-black text-freo-orange font-display font-bold uppercase tracking-widest px-10 py-5 text-lg hover:bg-white hover:text-freo-black transition-colors flex items-center gap-3 group">
        Entrar na Loja <ChevronRight className="group-hover:translate-x-1 transition-transform" />
      </button>
    </div>
  </section>
);

// ── Catálogo completo — busca todos os produtos ativos do Supabase ─────────
const ShopView = ({ addToCart }: any) => {
  const [activeFilter, setActiveFilter] = useState('Todos');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const categories = ['Todos', 'games', 'religioso', 'keycaps', 'personalizado', 'lifestyle', 'outros'];
  const categoryLabels: Record<string, string> = {
    'Todos': 'Todos', 'games': 'Games & Geek', 'religioso': 'Religioso',
    'keycaps': 'Keycaps', 'personalizado': 'Personalizado', 'lifestyle': 'Lifestyle', 'outros': 'Outros'
  };

  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      try {
        // @ts-ignore
        const sb = window.supabaseClient || window.supabase;
        if (!sb) return;
        const { data, error } = await sb
          .from('products')
          .select('*')
          .eq('is_active', true)
          .order('created_at', { ascending: false });
        if (!error && data) setProducts(data);
      } catch (e) {
        console.error('ShopView fetch error:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, []);

  const filtered = activeFilter === 'Todos' ? products : products.filter(p => p.category === activeFilter);

  return (
    <div className="pt-32 pb-24 px-6 max-w-7xl mx-auto min-h-screen">
      <div className="flex flex-col md:flex-row gap-12">
        {/* Sidebar */}
        <div className="md:w-1/4">
          <div className="sticky top-32">
            <h2 className="font-display font-black text-3xl uppercase mb-8">Catálogo</h2>
            <div className="space-y-2">
              {categories.map(cat => (
                <button key={cat} onClick={() => setActiveFilter(cat)} className={`block w-full text-left px-4 py-3 font-mono text-sm uppercase tracking-widest transition-all ${activeFilter === cat ? 'bg-freo-orange text-freo-black font-bold' : 'text-freo-light/60 hover:text-freo-orange hover:bg-white/5'}`}>
                  {activeFilter === cat && <span className="mr-2">&gt;</span>}
                  {categoryLabels[cat] || cat}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Grid */}
        <div className="md:w-3/4">
          <div className="mb-8 flex justify-between items-end border-b border-white/10 pb-4">
            <div className="font-mono text-freo-light/50 text-sm">
              {loading ? 'Carregando...' : <>Mostrando {filtered.length} resultado{filtered.length !== 1 ? 's' : ''} para <span className="text-freo-orange">[{categoryLabels[activeFilter] || activeFilter}]</span></>}
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="animate-pulse bg-freo-dark border border-white/5">
                  <div className="aspect-square bg-freo-black/80"></div>
                  <div className="p-5 space-y-3">
                    <div className="h-3 bg-white/5 rounded w-1/4"></div>
                    <div className="h-5 bg-white/5 rounded w-3/4"></div>
                    <div className="h-5 bg-white/5 rounded w-1/3"></div>
                    <div className="h-10 bg-freo-orange/20 rounded"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-24">
              <div className="text-5xl mb-4">📦</div>
              <p className="font-display font-bold text-xl text-white/20 uppercase mb-2">
                {products.length === 0 ? 'Nenhum produto cadastrado ainda' : 'Nenhum produto nesta categoria'}
              </p>
              <p className="font-mono text-sm text-white/20">
                {products.length === 0 ? 'Use o painel admin para importar seus produtos da Shopee.' : 'Tente outra categoria.'}
              </p>
            </div>
          ) : (
            <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <AnimatePresence>
                {filtered.map(p => (
                  <motion.div key={p.id} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.3 }}>
                    <ProductCard product={p} onAddToCart={addToCart} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
};

const HomeView = ({ setCurrentView, addToCart }: any) => (
  <>
    <Hero setCurrentView={setCurrentView} />
    <Marquee />
    <Categories setCurrentView={setCurrentView} />
    <FeaturedProducts addToCart={addToCart} />
    <StoreCTA setCurrentView={setCurrentView} />
    <ProcessSection />
    <AboutSection />
  </>
);

const AuthModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) { setName(''); setPhone(''); setEmail(''); setPassword(''); setError(''); setSuccess(false); }
  }, [isOpen, isLogin]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.includes('@') || !email.includes('.')) { setError('Por favor, insira um e-mail válido.'); return; }
    if (!isLogin) {
      if (!name || !phone || !email || !password) { setError('Preencha todos os campos.'); return; }
      setLoading(true);
      try {
        // @ts-ignore
        const { data, error } = await window.supabase.auth.signUp({ email, password, options: { data: { name, phone }, emailRedirectTo: "https://freofigures.com.br/auth/callback.html" } });
        if (error) {
          let msg = error.message;
          if (msg.includes('rate limit')) msg = 'Limite de envios excedido. Tente mais tarde.';
          else if (msg.includes('already registered')) msg = 'Este e-mail já está cadastrado.';
          setError(msg);
        } else {
          setSuccess(true);
          setTimeout(() => onClose(), 6000);
          fetch('https://n8nwebhook.solviaoficial.com/webhook/26afb276-b7a5-4d0c-b733-03c47836bd14', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, phone, email, action: 'create_account' }) }).catch(console.error);
        }
      } catch { setError('Erro de conexão. Tente novamente.'); }
      finally { setLoading(false); }
    } else {
      if (!email || !password) { setError('Preencha todos os campos.'); return; }
      setLoading(true);
      try {
        // @ts-ignore
        const { error } = await window.supabase.auth.signInWithPassword({ email, password });
        if (error) {
          let msg = error.message;
          if (msg === 'Invalid login credentials') msg = 'Email ou senha incorretos.';
          else if (msg === 'Email not confirmed') msg = 'Confirme seu email antes de fazer login.';
          setError(msg);
        } else { setSuccess(true); setTimeout(() => { onClose(); window.location.href = '/dashboard.html'; }, 1500); }
      } catch { setError('Erro de conexão. Tente novamente.'); }
      finally { setLoading(false); }
    }
  };

  if (!isOpen) return null;
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-freo-black/80 backdrop-blur-sm"></motion.div>
          <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative w-full max-w-md bg-freo-dark border border-white/10 shadow-2xl overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-freo-orange to-freo-cyan"></div>
            <button onClick={onClose} className="absolute top-4 right-4 text-freo-light/50 hover:text-white transition-colors"><X className="w-6 h-6" /></button>
            <div className="p-8">
              <div className="flex justify-center mb-8">
                <img src="https://rrmxqpvxrpcqqxsgccqw.supabase.co/storage/v1/object/public/imagens/logo.jpg" alt="Logo" className="w-16 h-16 rounded-full object-cover border-2 border-freo-orange shadow-[0_0_15px_rgba(221,175,52,0.3)]" />
              </div>
              <h2 className="text-3xl font-display font-black uppercase text-center mb-2">{isLogin ? 'Acessar a Forja' : 'Criar Conta'}</h2>
              <p className="text-freo-light/60 text-center font-body text-sm mb-8">{isLogin ? 'Entre para acompanhar seus pedidos e projetos.' : 'Junte-se à revolução da manufatura aditiva.'}</p>
              {success ? (
                <div className="bg-freo-cyan/10 border border-freo-cyan text-freo-cyan p-6 text-center font-mono text-sm mb-6 flex flex-col items-center gap-3">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  <span>{isLogin ? 'Login realizado com sucesso!' : '✅ Conta criada! Verifique seu email.'}</span>
                </div>
              ) : (
                <div className="space-y-4">
                  {error && <div className="bg-freo-orange/10 border border-freo-orange text-freo-orange p-3 text-center font-mono text-xs">{error}</div>}
                  <form className="space-y-4" onSubmit={handleSubmit}>
                    {!isLogin && (<><input type="text" placeholder="NOME COMPLETO" value={name} onChange={e => setName(e.target.value)} className="w-full bg-freo-black border border-white/10 px-4 py-3 font-mono text-sm focus:outline-none focus:border-freo-orange transition-colors" /><input type="tel" placeholder="TELEFONE / WHATSAPP" value={phone} onChange={e => setPhone(e.target.value)} className="w-full bg-freo-black border border-white/10 px-4 py-3 font-mono text-sm focus:outline-none focus:border-freo-orange transition-colors" /></>)}
                    <input type="email" placeholder="E-MAIL" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-freo-black border border-white/10 px-4 py-3 font-mono text-sm focus:outline-none focus:border-freo-orange transition-colors" />
                    <input type="password" placeholder="SENHA" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-freo-black border border-white/10 px-4 py-3 font-mono text-sm focus:outline-none focus:border-freo-orange transition-colors" />
                    <button type="submit" disabled={loading} className="w-full bg-freo-orange text-freo-black font-display font-bold uppercase tracking-widest py-4 hover:bg-white transition-colors mt-2 disabled:opacity-50 disabled:cursor-not-allowed">{loading ? 'Processando...' : (isLogin ? 'Entrar' : 'Criar Conta')}</button>
                  </form>
                </div>
              )}
              <div className="mt-8 text-center">
                <button onClick={() => setIsLogin(!isLogin)} className="text-freo-light/60 hover:text-freo-orange text-sm font-body transition-colors">{isLogin ? 'Não tem uma conta? Crie agora.' : 'Já tem uma conta? Faça login.'}</button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

const CartDrawer = ({ isOpen, onClose, cartItems, updateQuantity, removeItem }: any) => {
  const total = cartItems.reduce((acc: number, item: any) => {
    const priceStr = item.price.replace('R$', '').replace(/\s/g, '').replace(',', '.');
    return acc + (parseFloat(priceStr) * item.quantity);
  }, 0);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-[100] bg-freo-black/80 backdrop-blur-sm" />
          <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'tween', duration: 0.3 }} className="fixed top-0 right-0 h-full w-full sm:w-[400px] bg-freo-dark border-l border-white/10 z-[101] shadow-2xl flex flex-col">
            <div className="p-6 border-b border-white/10 flex justify-between items-center">
              <h2 className="text-2xl font-display font-black uppercase flex items-center gap-3"><ShoppingCart className="w-6 h-6 text-freo-orange" />Seu Carrinho</h2>
              <button onClick={onClose} className="text-freo-light/50 hover:text-white transition-colors"><X className="w-6 h-6" /></button>
            </div>
            <div className="flex-grow overflow-y-auto p-6 space-y-6">
              {cartItems.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-freo-light/50 font-body"><ShoppingCart className="w-16 h-16 mb-4 opacity-20" /><p>Seu carrinho está vazio.</p></div>
              ) : (
                cartItems.map((item: any, index: number) => (
                  <div key={index} className="flex gap-4 bg-freo-black/50 p-3 border border-white/5 relative group">
                    <img src={item.img} alt={item.name} className="w-20 h-20 object-cover" />
                    <div className="flex flex-col flex-grow justify-between">
                      <h4 className="font-display font-bold text-sm leading-tight pr-6">{item.name}</h4>
                      <div className="flex justify-between items-end">
                        <span className="font-mono text-freo-orange text-sm">{item.price}</span>
                        <div className="flex items-center gap-3 bg-freo-dark border border-white/10 px-2 py-1">
                          <button onClick={() => updateQuantity(item, -1)} className="hover:text-freo-orange transition-colors"><Minus className="w-3 h-3" /></button>
                          <span className="font-mono text-xs">{item.quantity}</span>
                          <button onClick={() => updateQuantity(item, 1)} className="hover:text-freo-orange transition-colors"><Plus className="w-3 h-3" /></button>
                        </div>
                      </div>
                    </div>
                    <button onClick={() => removeItem(item)} className="absolute top-3 right-3 text-freo-light/30 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))
              )}
            </div>
            {cartItems.length > 0 && (
              <div className="p-6 border-t border-white/10 bg-freo-black">
                <div className="flex justify-between items-center mb-6 font-mono">
                  <span className="text-freo-light/70 uppercase text-sm">Total</span>
                  <span className="text-2xl font-bold text-freo-orange">R$ {total.toFixed(2).replace('.', ',')}</span>
                </div>
                <button onClick={() => window.location.href = '/checkout.html'} className="w-full bg-freo-orange text-freo-black font-bold font-display uppercase tracking-widest py-4 hover:bg-white transition-colors">Finalizar Compra</button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default function App() {
  const [currentView, setCurrentView] = useState<'home' | 'shop'>('home');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const handleAuthData = (e: any) => {
      setUser(e.detail.user);
      if (e.detail.cartItems) {
        setCartItems(e.detail.cartItems.map((item: any) => ({
          name: item.product_name,
          price: formatPrice(item.price),
          img: item.image_url,
          quantity: item.quantity
        })));
      }
    };
    const handleAuthNotLoggedIn = () => { setUser(null); setCartItems([]); };
    window.addEventListener('auth-data-loaded', handleAuthData);
    window.addEventListener('auth-not-logged-in', handleAuthNotLoggedIn);
    // @ts-ignore
    const sb = window.supabaseClient || window.supabase;
    if (sb) sb.auth.getSession().then(({ data: { session } }: any) => { if (session) setUser(session.user); });
    return () => { window.removeEventListener('auth-data-loaded', handleAuthData); window.removeEventListener('auth-not-logged-in', handleAuthNotLoggedIn); };
  }, []);

  const handleOpenAuth = () => {
    if (user) window.location.href = '/dashboard.html';
    else window.location.href = '/login.html';
  };

  const addToCart = async (product: Product) => {
    // @ts-ignore
    const sb = window.supabase;
    if (!sb) return;
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { window.location.href = '/login.html'; return; }

    try {
      const thumb = product.images && product.images.length > 0 ? product.images[0] : '';
      const priceNum = product.promotional_price && product.promotional_price < product.price ? product.promotional_price : product.price;

      const { error } = await sb.from('cart_items').insert({
        user_id: session.user.id,
        product_id: String(product.id),
        product_name: product.title,
        quantity: 1,
        price: priceNum,
        total_price: priceNum,
        image_url: thumb
      });
      if (error) throw error;

      setCartItems(prev => {
        const existing = prev.find(item => item.name === product.title);
        if (existing) return prev.map(item => item.name === product.title ? { ...item, quantity: item.quantity + 1 } : item);
        return [...prev, { name: product.title, price: formatPrice(priceNum), img: thumb, quantity: 1 }];
      });

      const toast = document.createElement('div');
      toast.className = 'fixed bottom-4 right-4 bg-freo-orange text-freo-black px-6 py-4 font-display font-bold uppercase z-[9999] shadow-lg flex items-center gap-2 text-lg';
      toast.innerHTML = '✅ Adicionado ao carrinho!';
      document.body.appendChild(toast);
      setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.5s ease'; setTimeout(() => toast.remove(), 500); }, 3000);
    } catch (err) {
      console.error('Erro ao adicionar ao carrinho:', err);
    }
  };

  const updateQuantity = (product: any, delta: number) => {
    setCartItems(prev => prev.map(item => item.name === product.name ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item));
  };
  const removeItem = (product: any) => setCartItems(prev => prev.filter(item => item.name !== product.name));

  return (
    <div className="min-h-screen">
      <Navbar currentView={currentView} setCurrentView={setCurrentView} onOpenAuth={handleOpenAuth} cartItems={cartItems} onOpenCart={() => setIsCartOpen(true)} user={user} />
      {currentView === 'home' ? <HomeView setCurrentView={setCurrentView} addToCart={addToCart} /> : <ShopView addToCart={addToCart} />}
      <Footer />
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} cartItems={cartItems} updateQuantity={updateQuantity} removeItem={removeItem} />
    </div>
  );
}
