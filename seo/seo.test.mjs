import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createCatalogLoader, createSeoMiddleware, renderHome, renderProduct, sitemap } from './server.mjs';
import { productSchema, productUrl, SITE } from './shared.mjs';

const product = { id: 8, title: 'Peça & decoração', description: 'Peça de teste.', category: 'religioso', images: ['https://example.com/image.png'], price: 42.49, promotional_price: 30, stock: 2, variants: [] };
const home = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const detail = await readFile(new URL('../public/produto', import.meta.url), 'utf8');
const json = (body, id) => JSON.parse(body.match(new RegExp(`<script id="${id}" type="application/ld\\+json">([\\s\\S]*?)</script>`))[1]);

test('product HTML contains crawlable content, canonical and matching price before JavaScript', () => {
  const html = renderProduct(detail, product);
  assert.match(html, /Peça &amp; decoração/);
  assert.match(html, /R\$\s*30,00/);
  assert.match(html, /id="seo-product-summary"/);
  assert.equal(json(html, 'product-structured-data').offers.price, '30.00');
  assert.ok(html.includes(`href="${productUrl(8)}"`));
  assert.ok(html.includes('id="btn-cart"'));
  assert.ok(html.includes('id="btn-buynow"'));
  assert.equal((html.match(/<title>/g) || []).length, 1);
});
test('stock, variable prices and kits never fabricate a simple purchase price', () => {
  assert.match(productSchema({...product, stock:0}).offers.availability, /OutOfStock$/);
  assert.equal(productSchema({...product, promotional_price:null}).offers.price, '42.49');
  assert.equal(productSchema({...product, is_kit:true, kit_type:'fixed'}).offers, undefined);
  const variants=[{name:'Tamanho',per_option_price:true,options:[{name:'10cm',price:20},{name:'20cm',price:50}]}];
  assert.deepEqual(productSchema({...product,variants}).offers, {'@type':'AggregateOffer',priceCurrency:'BRL',lowPrice:'20.00',highPrice:'50.00',offerCount:2});
  assert.equal(productSchema({...product,variants:[...variants,...variants]}).offers, undefined);
});
test('HTML, attributes and JSON-LD escape catalog content', () => {
  const html = renderProduct(detail, {...product,title:'\"><script>alert(1)</script>',description:'</script><script>alert(2)</script>',images:['javascript:alert(3)']});
  assert.ok(!html.includes('<script>alert('));
  assert.ok(!html.includes('src="javascript:'));
  assert.doesNotThrow(() => json(html, 'product-structured-data'));
});
test('categories have unique canonicals and only matching product links', () => {
  const html = renderHome(home,[product,{...product,id:9,category:'games'}],'religioso');
  const root=html.match(/<div id="root">([\s\S]*?)<\/section><\/div>/)[1];
  assert.ok(root.includes('/produto?id=8'));
  assert.ok(!root.includes('/produto?id=9'));
  assert.match(html, /canonical" href="https:\/\/www.freofigures.com.br\/\?categoria=religioso"/);
  assert.equal(json(html,'breadcrumb-structured-data').itemListElement[1].name,'Artigos religiosos');
});
test('sitemap contains all products, no tracking, no invented modification dates', () => {
  const xml=sitemap([product,{...product,id:9,category:'anime'}]);
  assert.match(xml,/id=8/); assert.match(xml,/id=9/);
  assert.ok(!xml.includes('lastmod')); assert.ok(!xml.includes('checkout'));
  assert.ok(!xml.includes('categoria=keycaps'));
});
test('loader uses public allowlisted columns, pages results, caches and deduplicates requests', async () => {
  let calls=0, time=0;
  const loader=createCatalogLoader({sourceHtml:home,now:()=>time,ttl:30,fetchImpl:async (url,init)=>{
    calls++;
    assert.equal(url.searchParams.get('is_active'),'eq.true');
    assert.ok(!url.searchParams.get('select').includes('*'));
    assert.equal(Object.keys(init.headers).join(','),'apikey');
    return {ok:true,json:async()=>url.searchParams.get('offset')==='0'? Array.from({length:500},(_,id)=>({...product,id})):[{...product,id:501}]};
  }});
  const [a,b]=await Promise.all([loader(),loader()]);
  assert.equal(a.length,501); assert.equal(b,a); assert.equal(calls,2);
  await loader(); assert.equal(calls,2);
  time=31; await loader(); assert.equal(calls,4);
});
test('failed catalog responses are not cached as an empty or stale catalog', async () => {
  let calls=0;
  const loader=createCatalogLoader({sourceHtml:home,fetchImpl:async()=>{calls++;return calls===1?{ok:false,status:500}:{ok:true,json:async()=>[product]};}});
  await assert.rejects(loader());
  assert.equal((await loader()).length,1);
});

async function withServer(run, loader=async()=>[product]) {
  const middleware=createSeoMiddleware({root:'.',outputDir:'.',loadCatalog:loader,read:async file=>file.endsWith('produto')?detail:home});
  const server=createServer((req,res)=>{middleware(req,res,()=>{res.statusCode=200;res.end('unchanged downstream');}).catch(error=>{res.statusCode=500;res.end(error.message);});});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve=>server.close(resolve)); }
}
test('HTTP routes have correct MIME, HEAD, sitemap, aliases and real missing-product 404s', async()=>withServer(async base=>{
  for(const [route,type] of [['/','text/html'],['/?categoria=religioso','text/html'],['/produto?id=8','text/html'],['/robots.txt','text/plain'],['/sitemap.xml','application/xml']]) {
    const response=await fetch(base+route); assert.equal(response.status,200,route); assert.ok(response.headers.get('content-type').includes(type),route);
  }
  const head=await fetch(base+'/produto?id=8',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
  for(const route of ['/produto','/produto?id=999','/produto?id=%22%3E']) assert.equal((await fetch(base+route)).status,404);
  const alias=await fetch(base+'/public/politicas.html',{redirect:'manual'}); assert.equal(alias.status,301);assert.equal(alias.headers.get('location'),'/politicas.html');
}));
test('checkout, login, callbacks, assets and POST requests keep their existing handling',async()=>withServer(async base=>{
  for(const route of ['/checkout.html?guest=1','/auth/callback.html?code=test','/admin/produtos.html','/login.html']) {
    const response=await fetch(base+route);assert.equal(await response.text(),'unchanged downstream'); assert.equal(response.headers.get('x-robots-tag'),'noindex');
  }
  assert.equal(await (await fetch(base+'/assets/app.js')).text(),'unchanged downstream');
  assert.equal(await (await fetch(base+'/produto?id=8',{method:'POST'})).text(),'unchanged downstream');
}));
test('catalog outage preserves client storefront and emits a retryable sitemap failure',async()=>withServer(async base=>{
  const response=await fetch(base+'/produto?id=8');assert.equal(response.status,200);assert.equal(await response.text(),detail);
  const map=await fetch(base+'/sitemap.xml');assert.equal(map.status,503);assert.equal(map.headers.get('retry-after'),'60');
},async()=>{throw new Error('Simulated outage');}));
