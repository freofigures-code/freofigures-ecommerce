import { useMemo, useState } from 'react';
import { Box, ChevronDown, ChevronRight, Cross, Gamepad2, Gift, Grid2X2, List, Menu, ShoppingCart, SlidersHorizontal, UsersRound, X } from 'lucide-react';

export type GeekProduct = {
  id: number;
  title: string;
  price: number;
  promotional_price: number | null;
  images: string[];
  tags: string[] | string | null;
};

type Props<T extends GeekProduct> = {
  products: T[];
  loading: boolean;
  onAddToCart: (product: T) => void;
  onProductClick: (product: T) => void;
  onSelectCategory: (category: string) => void;
};

const money = (price: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price);
const effectivePrice = (product: GeekProduct) => product.promotional_price != null && Number(product.promotional_price) > 0 && Number(product.promotional_price) < Number(product.price) ? Number(product.promotional_price) : Number(product.price);
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const tagsOf = (product: GeekProduct) => (Array.isArray(product.tags) ? product.tags : typeof product.tags === 'string' ? product.tags.split(',') : []).map(tag => tag.trim()).filter(Boolean);
const SUBFILTERS = [
  { key: 'anime', label: 'Animes', tags: ['anime', 'animes'], titleTerms: ['one piece', 'luffy', 'nami', 'chopper', 'pokemon', 'naruto', 'dragon ball', 'demon slayer', 'jujutsu kaisen'] },
  { key: 'games', label: 'Games', tags: ['game', 'games', 'jogo', 'jogos'], titleTerms: ['gta', 'minecraft', 'resident evil', 'mario', 'hollow knight', 'rpg', 'xbox', 'ps5', 'gamer'] },
  { key: 'filmes', label: 'Filmes', tags: ['filme', 'filmes', 'cinema'], titleTerms: ['harry potter', 'hogwarts', 'star wars', 'deadpool'] },
  { key: 'series', label: 'Séries', tags: ['serie', 'series'], titleTerms: ['rick and morty', 'hora de aventura', 'adventure time', 'stranger things'] },
  { key: 'colecionaveis', label: 'Colecionáveis', tags: ['colecionavel', 'colecionaveis', 'action figure', 'miniatura'], titleTerms: ['figure', 'boneco', 'busto', 'estatua', 'miniatura', 'colecionavel'] },
] as const;
const matchesSubfilter = (product: GeekProduct, filter: typeof SUBFILTERS[number]) => {
  const tags = tagsOf(product).map(normalize);
  const title = normalize(product.title);
  return filter.tags.some(tag => tags.includes(tag)) || filter.titleTerms.some(term => title.includes(term));
};

const categoryLinks = [
  { key: 'kit_fixo', label: 'Kits Prontos', Icon: Gift },
  { key: 'montar_kit', label: 'Montar Kit', Icon: Box },
  { key: 'games', label: 'Geek/Gamer', Icon: Gamepad2 },
  { key: 'religioso', label: 'Religioso', Icon: Cross },
  { key: 'feito_por_voces', label: 'Feito por vocês', Icon: UsersRound },
];

function GeekProductCard<T extends GeekProduct>({ product, onAddToCart, onProductClick, list }: {
  product: T;
  onAddToCart: (product: T) => void;
  onProductClick: (product: T) => void;
  list: boolean;
}) {
  const image = product.images?.[0];
  const salePrice = Number(product.promotional_price);
  const hasSale = product.promotional_price != null && salePrice > 0 && salePrice < Number(product.price);
  const tag = tagsOf(product)[0];
  return (
    <article className={`group overflow-hidden rounded-md border border-[#25313d] bg-[#0d141c] hover:border-[#d6a72d]/70 transition-colors ${list ? 'sm:flex' : 'flex flex-col'}`}>
      <a href={`/produto?id=${encodeURIComponent(product.id)}`} onClick={() => onProductClick(product)} className={`relative block overflow-hidden bg-black ${list ? 'sm:w-48 sm:shrink-0' : ''}`} aria-label={`Ver ${product.title}`}>
        <div className={`${list ? 'aspect-[4/3] sm:aspect-square' : 'aspect-[4/3] sm:aspect-square'} flex items-center justify-center`}>
          {image ? <img src={image} alt={product.title} loading="lazy" className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500" /> : <Box className="w-14 h-14 text-white/15" aria-hidden="true" />}
        </div>
        {tag && <span className="absolute top-3 left-3 max-w-[75%] truncate rounded bg-[#f0bd3f] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[#080b0e]">{tag}</span>}
      </a>
      <div className="flex flex-1 flex-col px-3.5 py-3.5 sm:px-4">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-[#e3b434]">Geek/Gamer</p>
        <h2 className="line-clamp-2 min-h-[2.75rem] text-sm font-semibold leading-snug text-white sm:text-base"><a href={`/produto?id=${encodeURIComponent(product.id)}`} onClick={() => onProductClick(product)} className="hover:text-[#f0bd3f]">{product.title}</a></h2>
        <div className="mt-auto pt-2">
          {hasSale && <span className="mr-2 text-xs text-white/45 line-through">{money(Number(product.price))}</span>}
          <p className="text-lg font-bold text-white">{money(effectivePrice(product))}</p>
        </div>
        <div className="mt-2.5 flex gap-2">
          <button type="button" onClick={() => onAddToCart(product)} aria-label={`Adicionar ${product.title} ao carrinho`} className="flex h-10 w-11 shrink-0 items-center justify-center rounded border border-[#e3b434] text-[#f0bd3f] hover:bg-[#e3b434] hover:text-black transition-colors"><ShoppingCart className="h-4 w-4" aria-hidden="true" /></button>
          <a href={`/produto?id=${encodeURIComponent(product.id)}`} onClick={() => onProductClick(product)} className="flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded border border-[#e3b434] px-2 text-xs font-bold text-[#f0bd3f] hover:bg-[#e3b434] hover:text-black transition-colors">Ver detalhes <ChevronRight className="h-4 w-4" aria-hidden="true" /></a>
        </div>
      </div>
    </article>
  );
}

export default function GeekShopView<T extends GeekProduct>({ products, loading, onAddToCart, onProductClick, onSelectCategory }: Props<T>) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [subfilter, setSubfilter] = useState('all');
  const [sort, setSort] = useState('recent');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const availableFilters = useMemo(() => SUBFILTERS.filter(filter => products.some(product => matchesSubfilter(product, filter))), [products]);
  const visibleProducts = useMemo(() => {
    const selected = SUBFILTERS.find(filter => filter.key === subfilter);
    const filtered = selected ? products.filter(product => matchesSubfilter(product, selected)) : [...products];
    if (sort === 'price-asc') filtered.sort((a, b) => effectivePrice(a) - effectivePrice(b));
    if (sort === 'price-desc') filtered.sort((a, b) => effectivePrice(b) - effectivePrice(a));
    if (sort === 'name') filtered.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
    return filtered;
  }, [products, sort, subfilter]);

  const selectCategory = (category: string) => {
    setMobileMenuOpen(false);
    onSelectCategory(category);
  };
  const sidebar = (
    <div className="rounded-lg border border-[#26323c] bg-[#0d141b] p-3.5 shadow-[0_18px_45px_rgba(0,0,0,.28)]">
      <div className="border-b border-[#29343b] px-2 pb-4 pt-1">
        <p className="text-[10px] font-semibold uppercase tracking-[.25em] text-slate-400">Categorias</p>
        <p className="mt-1 text-xl font-black uppercase tracking-tight text-[#f0bd3f]">FreoFigures</p>
      </div>
      <nav aria-label="Categorias do catálogo" className="mt-4 space-y-1.5">
        {categoryLinks.map(({ key, label, Icon }, index) => <button key={key} type="button" onClick={() => selectCategory(key)} className={`flex min-h-12 w-full items-center gap-3 rounded-md border px-3 text-left text-sm font-semibold transition-colors ${key === 'games' ? 'border-[#e7b32d] bg-gradient-to-r from-[#efbd3e] to-[#c9931d] text-[#10151a] shadow-[0_0_17px_rgba(224,172,38,.24)]' : 'border-[#24303b] bg-[#151e27] text-[#e5e8eb] hover:border-[#b99032] hover:text-[#f0bd3f]'} ${index === 2 ? 'mt-2' : ''}`}>
          <Icon className={`h-5 w-5 shrink-0 ${key === 'games' ? 'text-[#10151a]' : 'text-[#f0bd3f]'}`} strokeWidth={1.8} aria-hidden="true" />
          <span className="flex-1">{label}</span><ChevronRight className="h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
        </button>)}
      </nav>
      <div className="mt-7 rounded-lg border border-[#3e3724] bg-[linear-gradient(135deg,#171b1d,#0b1117)] p-4">
        <span className="text-3xl leading-none text-[#f0bd3f]" aria-hidden="true">♛</span>
        <p className="mt-2 text-xs font-black uppercase leading-tight tracking-wide text-white">Qualidade que dá vida à sua paixão</p>
        <p className="mt-2 text-xs leading-relaxed text-slate-400">Personagens, universos e histórias em miniaturas incríveis.</p>
      </div>
    </div>
  );

  return <main className="min-h-screen bg-[#080d12] pt-20 text-[#f5f6f7] md:pt-24">
    <div className="mx-auto max-w-[1600px] px-4 pb-20 sm:px-5 lg:px-6">
      <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[252px_minmax(0,1fr)] xl:gap-7">
        <aside className="hidden lg:block lg:sticky lg:top-24 lg:self-start" aria-label="Navegação lateral">{sidebar}</aside>
        <div className="min-w-0">
          <section className="relative isolate min-h-52 overflow-hidden rounded-md border border-[#202b36] bg-[#0a1118] sm:min-h-60" aria-labelledby="geek-shop-title">
            <div className="absolute inset-0 bg-[url('/geek-gamer-hero.webp')] bg-cover bg-[center_right_30%] sm:bg-center" aria-hidden="true" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#080d12] via-[#080d12]/95 to-[#080d12]/20" aria-hidden="true" />
            <div className="relative z-10 flex min-h-52 flex-col justify-center px-5 py-8 sm:min-h-60 sm:px-8 lg:px-10">
              <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.2em] text-[#f0bd3f]"><span className="h-4 w-1 bg-[#f0bd3f]" />Catálogo</div>
              <h1 id="geek-shop-title" className="font-display text-4xl font-black uppercase italic leading-none tracking-tight sm:text-6xl xl:text-7xl"><span className="text-white">Geek</span><span className="text-[#f0bd3f]">/Gamer</span></h1>
              <p className="mt-3 max-w-lg text-sm leading-relaxed text-slate-300 sm:text-base">Do universo dos games, animes, filmes e séries para a sua coleção. Miniaturas feitas para verdadeiros fãs.</p>
            </div>
          </section>

          <div className="mt-4 rounded-md border border-[#1d2832] bg-[#0a1118] px-3 py-3 sm:px-4">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <button type="button" onClick={() => setMobileMenuOpen(true)} className="mr-1 flex h-10 items-center gap-2 rounded border border-[#af872a] px-3 text-xs font-bold text-[#f0bd3f] lg:hidden"><Menu className="h-4 w-4" /> Categorias</button>
              <p className="mr-auto text-xs text-slate-300">{loading ? 'Carregando produtos...' : <>Mostrando <strong className="text-white">{visibleProducts.length}</strong> resultado{visibleProducts.length === 1 ? '' : 's'} em <strong className="text-[#f0bd3f]">[Geek/Gamer]</strong></>}</p>
              <label className="relative flex items-center">
                <span className="sr-only">Filtrar Geek/Gamer</span>
                <select value={subfilter} onChange={event => setSubfilter(event.target.value)} className="h-10 appearance-none rounded border border-[#c99b2f] bg-[#131b22] pl-3 pr-8 text-xs font-semibold text-[#f0bd3f] focus:outline focus:outline-2 focus:outline-[#e4b338]">
                  <option value="all">Todos em Geek/Gamer</option>
                  {availableFilters.map(filter => <option key={filter.key} value={filter.key}>{filter.label}</option>)}
                </select><ChevronDown className="pointer-events-none absolute right-2 h-3 w-3 text-[#e4b338]" aria-hidden="true" />
              </label>
              {availableFilters.length > 0 && <div className="order-3 flex w-full gap-1.5 overflow-x-auto pb-1 sm:order-none sm:w-auto sm:flex-1 sm:pb-0" aria-label="Subfiltros Geek/Gamer">
                {availableFilters.map(filter => <button key={filter.key} type="button" onClick={() => setSubfilter(filter.key)} aria-pressed={subfilter === filter.key} className={`shrink-0 rounded border px-3 py-2 text-xs transition-colors ${subfilter === filter.key ? 'border-[#e4b338] bg-[#4d3910] text-[#f7c54d]' : 'border-[#25303b] bg-[#151d26] text-slate-300 hover:border-[#9d7b2b]'}`}>{filter.label}</button>)}
              </div>}
              <label className="relative ml-auto flex items-center sm:ml-0">
                <span className="mr-2 hidden text-xs text-slate-400 xl:inline">Ordenar por:</span>
                <select value={sort} onChange={event => setSort(event.target.value)} className="h-10 appearance-none rounded border border-[#25303b] bg-[#111820] pl-3 pr-8 text-xs text-slate-200 focus:outline focus:outline-2 focus:outline-[#e4b338]">
                  <option value="recent">Mais recentes</option><option value="price-asc">Menor preço</option><option value="price-desc">Maior preço</option><option value="name">Nome A–Z</option>
                </select><ChevronDown className="pointer-events-none absolute right-2 h-3 w-3 text-slate-400" aria-hidden="true" />
              </label>
              <div className="hidden items-center gap-1 sm:flex" aria-label="Visualização">
                <button type="button" onClick={() => setLayout('grid')} aria-label="Visualizar em grade" aria-pressed={layout === 'grid'} className={`flex h-10 w-10 items-center justify-center rounded border ${layout === 'grid' ? 'border-[#e4b338] text-[#f0bd3f]' : 'border-[#25303b] text-slate-400'}`}><Grid2X2 className="h-4 w-4" /></button>
                <button type="button" onClick={() => setLayout('list')} aria-label="Visualizar em lista" aria-pressed={layout === 'list'} className={`flex h-10 w-10 items-center justify-center rounded border ${layout === 'list' ? 'border-[#e4b338] text-[#f0bd3f]' : 'border-[#25303b] text-slate-400'}`}><List className="h-4 w-4" /></button>
              </div>
            </div>
          </div>

          {loading ? <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="h-80 animate-pulse rounded-md border border-[#26323c] bg-[#111a22]" />)}</div>
            : visibleProducts.length === 0 ? <div className="mt-5 rounded-md border border-[#26323c] bg-[#0e151d] p-10 text-center"><SlidersHorizontal className="mx-auto mb-3 h-9 w-9 text-[#e3b434]" /><h2 className="font-display text-xl font-bold">Nenhum produto encontrado</h2><p className="mt-2 text-sm text-slate-400">{subfilter === 'all' ? 'Esta categoria ainda não tem produtos disponíveis.' : 'Tente outro filtro dentro de Geek/Gamer.'}</p>{subfilter !== 'all' && <button type="button" onClick={() => setSubfilter('all')} className="mt-4 rounded border border-[#e3b434] px-4 py-2 text-xs font-bold text-[#f0bd3f]">Ver todos de Geek/Gamer</button>}</div>
            : <div className={`mt-4 grid gap-3 ${layout === 'list' ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4'}`}>
              {visibleProducts.map(product => <GeekProductCard key={product.id} product={product} onAddToCart={onAddToCart} onProductClick={onProductClick} list={layout === 'list'} />)}
            </div>}
        </div>
      </div>
    </div>
    {mobileMenuOpen && <div className="fixed inset-0 z-[85] lg:hidden"><button type="button" aria-label="Fechar categorias" onClick={() => setMobileMenuOpen(false)} className="absolute inset-0 bg-black/75" /><div className="absolute inset-y-0 left-0 w-[min(320px,90vw)] overflow-y-auto border-r border-[#38434c] bg-[#090f15] p-4 pt-20"><button type="button" onClick={() => setMobileMenuOpen(false)} aria-label="Fechar menu" className="absolute right-4 top-5 text-white"><X className="h-6 w-6" /></button>{sidebar}</div></div>}
  </main>;
}
