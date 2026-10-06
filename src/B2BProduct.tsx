import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Box, ShoppingCart } from 'lucide-react';
import { b2bUnitPrice, minimumB2BQuantity, type B2BTier } from './b2bPricing';
import { b2bEventUnitPrice, type B2BEventPricing } from './b2bEventPricing';
import { B2BEventCustomizer, type B2BEventCustomizerConfig } from './B2BEventCustomizer';

type Option = string | { name: string; price?: number };
type Product = {
  id: number; title: string; description: string | null; images: string[] | null;
  sale_mode: string; b2b_category: string; is_kit: boolean;
  variants: { name: string; options: Option[] }[] | null;
};
const currency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const db = () => (window as any).supabaseClient;

export default function B2BProduct() {
  const [access, setAccess] = useState<'loading' | 'guest' | 'pf' | 'ready' | 'error'>('loading');
  const [product, setProduct] = useState<Product | null>(null);
  const [tiers, setTiers] = useState<B2BTier[]>([]);
  const [eventPricing, setEventPricing] = useState<B2BEventPricing | null>(null);
  const [eventCustomizer, setEventCustomizer] = useState<B2BEventCustomizerConfig | null>(null);
  const [chosenColor, setChosenColor] = useState('');
  const [customText, setCustomText] = useState('');
  const [projectDetails, setProjectDetails] = useState('');
  const [deadline, setDeadline] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const id = Number(new URLSearchParams(location.search).get('id'));

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const client = db();
        if (!client) throw new Error('Conexão indisponível');
        const auth = await client.auth.getUser();
        if (!active) return;
        if (!auth.data.user || auth.error) { setAccess('guest'); return; }
        const profile = await client.from('profiles').select('account_type,is_admin,cnpj').eq('id', auth.data.user.id).single();
        if (profile.error) throw profile.error;
        if (!active) return;
        if (profile.data.is_admin !== true && (profile.data.account_type !== 'pj' || String(profile.data.cnpj || '').replace(/\D/g, '').length !== 14)) { setAccess('pf'); return; }
        if (!Number.isSafeInteger(id) || id < 1) throw new Error('Produto inválido');
        const [p, t, e, c] = await Promise.all([
          client.from('products').select('id,title,description,images,sale_mode,b2b_category,is_kit,variants').eq('id', id).eq('is_active', true).single(),
          client.from('product_price_tiers').select('min_qty,max_qty,unit_price,is_active').eq('product_id', id).eq('is_active', true).order('min_qty'),
          client.from('b2b_event_pricing').select('*').eq('product_id', id).maybeSingle(),
          client.from('b2b_event_customizers').select('*').eq('product_id', id).maybeSingle(),
        ]);
        if (p.error) throw p.error;
        if (t.error) throw t.error;
        if (e.error) throw e.error;
        if (c.error) throw c.error;
        if (!active) return;
        setProduct(p.data);
        setTiers(t.data || []);
        setEventPricing(e.data || null);
        setEventCustomizer(c.data || null);
        setChosenColor(c.data?.colors?.[0]?.hex || '');
        setQuantity(String(p.data.b2b_category === 'eventos' ? e.data?.minimum_quantity || 1 : minimumB2BQuantity(t.data || []) || 1));
        setAccess('ready');
      } catch (error) {
        if (active) { setMessage(error instanceof Error ? error.message : 'Não foi possível carregar o produto.'); setAccess('error'); }
      }
    })();
    return () => { active = false; };
  }, [id]);

  const amount = Number(quantity);
  const minimum = minimumB2BQuantity(tiers);
  const price = b2bUnitPrice(tiers, amount);
  const eventPrice = product?.b2b_category === 'eventos' ? b2bEventUnitPrice(eventPricing, amount) : null;
  const groups = useMemo(() => (Array.isArray(product?.variants) ? product.variants : []).filter(group => group?.name && Array.isArray(group.options) && group.options.length), [product]);
  const variant = groups.map(group => `${group.name}: ${choices[group.name] || ''}`).join(' | ');
  const configured = groups.every(group => Boolean(choices[group.name]));
  const canBuy = product?.sale_mode !== 'quote_only' && !product?.is_kit && minimum !== null && b2bUnitPrice(tiers, minimum) !== null;

  async function addToCart() {
    if (!product || !canBuy || price === null || !configured || !Number.isSafeInteger(amount) || amount > 1000000) {
      setMessage('Confira a quantidade mínima, a faixa de preço e as opções do produto.'); return;
    }
    setBusy(true); setMessage('');
    try {
      const client = db();
      const auth = await client.auth.getUser();
      if (auth.error || !auth.data.user) throw new Error('Entre novamente com sua conta empresarial.');
      const result = await client.from('b2b_cart_items').insert({
        user_id: auth.data.user.id, product_id: String(product.id), product_name: product.title,
        quantity: amount, price, total_price: Math.round(price * amount * 100) / 100,
        image_url: Array.isArray(product.images) ? product.images[0] || null : null, variant: variant || null,
      });
      if (result.error) throw result.error;
      location.assign('/b2b.html?cart=1');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível adicionar ao pedido.');
      setBusy(false);
    }
  }

  async function requestCustomizedQuote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!product || !eventCustomizer || !eventPricing || busy) return;
    const name = customText.trim();
    if (!name || name.length > eventCustomizer.text_limit || !eventCustomizer.colors.some(color => color.hex === chosenColor)
      || !Number.isSafeInteger(amount) || amount < eventPricing.minimum_quantity || amount > 1000000 || eventPrice === null) {
      setMessage('Confira o texto, a cor e a quantidade antes de solicitar a cotação.'); return;
    }
    setBusy(true); setMessage('');
    try {
      const client = db();
      const auth = await client.auth.getUser();
      if (auth.error || !auth.data.user) throw new Error('Entre novamente com sua conta empresarial.');
      const description = `Personalização de ${product.title}. ${projectDetails.trim()}`.trim().slice(0, 1000);
      const result = await client.from('b2b_quote_requests').insert({
        user_id: auth.data.user.id, category: 'eventos', product_id: product.id,
        description, quantity: amount, deadline: deadline.trim() || null,
        customization: { color_hex: chosenColor, text: name },
      }).select('id').single();
      if (result.error || !result.data?.id) throw result.error || new Error('Cotação não confirmada');
      location.assign(`/b2b-conta.html?quote=${encodeURIComponent(result.data.id)}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível registrar a cotação. Confira suas solicitações antes de tentar novamente.');
      setBusy(false);
    }
  }

  if (access !== 'ready') return <div className="min-h-screen bg-[#07111a] px-5 py-8 text-white"><a href="/b2b.html" className="text-[#f0bf5d]">← Área B2B</a><div className="max-w-xl mx-auto mt-20 border border-white/10 bg-[#0d2231] p-8"><h1 className="font-display font-black text-3xl">Produto empresarial</h1><p className="mt-4 text-white/65">{access === 'loading' ? 'Verificando acesso…' : access === 'guest' ? 'Entre com sua conta CNPJ para ver produtos, preços e condições B2B.' : access === 'pf' ? 'Este catálogo é exclusivo para contas empresariais com CNPJ.' : message}</p>{access === 'guest' && <a href={`/login.html?return=${encodeURIComponent(location.pathname + location.search)}`} className="inline-block mt-6 bg-[#f0bf5d] px-5 py-3 text-[#07111a] font-bold">Entrar com CNPJ</a>}{access === 'pf' && <a href="/cadastro.html" className="inline-block mt-6 text-[#f0bf5d]">Criar conta empresarial</a>}</div></div>;

  if (!product) return null;
  return <div className="min-h-screen bg-[#07111a] text-white">
    <header className="border-b border-white/10 bg-[#061524]"><div className="max-w-6xl mx-auto px-5 py-5 flex items-center justify-between gap-4"><a href="/b2b.html" className="font-display font-black text-xl">FREO<span className="text-[#5a9cc5]">FIGURES</span><small className="block text-[10px] tracking-[0.25em] text-white/55">CORPORATIVO</small></a><a href="/b2b.html?cart=1" className="text-[#f0bf5d] flex items-center gap-2 text-sm"><ShoppingCart size={19} /> Pedido B2B</a></div></header>
    <main className="max-w-6xl mx-auto px-5 py-8 md:py-14"><a href="/b2b.html#b2b-catalog" className="text-[#f0bf5d] text-sm inline-flex items-center gap-2"><ArrowLeft size={17} /> Voltar ao catálogo</a>
      <div className="grid md:grid-cols-2 gap-8 lg:gap-14 mt-7"><div className="aspect-square rounded-xl bg-[#101c25] overflow-hidden border border-white/10">{Array.isArray(product.images) && product.images[0] ? <img src={product.images[0]} alt={product.title} className="w-full h-full object-contain" /> : <div className="w-full h-full grid place-items-center"><Box size={70} className="text-white/20" /></div>}</div>
        <div><p className="uppercase tracking-[0.25em] text-xs text-[#f0bf5d]">Catálogo empresarial · {product.b2b_category === 'eventos' ? 'Eventos' : product.b2b_category === 'sob_medida' ? 'Sob medida' : 'Produtos da loja'}</p><h1 className="font-display text-3xl md:text-5xl font-black mt-3 leading-tight">{product.title}</h1><p className="mt-5 text-white/65 whitespace-pre-wrap">{product.description}</p>
          {canBuy ? <div className="mt-8 border border-[#f0bf5d]/30 bg-[#f0bf5d]/5 rounded-xl p-5 space-y-5">
            <div><p className="text-sm text-white/60">Quantidade mínima B2B: <strong className="text-white">{minimum?.toLocaleString('pt-BR')} unidades</strong></p><p className="text-xs text-white/45 mt-1">Produzido sob encomenda; a compra B2B não depende do estoque da loja.</p></div>
            {groups.map(group => <label key={group.name} className="block text-sm">{group.name}<select value={choices[group.name] || ''} onChange={e => setChoices(prev => ({ ...prev, [group.name]: e.target.value }))} className="block w-full mt-2 bg-[#07111a] border border-white/20 rounded p-3"><option value="">Selecione</option>{group.options.map(option => { const name = typeof option === 'string' ? option : option.name; return <option key={name} value={name}>{name}</option>; })}</select></label>)}
            <label className="block text-sm">Quantidade<input type="number" min={minimum || 1} max="1000000" step="1" value={quantity} onChange={e => setQuantity(e.target.value)} className="block w-full mt-2 bg-[#07111a] border border-white/20 rounded p-3" /></label>
            {price !== null ? <div><p className="text-sm text-white/55">{currency(price)} por unidade</p><p className="font-display text-3xl font-bold text-[#f0bf5d]">{currency(Math.round(price * amount * 100) / 100)}</p></div> : <p className="text-sm text-amber-300">Quantidade fora das faixas de preço configuradas.</p>}
            <button type="button" disabled={busy || price === null || !configured || amount > 1000000} onClick={addToCart} className="w-full rounded bg-[#f0bf5d] text-[#07111a] font-bold p-4 disabled:opacity-40 flex items-center justify-center gap-2">{busy ? 'Adicionando…' : 'Adicionar ao pedido B2B'} <ArrowRight size={19} /></button>
          </div> : <form onSubmit={requestCustomizedQuote} className="mt-8 border border-white/15 bg-[#0d2231] rounded-xl p-5 space-y-4"><p>Este produto é preparado mediante cotação. Informe a quantidade e os detalhes do projeto para conversar com nossa equipe no site.</p>
            {eventCustomizer && <B2BEventCustomizer config={eventCustomizer} colorHex={chosenColor} text={customText} onColorChange={setChosenColor} onTextChange={setCustomText} />}
            {product.b2b_category === 'eventos' && eventPricing && <><p className="text-sm text-white/65">Quantidade mínima: {eventPricing.minimum_quantity.toLocaleString('pt-BR')} unidades</p><label className="block text-sm">Quantidade<input type="number" min={eventPricing.minimum_quantity} max="1000000" step="1" value={quantity} onChange={e => setQuantity(e.target.value)} className="block w-full mt-2 bg-[#07111a] border border-white/20 rounded p-3" /></label><p className="text-sm text-white/75">{eventPrice === null ? 'Informe uma quantidade válida para ver a estimativa.' : `${currency(eventPrice)} por unidade · ${currency(eventPrice * amount)} estimados no total`}</p>{eventPricing.pricing_mode === 'tiers' && <div className="divide-y divide-white/10 border-y border-white/10">{eventPricing.tiers.map(tier => <div key={tier.min_qty} className="flex justify-between gap-3 py-2 text-sm"><span>A partir de {tier.min_qty.toLocaleString('pt-BR')} unidades</span><strong>{currency(tier.unit_price)}/un.</strong></div>)}</div>}{eventPricing.pricing_mode === 'step' && <p className="text-xs text-white/50">O preço unitário diminui {currency(eventPricing.discount_per_extra_unit)} por unidade adicional, até {currency(eventPricing.floor_unit_price)}/un.</p>}</>}
            {product.b2b_category === 'eventos' && !eventPricing && <p className="text-amber-300 text-sm">Preço definido após análise do projeto e da quantidade.</p>}
            {eventCustomizer && <><label className="block text-sm">Mais detalhes (opcional)<textarea value={projectDetails} onChange={e => setProjectDetails(e.target.value)} maxLength={800} rows={3} placeholder="Ex.: incluir logotipo, embalagem ou uma data especial" className="block w-full mt-2 bg-[#07111a] border border-white/20 rounded p-3" /></label><label className="block text-sm">Prazo desejado (opcional)<input value={deadline} onChange={e => setDeadline(e.target.value)} maxLength={100} placeholder="Ex.: até novembro" className="block w-full mt-2 bg-[#07111a] border border-white/20 rounded p-3" /></label></>}
            {eventCustomizer ? <button type="submit" disabled={busy || eventPrice === null || !customText.trim()} className="inline-block bg-[#f0bf5d] text-[#07111a] font-bold px-5 py-3 disabled:opacity-50">{busy ? 'Registrando...' : 'Solicitar cotação com minhas escolhas'}</button> : (!eventPricing || eventPrice !== null) && <a href={`/b2b.html?quote=${encodeURIComponent(product.id)}${eventPrice !== null ? `&quantity=${amount}` : ''}`} className="inline-block bg-[#f0bf5d] text-[#07111a] font-bold px-5 py-3">Solicitar cotação no site</a>}</form>}
          {message && <p role="alert" className="text-red-300 mt-4">{message}</p>}
          {canBuy && tiers.length > 0 && <section className="mt-8"><h2 className="font-display font-bold text-lg">Preços por quantidade</h2><div className="mt-3 divide-y divide-white/10 border-y border-white/10">{tiers.map((tier, i) => <div key={i} className="flex justify-between py-3 text-sm"><span>{tier.min_qty.toLocaleString('pt-BR')}{tier.max_qty ? ` a ${tier.max_qty.toLocaleString('pt-BR')}` : '+'} unidades</span><strong>{currency(Number(tier.unit_price))}/un.</strong></div>)}</div></section>}
        </div></div>
    </main>
  </div>;
}
