export const SITE = 'https://www.freofigures.com.br';
export const LOGO = 'https://rrmxqpvxrpcqqxsgccqw.supabase.co/storage/v1/object/public/imagens/LOGO_DEASHBOARD4.png';
export const HOME_TITLE = 'FreoFigures | Arte em Impressão 3D';
export const HOME_DESCRIPTION = 'Conheça a FreoFigures: peças em impressão 3D, artigos religiosos, action figures, keycaps e decoração. Explore o catálogo e os projetos personalizados.';
export const CATEGORIES = {
  Todos: ['Catálogo', 'Explore o catálogo de peças em impressão 3D da FreoFigures.'],
  games: ['Games & Geek', 'Peças de games e cultura geek em impressão 3D. Confira os modelos da FreoFigures.'],
  religioso: ['Artigos religiosos', 'Imagens religiosas e pias de água benta em impressão 3D. Confira modelos, medidas e opções na FreoFigures.'],
  keycaps: ['Keycaps personalizados', 'Keycaps para personalizar seu teclado. Confira modelos e opções disponíveis na FreoFigures.'],
  personalizado: ['Personalizados', 'Conheça as peças personalizadas em impressão 3D da FreoFigures.'],
  lifestyle: ['Utensílios e acessórios', 'Peças funcionais, suportes e acessórios em impressão 3D da FreoFigures.'],
  outros: ['Decoração', 'Objetos decorativos em impressão 3D para seu ambiente. Conheça o catálogo da FreoFigures.'],
  kit_fixo: ['Kits prontos', 'Conheça os kits de produtos disponíveis na FreoFigures.'],
};
export const categoryUrl = category => `${SITE}/?categoria=${encodeURIComponent(category)}`;
export const productUrl = id => `${SITE}/produto?id=${encodeURIComponent(id)}`;
export const plainText = value => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const safeJson = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
export function safeImage(value) {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
}
export function pageMetadata(category) {
  const entry = Object.hasOwn(CATEGORIES, category || '') ? CATEGORIES[category] : null;
  return entry ? { title: `${entry[0]} | FreoFigures`, description: entry[1], url: categoryUrl(category) }
    : { title: HOME_TITLE, description: HOME_DESCRIPTION, url: `${SITE}/` };
}
export function basePrice(p) {
  const promo = Number(p.promotional_price), regular = Number(p.price);
  return p.promotional_price && promo < regular ? promo : regular;
}
export function productSchema(p) {
  const images = (Array.isArray(p.images) ? p.images : []).map(safeImage).filter(Boolean);
  const data = { '@context': 'https://schema.org', '@type': 'Product', '@id': `${productUrl(p.id)}#product`,
    name: plainText(p.title), description: plainText(p.description), url: productUrl(p.id), image: images,
    sku: String(p.id), category: CATEGORIES[p.category]?.[0] || plainText(p.category) };
  // Kit prices depend on their component products. Do not publish an unverified price.
  if (p.is_kit && p.kit_type === 'fixed') return data;
  const price = basePrice(p);
  const pricedVariants = (Array.isArray(p.variants) ? p.variants : []).filter(v => v.name && v.per_option_price && Array.isArray(v.options) && v.options.length);
  if (pricedVariants.length) {
    // A range describes one priced dimension without inventing variant URLs or identifiers.
    // Multiple price dimensions require a separate variant model; omit uncertain offers.
    if (pricedVariants.length === 1) {
      const prices = pricedVariants[0].options.map(o => typeof o === 'object' && o.price != null ? Number(o.price) : price);
      if (prices.every(value => Number.isFinite(value) && value > 0)) data.offers = {
        '@type': 'AggregateOffer', priceCurrency: 'BRL', lowPrice: Math.min(...prices).toFixed(2), highPrice: Math.max(...prices).toFixed(2), offerCount: prices.length,
      };
    }
    return data;
  }
  if (Number.isFinite(price) && price > 0) data.offers = {
    '@type': 'Offer', url: productUrl(p.id), priceCurrency: 'BRL', price: price.toFixed(2),
    availability: Number(p.stock) > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    seller: { '@id': `${SITE}/#organization` },
  };
  return data;
}
export const organizationSchema = {
  '@context': 'https://schema.org', '@type': 'Organization', '@id': `${SITE}/#organization`,
  name: 'Freo Figures', url: `${SITE}/`, logo: LOGO,
  email: 'contato@freofigures.com.br', telephone: '+55-11-94645-4111',
  sameAs: ['https://www.instagram.com/freofigures', 'https://shopee.com.br/shop/735981690'],
};
export function breadcrumbs(category, product) {
  const items = [{ name: 'Início', item: `${SITE}/` }];
  if (Object.hasOwn(CATEGORIES, category || '')) items.push({ name: CATEGORIES[category][0], item: categoryUrl(category) });
  if (product) items.push({ name: plainText(product.title), item: productUrl(product.id) });
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map((entry, index) => ({ '@type': 'ListItem', position: index + 1, ...entry })) };
}
