// Black Friday — estado da campanha (tabela store_campaigns) e peças visuais.
// Opção B: o preço vem de products.promotional_price; aqui só muda o visual.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type StoreCampaign = {
  id: string;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  headline: string;
  subheadline: string;
  cta_label: string;
  low_stock_threshold: number;
};

export type BlackFridayState = { live: boolean; campaign: StoreCampaign | null };

const OFF: BlackFridayState = { live: false, campaign: null };
const BlackFridayContext = createContext<BlackFridayState>(OFF);

const ms = (iso: string | null) => (iso ? new Date(iso).getTime() : NaN);

export function isCampaignLive(c: StoreCampaign | null, now = Date.now()) {
  if (!c || !c.is_active) return false;
  const start = ms(c.starts_at), end = ms(c.ends_at);
  if (Number.isFinite(start) && now < start) return false;
  if (Number.isFinite(end) && now >= end) return false;
  return true;
}

// ?bf_preview=1 mostra o visual sem ligar a campanha (só para quem tem o link).
function previewCampaign(base: StoreCampaign | null): StoreCampaign | null {
  if (typeof window === 'undefined' || new URLSearchParams(window.location.search).get('bf_preview') !== '1') return null;
  const end = base?.ends_at && ms(base.ends_at) > Date.now() ? base.ends_at : new Date(Date.now() + 3 * 864e5).toISOString();
  return {
    id: 'black_friday', headline: 'Black Friday FreoFigures',
    subheadline: 'Os menores preços do ano em peças selecionadas. Só enquanto durar o estoque.',
    cta_label: 'Ver ofertas', low_stock_threshold: 5, ...base, is_active: true, starts_at: null, ends_at: end,
  };
}

let campaignRequest: Promise<StoreCampaign | null> | null = null;
function fetchCampaign() {
  campaignRequest ??= (async () => {
    try {
      const client = (window as any).supabaseClient || (window as any).supabase;
      if (!client?.from) return null;
      const { data, error } = await client.from('store_campaigns').select('*').eq('id', 'black_friday').maybeSingle();
      return error ? null : (data as StoreCampaign | null);
    } catch {
      return null;
    }
  })();
  return campaignRequest;
}

export function BlackFridayProvider({ children }: { children: ReactNode }) {
  const [campaign, setCampaign] = useState<StoreCampaign | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchCampaign().then(data => { if (alive) setCampaign(previewCampaign(data) || data); });
    return () => { alive = false; };
  }, []);

  // Reavalia exatamente na hora em que a campanha começa ou termina.
  useEffect(() => {
    const evaluate = () => setLive(isCampaignLive(campaign));
    evaluate();
    if (!campaign) return;
    const now = Date.now();
    const next = [ms(campaign.starts_at), ms(campaign.ends_at)].filter(t => Number.isFinite(t) && t > now).sort((a, b) => a - b)[0];
    if (next === undefined) return;
    const timer = window.setTimeout(evaluate, Math.min(next - now + 50, 2 ** 31 - 1));
    return () => window.clearTimeout(timer);
  }, [campaign, live]);

  useEffect(() => {
    document.documentElement.classList.toggle('bf-live', live);
  }, [live]);

  return <BlackFridayContext.Provider value={{ live, campaign }}>{children}</BlackFridayContext.Provider>;
}

export const useBlackFriday = () => useContext(BlackFridayContext);

// ── Preço ───────────────────────────────────────────────────────────────────

type Priced = { price: number | string; promotional_price: number | string | null; stock?: number | string | null };

export function saleInfo(product: Priced) {
  const regular = Number(product.price);
  const promo = Number(product.promotional_price);
  const onSale = product.promotional_price != null && Number.isFinite(promo) && promo > 0 && promo < regular;
  const current = onSale ? promo : regular;
  return {
    onSale, regular, current,
    pct: onSale ? Math.round((1 - promo / regular) * 100) : 0,
    savings: onSale ? regular - promo : 0,
  };
}

export const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function lowStockCount(product: Priced, campaign: StoreCampaign | null) {
  const stock = Math.floor(Number(product.stock));
  const limit = campaign?.low_stock_threshold ?? 5;
  return Number.isFinite(stock) && stock > 0 && stock <= limit ? stock : 0;
}

// ── Contador ────────────────────────────────────────────────────────────────

function useCountdown(target: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [target]);
  const left = Math.max(0, ms(target) - now);
  if (!target || !Number.isFinite(left)) return null;
  const s = Math.floor(left / 1000);
  return { days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60 };
}

const pad = (n: number) => String(n).padStart(2, '0');

export function CountdownInline({ target, className = '' }: { target: string | null; className?: string }) {
  const t = useCountdown(target);
  if (!t) return <span className={className}>Por tempo limitado</span>;
  return (
    <span className={`tabular-nums ${className}`} aria-label={`Termina em ${t.days} dias, ${t.hours} horas e ${t.minutes} minutos`}>
      {t.days > 0 && `${t.days}d `}{pad(t.hours)}:{pad(t.minutes)}:{pad(t.seconds)}
    </span>
  );
}

export function CountdownBlocks({ target }: { target: string | null }) {
  const t = useCountdown(target);
  if (!t) return null;
  const parts: [number, string][] = [[t.days, 'dias'], [t.hours, 'horas'], [t.minutes, 'min'], [t.seconds, 'seg']];
  return (
    <div className="flex items-stretch justify-center gap-2 sm:gap-3" role="timer" aria-label={`Oferta termina em ${t.days} dias, ${t.hours} horas e ${t.minutes} minutos`}>
      {parts.map(([value, label], i) => (
        <div key={label} className="flex items-center gap-2 sm:gap-3">
          <div className="bf-count-cell min-w-[64px] sm:min-w-[88px] px-2 py-3 sm:py-4 text-center">
            <div className="font-display font-black text-3xl sm:text-5xl tabular-nums leading-none text-white">{pad(value)}</div>
            <div className="mt-1.5 font-mono text-[9px] sm:text-[10px] uppercase tracking-[.25em] text-freo-orange">{label}</div>
          </div>
          {i < parts.length - 1 && <span className="font-display font-black text-2xl sm:text-4xl text-freo-orange/60" aria-hidden="true">:</span>}
        </div>
      ))}
    </div>
  );
}

// ── Peças visuais ───────────────────────────────────────────────────────────

export function BlackFridayTopBar({ onCta }: { onCta?: () => void }) {
  const { live, campaign } = useBlackFriday();
  if (!live || !campaign) return null;
  return (
    <div className="bf-topbar relative overflow-hidden border-b border-freo-orange/40 bg-black text-white">
      <div className="max-w-[1500px] mx-auto px-3 sm:px-6 py-1.5 flex items-center justify-center gap-2 sm:gap-4 text-[11px] sm:text-xs font-mono uppercase tracking-[.15em]">
        <span className="bf-tag px-1.5 py-0.5 font-display font-black tracking-[.12em] text-black">Black Friday</span>
        <span className="hidden md:inline text-white/70 truncate">{campaign.headline}</span>
        <span className="text-white/50 hidden sm:inline">· termina em</span>
        <CountdownInline target={campaign.ends_at} className="font-bold text-freo-orange" />
        {onCta && <button type="button" onClick={onCta} className="hidden sm:inline underline underline-offset-4 decoration-freo-orange/60 hover:text-freo-orange">{campaign.cta_label} →</button>}
      </div>
    </div>
  );
}

export function BfDiscountBadge({ pct, className = '' }: { pct: number; className?: string }) {
  return (
    <div className={`bf-badge ${className}`} aria-label={`Black Friday: ${pct}% de desconto`}>
      <span className="bf-badge-label">Black<br />Friday</span>
      <span className="bf-badge-pct">−{pct}%</span>
    </div>
  );
}

export function BfLowStock({ count, className = '' }: { count: number; className?: string }) {
  return (
    <div className={`bf-lowstock ${className}`}>
      <span className="bf-lowstock-dot" aria-hidden="true" />
      {count === 1 ? 'Última unidade' : `Últimas ${count} unidades`}
    </div>
  );
}

export function BfPriceBlock({ regular, current, savings, size = 'md' }: { regular: number; current: number; savings: number; size?: 'sm' | 'md' }) {
  return (
    <div className="bf-price">
      <div className="flex items-baseline gap-1.5 flex-wrap">
        <span className="text-[10px] md:text-[11px] font-mono uppercase tracking-wider text-white/45">de</span>
        <span className="font-mono text-xs md:text-sm text-white/45 line-through">{brl(regular)}</span>
        <span className="text-[10px] md:text-[11px] font-mono uppercase tracking-wider text-white/45">por</span>
      </div>
      <div className={`font-display font-black leading-none text-freo-orange ${size === 'sm' ? 'text-xl md:text-2xl' : 'text-2xl md:text-3xl'}`}>{brl(current)}</div>
      <div className="bf-savings mt-1.5">Economize {brl(savings)}</div>
    </div>
  );
}
