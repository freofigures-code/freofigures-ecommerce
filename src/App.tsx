import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShoppingCart, Menu, X, ChevronRight, Box, Hexagon, Search, User, Trash2, Plus, Minus } from 'lucide-react';

// --- Types ---
type CartItem = { cartItemId?: number; name: string; price: string; img: string; quantity: number; variant?: string | null; };
type Product = { id: number; title: string; price: number; promotional_price: number | null; category: string | null; images: string[]; tags: string[] | null; is_active: boolean; };

// --- Navbar ---
const Navbar = ({ currentView, setCurrentView, onOpenAuth, cartItems, onOpenCart, user }: any) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  return (
    <nav className={`fixed top-0 left-0 w-full z-50 transition-all duration-300 ${isScrolled ? 'bg-black/90 backdrop-blur-md border-b border-freo-orange/20 py-4' : 'bg-transparent py-6'}`}>
      <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
        <div className="flex items-center gap-3 z-50 cursor-pointer" onClick={() => setCurrentView('home')}>
          <img src="https://rrmxqpvxrpcqqxsgccqw.supabase.co/storage/v1/object/public/imagens/logo.jpg" alt="Logo" className="w-10 h-10 rounded-full object-cover border-2 border-freo-orange shadow-[0_0_10px_rgba(221,175,52,0.5)]" />
          <span className="font-display font-black text-2xl tracking-tighter uppercase">Freo<span className="text-freo-orange font-light">Figures</span></span>
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
              <Box className="w-4 h-4" /> Meus Pedidos
            </a>
          )}
          <button className="text-freo-light hover:text-freo-orange transition-colors"><Search className="w-5 h-5" /></button>
          <button onClick={onOpenAuth} className="text-freo-light hover:text-freo-orange transition-colors"><User className="w-5 h-5" /></button>
          <button onClick={onOpenCart} className="text-freo-light hover:text-freo-orange transition-colors relative">
            <ShoppingCart className="w-5 h-5" />
            {cartItems.length > 0 && <span className="absolute -top-2 -right-2 bg-freo-orange text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{cartItems.reduce((a: number, i: any) => a + i.quantity, 0)}</span>}
          </button>
        </div>
        <button className="md:hidden z-50" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>{mobileMenuOpen ? <X /> : <Menu />}</button>
      </div>
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="absolute top-0 left-0 w-full h-screen bg-black flex flex-col items-center justify-center gap-8 text-2xl font-display font-bold uppercase">
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
            {user && <a href="/meus-pedidos.html" className="text-freo-orange flex items-center gap-2 mt-4 text-lg border border-freo-orange/30 px-6 py-2 rounded bg-freo-orange/10"><Box className="w-6 h-6" /> Meus Pedidos</a>}
            <button onClick={() => { onOpenAuth(); setMobileMenuOpen(false); }} className="text-freo-light hover:text-freo-orange flex items-center gap-2 mt-4 text-lg">
              <User className="w-6 h-6" /> {user ? 'Minha Conta' : 'Entrar / Criar Conta'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

const CyberpunkFigure = () => {
  return (
    <div className="relative w-full h-full flex items-center justify-center select-none">
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-72 h-72 rounded-full" style={{ background: 'radial-gradient(circle, rgba(221,175,52,0.18) 0%, rgba(221,175,52,0.06) 50%, transparent 75%)', filter: 'blur(20px)' }} />
      </div>
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 40, repeat: Infinity, ease: 'linear' }} className="absolute w-[420px] h-[420px] pointer-events-none" style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
        <svg viewBox="0 0 420 420" className="w-full h-full">
          <polygon points="210,8 400,115 400,305 210,412 20,305 20,115" fill="none" stroke="rgba(221,175,52,0.13)" strokeWidth="1" strokeDasharray="8 6" />
          {[0,60,120,180,240,300].map((angle, i) => {
            const rad = (angle * Math.PI) / 180;
            const cx = 210 + 200 * Math.sin(rad);
            const cy = 210 - 200 * Math.cos(rad);
            return <circle key={i} cx={cx} cy={cy} r="3" fill="rgba(221,175,52,0.4)" />;
          })}
        </svg>
      </motion.div>
      <motion.div animate={{ rotate: -360 }} transition={{ duration: 25, repeat: Infinity, ease: 'linear' }} className="absolute w-[310px] h-[310px] pointer-events-none" style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
        <svg viewBox="0 0 310 310" className="w-full h-full">
          <polygon points="155,6 295,82 295,228 155,304 15,228 15,82" fill="none" stroke="rgba(221,175,52,0.07)" strokeWidth="1" />
        </svg>
      </motion.div>
      <div className="absolute bottom-16 left-1/2 -translate-x-1/2 pointer-events-none">
        <svg viewBox="0 0 260 40" width="260" height="40">
          <ellipse cx="130" cy="22" rx="100" ry="12" fill="rgba(221,175,52,0.10)" style={{ filter: 'blur(6px)' }}/>
          <ellipse cx="130" cy="20" rx="110" ry="13" fill="rgba(221,175,52,0.05)" stroke="rgba(221,175,52,0.2)" strokeWidth="1"/>
          <ellipse cx="130" cy="18" rx="78" ry="8" fill="rgba(221,175,52,0.04)" stroke="rgba(221,175,52,0.14)" strokeWidth="1"/>
        </svg>
      </div>
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-[5]" viewBox="0 0 500 660" preserveAspectRatio="none">
        <line x1="80" y1="220" x2="160" y2="300" stroke="rgba(221,175,52,0.15)" strokeWidth="1" strokeDasharray="4 4"/>
        <line x1="420" y1="180" x2="340" y2="270" stroke="rgba(221,175,52,0.15)" strokeWidth="1" strokeDasharray="4 4"/>
        <line x1="250" y1="520" x2="250" y2="590" stroke="rgba(221,175,52,0.18)" strokeWidth="1" strokeDasharray="3 4"/>
      </svg>
      <motion.div animate={{ top: ['0%', '100%'] }} transition={{ duration: 4, repeat: Infinity, ease: 'linear' }} className="absolute left-0 w-full h-0.5 pointer-events-none z-20" style={{ background: 'linear-gradient(90deg, transparent, rgba(221,175,52,0.45), transparent)' }} />
      <motion.div animate={{ y: [-8, 8, -8] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }} className="relative z-10" style={{ marginTop: '-20px' }}>
        <img src="https://rrmxqpvxrpcqqxsgccqw.supabase.co/storage/v1/object/public/imagens/LOGO_DEASHBOARD2.png" alt="Freo Figures" className="w-[500px] h-[500px] object-contain" style={{ filter: 'drop-shadow(0 0 28px rgba(221,175,52,0.40)) drop-shadow(0 0 8px rgba(221,175,52,0.2))' }} />
      </motion.div>
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }} className="absolute top-8 right-0 flex items-center gap-3 bg-black/90 border border-freo-orange/30 backdrop-blur-sm px-4 py-3 z-20">
        <div className="text-freo-orange">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 3H3v3M18 3h3v3M6 21H3v-3M18 21h3v-3"/>
            <rect x="7" y="7" width="10" height="10" rx="0.5"/>
          </svg>
        </div>
        <div>
          <div className="font-mono text-[9px] text-freo-orange/50 uppercase tracking-widest mb-0.5">Resolução</div>
          <div className="font-display font-black text-xl text-white leading-none">0.05mm</div>
        </div>
        <div className="ml-1 flex flex-col gap-1">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: i < 4 ? '#DDAF34' : 'rgba(221,175,52,0.18)' }}/>
          ))}
        </div>
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }} className="absolute bottom-28 left-0 flex items-center gap-3 bg-black/90 border border-freo-orange/30 backdrop-blur-sm px-4 py-3 z-20">
        <div className="w-8 h-8 flex items-center justify-center text-freo-orange border border-freo-orange/30 flex-shrink-0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9"/>
          </svg>
        </div>
        <div>
          <div className="font-mono text-[9px] text-freo-orange/50 uppercase tracking-widest mb-0.5">Material</div>
          <div className="font-display font-bold text-base text-white leading-tight">PLA Silk Premium</div>
        </div>
      </motion.div>
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.05 }} className="absolute bottom-10 right-0 bg-black/95 border border-freo-orange/30 px-5 py-4 z-20 text-center min-w-[120px]">
        <div className="font-display font-black text-xl text-freo-orange leading-none">FREO</div>
        <div className="font-display font-black text-lg text-white leading-none mb-2">FIGURES</div>
        <div className="w-full h-px bg-freo-orange/20 mb-2"/>
        <div className="font-mono text-[8px] text-freo-orange/40 uppercase tracking-widest">001/999</div>
        <div className="font-mono text-[8px] text-freo-orange/30 uppercase tracking-widest">Edição Limitada</div>
      </motion.div>
      <div className="absolute top-10 left-[18%] w-6 h-6 border-t border-l border-freo-orange/30 z-20"/>
      <div className="absolute top-10 right-[18%] w-6 h-6 border-t border-r border-freo-orange/30 z-20"/>
    </div>
  );
};

const Hero = ({ setCurrentView }: any) => {
  const [scanLine, setScanLine] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setScanLine(v => (v + 1) % 100), 80);
    return () => clearInterval(t);
  }, []);
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden bg-[#080808]">
      <div className="absolute inset-0 z-0" style={{ backgroundImage: `linear-gradient(rgba(221,175,52,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(221,175,52,0.04) 1px, transparent 1px)`, backgroundSize: '60px 60px' }}/>
      <div className="absolute inset-0 z-0 opacity-[0.12]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")` }}/>
      <div className="absolute inset-0 z-0" style={{ background: 'radial-gradient(ellipse 55% 75% at 22% 55%, rgba(221,175,52,0.07) 0%, transparent 70%)' }}/>
      <div className="absolute right-0 top-0 h-full w-[55%] z-0" style={{ background: 'radial-gradient(ellipse 80% 100% at 65% 52%, rgba(221,175,52,0.13) 0%, transparent 65%)' }}/>
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-freo-orange/40 to-transparent z-10"/>
      <div className="absolute top-24 left-5 w-7 h-7 border-t-2 border-l-2 border-freo-orange/45 z-20"/>
      <div className="absolute top-24 right-5 w-7 h-7 border-t-2 border-r-2 border-freo-orange/45 z-20"/>
      <div className="absolute bottom-5 left-5 w-7 h-7 border-b-2 border-l-2 border-freo-orange/25 z-20"/>
      <div className="absolute bottom-5 right-5 w-7 h-7 border-b-2 border-r-2 border-freo-orange/25 z-20"/>
      <div className="absolute left-3 top-1/2 -translate-y-1/2 z-20 hidden xl:flex flex-col items-center gap-3">
        <div className="w-px h-20 bg-gradient-to-b from-transparent to-freo-orange/25"/>
        <span className="font-mono text-[8px] text-freo-orange/30 uppercase tracking-[0.45em]" style={{ writingMode: 'vertical-rl' }}>FREOFIGURES</span>
        <div className="w-px h-20 bg-gradient-to-t from-transparent to-freo-orange/25"/>
      </div>
      <div className="absolute right-3 top-1/2 -translate-y-1/2 z-20 hidden xl:flex flex-col items-center gap-3">
        <div className="w-px h-20 bg-gradient-to-b from-transparent to-freo-orange/25"/>
        <span className="font-mono text-[8px] text-freo-orange/30 uppercase tracking-[0.45em]" style={{ writingMode: 'vertical-rl' }}>BRASIL</span>
        <div className="w-px h-20 bg-gradient-to-t from-transparent to-freo-orange/25"/>
      </div>
      <div className="max-w-7xl mx-auto px-6 lg:px-12 grid lg:grid-cols-2 gap-6 items-center relative z-10 w-full pt-28 pb-12 min-h-screen">
        <div className="flex flex-col gap-7">
          <motion.div initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.55 }} className="inline-flex items-center gap-2 self-start border border-freo-orange/20 bg-freo-orange/5 px-3 py-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-freo-orange animate-pulse"/>
            <span className="font-mono text-[10px] text-freo-orange uppercase tracking-[0.18em]">Layer by Layer, Legend by Design.</span>
          </motion.div>
          <motion.h1 initial={{ opacity: 0, y: 44 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.1 }} className="font-display font-black leading-[0.88] uppercase">
            <span className="block text-white" style={{ fontSize: 'clamp(2.8rem, 6.2vw, 5.8rem)', textShadow: '0 0 60px rgba(255,255,255,0.05)' }}>Tornando o</span>
            <span className="block" style={{ fontSize: 'clamp(2.4rem, 5.8vw, 5.4rem)', color: '#DDAF34', textShadow: '0 0 80px rgba(221,175,52,0.38)' }}>inimaginável</span>
            <span className="block" style={{ fontSize: 'clamp(2.4rem, 5.8vw, 5.4rem)', color: '#DDAF34', textShadow: '0 0 80px rgba(221,175,52,0.38)' }}>palpável</span>
          </motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.7, delay: 0.32 }} className="text-freo-light/65 text-base md:text-lg max-w-[420px] font-body leading-relaxed">
            Arte, utilidade e cultura pop esculpidas camada por camada. Impressão 3D de alta precisão com design exclusivo{' '}
            <span className="text-freo-orange font-semibold">FreoFigures.</span>
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.46 }} className="flex flex-wrap gap-4 mt-1">
            <button onClick={() => { setCurrentView('shop'); window.scrollTo(0, 0); }} className="group relative flex items-center gap-3 bg-freo-orange text-freo-black font-display font-bold uppercase tracking-widest px-8 py-4 hover:bg-white transition-colors overflow-hidden">
              <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent"/>
              <span className="relative">Explorar Loja</span>
              <ChevronRight className="relative w-5 h-5 group-hover:translate-x-1 transition-transform"/>
            </button>
            <a href="https://wa.me/5511961789176?text=Olá,%20gostaria%20de%20falar%20sobre%20um%20projeto%20customizado!" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center border border-white/15 text-white font-display font-bold uppercase tracking-widest px-8 py-4 hover:border-freo-orange/50 hover:bg-freo-orange/5 transition-all">
              Projetos Custom
            </a>
          </motion.div>
        </div>
        <motion.div initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.85, delay: 0.2 }} className="relative h-[480px] lg:h-[660px] hidden lg:block">
          <CyberpunkFigure />
        </motion.div>
      </div>
    </section>
  );
};

const Marquee = () => (
  <div className="bg-freo-orange text-freo-black py-3 overflow-hidden flex whitespace-nowrap border-y border-freo-orange/50">
    <motion.div animate={{ x: [0, -1035] }} transition={{ duration: 20, repeat: Infinity, ease: "linear" }} className="flex gap-8 font-display font-black text-xl uppercase tracking-widest">
      {[...Array(10)].map((_, i) => (
        <span key={i} className="flex items-center gap-8">
          <span>Impressão 3D</span><Hexagon className="w-4 h-4" fill="currentColor"/>
          <span>Action Figures</span><Hexagon className="w-4 h-4" fill="currentColor"/>
          <span>Arte Religiosa</span><Hexagon className="w-4 h-4" fill="currentColor"/>
          <span>Utensílios</span><Hexagon className="w-4 h-4" fill="currentColor"/>
        </span>
      ))}
    </motion.div>
  </div>
);

const Categories = ({ setCurrentView, setFilter }: any) => {
  const cats = [
    { name: "Action Figures", slug: "games", img: "https://rrmxqpvxrpcqqxsgccqw.supabase.co/storage/v1/object/public/imagens/ACTION_FIGURES.png", desc: "Heróis, vilões e cultura pop." },
    { name: "Religioso", slug: "religioso", img: "https://rrmxqpvxrpcqqxsgccqw.supabase.co/storage/v1/object/public/imagens/RELIGIOSO.png", desc: "Fé materializada com respeito." },
    { name: "Utensílios", slug: "lifestyle", img: "https://rrmxqpvxrpcqqxsgccqw.supabase.co/storage/v1/object/public/imagens/UTENSILIOS.png", desc: "Design funcional para o dia a dia." },
    { name: "Decoração", slug: "outros", img: "https://rrmxqpvxrpcqqxsgccqw.supabase.co/storage/v1/object/public/imagens/DECORACAO.png", desc: "Geometria e arte para seu espaço." }
  ];
  const handleCatClick = (slug: string) => {
    setFilter(slug);
    setCurrentView('shop');
    window.scrollTo(0, 0);
  };
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
          <div key={i} onClick={() => handleCatClick(cat.slug)} className="group relative h-[400px] overflow-hidden bg-freo-dark cursor-pointer border border-white/5">
            <img src={cat.img} alt={cat.name} className="absolute inset-0 w-full h-full object-cover opacity-50 group-hover:opacity-80 transition-opacity duration-500 grayscale group-hover:grayscale-0" referrerPolicy="no-referrer"/>
            <div className="absolute inset-0 bg-gradient-to-t from-freo-black via-freo-black/50 to-transparent"/>
            <div className="absolute bottom-0 left-0 p-6 w-full transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
              <div className="text-freo-orange font-mono text-xs mb-2 opacity-0 group-hover:opacity-100 transition-opacity delay-100">// CATEGORIA_0{i+1}</div>
              <h3 className="text-2xl font-display font-bold uppercase tracking-wide mb-1">{cat.name}</h3>
              <p className="text-sm text-freo-light/70 font-body opacity-0 group-hover:opacity-100 transition-opacity delay-150">{cat.desc}</p>
            </div>
            <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-freo-orange opacity-0 group-hover:opacity-100 transition-opacity m-4"/>
            <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-freo-orange opacity-0 group-hover:opacity-100 transition-opacity m-4"/>
          </div>
        ))}
      </div>
    </section>
  );
};

const formatPrice = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const ProductCard = ({ product, onAddToCart, compact = false }: { product: Product; onAddToCart: (p: Product) => void; compact?: boolean }) => {
  const thumb = product.images && product.images.length > 0 ? product.images[0] : null;
  const hasPromo = product.promotional_price && product.promotional_price < product.price;
  const displayPrice = hasPromo ? product.promotional_price! : product.price;
  const tag = product.tags && product.tags.length > 0 ? product.tags[0] : null;
  const goToProduct = () => { window.location.href = '/produto?id=' + product.id; };
  return (
    <div className={`group flex flex-col ${compact ? '' : 'bg-freo-dark border border-white/5 hover:border-freo-orange/50 transition-colors'}`}>
      <div className={`relative ${compact ? 'aspect-square' : 'aspect-square bg-freo-black'} overflow-hidden ${compact ? 'border border-white/5 group-hover:border-freo-orange/50 transition-colors' : ''} mb-4 cursor-pointer`} onClick={goToProduct}>
        {tag && <div className="absolute top-3 left-3 z-10 bg-freo-orange text-freo-black text-[10px] font-bold uppercase tracking-widest px-2 py-1">{tag}</div>}
        {thumb ? <img src={thumb} alt={product.title} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all duration-700"/> : <div className="w-full h-full flex items-center justify-center bg-freo-dark"><Box className="w-12 h-12 text-white/10"/></div>}
        {!compact && <div className="absolute inset-0 bg-freo-orange/20 opacity-0 group-hover:opacity-100 mix-blend-overlay transition-opacity duration-300"/>}
      </div>
      <div className={`flex flex-col flex-grow ${compact ? '' : 'p-5'}`}>
        <span className="text-freo-orange text-[10px] font-mono uppercase mb-1 tracking-wider">{product.category || 'Geral'}</span>
        <h3 className="font-display font-bold leading-tight mb-2 group-hover:text-freo-orange transition-colors cursor-pointer text-lg" onClick={goToProduct}>{product.title}</h3>
        <div className="mt-auto flex flex-col gap-3">
          <div className="flex items-end gap-2">
            {hasPromo && <span className="font-mono text-sm text-white/30 line-through">{formatPrice(product.price)}</span>}
            <span className="font-mono text-xl font-bold text-freo-orange">{formatPrice(displayPrice)}</span>
          </div>
          <button onClick={(e) => { e.stopPropagation(); onAddToCart(product); }} className="w-full bg-freo-orange text-freo-black font-display font-bold uppercase tracking-wider py-3 hover:bg-white transition-colors flex items-center justify-center gap-2">
            <ShoppingCart className="w-5 h-5"/> Adicionar ao carrinho
          </button>
        </div>
      </div>
    </div>
  );
};

const FeaturedProducts = ({ addToCart }: any) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try {
        // @ts-ignore
        const sb = window.supabaseClient || window.supabase;
        if (!sb) return;
        const { data, error } = await sb.from('products').select('*').eq('is_active', true).order('created_at', { ascending: false }).limit(4);
        if (!error && data) setProducts(data);
      } catch(e) { console.error(e); } finally { setLoading(false); }
    })();
  }, []);
  return (
    <section id="destaques" className="py-24 bg-freo-dark relative border-y border-white/5">
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-freo-orange/50 to-transparent"/>
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-display font-black uppercase tracking-tighter inline-block relative">
            Destaques da <span className="text-freo-orange">Forja</span>
            <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-24 h-1 bg-freo-orange"/>
          </h2>
        </div>
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {[...Array(4)].map((_, i) => <div key={i} className="animate-pulse"><div className="aspect-square bg-freo-dark/80 mb-4"/><div className="h-3 bg-freo-dark/80 rounded w-1/3 mb-2"/><div className="h-5 bg-freo-dark/80 rounded w-3/4 mb-4"/><div className="h-10 bg-freo-dark/80 rounded"/></div>)}
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-16"><p className="font-mono text-white/30 text-sm">Nenhum produto cadastrado ainda.</p></div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {products.map(p => <ProductCard key={p.id} product={p} onAddToCart={addToCart} compact/>)}
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
          <video
            src="https://rrmxqpvxrpcqqxsgccqw.supabase.co/storage/v1/object/public/imagens/video_deashborad.mp4"
            className="w-full h-full object-cover opacity-80"
            autoPlay
            loop
            muted
            playsInline
          />
          <motion.div animate={{ top: ['0%','100%','0%'] }} transition={{ duration: 4, repeat: Infinity, ease: "linear" }} className="absolute left-0 w-full h-1 bg-freo-orange shadow-[0_0_20px_rgba(255,77,0,0.8)] z-10"/>
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
              <div><h4 className="text-xl font-bold font-display uppercase tracking-wide mb-2">{step.title}</h4><p className="text-freo-light/60 font-body">{step.desc}</p></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </section>
);

const AboutSection = () => (
  <section id="sobre-nos" className="py-32 px-6 bg-freo-black relative overflow-hidden border-t border-white/5">
    <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-freo-orange/5 rounded-full blur-[150px] pointer-events-none"/>
    <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-freo-cyan/5 rounded-full blur-[100px] pointer-events-none"/>
    <div className="max-w-4xl mx-auto relative z-10">
      <div className="flex flex-col md:flex-row gap-16 items-start">
        <div className="md:w-1/3 md:sticky md:top-32">
          <div className="font-mono text-freo-orange text-sm mb-4 tracking-widest uppercase">// A ORIGEM</div>
          <h2 className="text-4xl md:text-5xl font-display font-black uppercase tracking-tighter leading-none mb-6">Sobre <br/><span className="text-freo-orange">Nós?</span></h2>
          <div className="w-12 h-1 bg-freo-orange mb-8"/>
          <div className="relative w-32 h-32 md:w-48 md:h-48 grayscale hover:grayscale-0 transition-all duration-500 border border-white/10">
            <img src="https://rrmxqpvxrpcqqxsgccqw.supabase.co/storage/v1/object/public/imagens/logo.jpg" alt="Freo Figures Creator" className="w-full h-full object-cover opacity-80" referrerPolicy="no-referrer"/>
            <div className="absolute inset-0 border border-freo-orange/30 translate-x-2 translate-y-2 -z-10"/>
          </div>
        </div>
        <div className="md:w-2/3 space-y-8 font-body text-lg text-freo-light/80 leading-relaxed">
          <p className="text-2xl font-display font-medium text-white">É mais sobre por que eu comecei.</p>
          <p>A Freo Figures começou com uma máquina, um rolo de filamento e uma inquietação:<br/><span className="text-freo-orange font-medium italic">"E se eu puder criar exatamente o que eu imagino?"</span></p>
          <p>Eu não comecei isso pensando em abrir empresa.<br/>Eu comecei porque não me conformava em só consumir o que já existia.</p>
          <div className="pl-6 border-l-2 border-freo-orange/50 py-2 space-y-1 font-mono text-sm uppercase tracking-wider text-freo-light/60">
            <p>Eu queria fazer.</p><p>Errar.</p><p>Aprender.</p><p>Melhorar.</p><p className="text-freo-orange">Fazer de novo.</p>
          </div>
          <p>No começo deu errado várias vezes. Peça que não saía como eu queria. Ideia que na cabeça era incrível e na prática não funcionava.</p>
          <p className="font-bold text-white">Mas nunca foi sobre o mais fácil.</p>
          <p>Foi sobre olhar pra algo que não existe ainda e pensar: <br/><span className="text-freo-cyan font-medium italic">"Eu consigo criar isso."</span></p>
          <div className="bg-freo-dark p-8 border border-white/5 mt-12 relative">
            <div className="absolute top-0 left-0 w-2 h-full bg-freo-orange"/>
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

const StoreCTA = ({ setCurrentView }: any) => (
  <section className="py-24 px-6 bg-freo-orange text-freo-black relative overflow-hidden border-y border-freo-orange/50">
    <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '20px 20px' }}/>
    <div className="max-w-4xl mx-auto text-center relative z-10 flex flex-col items-center">
      <img src="https://rrmxqpvxrpcqqxsgccqw.supabase.co/storage/v1/object/public/imagens/logo.jpg" alt="Logo" className="w-24 h-24 rounded-full object-cover border-4 border-freo-black mb-6 shadow-2xl"/>
      <h2 className="text-5xl md:text-7xl font-display font-black uppercase tracking-tighter mb-6 leading-none">Acesse o <br/> Catálogo Completo</h2>
      <p className="font-body text-xl mb-10 font-medium max-w-2xl">Filtre por categorias, explore detalhes e encontre a peça perfeita para o seu setup, altar ou estante.</p>
      <button onClick={() => { setCurrentView('shop'); window.scrollTo(0, 0); }} className="bg-freo-black text-freo-orange font-display font-bold uppercase tracking-widest px-10 py-5 text-lg hover:bg-white hover:text-freo-black transition-colors flex items-center gap-3 group">
        Entrar na Loja <ChevronRight className="group-hover:translate-x-1 transition-transform"/>
      </button>
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
            <img src="https://rrmxqpvxrpcqqxsgccqw.supabase.co/storage/v1/object/public/imagens/logo.jpg" alt="Logo" className="w-10 h-10 rounded-full object-cover border-2 border-freo-orange"/>
            <span className="font-display font-black text-2xl tracking-tighter uppercase">Freo<span className="text-freo-orange font-light">Figures</span></span>
          </div>
          <p className="text-freo-light/60 font-body text-sm mb-6">Transformando filamento em arte. Especialistas em impressão 3D de alta qualidade.</p>
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
            <input type="email" placeholder="SEU E-MAIL" className="bg-freo-black border border-white/20 px-4 py-2 w-full text-sm font-mono focus:outline-none focus:border-freo-orange"/>
            <button className="bg-freo-orange text-freo-black px-4 font-bold hover:bg-white transition-colors"><ChevronRight className="w-5 h-5"/></button>
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

const ShopView = ({ addToCart, initialFilter }: any) => {
  const [activeFilter, setActiveFilter] = useState(initialFilter || 'Todos');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const categories = ['Todos','games','religioso','keycaps','personalizado','lifestyle','outros'];
  const categoryLabels: Record<string,string> = { 'Todos':'Todos','games':'Games & Geek','religioso':'Religioso','keycaps':'Keycaps','personalizado':'Personalizado','lifestyle':'Lifestyle','outros':'Outros' };

  useEffect(() => { setActiveFilter(initialFilter || 'Todos'); }, [initialFilter]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // @ts-ignore
        const sb = window.supabaseClient || window.supabase;
        if (!sb) return;
        const { data, error } = await sb.from('products').select('*').eq('is_active', true).order('created_at', { ascending: false });
        if (!error && data) setProducts(data);
      } catch(e) { console.error(e); } finally { setLoading(false); }
    })();
  }, []);

  const filtered = activeFilter === 'Todos' ? products : products.filter(p => p.category === activeFilter);
  return (
    <div className="pt-32 pb-24 px-6 max-w-7xl mx-auto min-h-screen">
      <div className="flex flex-col md:flex-row gap-12">
        <div className="md:w-1/4">
          <div className="sticky top-32">
            <h2 className="font-display font-black text-3xl uppercase mb-8">Catálogo</h2>
            <div className="space-y-2">
              {categories.map(cat => (
                <button key={cat} onClick={() => setActiveFilter(cat)} className={`block w-full text-left px-4 py-3 font-mono text-sm uppercase tracking-widest transition-all ${activeFilter === cat ? 'bg-freo-orange text-freo-black font-bold' : 'text-freo-light/60 hover:text-freo-orange hover:bg-white/5'}`}>
                  {activeFilter === cat && <span className="mr-2">&gt;</span>}{categoryLabels[cat] || cat}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="md:w-3/4">
          <div className="mb-8 flex justify-between items-end border-b border-white/10 pb-4">
            <div className="font-mono text-freo-light/50 text-sm">
              {loading ? 'Carregando...' : <>Mostrando {filtered.length} resultado{filtered.length !== 1 ? 's' : ''} para <span className="text-freo-orange">[{categoryLabels[activeFilter] || activeFilter}]</span></>}
            </div>
          </div>
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_,i) => <div key={i} className="animate-pulse bg-freo-dark border border-white/5"><div className="aspect-square bg-freo-black/80"/><div className="p-5 space-y-3"><div className="h-3 bg-white/5 rounded w-1/4"/><div className="h-5 bg-white/5 rounded w-3/4"/><div className="h-10 bg-freo-orange/20 rounded"/></div></div>)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-24">
              <div className="text-5xl mb-4">📦</div>
              <p className="font-display font-bold text-xl text-white/20 uppercase mb-2">{products.length === 0 ? 'Nenhum produto cadastrado ainda' : 'Nenhum produto nesta categoria'}</p>
              <p className="font-mono text-sm text-white/20">{products.length === 0 ? 'Use o painel admin para importar seus produtos.' : 'Tente outra categoria.'}</p>
            </div>
          ) : (
            <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <AnimatePresence>
                {filtered.map(p => (
                  <motion.div key={p.id} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.3 }}>
                    <ProductCard product={p} onAddToCart={addToCart}/>
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

const HomeView = ({ setCurrentView, addToCart, setFilter }: any) => (
  <>
    <Hero setCurrentView={setCurrentView}/>
    <Marquee/>
    <Categories setCurrentView={setCurrentView} setFilter={setFilter}/>
    <FeaturedProducts addToCart={addToCart}/>
    <StoreCTA setCurrentView={setCurrentView}/>
    <ProcessSection/>
    <AboutSection/>
  </>
);

const AuthModal = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  useEffect(() => { if (isOpen) { setName(''); setPhone(''); setEmail(''); setPassword(''); setError(''); setSuccess(false); } }, [isOpen, isLogin]);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (!email.includes('@') || !email.includes('.')) { setError('Por favor, insira um e-mail válido.'); return; }
    if (!isLogin) {
      if (!name || !phone || !email || !password) { setError('Preencha todos os campos.'); return; }
      setLoading(true);
      try {
        // @ts-ignore
        const { error } = await window.supabase.auth.signUp({ email, password, options: { data: { name, phone }, emailRedirectTo: "https://freofigures.com.br/auth/callback.html" } });
        if (error) { let msg = error.message; if (msg.includes('rate limit')) msg = 'Limite de envios excedido. Tente mais tarde.'; else if (msg.includes('already registered')) msg = 'Este e-mail já está cadastrado.'; setError(msg); }
        else { setSuccess(true); setTimeout(() => onClose(), 6000); fetch('https://n8nwebhook.solviaoficial.com/webhook/26afb276-b7a5-4d0c-b733-03c47836bd14', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, phone, email, action: 'create_account' }) }).catch(console.error); }
      } catch { setError('Erro de conexão. Tente novamente.'); } finally { setLoading(false); }
    } else {
      if (!email || !password) { setError('Preencha todos os campos.'); return; }
      setLoading(true);
      try {
        // @ts-ignore
        const { error } = await window.supabase.auth.signInWithPassword({ email, password });
        if (error) { let msg = error.message; if (msg === 'Invalid login credentials') msg = 'Email ou senha incorretos.'; else if (msg === 'Email not confirmed') msg = 'Confirme seu email antes de fazer login.'; setError(msg); }
        else { setSuccess(true); setTimeout(() => { onClose(); window.location.href = '/dashboard.html'; }, 1500); }
      } catch { setError('Erro de conexão. Tente novamente.'); } finally { setLoading(false); }
    }
  };
  if (!isOpen) return null;
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-freo-black/80 backdrop-blur-sm"/>
          <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative w-full max-w-md bg-freo-dark border border-white/10 shadow-2xl overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-freo-orange to-freo-cyan"/>
            <button onClick={onClose} className="absolute top-4 right-4 text-freo-light/50 hover:text-white transition-colors"><X className="w-6 h-6"/></button>
            <div className="p-8">
              <div className="flex justify-center mb-8"><img src="https://rrmxqpvxrpcqqxsgccqw.supabase.co/storage/v1/object/public/imagens/logo.jpg" alt="Logo" className="w-16 h-16 rounded-full object-cover border-2 border-freo-orange shadow-[0_0_15px_rgba(221,175,52,0.3)]"/></div>
              <h2 className="text-3xl font-display font-black uppercase text-center mb-2">{isLogin ? 'Acessar a Forja' : 'Criar Conta'}</h2>
              <p className="text-freo-light/60 text-center font-body text-sm mb-8">{isLogin ? 'Entre para acompanhar seus pedidos e projetos.' : 'Junte-se à revolução da manufatura aditiva.'}</p>
              {success ? (
                <div className="bg-freo-cyan/10 border border-freo-cyan text-freo-cyan p-6 text-center font-mono text-sm mb-6 flex flex-col items-center gap-3">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                  <span>{isLogin ? 'Login realizado com sucesso!' : '✅ Conta criada! Verifique seu email.'}</span>
                </div>
              ) : (
                <div className="space-y-4">
                  {error && <div className="bg-freo-orange/10 border border-freo-orange text-freo-orange p-3 text-center font-mono text-xs">{error}</div>}
                  <form className="space-y-4" onSubmit={handleSubmit}>
                    {!isLogin && (<><input type="text" placeholder="NOME COMPLETO" value={name} onChange={e => setName(e.target.value)} className="w-full bg-freo-black border border-white/10 px-4 py-3 font-mono text-sm focus:outline-none focus:border-freo-orange transition-colors"/><input type="tel" placeholder="TELEFONE / WHATSAPP" value={phone} onChange={e => setPhone(e.target.value)} className="w-full bg-freo-black border border-white/10 px-4 py-3 font-mono text-sm focus:outline-none focus:border-freo-orange transition-colors"/></>)}
                    <input type="email" placeholder="E-MAIL" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-freo-black border border-white/10 px-4 py-3 font-mono text-sm focus:outline-none focus:border-freo-orange transition-colors"/>
                    <input type="password" placeholder="SENHA" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-freo-black border border-white/10 px-4 py-3 font-mono text-sm focus:outline-none focus:border-freo-orange transition-colors"/>
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

// ─── CartDrawer com suporte a variantes ───────────────────────────────────────
const CartDrawer = ({ isOpen, onClose, cartItems, updateQuantity, removeItem }: any) => {
  const total = cartItems.reduce((acc: number, item: any) => {
    const p = item.price.replace('R$','').replace(/\s/g,'').replace(',','.');
    return acc + (parseFloat(p) * item.quantity);
  }, 0);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[100] bg-freo-black/80 backdrop-blur-sm"
          />
          <motion.div
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.3 }}
            className="fixed top-0 right-0 h-full w-full sm:w-[420px] bg-freo-dark border-l border-white/10 z-[101] shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="p-6 border-b border-white/10 flex justify-between items-center">
              <h2 className="text-2xl font-display font-black uppercase flex items-center gap-3">
                <ShoppingCart className="w-6 h-6 text-freo-orange"/>
                Seu Carrinho
              </h2>
              <button onClick={onClose} className="text-freo-light/50 hover:text-white transition-colors">
                <X className="w-6 h-6"/>
              </button>
            </div>

            {/* Items */}
            <div className="flex-grow overflow-y-auto p-6 space-y-4">
              {cartItems.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-freo-light/50 font-body">
                  <ShoppingCart className="w-16 h-16 mb-4 opacity-20"/>
                  <p>Seu carrinho está vazio.</p>
                </div>
              ) : cartItems.map((item: CartItem, index: number) => (
                <div key={item.cartItemId ?? index} className="flex gap-4 bg-freo-black/50 p-3 border border-white/5 relative group">
                  <img src={item.img} alt={item.name} className="w-20 h-20 object-cover flex-shrink-0"/>
                  <div className="flex flex-col flex-grow justify-between min-w-0">
                    <div className="pr-6">
                      <h4 className="font-display font-bold text-sm leading-tight">{item.name}</h4>
                      {/* ── Variante selecionada ── */}
                      {item.variant && (
                        <p className="font-mono text-[10px] text-freo-orange/70 mt-1 uppercase tracking-wider leading-relaxed">
                          {item.variant}
                        </p>
                      )}
                    </div>
                    <div className="flex justify-between items-center mt-2">
                      <span className="font-mono text-freo-orange text-sm font-bold">{item.price}</span>
                      <div className="flex items-center gap-2 bg-freo-dark border border-white/10 px-2 py-1">
                        <button onClick={() => updateQuantity(item, -1)} className="hover:text-freo-orange transition-colors">
                          <Minus className="w-3 h-3"/>
                        </button>
                        <span className="font-mono text-xs w-4 text-center">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item, 1)} className="hover:text-freo-orange transition-colors">
                          <Plus className="w-3 h-3"/>
                        </button>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => removeItem(item)}
                    className="absolute top-3 right-3 text-freo-light/30 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-4 h-4"/>
                  </button>
                </div>
              ))}
            </div>

            {/* Footer */}
            {cartItems.length > 0 && (
              <div className="p-6 border-t border-white/10 bg-freo-black">
                <div className="flex justify-between items-center mb-6 font-mono">
                  <span className="text-freo-light/70 uppercase text-sm">Total</span>
                  <span className="text-2xl font-bold text-freo-orange">
                    R$ {total.toFixed(2).replace('.', ',')}
                  </span>
                </div>
                <button
                  onClick={() => window.location.href = '/checkout.html'}
                  className="w-full bg-freo-orange text-freo-black font-bold font-display uppercase tracking-widest py-4 hover:bg-white transition-colors"
                >
                  Finalizar Compra
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

// ─── App principal ────────────────────────────────────────────────────────────
export default function App() {
  const [currentView, setCurrentView] = useState<'home' | 'shop'>('home');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [user, setUser] = useState<any>(null);
  const [activeFilter, setActiveFilter] = useState('Todos');

  useEffect(() => {
    const handleAuthData = (e: any) => {
      setUser(e.detail.user);
      if (e.detail.cartItems) {
        setCartItems(e.detail.cartItems.map((item: any) => ({
          cartItemId: item.id,
          name: item.product_name,
          price: formatPrice(item.price),
          img: item.image_url,
          quantity: item.quantity,
          variant: item.variant ?? null,   // ← lê variante do Supabase
        })));
      }
    };
    const handleNotLoggedIn = () => { setUser(null); setCartItems([]); };
    window.addEventListener('auth-data-loaded', handleAuthData);
    window.addEventListener('auth-not-logged-in', handleNotLoggedIn);
    // @ts-ignore
    const sb = window.supabaseClient || window.supabase;
    if (sb) sb.auth.getSession().then(({ data: { session } }: any) => { if (session) setUser(session.user); });
    return () => {
      window.removeEventListener('auth-data-loaded', handleAuthData);
      window.removeEventListener('auth-not-logged-in', handleNotLoggedIn);
    };
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
      const priceNum = product.promotional_price && product.promotional_price < product.price
        ? product.promotional_price
        : product.price;
      const { data, error } = await sb.from('cart_items').insert({
        user_id: session.user.id,
        product_id: String(product.id),
        product_name: product.title,
        quantity: 1,
        price: priceNum,
        total_price: priceNum,
        image_url: thumb,
        variant: null,   // produtos sem variante adicionados pelo card
      }).select().single();
      if (error) throw error;
      setCartItems(prev => {
        const ex = prev.find(i => i.cartItemId === data.id);
        if (ex) return prev.map(i => i.cartItemId === data.id ? { ...i, quantity: i.quantity + 1 } : i);
        return [...prev, {
          cartItemId: data.id,
          name: product.title,
          price: formatPrice(priceNum),
          img: thumb,
          quantity: 1,
          variant: null,
        }];
      });
      const toast = document.createElement('div');
      toast.className = 'fixed bottom-4 right-4 bg-freo-orange text-freo-black px-6 py-4 font-display font-bold uppercase z-[9999] shadow-lg flex items-center gap-2 text-lg';
      toast.innerHTML = '✅ Adicionado ao carrinho!';
      document.body.appendChild(toast);
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.5s ease';
        setTimeout(() => toast.remove(), 500);
      }, 3000);
    } catch(err) { console.error('Erro ao adicionar ao carrinho:', err); }
  };

  // ── Usa cartItemId como chave única (suporta mesmo produto com variantes diferentes) ──
  const updateQuantity = (product: CartItem, delta: number) =>
    setCartItems(prev =>
      prev.map(item =>
        item.cartItemId === product.cartItemId
          ? { ...item, quantity: Math.max(1, item.quantity + delta) }
          : item
      )
    );

  const removeItem = async (product: CartItem) => {
    // @ts-ignore
    const sb = window.supabase;
    if (sb && product.cartItemId) {
      await sb.from('cart_items').delete().eq('id', product.cartItemId);
    }
    setCartItems(prev => prev.filter(item => item.cartItemId !== product.cartItemId));
  };

  return (
    <div className="min-h-screen">
      <Navbar
        currentView={currentView}
        setCurrentView={setCurrentView}
        onOpenAuth={handleOpenAuth}
        cartItems={cartItems}
        onOpenCart={() => setIsCartOpen(true)}
        user={user}
      />
      {currentView === 'home'
        ? <HomeView setCurrentView={setCurrentView} addToCart={addToCart} setFilter={setActiveFilter}/>
        : <ShopView addToCart={addToCart} initialFilter={activeFilter}/>
      }
      <Footer/>
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)}/>
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cartItems={cartItems}
        updateQuantity={updateQuantity}
        removeItem={removeItem}
      />
    </div>
  );
}
