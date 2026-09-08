# Public storefront SEO

The existing Vite preview server installs `seoPlugin` from `vite.config.ts`.
The Docker command, existing URLs, client-side authentication, cart, coupons,
checkout and Supabase authorization remain unchanged.

- `/robots.txt` serves valid crawler rules, including access for search crawlers.
- `/sitemap.xml` lists active public products and nonempty catalog categories.
- `/` and `/?categoria=…` include HTML links before React starts.
- `/produto?id=…` serves `text/html`, product content, canonical, social metadata
  and Product/BreadcrumbList JSON-LD before the existing client script runs.
- Simple products use Offer. A single priced variant dimension uses AggregateOffer
  (a price range for product snippets, not full merchant variant listings).
  Fixed kits and multiple priced dimensions omit unverified offers.
- Legacy policy links redirect to the existing policy document and relevant tab.
- Private/account page responses receive noindex; their authentication is unchanged.

The server reads only allowlisted public product columns using the same anonymous
catalog configuration already present in index.html. It never uses a service-role
key, receives a customer session or writes catalog/account data. The catalog cache
lasts 30 seconds. Failed loads are not cached. If the catalog API is unavailable,
the storefront falls back to its existing client-side loader; sitemap returns 503
with Retry-After. Catalog values are escaped in generated HTML and JSON-LD.

## Checks

`npm run lint`, `npm test`, `npm run build`, then `npm run preview`.
Inspect the raw HTML for a real product and category, plus HTTP Content-Type,
canonical, robots, sitemap, missing product 404 and policy redirect responses.
Check the rendered storefront on mobile/desktop and confirm there is one visible
product heading after the client has loaded. The server summary is removed only
after product rendering succeeds.

This runtime requires the configured Vite preview server (as used by the existing
Dockerfile). A static-file-only host needs equivalent server routing; copying just
dist to a static host does not enable the middleware.

## Account work after publication

Verify the domain in Google Search Console and Bing Webmaster Tools, submit
https://www.freofigures.com.br/sitemap.xml, inspect product/category URLs and monitor
index coverage. Configure Google Merchant Center with accurate shipping, returns
and product data. These account tasks cannot be inferred or completed from source
code. Do not invent reviews, GTINs, shipping prices or return rules in structured
data. Rich result eligibility and crawling do not guarantee indexing or rankings.

## Rollback

Revert the SEO change commit and deploy the previous version with the existing
deployment process. No database migration or data rollback is required.
