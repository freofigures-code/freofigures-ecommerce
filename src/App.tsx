import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShoppingCart,
  Menu,
  X,
  ChevronRight,
  Box,
  Hexagon,
  Search,
  User,
  Trash2,
  Plus,
  Minus,
} from 'lucide-react';

// --- Types ---
type CartItem = {
  cartItemId?: number;
  name: string;
  price: string;
  img: string;
  quantity: number;
  variant?: string | null;
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
};

// --- Utils ---
const formatPrice = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);

// --- Busca Inteligente Marketplace ---
const normalizeText = (value: string | number | null | undefined) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const SEARCH_STOP_WORDS = new Set([
  'a',
  'o',
  'e',
  'de',
  'do',
  'da',
  'dos',
  'das',
  'em',
  'no',
  'na',
  'nos',
  'nas',
  'para',
  'com',
  'por',
  'um',
  'uma',
  'uns',
  'umas',
  'ao',
  'aos',
  'as',
  'os',
]);

const MINIMUM_SEARCH_SCORE = 35;

const CATEGORY_SEARCH_INTENTS: Record<string, string[]> = {
  religioso: [
    'religioso',
    'religiosa',
    'religiao',
    'religião',
    'santo',
    'santa',
    'santos',
    'santas',
    'fe',
    'fé',
    'catolico',
    'católico',
    'catolica',
    'católica',
    'nossa senhora',
    'jesus',
    'maria',
    'cruz',
    'sao bento',
    'são bento',
    'sao miguel',
    'são miguel',
    'agua benta',
    'água benta',
    'pia de agua benta',
    'pia de água benta',
  ],
  games: [
    'games',
    'game',
    'gamer',
    'geek',
    'jogo',
    'jogos',
    'nerd',
    'action figure',
    'action figures',
    'boneco',
    'bonecos',
    'figura',
    'figuras',
    'colecionavel',
    'colecionável',
    'colecionador',
  ],
  keycaps: ['keycap', 'keycaps', 'tecla', 'teclas', 'teclado', 'switch'],
  personalizado: [
    'personalizado',
    'personalizada',
    'personalizados',
    'personalizadas',
    'custom',
    'customizado',
    'customizada',
    'nome',
    'numero',
    'número',
    'presente',
    'encomenda',
  ],
  lifestyle: [
    'lifestyle',
    'casa',
    'decoracao',
    'decoração',
    'utilitario',
    'utilitário',
    'utensilio',
    'utensílio',
    'organizador',
    'suporte',
    'porta treco',
    'porta objeto',
  ],
  outros: ['outros', 'diversos', 'variados'],
};

const CATEGORY_BROAD_TERMS: Record<string, string[]> = {
  religioso: [
    'religioso',
    'religiosa',
    'religiao',
    'religião',
    'santo',
    'santa',
    'santos',
    'santas',
    'fe',
    'fé',
    'catolico',
    'católico',
    'catolica',
    'católica',
    'agua benta',
    'água benta',
    'pia de agua benta',
    'pia de água benta',
  ],
  games: [
    'games',
    'game',
    'gamer',
    'geek',
    'jogo',
    'jogos',
    'nerd',
    'action figure',
    'action figures',
    'boneco',
    'bonecos',
    'figura',
    'figuras',
    'colecionavel',
    'colecionável',
    'colecionador',
  ],
  keycaps: ['keycap', 'keycaps', 'tecla', 'teclas', 'teclado', 'switch'],
  personalizado: [
    'personalizado',
    'personalizada',
    'personalizados',
    'personalizadas',
    'custom',
    'customizado',
    'customizada',
    'encomenda',
  ],
  lifestyle: [
    'lifestyle',
    'casa',
    'decoracao',
    'decoração',
    'utilitario',
    'utilitário',
    'utensilio',
    'utensílio',
    'organizador',
  ],
  outros: ['outros', 'diversos', 'variados'],
};

const RELATED_SEARCH_TERMS: Record<string, string[]> = {
  mario: ['super mario', 'nintendo', 'encanador', 'mário'],
  coringa: ['joker', 'palhaco', 'palhaço', 'vilao', 'vilão'],
  joker: ['coringa', 'palhaco', 'palhaço'],
  minecraft: ['mine', 'creeper', 'bloco', 'cubinho', 'chaveiro creeper'],
  mine: ['minecraft', 'creeper'],
  creeper: ['minecraft', 'mine'],
  chaveiro: ['chaveiros', 'keychain', 'pingente', 'chaveirinho'],
  keycap: ['keycaps', 'tecla', 'teclas', 'teclado'],
  camisa: ['camiseta', 'uniforme', 'futebol', 'brasil', 'selecao', 'seleção'],
  camiseta: ['camisa', 'uniforme', 'futebol'],
  deadpool: [
    'dead pool',
    'wade',
    'anti heroi',
    'anti-heroi',
    'anti herói',
    'anti-herói',
    'suporte headset',
    'headset',
  ],
  resident: [
    'resident evil',
    'residente evil',
    'resid evil',
    'umbrella',
    'umbrella corporation',
    'controle',
    'ps5',
    'xbox',
    'pro controller',
    'controller',
  ],
  evil: ['resident evil', 'umbrella'],
  umbrella: ['resident evil', 'residente evil'],
  varinha: [
    'magia',
    'magica',
    'mágica',
    'harry',
    'bruxo',
    'bruxa',
    'cartao',
    'cartão',
    'porta cartao',
    'porta cartão',
    'pagamento',
  ],
  pagamento: ['cartao', 'cartão', 'porta cartao', 'porta cartão', 'varinha'],
  dichavador: ['grinder', 'triturador', 'tabacaria', 'gnomus'],
  grinder: ['dichavador', 'triturador'],
  copo: ['caneca', 'vaso', 'porta treco', 'porta objeto'],
  nossa: ['nossa senhora', 'maria', 'santa', 'religioso'],
  senhora: ['nossa senhora', 'maria', 'santa', 'religioso'],
  bento: ['sao bento', 'são bento', 'santo bento', 'religioso'],
  miguel: ['sao miguel', 'são miguel', 'arcanjo', 'religioso'],
  cruz: ['religioso', 'cristo', 'jesus'],
};

const singularizeWord = (word: string) => {
  if (word.length <= 3) return word;
  if (word.endsWith('oes')) return word.slice(0, -3) + 'ao';
  if (word.endsWith('aes')) return word.slice(0, -3) + 'ao';
  if (word.endsWith('is')) return word.slice(0, -2) + 'il';
  if (word.endsWith('es')) return word.slice(0, -2);
  if (word.endsWith('s')) return word.slice(0, -1);
  return word;
};

const unique = <T,>(items: T[]) => Array.from(new Set(items));

const getSearchWords = (term: string) =>
  unique(
    normalizeText(term)
      .split(' ')
      .filter(word => word.length > 1 && !SEARCH_STOP_WORDS.has(word))
      .flatMap(word => unique([word, singularizeWord(word)]))
      .filter(word => word.length > 1 && !SEARCH_STOP_WORDS.has(word))
  );

const levenshteinDistance = (a: string, b: string) => {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i]);

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] =
        b.charAt(i - 1) === a.charAt(j - 1)
          ? matrix[i - 1][j - 1]
          : Math.min(
              matrix[i - 1][j - 1] + 1,
              matrix[i][j - 1] + 1,
              matrix[i - 1][j] + 1
            );
    }
  }

  return matrix[b.length][a.length];
};

const isCloseWord = (searchWord: string, productWord: string) => {
  if (searchWord.length < 3 || productWord.length < 3) return false;
  if (searchWord === productWord) return true;
  if (productWord.startsWith(searchWord) || searchWord.startsWith(productWord)) return true;
  if (searchWord.length >= 4 && (productWord.includes(searchWord) || searchWord.includes(productWord))) return true;

  const distance = levenshteinDistance(searchWord, productWord);
  const maxDistance = searchWord.length <= 4 ? 1 : searchWord.length <= 7 ? 2 : 3;

  return distance <= maxDistance;
};

const getCategoryIntent = (term: string) => {
  const query = normalizeText(term);
  const queryWords = getSearchWords(term);

  for (const [category, terms] of Object.entries(CATEGORY_SEARCH_INTENTS)) {
    const normalizedTerms = terms.map(normalizeText);

    const hasIntent = normalizedTerms.some(item => {
      const itemWords = getSearchWords(item);

      return (
        query === item ||
        query.includes(item) ||
        item.includes(query) ||
        itemWords.some(word => queryWords.some(queryWord => isCloseWord(queryWord, word)))
      );
    });

    if (hasIntent) return category;
  }

  return null;
};

const getBroadCategoryWords = (category: string | null) => {
  if (!category) return [];
  return unique((CATEGORY_BROAD_TERMS[category] || []).flatMap(term => getSearchWords(term)));
};

const expandSearchPhrases = (term: string) => {
  const query = normalizeText(term);
  const words = getSearchWords(term);
  const phrases = new Set<string>([query]);

  Object.entries(RELATED_SEARCH_TERMS).forEach(([main, aliases]) => {
    const group = [main, ...aliases].map(normalizeText);

    const shouldExpand = group.some(item => {
      const itemWords = getSearchWords(item);

      return (
        query === item ||
        query.includes(item) ||
        item.includes(query) ||
        itemWords.some(word => words.some(queryWord => isCloseWord(queryWord, word)))
      );
    });

    if (shouldExpand) {
      group.forEach(item => phrases.add(item));
    }
  });

  return Array.from(phrases).filter(Boolean);
};

const expandSearchWords = (term: string) => {
  const baseWords = getSearchWords(term);
  const expanded = new Set(baseWords);

  Object.entries(RELATED_SEARCH_TERMS).forEach(([main, aliases]) => {
    const group = [main, ...aliases].map(normalizeText);

    const shouldExpand = group.some(item => {
      const itemWords = getSearchWords(item);
      return itemWords.some(word => baseWords.some(base => isCloseWord(base, word)));
    });

    if (shouldExpand) {
      group.forEach(item => {
        getSearchWords(item).forEach(word => {
          if (word.length >= 3 && !SEARCH_STOP_WORDS.has(word)) {
            expanded.add(word);
          }
        });
      });
    }
  });

  return Array.from(expanded);
};

const getProductTagsText = (tags: Product['tags']) => {
  if (!tags) return '';
  if (Array.isArray(tags)) return tags.join(' ');
  return String(tags);
};

const getProductSearchText = (product: Product) => {
  const tags = getProductTagsText(product.tags);
  return normalizeText(`${product.title} ${product.category || ''} ${tags}`);
};

const getProductWords = (product: Product) => {
  const text = getProductSearchText(product);

  return unique(
    text
      .split(' ')
      .filter(word => word.length >= 3 && !SEARCH_STOP_WORDS.has(word))
      .flatMap(word => unique([word, singularizeWord(word)]))
  );
};

const wordMatchesProduct = (word: string, productWords: string[], text: string, title: string) => {
  if (word.length < 3) return false;
  if (title.includes(word) || text.includes(word)) return true;
  return productWords.some(productWord => isCloseWord(word, productWord));
};

const getSpecificSearchWords = (searchTerm: string, categoryIntent: string | null) => {
  const words = expandSearchWords(searchTerm);
  const broadWords = getBroadCategoryWords(categoryIntent);

  return words.filter(word => !broadWords.some(broad => isCloseWord(word, broad)));
};

const getSearchScore = (product: Product, searchTerm: string) => {
  const query = normalizeText(searchTerm);

  if (!query) return 0;

  const categoryIntent = getCategoryIntent(searchTerm);
  const productCategory = normalizeText(product.category || '');
  const title = normalizeText(product.title);
  const text = getProductSearchText(product);
  const productWords = getProductWords(product);
  const searchWords = expandSearchWords(query);
  const searchPhrases = expandSearchPhrases(query);
  const specificWords = getSpecificSearchWords(searchTerm, categoryIntent);

  let score = 0;
  let matchedSpecificWords = 0;

  if (categoryIntent) {
    if (productCategory === categoryIntent) {
      score += 140;
    } else {
      score -= 180;
    }
  }

  if (title === query) score += 350;
  if (title.includes(query)) score += 220;
  if (text.includes(query)) score += 130;

  searchPhrases.forEach(phrase => {
    if (!phrase || phrase === query) return;

    if (title.includes(phrase)) score += 160;
    else if (text.includes(phrase)) score += 90;
  });

  searchWords.forEach(word => {
    if (word.length < 3) return;

    const exactTitleWord = title.split(' ').includes(word);
    const exactTextWord = text.split(' ').includes(word);

    if (exactTitleWord) {
      score += 90;
    } else if (title.includes(word)) {
      score += 70;
    } else if (exactTextWord) {
      score += 55;
    } else if (text.includes(word)) {
      score += 35;
    } else {
      const bestDistance = productWords.reduce(
        (best, current) => Math.min(best, levenshteinDistance(word, current)),
        99
      );

      const maxDistance = word.length <= 4 ? 1 : word.length <= 7 ? 2 : 3;

      if (bestDistance <= maxDistance) {
        score += 28;
      }
    }
  });

  specificWords.forEach(word => {
    if (wordMatchesProduct(word, productWords, text, title)) {
      matchedSpecificWords += 1;
    }
  });

  if (categoryIntent && specificWords.length > 0 && matchedSpecificWords === 0) {
    return 0;
  }

  if (!categoryIntent && searchWords.length > 0) {
    const matchedWords = searchWords.filter(word =>
      wordMatchesProduct(word, productWords, text, title)
    ).length;

    if (matchedWords === 0) return 0;

    if (searchWords.length >= 2 && matchedWords === 1) {
      score -= 25;
    }
  }

  return score;
};

// --- Navbar ---
const Navbar = ({
  currentView,
  setCurrentView,
  onOpenAuth,
  cartItems,
  onOpenCart,
  user,
  searchTerm,
  setSearchTerm,
  onSearchSubmit,
  onSearchClear,
}: any) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);

    window.addEventListener('scroll', handleScroll);

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!isSearchOpen) return;

    const timer = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 80);

    return () => window.clearTimeout(timer);
  }, [isSearchOpen]);

  const submitSearch = (event?: React.FormEvent) => {
    event?.preventDefault();

    const clean = String(searchTerm || '').trim();

    if (!clean) return;

    onSearchSubmit(clean);
    setIsSearchOpen(false);
    setMobileMenuOpen(false);
  };

  const clearSearch = () => {
    setSearchTerm('');
    onSearchClear();
    searchInputRef.current?.focus();
  };

  const goToCatalog = () => {
    onSearchClear();
    setCurrentView('shop');
    setMobileMenuOpen(false);
    window.scrollTo(0, 0);
  };

  const goHome = () => {
    onSearchClear();
    setCurrentView('home');
    setMobileMenuOpen(false);
    window.scrollTo(0, 0);
  };

  return (
    <nav className={`fixed top-0 left-0 w-full z-50 transition-all duration-300 ${
      isScrolled
        ? 'bg-black/90 backdrop-blur-md border-b border-freo-orange/20 py-4'
        : 'bg-transparent py-6'
    }`}>
      <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
        <div className="flex items-center gap-3 z-50 cursor-pointer" onClick={goHome}>
          <img
            src="https://rrmxqpvxrpcqqxsgccqw.supabase.co/storage/v1/object/public/imagens/logo.jpg"
            alt="Logo"
            className="w-10 h-10 rounded-full object-cover border-2 border-freo-orange shadow-[0_0_10px_rgba(221,175,52,0.5)]"
          />

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

              <button onClick={goToCatalog} className="text-freo-orange hover:text-white transition-colors">
                Catálogo
              </button>
            </>
          ) : (
            <>
              <button onClick={goHome} className="hover:text-freo-orange transition-colors">
                Início
              </button>

              <span className="text-freo-orange">Catálogo</span>
            </>
          )}
        </div>

        <div className="hidden md:flex items-center gap-6">
          {user && (
            <a
              href="/meus-pedidos.html"
              className="flex items-center gap-2 text-xs font-mono text-freo-orange hover:text-white transition-colors border border-freo-orange/30 hover:border-white/30 bg-freo-orange/10 px-3 py-1.5 rounded"
            >
              <Box className="w-4 h-4" />
              Meus Pedidos
            </a>
          )}

          <button
            onClick={() => setIsSearchOpen(true)}
            className="text-freo-light hover:text-freo-orange transition-colors"
            aria-label="Pesquisar produto"
          >
            <Search className="w-5 h-5" />
          </button>

          <button
            onClick={onOpenAuth}
            className="text-freo-light hover:text-freo-orange transition-colors"
            aria-label="Minha conta"
          >
            <User className="w-5 h-5" />
          </button>

          <button
            onClick={onOpenCart}
            className="text-freo-light hover:text-freo-orange transition-colors relative"
            aria-label="Abrir carrinho"
          >
            <ShoppingCart className="w-5 h-5" />

            {cartItems.length > 0 && (
              <span className="absolute -top-2 -right-2 bg-freo-orange text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {cartItems.reduce((total: number, item: CartItem) => total + item.quantity, 0)}
              </span>
            )}
          </button>
        </div>

        <button
          className="md:hidden z-50"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Abrir menu"
        >
          {mobileMenuOpen ? <X /> : <Menu />}
        </button>
      </div>

      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-0 left-0 w-full h-screen bg-black flex flex-col items-center justify-center gap-8 text-2xl font-display font-bold uppercase"
          >
            {currentView === 'home' ? (
              <>
                <a href="#categorias" onClick={() => setMobileMenuOpen(false)} className="hover:text-freo-orange">Categorias</a>
                <a href="#destaques" onClick={() => setMobileMenuOpen(false)} className="hover:text-freo-orange">Destaques</a>
                <a href="#sobre" onClick={() => setMobileMenuOpen(false)} className="hover:text-freo-orange">O Processo</a>
                <a href="#sobre-nos" onClick={() => setMobileMenuOpen(false)} className="hover:text-freo-orange">A Origem</a>

                <button onClick={goToCatalog} className="text-freo-orange">
                  Catálogo
                </button>
              </>
            ) : (
              <>
                <button onClick={goHome} className="hover:text-freo-orange">Início</button>
                <span className="text-freo-orange">Catálogo</span>
              </>
            )}

            <button
              onClick={() => {
                setIsSearchOpen(true);
                setMobileMenuOpen(false);
              }}
              className="text-freo-light hover:text-freo-orange flex items-center gap-2 mt-2 text-lg"
            >
              <Search className="w-6 h-6" />
              Buscar Produto
            </button>

            {user && (
              <a
                href="/meus-pedidos.html"
                className="text-freo-orange flex items-center gap-2 mt-4 text-lg border border-freo-orange/30 px-6 py-2 rounded bg-freo-orange/10"
              >
                <Box className="w-6 h-6" />
                Meus Pedidos
              </a>
            )}

            <button
              onClick={() => {
                onOpenAuth();
                setMobileMenuOpen(false);
              }}
              className="text-freo-light hover:text-freo-orange flex items-center gap-2 mt-4 text-lg"
            >
              <User className="w-6 h-6" />
              {user ? 'Minha Conta' : 'Entrar / Criar Conta'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isSearchOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSearchOpen(false)}
              className="fixed inset-0 z-[60] bg-black/75 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.98 }}
              className="fixed top-24 left-1/2 -translate-x-1/2 z-[70] w-[calc(100%-32px)] max-w-3xl bg-freo-dark border border-freo-orange/30 shadow-[0_0_40px_rgba(221,175,52,0.15)]"
            >
              <form onSubmit={submitSearch} className="p-4 md:p-5">
                <div className="flex items-center gap-3 bg-freo-black border border-white/10 px-4 py-3 focus-within:border-freo-orange transition-colors">
                  <Search className="w-5 h-5 text-freo-orange flex-shrink-0" />

                  <input
                    ref={searchInputRef}
                    value={searchTerm}
                    onChange={event => setSearchTerm(event.target.value)}
                    placeholder="Busque como na Shopee: santo, coringa, joker, resdent evil, creeper, camiseta..."
                    className="w-full bg-transparent outline-none text-white font-mono text-sm md:text-base placeholder:text-white/25"
                  />

                  {searchTerm && (
                    <button
                      type="button"
                      onClick={clearSearch}
                      className="text-white/40 hover:text-white transition-colors"
                      aria-label="Limpar busca"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}

                  <button
                    type="submit"
                    className="hidden sm:block bg-freo-orange text-freo-black font-display font-bold uppercase tracking-widest px-5 py-2 hover:bg-white transition-colors"
                  >
                    Buscar
                  </button>
                </div>

                <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-[11px] font-mono text-white/35 uppercase tracking-wider">
                  <span>Busca inteligente global: todas as categorias, sinônimos, variações e erros de digitação.</span>

                  <button
                    type="button"
                    onClick={() => setIsSearchOpen(false)}
                    className="text-freo-orange hover:text-white transition-colors self-start sm:self-auto"
                  >
                    Fechar
                  </button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </nav>
  );
};

// --- Hero ---
const Hero = ({ setCurrentView }: any) => {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden bg-[#080808]">
      <div
        className="absolute inset-0 z-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(221,175,52,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(221,175,52,0.04) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      <div
        className="absolute inset-0 z-0"
        style={{
          background:
            'radial-gradient(ellipse 55% 75% at 22% 55%, rgba(221,175,52,0.07) 0%, transparent 70%)',
        }}
      />

      <div className="max-w-7xl mx-auto px-6 lg:px-12 grid lg:grid-cols-2 gap-10 items-center relative z-10 w-full pt-28 pb-12 min-h-screen">
        <div className="flex flex-col gap-7">
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.55 }}
            className="inline-flex items-center gap-2 self-start border border-freo-orange/20 bg-freo-orange/5 px-3 py-1.5"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-freo-orange animate-pulse" />
            <span className="font-mono text-[10px] text-freo-orange uppercase tracking-[0.18em]">
              Layer by Layer, Legend by Design.
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 44 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="font-display font-black leading-[0.88] uppercase"
          >
            <span
              className="block text-white"
              style={{
                fontSize: 'clamp(2.8rem, 6.2vw, 5.8rem)',
                textShadow: '0 0 60px rgba(255,255,255,0.05)',
              }}
            >
              Tornando o
            </span>

            <span
              className="block"
              style={{
                fontSize: 'clamp(2.4rem, 5.8vw, 5.4rem)',
                color: '#DDAF34',
                textShadow: '0 0 80px rgba(221,175,52,0.38)',
              }}
            >
              inimaginável
            </span>

            <span
              className="block"
              style={{
                fontSize: 'clamp(2.4rem, 5.8vw, 5.4rem)',
                color: '#DDAF34',
                textShadow: '0 0 80px rgba(221,175,52,0.38)',
              }}
            >
              palpável
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.32 }}
            className="text-freo-light/65 text-base md:text-lg max-w-[420px] font-body leading-relaxed"
          >
            Arte, utilidade e cultura pop esculpidas camada por camada. Impressão 3D de alta precisão com design exclusivo{' '}
            <span className="text-freo-orange font-semibold">FreoFigures.</span>
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.46 }}
            className="flex flex-wrap gap-4 mt-1"
          >
            <button
              onClick={() => {
                setCurrentView('shop');
                window.scrollTo(0, 0);
              }}
              className="group relative flex items-center gap-3 bg-freo-orange text-freo-black font-display font-bold uppercase tracking-widest px-8 py-4 hover:bg-white transition-colors overflow-hidden"
            >
              <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              <span className="relative">Explorar Loja</span>
              <ChevronRight className="relative w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>

            <a
              href="https://wa.me/5511961789176?text=Olá,%20gostaria%20de%20falar%20sobre%20um%20projeto%20customizado!"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center border border-white/15 text-white font-display font-bold uppercase tracking-widest px-8 py-4 hover:border-freo-orange/50 hover:bg-freo-orange/5 transition-all"
            >
              Projetos Custom
            </a>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.85, delay: 0.2 }}
          className="relative h-[480px] lg:h-[660px] hidden lg:flex items-center justify-center"
        >
          <div className="absolute w-[420px] h-[420px] rounded-full bg-freo-orange/10 blur-[80px]" />

          <motion.img
            animate={{ y: [-8, 8, -8] }}
            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
            src="https://rrmxqpvxrpcqqxsgccqw.supabase.co/storage/v1/object/public/imagens/LOGO_DEASHBOARD2.png"
            alt="Freo Figures"
            className="relative z-10 w-[500px] h-[500px] object-contain"
            style={{
              filter:
                'drop-shadow(0 0 28px rgba(221,175,52,0.40)) drop-shadow(0 0 8px rgba(221,175,52,0.2))',
            }}
          />
        </motion.div>
      </div>
    </section>
  );
};

// --- Marquee ---
const Marquee = () => (
  <div className="bg-freo-orange text-freo-black py-3 overflow-hidden flex whitespace-nowrap border-y border-freo-orange/50">
    <motion.div
      animate={{ x: [0, -1035] }}
      transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
      className="flex gap-8 font-display font-black text-xl uppercase tracking-widest"
    >
      {[...Array(10)].map((_, index) => (
        <span key={index} className="flex items-center gap-8">
          <span>Impressão 3D</span>
          <Hexagon className="w-4 h-4" fill="currentColor" />
          <span>Action Figures</span>
          <Hexagon className="w-4 h-4" fill="currentColor" />
          <span>Arte Religiosa</span>
          <Hexagon className="w-4 h-4" fill="currentColor" />
          <span>Utensílios</span>
          <Hexagon className="w-4 h-4" fill="currentColor" />
        </span>
      ))}
    </motion.div>
  </div>
);

// --- Categories ---
const Categories = ({ setCurrentView, setFilter }: any) => {
  const cats = [
    {
      name: 'Action Figures',
      slug: 'games',
      img: 'https://rrmxqpvxrpcqqxsgccqw.supabase.co/storage/v1/object/public/imagens/ACTION_FIGURES.png',
      desc: 'Heróis, vilões e cultura pop.',
    },
    {
      name: 'Religioso',
      slug: 'religioso',
      img: 'https://rrmxqpvxrpcqqxsgccqw.supabase.co/storage/v1/object/public/imagens/RELIGIOSO.png',
      desc: 'Fé materializada com respeito.',
    },
    {
      name: 'Utensílios',
      slug: 'lifestyle',
      img: 'https://rrmxqpvxrpcqqxsgccqw.supabase.co/storage/v1/object/public/imagens/UTENSILIOS.png',
      desc: 'Design funcional para o dia a dia.',
    },
    {
      name: 'Decoração',
      slug: 'outros',
      img: 'https://rrmxqpvxrpcqqxsgccqw.supabase.co/storage/v1/object/public/imagens/DECORACAO.png',
      desc: 'Geometria e arte para seu espaço.',
    },
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
          <h2 className="text-4xl md:text-6xl font-display font-black uppercase tracking-tighter">
            Nossos <span className="text-freo-orange">Domínios</span>
          </h2>

          <p className="text-freo-light/60 mt-2 font-body max-w-md">
            Explore nossas categorias de produtos criados com precisão milimétrica.
          </p>
        </div>

        <button
          onClick={() => {
            setCurrentView('shop');
            window.scrollTo(0, 0);
          }}
          className="text-sm font-bold uppercase tracking-widest border-b border-freo-orange pb-1 hover:text-freo-orange transition-colors"
        >
          Ver todas as categorias
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {cats.map((cat, index) => (
          <div
            key={cat.slug}
            onClick={() => handleCatClick(cat.slug)}
            className="group relative h-[400px] overflow-hidden bg-freo-dark cursor-pointer border border-white/5"
          >
            <img
              src={cat.img}
              alt={cat.name}
              className="absolute inset-0 w-full h-full object-cover opacity-50 group-hover:opacity-80 transition-opacity duration-500 grayscale group-hover:grayscale-0"
              referrerPolicy="no-referrer"
            />

            <div className="absolute inset-0 bg-gradient-to-t from-freo-black via-freo-black/50 to-transparent" />

            <div className="absolute bottom-0 left-0 p-6 w-full transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
              <div className="text-freo-orange font-mono text-xs mb-2 opacity-0 group-hover:opacity-100 transition-opacity delay-100">
                // CATEGORIA_0{index + 1}
              </div>

              <h3 className="text-2xl font-display font-bold uppercase tracking-wide mb-1">
                {cat.name}
              </h3>

              <p className="text-sm text-freo-light/70 font-body opacity-0 group-hover:opacity-100 transition-opacity delay-150">
                {cat.desc}
              </p>
            </div>

            <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-freo-orange opacity-0 group-hover:opacity-100 transition-opacity m-4" />
            <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-freo-orange opacity-0 group-hover:opacity-100 transition-opacity m-4" />
          </div>
        ))}
      </div>
    </section>
  );
};

// --- ProductCard ---
const ProductCard = ({
  product,
  onAddToCart,
  compact = false,
}: {
  product: Product;
  onAddToCart: (product: Product) => void;
  compact?: boolean;
}) => {
  const thumb = product.images && product.images.length > 0 ? product.images[0] : null;
  const hasPromo = product.promotional_price !== null && product.promotional_price < product.price;
  const displayPrice = hasPromo ? product.promotional_price! : product.price;
  const tags = Array.isArray(product.tags) ? product.tags : typeof product.tags === 'string' ? [product.tags] : [];
  const tag = tags.length > 0 ? tags[0] : null;

  const goToProduct = () => {
    window.location.href = `/produto?id=${product.id}`;
  };

  return (
    <div className={`group flex flex-col ${
      compact ? '' : 'bg-freo-dark border border-white/5 hover:border-freo-orange/50 transition-colors'
    }`}>
      <div
        className={`relative ${
          compact ? 'aspect-square' : 'aspect-square bg-freo-black'
        } overflow-hidden ${
          compact ? 'border border-white/5 group-hover:border-freo-orange/50 transition-colors' : ''
        } mb-4 cursor-pointer`}
        onClick={goToProduct}
      >
        {tag && (
          <div className="absolute top-3 left-3 z-10 bg-freo-orange text-freo-black text-[10px] font-bold uppercase tracking-widest px-2 py-1">
            {tag}
          </div>
        )}

        {thumb ? (
          <img
            src={thumb}
            alt={product.title}
            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all duration-700"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-freo-dark">
            <Box className="w-12 h-12 text-white/10" />
          </div>
        )}

        {!compact && (
          <div className="absolute inset-0 bg-freo-orange/20 opacity-0 group-hover:opacity-100 mix-blend-overlay transition-opacity duration-300" />
        )}
      </div>

      <div className={`flex flex-col flex-grow ${compact ? '' : 'p-5'}`}>
        <span className="text-freo-orange text-[10px] font-mono uppercase mb-1 tracking-wider">
          {product.category || 'Geral'}
        </span>

        <h3
          className="font-display font-bold leading-tight mb-2 group-hover:text-freo-orange transition-colors cursor-pointer text-lg"
          onClick={goToProduct}
        >
          {product.title}
        </h3>

        <div className="mt-auto flex flex-col gap-3">
          <div className="flex items-end gap-2">
            {hasPromo && (
              <span className="font-mono text-sm text-white/30 line-through">
                {formatPrice(product.price)}
              </span>
            )}

            <span className="font-mono text-xl font-bold text-freo-orange">
              {formatPrice(displayPrice)}
            </span>
          </div>

          <button
            onClick={event => {
              event.stopPropagation();
              onAddToCart(product);
            }}
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

// --- FeaturedProducts ---
const FeaturedProducts = ({ addToCart }: any) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadProducts = async () => {
      try {
        // @ts-ignore
        const supabase = window.supabaseClient || window.supabase;

        if (!supabase) return;

        const { data, error } = await supabase
          .from('products')
          .select('*')
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(4);

        if (!error && data) {
          setProducts(data);
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    loadProducts();
  }, []);

  return (
    <section id="destaques" className="py-24 bg-freo-dark relative border-y border-white/5">
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-freo-orange/50 to-transparent" />

      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-display font-black uppercase tracking-tighter inline-block relative">
            Destaques da <span className="text-freo-orange">Forja</span>
            <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-24 h-1 bg-freo-orange" />
          </h2>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {[...Array(4)].map((_, index) => (
              <div key={index} className="animate-pulse">
                <div className="aspect-square bg-freo-black/80 mb-4" />
                <div className="h-3 bg-white/5 rounded w-1/3 mb-2" />
                <div className="h-5 bg-white/5 rounded w-3/4 mb-4" />
                <div className="h-10 bg-freo-orange/20 rounded" />
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-16">
            <p className="font-mono text-white/30 text-sm">Nenhum produto cadastrado ainda.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {products.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                onAddToCart={addToCart}
                compact
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

// --- ProcessSection ---
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

          <motion.div
            animate={{ top: ['0%', '100%', '0%'] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
            className="absolute left-0 w-full h-1 bg-freo-orange shadow-[0_0_20px_rgba(255,77,0,0.8)] z-10"
          />
        </div>

        <div className="absolute -bottom-8 -right-8 bg-freo-black border border-freo-orange p-6 max-w-xs">
          <div className="font-mono text-freo-orange text-sm mb-2">// QUALIDADE_FREO</div>
          <div className="font-display font-black text-4xl mb-1">100%</div>
          <div className="text-sm text-freo-light/70 font-body">
            Inspecionado manualmente antes do envio.
          </div>
        </div>
      </div>

      <div className="order-1 lg:order-2">
        <h2 className="text-4xl md:text-5xl font-display font-black uppercase tracking-tighter mb-8">
          A Arte da <br />
          <span className="text-freo-orange">Manufatura Aditiva</span>
        </h2>

        <div className="space-y-8">
          {[
            {
              num: '01',
              title: 'Design & Modelagem',
              desc: 'Criamos ou curamos modelos 3D exclusivos, otimizados para a melhor resolução possível.',
            },
            {
              num: '02',
              title: 'Fatiamento de Precisão',
              desc: 'Configuramos cada camada no software para garantir resistência estrutural e acabamento impecável.',
            },
            {
              num: '03',
              title: 'Impressão Camada a Camada',
              desc: 'Nossas máquinas depositam o material com precisão para transformar ideia em peça real.',
            },
            {
              num: '04',
              title: 'Pós-Processamento',
              desc: 'Limpeza, ajustes e controle de qualidade antes do envio.',
            },
          ].map(step => (
            <div key={step.num} className="flex gap-6 group">
              <div className="font-display font-black text-4xl text-freo-gray group-hover:text-freo-orange transition-colors">
                {step.num}
              </div>

              <div>
                <h4 className="text-xl font-bold font-display uppercase tracking-wide mb-2">
                  {step.title}
                </h4>

                <p className="text-freo-light/60 font-body">
                  {step.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </section>
);

// --- AboutSection ---
const AboutSection = () => (
  <section id="sobre-nos" className="py-32 px-6 bg-freo-black relative overflow-hidden border-t border-white/5">
    <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-freo-orange/5 rounded-full blur-[150px] pointer-events-none" />
    <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-freo-cyan/5 rounded-full blur-[100px] pointer-events-none" />

    <div className="max-w-4xl mx-auto relative z-10">
      <div className="flex flex-col md:flex-row gap-16 items-start">
        <div className="md:w-1/3 md:sticky md:top-32">
          <div className="font-mono text-freo-orange text-sm mb-4 tracking-widest uppercase">
            // A ORIGEM
          </div>

          <h2 className="text-4xl md:text-5xl font-display font-black uppercase tracking-tighter leading-none mb-6">
            Sobre <br />
            <span className="text-freo-orange">Nós?</span>
          </h2>

          <div className="w-12 h-1 bg-freo-orange mb-8" />

          <div className="relative w-32 h-32 md:w-48 md:h-48 grayscale hover:grayscale-0 transition-all duration-500 border border-white/10">
            <img
              src="https://rrmxqpvxrpcqqxsgccqw.supabase.co/storage/v1/object/public/imagens/logo.jpg"
              alt="Freo Figures Creator"
              className="w-full h-full object-cover opacity-80"
              referrerPolicy="no-referrer"
            />

            <div className="absolute inset-0 border border-freo-orange/30 translate-x-2 translate-y-2 -z-10" />
          </div>
        </div>

        <div className="md:w-2/3 space-y-8 font-body text-lg text-freo-light/80 leading-relaxed">
          <p className="text-2xl font-display font-medium text-white">
            É mais sobre por que eu comecei.
          </p>

          <p>
            A Freo Figures começou com uma máquina, um rolo de filamento e uma inquietação:
            <br />
            <span className="text-freo-orange font-medium italic">
              "E se eu puder criar exatamente o que eu imagino?"
            </span>
          </p>

          <p>
            Eu não comecei isso pensando em abrir empresa.
            <br />
            Eu comecei porque não me conformava em só consumir o que já existia.
          </p>

          <div className="pl-6 border-l-2 border-freo-orange/50 py-2 space-y-1 font-mono text-sm uppercase tracking-wider text-freo-light/60">
            <p>Eu queria fazer.</p>
            <p>Errar.</p>
            <p>Aprender.</p>
            <p>Melhorar.</p>
            <p className="text-freo-orange">Fazer de novo.</p>
          </div>

          <p>
            No começo deu errado várias vezes. Peça que não saía como eu queria.
            Ideia que na cabeça era incrível e na prática não funcionava.
          </p>

          <p className="font-bold text-white">Mas nunca foi sobre o mais fácil.</p>

          <p>
            Foi sobre olhar pra algo que não existe ainda e pensar:
            <br />
            <span className="text-freo-cyan font-medium italic">
              "Eu consigo criar isso."
            </span>
          </p>

          <div className="bg-freo-dark p-8 border border-white/5 mt-12 relative">
            <div className="absolute top-0 left-0 w-2 h-full bg-freo-orange" />

            <p className="mb-6">
              Se você está aqui, talvez você também seja do tipo que valoriza quem faz, não só quem vende.
            </p>

            <p className="font-display text-xl text-white">
              Então, mais do que comprar uma peça, você está apoiando alguém que decidiu construir algo do zero.
              <br />
              <span className="text-freo-orange">Camada por camada. Sem atalho.</span>
            </p>
          </div>

          <div className="pt-8">
            <p className="font-display font-bold uppercase tracking-widest text-sm">
              Essa é a Freo Figures.
              <br />
              <span className="text-freo-light/50">E esse sou eu por trás dela.</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>
);

// --- StoreCTA ---
const StoreCTA = ({ setCurrentView }: any) => (
  <section className="py-24 px-6 bg-freo-orange text-freo-black relative overflow-hidden border-y border-freo-orange/50">
    <div
      className="absolute inset-0 opacity-10"
      style={{
        backgroundImage: 'radial-gradient(#000 1px, transparent 1px)',
        backgroundSize: '20px 20px',
      }}
    />

    <div className="max-w-4xl mx-auto text-center relative z-10 flex flex-col items-center">
      <img
        src="https://rrmxqpvxrpcqqxsgccqw.supabase.co/storage/v1/object/public/imagens/logo.jpg"
        alt="Logo"
        className="w-24 h-24 rounded-full object-cover border-4 border-freo-black mb-6 shadow-2xl"
      />

      <h2 className="text-5xl md:text-7xl font-display font-black uppercase tracking-tighter mb-6 leading-none">
        Acesse o <br />
        Catálogo Completo
      </h2>

      <p className="font-body text-xl mb-10 font-medium max-w-2xl">
        Filtre por categorias, explore detalhes e encontre a peça perfeita para seu setup, altar ou estante.
      </p>

      <button
        onClick={() => {
          setCurrentView('shop');
          window.scrollTo(0, 0);
        }}
        className="bg-freo-black text-freo-orange font-display font-bold uppercase tracking-widest px-10 py-5 text-lg hover:bg-white hover:text-freo-black transition-colors flex items-center gap-3 group"
      >
        Entrar na Loja
        <ChevronRight className="group-hover:translate-x-1 transition-transform" />
      </button>
    </div>
  </section>
);

// --- Footer ---
const Footer = () => (
  <footer className="bg-freo-dark pt-20 pb-10 border-t border-white/10 relative overflow-hidden">
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[15vw] font-display font-black text-white/[0.02] whitespace-nowrap pointer-events-none select-none">
      FREO FIGURES
    </div>

    <div className="max-w-7xl mx-auto px-6 relative z-10">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">
        <div className="col-span-1 md:col-span-2 lg:col-span-1">
          <div className="flex items-center gap-3 mb-6">
            <img
              src="https://rrmxqpvxrpcqqxsgccqw.supabase.co/storage/v1/object/public/imagens/logo.jpg"
              alt="Logo"
              className="w-10 h-10 rounded-full object-cover border-2 border-freo-orange"
            />

            <span className="font-display font-black text-2xl tracking-tighter uppercase">
              Freo<span className="text-freo-orange font-light">Figures</span>
            </span>
          </div>

          <p className="text-freo-light/60 font-body text-sm mb-6">
            Transformando filamento em arte. Especialistas em impressão 3D de alta qualidade.
          </p>

          <div className="flex gap-4">
            <div className="w-10 h-10 border border-white/20 flex items-center justify-center hover:bg-freo-orange hover:border-freo-orange transition-colors cursor-pointer">IG</div>
            <div className="w-10 h-10 border border-white/20 flex items-center justify-center hover:bg-freo-orange hover:border-freo-orange transition-colors cursor-pointer">TT</div>
            <div className="w-10 h-10 border border-white/20 flex items-center justify-center hover:bg-freo-orange hover:border-freo-orange transition-colors cursor-pointer">YT</div>
          </div>
        </div>

        <div>
          <h4 className="font-display font-bold uppercase tracking-widest mb-6 text-freo-orange">
            Loja
          </h4>

          <ul className="space-y-3 text-sm text-freo-light/70 font-body">
            <li><a href="#" className="hover:text-white transition-colors">Action Figures</a></li>
            <li><a href="#" className="hover:text-white transition-colors">Artigos Religiosos</a></li>
            <li><a href="#" className="hover:text-white transition-colors">Utensílios & Casa</a></li>
            <li><a href="#" className="hover:text-white transition-colors">Decoração</a></li>
            <li>
              <a
                href="https://wa.me/5511961789176?text=Olá,%20gostaria%20de%20falar%20sobre%20um%20projeto%20sob%20medida!"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition-colors"
              >
                Projetos Sob Medida
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="font-display font-bold uppercase tracking-widest mb-6 text-freo-orange">
            Suporte
          </h4>

          <ul className="space-y-3 text-sm text-freo-light/70 font-body">
            <li><a href="#" className="hover:text-white transition-colors">FAQ</a></li>
            <li><a href="#" className="hover:text-white transition-colors">Envio e Prazos</a></li>
            <li><a href="#" className="hover:text-white transition-colors">Trocas e Devoluções</a></li>
            <li><a href="#" className="hover:text-white transition-colors">Cuidados com a Peça</a></li>
            <li>
              <a
                href="https://wa.me/5511961789176?text=Olá,%20vim%20pelo%20site%20da%20FreoFigures!"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition-colors"
              >
                Contato
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="font-display font-bold uppercase tracking-widest mb-6 text-freo-orange">
            Newsletter
          </h4>

          <p className="text-sm text-freo-light/70 font-body mb-4">
            Receba novidades sobre novos modelos e descontos exclusivos.
          </p>

          <div className="flex">
            <input
              type="email"
              placeholder="SEU E-MAIL"
              className="bg-freo-black border border-white/20 px-4 py-2 w-full text-sm font-mono focus:outline-none focus:border-freo-orange"
            />

            <button className="bg-freo-orange text-freo-black px-4 font-bold hover:bg-white transition-colors">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-freo-light/40 font-mono">
        <div>&copy; {new Date().getFullYear()} FREO FIGURES. TODOS OS DIREITOS RESERVADOS.</div>

        <div className="flex gap-4">
          <a href="#" className="hover:text-white">TERMOS</a>
          <a href="#" className="hover:text-white">PRIVACIDADE</a>
        </div>
      </div>
    </div>
  </footer>
);

// --- ShopView ---
const ShopView = ({ addToCart, initialFilter, searchTerm, onClearSearch }: any) => {
  const [activeFilter, setActiveFilter] = useState(initialFilter || 'Todos');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const categories = ['Todos', 'games', 'religioso', 'keycaps', 'personalizado', 'lifestyle', 'outros'];

  const categoryLabels: Record<string, string> = {
    Todos: 'Todos',
    games: 'Games & Geek',
    religioso: 'Religioso',
    keycaps: 'Keycaps',
    personalizado: 'Personalizado',
    lifestyle: 'Lifestyle',
    outros: 'Outros',
  };

  const hasSearch = String(searchTerm || '').trim().length > 0;

  useEffect(() => {
    setActiveFilter(initialFilter || 'Todos');
  }, [initialFilter]);

  useEffect(() => {
    if (hasSearch) {
      setActiveFilter('Todos');
    }
  }, [hasSearch, searchTerm]);

  useEffect(() => {
    const loadProducts = async () => {
      setLoading(true);

      try {
        // @ts-ignore
        const supabase = window.supabaseClient || window.supabase;

        if (!supabase) return;

        const { data, error } = await supabase
          .from('products')
          .select('*')
          .eq('is_active', true)
          .order('created_at', { ascending: false });

        if (!error && data) {
          setProducts(data);
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    loadProducts();
  }, []);

  const filtered = useMemo(() => {
    if (hasSearch) {
      return products
        .map(product => ({
          product,
          score: getSearchScore(product, searchTerm),
        }))
        .filter(item => item.score >= MINIMUM_SEARCH_SCORE)
        .sort((a, b) => b.score - a.score)
        .map(item => item.product);
    }

    if (activeFilter === 'Todos') {
      return products;
    }

    return products.filter(product => product.category === activeFilter);
  }, [products, searchTerm, hasSearch, activeFilter]);

  const handleCategoryClick = (category: string) => {
    onClearSearch();
    setActiveFilter(category);
  };

  return (
    <div className="pt-32 pb-24 px-6 max-w-7xl mx-auto min-h-screen">
      <div className="flex flex-col md:flex-row gap-12">
        <div className="md:w-1/4">
          <div className="sticky top-32">
            <h2 className="font-display font-black text-3xl uppercase mb-8">
              Catálogo
            </h2>

            {hasSearch && (
              <div className="mb-5 bg-freo-orange/10 border border-freo-orange/30 p-4">
                <div className="font-mono text-[10px] text-freo-orange uppercase tracking-widest mb-2">
                  Busca ativa
                </div>

                <div className="font-display font-bold text-white leading-tight mb-3 break-words">
                  {searchTerm}
                </div>

                <button
                  onClick={onClearSearch}
                  className="font-mono text-[11px] uppercase text-white/50 hover:text-freo-orange transition-colors"
                >
                  Limpar busca
                </button>
              </div>
            )}

            <div className="space-y-2">
              {categories.map(category => (
                <button
                  key={category}
                  onClick={() => handleCategoryClick(category)}
                  className={`block w-full text-left px-4 py-3 font-mono text-sm uppercase tracking-widest transition-all ${
                    !hasSearch && activeFilter === category
                      ? 'bg-freo-orange text-freo-black font-bold'
                      : 'text-freo-light/60 hover:text-freo-orange hover:bg-white/5'
                  }`}
                >
                  {!hasSearch && activeFilter === category && <span className="mr-2">&gt;</span>}
                  {categoryLabels[category] || category}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="md:w-3/4">
          <div className="mb-8 flex flex-col md:flex-row md:justify-between md:items-end gap-4 border-b border-white/10 pb-4">
            <div className="font-mono text-freo-light/50 text-sm">
              {loading ? (
                'Carregando...'
              ) : hasSearch ? (
                <>
                  Mostrando {filtered.length} resultado{filtered.length !== 1 ? 's' : ''} para a busca{' '}
                  <span className="text-freo-orange">[{searchTerm}]</span> em todas as categorias
                </>
              ) : (
                <>
                  Mostrando {filtered.length} resultado{filtered.length !== 1 ? 's' : ''} para{' '}
                  <span className="text-freo-orange">[{categoryLabels[activeFilter] || activeFilter}]</span>
                </>
              )}
            </div>

            {hasSearch && (
              <button
                onClick={onClearSearch}
                className="self-start md:self-auto text-xs font-mono uppercase tracking-widest border border-freo-orange/30 text-freo-orange px-3 py-2 hover:bg-freo-orange hover:text-freo-black transition-colors"
              >
                Ver catálogo completo
              </button>
            )}
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, index) => (
                <div key={index} className="animate-pulse bg-freo-dark border border-white/5">
                  <div className="aspect-square bg-freo-black/80" />

                  <div className="p-5 space-y-3">
                    <div className="h-3 bg-white/5 rounded w-1/4" />
                    <div className="h-5 bg-white/5 rounded w-3/4" />
                    <div className="h-10 bg-freo-orange/20 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-24">
              <div className="text-5xl mb-4">🔎</div>

              <p className="font-display font-bold text-xl text-white/20 uppercase mb-2">
                {products.length === 0
                  ? 'Nenhum produto cadastrado ainda'
                  : hasSearch
                    ? 'Nenhum produto encontrado'
                    : 'Nenhum produto nesta categoria'}
              </p>

              <p className="font-mono text-sm text-white/20 max-w-xl mx-auto">
                {products.length === 0
                  ? 'Use o painel admin para importar seus produtos.'
                  : hasSearch
                    ? 'Tente buscar por outra palavra relacionada: joker, coringa, creeper, chaveiro, santo, cruz, resident, umbrella.'
                    : 'Tente outra categoria.'}
              </p>
            </div>
          ) : (
            <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <AnimatePresence>
                {filtered.map(product => (
                  <motion.div
                    key={product.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.3 }}
                  >
                    <ProductCard product={product} onAddToCart={addToCart} />
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

// --- HomeView ---
const HomeView = ({ setCurrentView, addToCart, setFilter }: any) => (
  <>
    <Hero setCurrentView={setCurrentView} />
    <Marquee />
    <Categories setCurrentView={setCurrentView} setFilter={setFilter} />
    <FeaturedProducts addToCart={addToCart} />
    <StoreCTA setCurrentView={setCurrentView} />
    <ProcessSection />
    <AboutSection />
  </>
);

// --- AuthModal ---
const AuthModal = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setPhone('');
      setEmail('');
      setPassword('');
      setError('');
      setSuccess(false);
    }
  }, [isOpen, isLogin]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!email.includes('@') || !email.includes('.')) {
      setError('Por favor, insira um e-mail válido.');
      return;
    }

    if (!isLogin) {
      if (!name || !phone || !email || !password) {
        setError('Preencha todos os campos.');
        return;
      }

      setLoading(true);

      try {
        // @ts-ignore
        const { error } = await window.supabase.auth.signUp({
          email,
          password,
          options: {
            data: { name, phone },
            emailRedirectTo: 'https://freofigures.com.br/auth/callback.html',
          },
        });

        if (error) {
          let message = error.message;

          if (message.includes('rate limit')) {
            message = 'Limite de envios excedido. Tente mais tarde.';
          } else if (message.includes('already registered')) {
            message = 'Este e-mail já está cadastrado.';
          }

          setError(message);
        } else {
          setSuccess(true);

          setTimeout(() => onClose(), 6000);

          fetch('https://n8nwebhook.solviaoficial.com/webhook/26afb276-b7a5-4d0c-b733-03c47836bd14', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name,
              phone,
              email,
              action: 'create_account',
            }),
          }).catch(console.error);
        }
      } catch {
        setError('Erro de conexão. Tente novamente.');
      } finally {
        setLoading(false);
      }
    } else {
      if (!email || !password) {
        setError('Preencha todos os campos.');
        return;
      }

      setLoading(true);

      try {
        // @ts-ignore
        const { error } = await window.supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          let message = error.message;

          if (message === 'Invalid login credentials') {
            message = 'Email ou senha incorretos.';
          } else if (message === 'Email not confirmed') {
            message = 'Confirme seu email antes de fazer login.';
          }

          setError(message);
        } else {
          setSuccess(true);

          setTimeout(() => {
            onClose();
            window.location.href = '/dashboard.html';
          }, 1500);
        }
      } catch {
        setError('Erro de conexão. Tente novamente.');
      } finally {
        setLoading(false);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-freo-black/80 backdrop-blur-sm"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-md bg-freo-dark border border-white/10 shadow-2xl overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-freo-orange to-freo-cyan" />

          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-freo-light/50 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>

          <div className="p-8">
            <div className="flex justify-center mb-8">
              <img
                src="https://rrmxqpvxrpcqqxsgccqw.supabase.co/storage/v1/object/public/imagens/logo.jpg"
                alt="Logo"
                className="w-16 h-16 rounded-full object-cover border-2 border-freo-orange shadow-[0_0_15px_rgba(221,175,52,0.3)]"
              />
            </div>

            <h2 className="text-3xl font-display font-black uppercase text-center mb-2">
              {isLogin ? 'Acessar a Forja' : 'Criar Conta'}
            </h2>

            <p className="text-freo-light/60 text-center font-body text-sm mb-8">
              {isLogin
                ? 'Entre para acompanhar seus pedidos e projetos.'
                : 'Junte-se à revolução da manufatura aditiva.'}
            </p>

            {success ? (
              <div className="bg-freo-cyan/10 border border-freo-cyan text-freo-cyan p-6 text-center font-mono text-sm mb-6 flex flex-col items-center gap-3">
                <span>{isLogin ? 'Login realizado com sucesso!' : '✅ Conta criada! Verifique seu email.'}</span>
              </div>
            ) : (
              <div className="space-y-4">
                {error && (
                  <div className="bg-freo-orange/10 border border-freo-orange text-freo-orange p-3 text-center font-mono text-xs">
                    {error}
                  </div>
                )}

                <form className="space-y-4" onSubmit={handleSubmit}>
                  {!isLogin && (
                    <>
                      <input
                        type="text"
                        placeholder="NOME COMPLETO"
                        value={name}
                        onChange={event => setName(event.target.value)}
                        className="w-full bg-freo-black border border-white/10 px-4 py-3 font-mono text-sm focus:outline-none focus:border-freo-orange transition-colors"
                      />

                      <input
                        type="tel"
                        placeholder="TELEFONE / WHATSAPP"
                        value={phone}
                        onChange={event => setPhone(event.target.value)}
                        className="w-full bg-freo-black border border-white/10 px-4 py-3 font-mono text-sm focus:outline-none focus:border-freo-orange transition-colors"
                      />
                    </>
                  )}

                  <input
                    type="email"
                    placeholder="E-MAIL"
                    value={email}
                    onChange={event => setEmail(event.target.value)}
                    className="w-full bg-freo-black border border-white/10 px-4 py-3 font-mono text-sm focus:outline-none focus:border-freo-orange transition-colors"
                  />

                  <input
                    type="password"
                    placeholder="SENHA"
                    value={password}
                    onChange={event => setPassword(event.target.value)}
                    className="w-full bg-freo-black border border-white/10 px-4 py-3 font-mono text-sm focus:outline-none focus:border-freo-orange transition-colors"
                  />

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-freo-orange text-freo-black font-display font-bold uppercase tracking-widest py-4 hover:bg-white transition-colors mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Processando...' : isLogin ? 'Entrar' : 'Criar Conta'}
                  </button>
                </form>
              </div>
            )}

            <div className="mt-8 text-center">
              <button
                onClick={() => setIsLogin(!isLogin)}
                className="text-freo-light/60 hover:text-freo-orange text-sm font-body transition-colors"
              >
                {isLogin ? 'Não tem uma conta? Crie agora.' : 'Já tem uma conta? Faça login.'}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

// --- CartDrawer ---
const CartDrawer = ({ isOpen, onClose, cartItems, updateQuantity, removeItem }: any) => {
  const total = cartItems.reduce((acc: number, item: CartItem) => {
    const price = item.price.replace('R$', '').replace(/\s/g, '').replace(',', '.');
    return acc + parseFloat(price) * item.quantity;
  }, 0);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[100] bg-freo-black/80 backdrop-blur-sm"
          />

          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.3 }}
            className="fixed top-0 right-0 h-full w-full sm:w-[420px] bg-freo-dark border-l border-white/10 z-[101] shadow-2xl flex flex-col"
          >
            <div className="p-6 border-b border-white/10 flex justify-between items-center">
              <h2 className="text-2xl font-display font-black uppercase flex items-center gap-3">
                <ShoppingCart className="w-6 h-6 text-freo-orange" />
                Seu Carrinho
              </h2>

              <button
                onClick={onClose}
                className="text-freo-light/50 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-grow overflow-y-auto p-6 space-y-4">
              {cartItems.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-freo-light/50 font-body">
                  <ShoppingCart className="w-16 h-16 mb-4 opacity-20" />
                  <p>Seu carrinho está vazio.</p>
                </div>
              ) : (
                cartItems.map((item: CartItem, index: number) => (
                  <div
                    key={item.cartItemId ?? index}
                    className="flex gap-4 bg-freo-black/50 p-3 border border-white/5 relative group"
                  >
                    <img
                      src={item.img}
                      alt={item.name}
                      className="w-20 h-20 object-cover flex-shrink-0"
                    />

                    <div className="flex flex-col flex-grow justify-between min-w-0">
                      <div className="pr-6">
                        <h4 className="font-display font-bold text-sm leading-tight">
                          {item.name}
                        </h4>

                        {item.variant && (
                          <p className="font-mono text-[10px] text-freo-orange/70 mt-1 uppercase tracking-wider leading-relaxed">
                            {item.variant}
                          </p>
                        )}
                      </div>

                      <div className="flex justify-between items-center mt-2">
                        <span className="font-mono text-freo-orange text-sm font-bold">
                          {item.price}
                        </span>

                        <div className="flex items-center gap-2 bg-freo-dark border border-white/10 px-2 py-1">
                          <button
                            onClick={() => updateQuantity(item, -1)}
                            className="hover:text-freo-orange transition-colors"
                          >
                            <Minus className="w-3 h-3" />
                          </button>

                          <span className="font-mono text-xs w-4 text-center">
                            {item.quantity}
                          </span>

                          <button
                            onClick={() => updateQuantity(item, 1)}
                            className="hover:text-freo-orange transition-colors"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => removeItem(item)}
                      className="absolute top-3 right-3 text-freo-light/30 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {cartItems.length > 0 && (
              <div className="p-6 border-t border-white/10 bg-freo-black">
                <div className="flex justify-between items-center mb-6 font-mono">
                  <span className="text-freo-light/70 uppercase text-sm">Total</span>

                  <span className="text-2xl font-bold text-freo-orange">
                    R$ {total.toFixed(2).replace('.', ',')}
                  </span>
                </div>

                <button
                  onClick={() => {
                    window.location.href = '/checkout.html';
                  }}
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

// --- App Principal ---
export default function App() {
  const [currentView, setCurrentView] = useState<'home' | 'shop'>('home');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [user, setUser] = useState<any>(null);
  const [activeFilter, setActiveFilter] = useState('Todos');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const handleAuthData = (event: any) => {
      setUser(event.detail.user);

      if (event.detail.cartItems) {
        setCartItems(
          event.detail.cartItems.map((item: any) => ({
            cartItemId: item.id,
            name: item.product_name,
            price: formatPrice(item.price),
            img: item.image_url,
            quantity: item.quantity,
            variant: item.variant ?? null,
          }))
        );
      }
    };

    const handleNotLoggedIn = () => {
      setUser(null);
      setCartItems([]);
    };

    window.addEventListener('auth-data-loaded', handleAuthData);
    window.addEventListener('auth-not-logged-in', handleNotLoggedIn);

    // @ts-ignore
    const supabase = window.supabaseClient || window.supabase;

    if (supabase) {
      supabase.auth.getSession().then(({ data: { session } }: any) => {
        if (session) setUser(session.user);
      });
    }

    return () => {
      window.removeEventListener('auth-data-loaded', handleAuthData);
      window.removeEventListener('auth-not-logged-in', handleNotLoggedIn);
    };
  }, []);

  const handleOpenAuth = () => {
    if (user) {
      window.location.href = '/dashboard.html';
    } else {
      window.location.href = '/login.html';
    }
  };

  const handleSearchSubmit = (term?: string) => {
    const clean = String(term ?? searchTerm).trim();

    if (!clean) return;

    setSearchTerm(clean);
    setActiveFilter('Todos');
    setCurrentView('shop');

    window.setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 0);
  };

  const handleSearchClear = () => {
    setSearchTerm('');
  };

  const handleFilterChange = (filter: string) => {
    setSearchTerm('');
    setActiveFilter(filter);
  };

  const addToCart = async (product: Product) => {
    // @ts-ignore
    const supabase = window.supabaseClient || window.supabase;

    if (!supabase) return;

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      window.location.href = '/login.html';
      return;
    }

    try {
      const thumb = product.images && product.images.length > 0 ? product.images[0] : '';
      const priceNum =
        product.promotional_price !== null && product.promotional_price < product.price
          ? product.promotional_price
          : product.price;

      const { data, error } = await supabase
        .from('cart_items')
        .insert({
          user_id: session.user.id,
          product_id: String(product.id),
          product_name: product.title,
          quantity: 1,
          price: priceNum,
          total_price: priceNum,
          image_url: thumb,
          variant: null,
        })
        .select()
        .single();

      if (error) throw error;

      setCartItems(previous => [
        ...previous,
        {
          cartItemId: data.id,
          name: product.title,
          price: formatPrice(priceNum),
          img: thumb,
          quantity: 1,
          variant: null,
        },
      ]);

      const toast = document.createElement('div');
      toast.className =
        'fixed bottom-4 right-4 bg-freo-orange text-freo-black px-6 py-4 font-display font-bold uppercase z-[9999] shadow-lg flex items-center gap-2 text-lg';
      toast.innerHTML = '✅ Adicionado ao carrinho!';

      document.body.appendChild(toast);

      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.5s ease';

        setTimeout(() => toast.remove(), 500);
      }, 3000);
    } catch (error) {
      console.error('Erro ao adicionar ao carrinho:', error);
    }
  };

  const updateQuantity = (product: CartItem, delta: number) => {
    setCartItems(previous =>
      previous.map(item =>
        item.cartItemId === product.cartItemId
          ? {
              ...item,
              quantity: Math.max(1, item.quantity + delta),
            }
          : item
      )
    );
  };

  const removeItem = async (product: CartItem) => {
    // @ts-ignore
    const supabase = window.supabaseClient || window.supabase;

    if (supabase && product.cartItemId) {
      await supabase.from('cart_items').delete().eq('id', product.cartItemId);
    }

    setCartItems(previous => previous.filter(item => item.cartItemId !== product.cartItemId));
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
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        onSearchSubmit={handleSearchSubmit}
        onSearchClear={handleSearchClear}
      />

      {currentView === 'home' ? (
        <HomeView
          setCurrentView={setCurrentView}
          addToCart={addToCart}
          setFilter={handleFilterChange}
        />
      ) : (
        <ShopView
          addToCart={addToCart}
          initialFilter={activeFilter}
          searchTerm={searchTerm}
          onClearSearch={handleSearchClear}
        />
      )}

      <Footer />

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />

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
