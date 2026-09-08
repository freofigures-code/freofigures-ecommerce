import { pageMetadata, breadcrumbs, CATEGORIES, safeJson } from '../seo/shared.mjs';

export function updateStoreMetadata(category?: string) {
  const meta = pageMetadata(category);
  document.title = meta.title;
  const setMeta = (key: string, content: string, property = false) => {
    const attribute = property ? 'property' : 'name';
    let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
    if (!element) { element = document.createElement('meta'); element.setAttribute(attribute, key); document.head.appendChild(element); }
    element.content = content;
  };
  setMeta('description', meta.description);
  setMeta('og:title', meta.title, true);
  setMeta('og:description', meta.description, true);
  setMeta('og:url', meta.url, true);
  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.appendChild(canonical); }
  canonical.href = meta.url;
  let trail = document.getElementById('breadcrumb-structured-data');
  if (category && Object.hasOwn(CATEGORIES, category)) {
    if (!trail) { trail = document.createElement('script'); trail.id = 'breadcrumb-structured-data'; trail.setAttribute('type', 'application/ld+json'); document.head.appendChild(trail); }
    trail.textContent = safeJson(breadcrumbs(category));
  } else trail?.remove();
}

export function updateStoreLocation(category?: string) {
  const url = new URL(window.location.href);
  if (category) url.searchParams.set('categoria', category);
  else url.searchParams.delete('categoria');
  window.history.replaceState({}, '', '/' + url.search + url.hash);
  updateStoreMetadata(category);
}
