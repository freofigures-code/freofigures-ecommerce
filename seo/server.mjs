import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { SITE, LOGO, CATEGORIES, categoryUrl, productUrl, pageMetadata, plainText, escapeHtml as esc, safeJson, safeImage, productSchema, organizationSchema, breadcrumbs } from './shared.mjs';

const FIELDS = 'id,title,description,category,images,price,promotional_price,stock,is_kit,kit_type,variants,created_at';
const ALIASES = {
  '/public/politicas.html': '/politicas.html',
  '/public/termos-de-uso.html': '/politicas.html#termos',
  '/termos-de-uso.html': '/politicas.html#termos',
  '/public/trocas-e-devolucoes.html': '/politicas.html#trocas',
  '/trocas-e-devolucoes.html': '/politicas.html#trocas',
  '/politica-de-envio': '/politicas.html#envio',
};

// Only the same public, anonymous catalog access already used by the storefront.
// No privileged key, user session, order, cart or account data is read here.
export function createCatalogLoader({ sourceHtml, fetchImpl = fetch, ttl = 30000, now = Date.now }) {
  const url = sourceHtml.match(/const SUPABASE_URL\s*=\s*"([^"]+)"/)?.[1];
  const key = sourceHtml.match(/const SUPABASE_ANON_KEY\s*=\s*"([^"]+)"/)?.[1];
  let cached, expires = 0, pending;
  return async function loadCatalog() {
    if (cached && now() < expires) return cached;
    if (pending) return pending;
    pending = (async () => {
      if (!url || !key) throw new Error('Public catalog configuration unavailable');
      const products = [];
      for (let offset = 0; ; offset += 500) {
        const endpoint = new URL('/rest/v1/products', url);
        endpoint.search = new URLSearchParams({ select: FIELDS, is_active: 'eq.true', order: 'created_at.desc,id.desc', offset: String(offset), limit: '500' }).toString();
        const response = await fetchImpl(endpoint, { headers: { apikey: key }, signal: AbortSignal.timeout(4000) });
        if (!response.ok) throw new Error(`Public catalog unavailable (${response.status})`);
        const batch = await response.json();
        if (!Array.isArray(batch)) throw new Error('Invalid public catalog response');
        products.push(...batch);
        if (batch.length < 500) break;
        if (offset >= 49500) throw new Error('Catalog exceeds sitemap capacity');
      }
      cached = products;
      expires = now() + ttl;
      return products;
    })();
    try { return await pending; } finally { pending = null; }
  };
}

function jsonLd(id, data) { return `<script id="${id}" type="application/ld+json">${safeJson(data)}</script>`; }
export function addHead(html, { title, description, url, image }, schemas = []) {
  const head = `<title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}">
    <link rel="canonical" href="${esc(url)}">
    <meta name="robots" content="index,follow,max-image-preview:large">
    <meta property="og:type" content="website"><meta property="og:locale" content="pt_BR">
    <meta property="og:site_name" content="FreoFigures">
    <meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">
    <meta property="og:url" content="${esc(url)}"><meta property="og:image" content="${esc(image || LOGO)}">
    <meta name="twitter:card" content="summary_large_image">
    ${jsonLd('organization-structured-data', organizationSchema)}${schemas.join('')}`;
  return html.replace(/<title>[\s\S]*?<\/title>/i, head);
}

function categoryLinks() {
  return Object.entries(CATEGORIES).map(([key, entry]) => `<a href="${esc(categoryUrl(key))}">${esc(entry[0])}</a>`).join(' · ');
}
function fallbackShell(content, id = '') {
  return `<section ${id ? `id="${id}"` : ''} style="max-width:1152px;margin:auto;padding:32px 24px;font-family:Arial,sans-serif;line-height:1.6"><a href="/">FreoFigures</a>${content}<nav aria-label="Categorias">${categoryLinks()}</nav><p><a href="/faq.html">Dúvidas frequentes</a> · <a href="/politicas.html">Políticas e atendimento</a></p></section>`;
}
export function renderHome(html, products, category) {
  const meta = pageMetadata(category);
  const selected = category === 'Todos' ? products : category === 'kit_fixo' ? products.filter(p => p.is_kit && p.kit_type === 'fixed')
    : category ? products.filter(p => p.category === category) : products.slice(0, 4);
  const cards = selected.map(p => `<li><a href="${esc(productUrl(p.id))}">${esc(p.title)}</a></li>`).join('');
  const content = fallbackShell(`<h1>${esc(meta.title)}</h1><p>${esc(meta.description)}</p><ul>${cards}</ul>`);
  return addHead(html, meta, category ? [jsonLd('breadcrumb-structured-data', breadcrumbs(category))] : [])
    .replace('<div id="root"></div>', `<div id="root">${content}</div>`);
}
export function renderProduct(html, p) {
  const schema = productSchema(p);
  const money = value => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const priceText = schema.offers?.['@type'] === 'Offer' ? money(schema.offers.price) : schema.offers?.['@type'] === 'AggregateOffer' ? `${money(schema.offers.lowPrice)} a ${money(schema.offers.highPrice)}, conforme a opção` : '';
  const meta = { title: `${plainText(p.title)} | FreoFigures`, description: plainText(p.description).slice(0, 180) || `Conheça ${plainText(p.title)} na FreoFigures. Confira as opções disponíveis.`, url: productUrl(p.id), image: safeImage(p.images?.[0]) };
  const variants = (Array.isArray(p.variants) ? p.variants : []).filter(v => v.name && Array.isArray(v.options)).map(v => `<p>${esc(v.name)}: ${v.options.map(o => esc(typeof o === 'object' ? o.name : o)).join(', ')}</p>`).join('');
  const summary = fallbackShell(`<h1>${esc(p.title)}</h1>${meta.image ? `<img src="${esc(meta.image)}" alt="${esc(p.title)}" width="320" style="max-width:100%;height:auto">` : ''}<p>${esc(priceText)}</p><p style="white-space:pre-line">${esc(plainText(p.description))}</p>${variants}<p>${Number(p.stock) > 0 ? 'Em estoque' : 'Fora de estoque'}</p>`, 'seo-product-summary');
  return addHead(html, meta, [jsonLd('product-structured-data', schema), jsonLd('breadcrumb-structured-data', breadcrumbs(p.category, p))])
    .replace('<!-- CONTEÚDO DO PRODUTO -->', `${summary}\n<!-- CONTEÚDO DO PRODUTO -->`);
}
export function sitemap(products) {
  const categories = Object.keys(CATEGORIES).filter(key => key === 'Todos' || products.some(p => key === 'kit_fixo' ? p.is_kit && p.kit_type === 'fixed' : p.category === key));
  const urls = [`${SITE}/`, `${SITE}/faq.html`, `${SITE}/politicas.html`, ...categories.map(categoryUrl), ...products.map(p => productUrl(p.id))];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...new Set(urls)].map(url => `<url><loc>${esc(url)}</loc></url>`).join('')}</urlset>`;
}

export function createSeoMiddleware({ root, outputDir, loadCatalog, read = readFile, development = false }) {
  const templates = new Map();
  async function template(file) {
    const location = development ? path.join(root, file === 'index.html' ? file : `public/${file}`) : path.join(outputDir, file);
    if (development || !templates.has(file)) templates.set(file, await read(location, 'utf8'));
    return templates.get(file);
  }
  return async (req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method)) return next();
    const url = new URL(req.url || '/', SITE), pathname = url.pathname;
    const send = (status, type, body) => {
      res.statusCode = status;
      res.setHeader('Content-Type', `${type}; charset=utf-8`);
      res.setHeader('Cache-Control', 'no-cache');
      res.end(req.method === 'HEAD' ? undefined : body);
    };
    if (Object.hasOwn(ALIASES, pathname)) {
      res.setHeader('Location', ALIASES[pathname]); return send(301, 'text/plain', 'Moved permanently');
    }
    if (/^\/(admin(?:\/|$)|auth(?:\/|$)|(?:login|cadastro|checkout|dashboard|meus-pedidos|obrigado|excluir-conta|minhas-criacoes)\.html$)/.test(pathname)) {
      res.setHeader('X-Robots-Tag', 'noindex');
      return next();
    }
    if (pathname === '/robots.txt') return send(200, 'text/plain', `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
    if (pathname === '/sitemap.xml') {
      try { return send(200, 'application/xml', sitemap(await loadCatalog())); }
      catch { res.setHeader('Retry-After', '60'); return send(503, 'text/plain', 'Sitemap temporariamente indisponível.'); }
    }
    const isHome = pathname === '/' || pathname === '/index.html';
    const isProduct = pathname === '/produto';
    if (!isHome && !isProduct) return next();
    try {
      const html = await template(isProduct ? 'produto' : 'index.html');
      const category = url.searchParams.get('categoria');
      const invalidCategory = category !== null && !Object.hasOwn(CATEGORIES, category);
      const id = url.searchParams.get('id');
      if (isProduct && (!id || !/^[a-zA-Z0-9-]{1,80}$/.test(id))) return send(404, 'text/html', html);
      try {
        const products = await loadCatalog();
        if (isProduct) {
          const p = products.find(p => String(p.id) === id);
          if (!p) return send(404, 'text/html', html);
          return send(200, 'text/html', renderProduct(html, p));
        }
        if (invalidCategory) res.setHeader('X-Robots-Tag', 'noindex');
        return send(200, 'text/html', renderHome(html, products, invalidCategory ? null : category));
      } catch {
        // An upstream outage must not prevent the existing client-side shop from opening.
        // Serve its original template without stale stock/prices or incorrect 404 responses.
        return send(200, 'text/html', isProduct ? html : renderHome(html, [], invalidCategory ? null : category));
      }
    } catch (error) { next(error); }
  };
}

export function seoPlugin() {
  let config;
  async function setup(server, development) {
    const sourceHtml = await readFile(path.join(config.root, 'index.html'), 'utf8');
    server.middlewares.use(createSeoMiddleware({ root: config.root, outputDir: path.resolve(config.root, config.build.outDir), development, loadCatalog: createCatalogLoader({ sourceHtml }) }));
  }
  return { name: 'freo-seo', configResolved(value) { config = value; },
    // Vite handles transformations/HMR in development. Production HTML is served by preview.
    async configurePreviewServer(server) { await setup(server, false); },
  };
}
