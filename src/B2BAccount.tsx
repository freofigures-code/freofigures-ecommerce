import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Building2, ClipboardList, FileText, MessageCircle, Package, UserRound } from 'lucide-react';

type Profile = { id: string; account_type: string | null; is_admin?: boolean | null; company_name: string | null; trade_name: string | null; cnpj: string | null; name: string | null; phone: string | null };
type Quote = { id: string; category: string; product_name: string | null; description: string; quantity: number; deadline: string | null; status: string; admin_note: string | null; created_at: string; updated_at: string };
type Order = { id: string | number; status: string | null; total: number | null; created_at: string };

const quoteStatus: Record<string, { label: string; color: string }> = {
  recebida: { label: 'Recebida', color: 'text-[#e5bb62] bg-[#e5bb62]/10 border-[#e5bb62]/30' },
  em_analise: { label: 'Em análise', color: 'text-[#83c5ec] bg-[#83c5ec]/10 border-[#83c5ec]/30' },
  proposta_enviada: { label: 'Proposta enviada', color: 'text-[#8ed2b6] bg-[#8ed2b6]/10 border-[#8ed2b6]/30' },
  aprovada: { label: 'Aprovada', color: 'text-[#8ed2b6] bg-[#8ed2b6]/10 border-[#8ed2b6]/30' },
  recusada: { label: 'Não aprovada', color: 'text-[#ef9d9d] bg-[#ef9d9d]/10 border-[#ef9d9d]/30' },
};
const categoryName: Record<string, string> = { loja: 'Produtos em quantidade', eventos: 'Personalizados para eventos', sob_medida: 'Novo produto sob medida' };
const orderName: Record<string, string> = { pendente: 'Aguardando pagamento', pago: 'Pago', producao: 'Em produção', enviado: 'Enviado', entregue: 'Entregue', cancelado: 'Cancelado' };
const date = (value: string) => new Date(value).toLocaleDateString('pt-BR');
const money = (value: number | null) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
const cnpjDisplay = (value: string | null) => value?.replace(/\D/g, '').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') || 'Não informado';

function AccountHeader({ onSignOut }: { onSignOut: () => void }) {
  return <header className="border-b border-white/10 bg-[#061524]">
    <div className="max-w-7xl mx-auto px-5 sm:px-8 py-5 flex flex-wrap items-center justify-between gap-4">
      <a href="/b2b.html" className="font-display text-2xl font-black leading-none tracking-tight">FREO<span className="text-[#5a9cc5]">FIGURES</span><span className="block mt-1 font-body text-[10px] tracking-[0.3em] font-normal text-white/60">CORPORATIVO</span></a>
      <nav aria-label="Navegação empresarial" className="flex flex-wrap items-center gap-3 sm:gap-6 text-sm font-body">
        <a href="/b2b.html" className="text-white/65 hover:text-white">Catálogo B2B</a>
        <a href="/b2b-conta.html" aria-current="page" className="text-[#f0bf5d]">Área da empresa</a>
        <a href="/dashboard.html" className="text-white/65 hover:text-white">Conta pessoal</a>
        <button type="button" onClick={onSignOut} className="text-white/65 hover:text-white">Sair</button>
      </nav>
    </div>
  </header>;
}

export default function B2BAccount() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState('');
  const [access, setAccess] = useState<'loading' | 'login' | 'pj' | 'ok' | 'error'>('loading');
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [quotesError, setQuotesError] = useState('');
  const [ordersError, setOrdersError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  async function loadData(userId: string) {
    setRefreshing(true);
    const db = (window as any).supabaseClient;
    const [quoteResult, orderResult] = await Promise.all([
      db.from('b2b_quote_requests').select('id,category,product_name,description,quantity,deadline,status,admin_note,created_at,updated_at').eq('user_id', userId).order('created_at', { ascending: false }),
      db.from('orders').select('id,status,total,created_at').eq('user_id', userId).eq('is_b2b', true).order('created_at', { ascending: false }).limit(5),
    ]);
    if (quoteResult.error) setQuotesError('Não foi possível carregar as cotações. Confira se o SQL da área B2B já foi executado e tente novamente.');
    else { setQuotes(quoteResult.data || []); setQuotesError(''); }
    if (orderResult.error) setOrdersError('Não foi possível carregar os pedidos agora.');
    else { setOrders(orderResult.data || []); setOrdersError(''); }
    setRefreshing(false);
  }

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const db = (window as any).supabaseClient;
        const { data: userData, error: userError } = await db.auth.getUser();
        if (!live) return;
        if (userError || !userData.user) { setAccess('login'); return; }
        const user = userData.user;
        const { data: p, error: pError } = await db.from('profiles').select('id,account_type,is_admin,company_name,trade_name,cnpj,name,phone').eq('id', user.id).single();
        if (!live) return;
        if (pError) { setAccess('error'); return; }
        if (!p.is_admin && (p.account_type !== 'pj' || String(p.cnpj || '').replace(/\D/g, '').length !== 14)) { setAccess('pj'); return; }
        setProfile(p);
        setEmail(user.email || '');
        setAccess('ok');
        await loadData(user.id);
      } catch { if (live) setAccess('error'); }
    })();
    return () => { live = false; };
  }, []);

  const openQuotes = quotes.filter(q => ['recebida', 'em_analise', 'proposta_enviada'].includes(q.status)).length;
  return <div className="min-h-screen bg-[#07111a] font-body text-white">
    <AccountHeader onSignOut={async () => { await (window as any).supabaseClient.auth.signOut(); window.location.assign('/login.html'); }} />
    {access !== 'ok' ? <main className="max-w-lg mx-auto px-5 py-24 text-center">
      <Building2 className="w-11 h-11 text-[#e5bb62] mx-auto mb-6" />
      <h1 className="font-display font-black text-3xl">Área da empresa</h1>
      <p className="text-white/60 mt-4">{access === 'loading' ? 'Carregando sua conta...' : access === 'login' ? 'Entre com sua conta empresarial para acompanhar solicitações e pedidos.' : access === 'pj' ? 'Esta área está disponível para contas empresariais (CNPJ).' : 'Não foi possível carregar seu cadastro. Atualize a página para tentar novamente.'}</p>
      {access === 'login' && <a href="/login.html?return=%2Fb2b-conta.html" className="inline-block mt-7 bg-[#e5bb62] text-[#061524] font-bold px-6 py-3">Entrar</a>}
      {access === 'pj' && <a href="/cadastro.html" className="inline-block mt-7 bg-[#e5bb62] text-[#061524] font-bold px-6 py-3">Conhecer o cadastro empresarial</a>}
    </main> : <main className="max-w-7xl mx-auto px-5 sm:px-8 py-10 md:py-14">
      <a href="/b2b.html" className="inline-flex items-center gap-2 text-sm text-white/55 hover:text-white"><ArrowLeft size={16} /> Voltar ao catálogo B2B</a>
      <div className="mt-7 flex flex-wrap justify-between items-end gap-5">
        <div><p className="text-[#e5bb62] text-xs uppercase tracking-[0.24em]">Painel empresarial</p><h1 className="font-display font-black text-4xl md:text-5xl mt-2">Área da empresa</h1><p className="text-white/55 mt-2">Cotações, pedidos e dados da sua conta em um só lugar.</p></div>
        <button type="button" disabled={refreshing} onClick={() => loadData(profile!.id)} className="border border-white/20 px-4 py-2 text-sm hover:border-[#e5bb62] disabled:opacity-50">{refreshing ? 'Atualizando...' : 'Atualizar dados'}</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-9">
        <div className="border border-white/10 bg-[#0d2231] p-5"><ClipboardList className="text-[#e5bb62]" size={23} /><p className="text-3xl font-display font-black mt-4">{quotes.length}</p><p className="text-white/55 text-sm">Cotações registradas</p></div>
        <div className="border border-white/10 bg-[#0d2231] p-5"><MessageCircle className="text-[#e5bb62]" size={23} /><p className="text-3xl font-display font-black mt-4">{openQuotes}</p><p className="text-white/55 text-sm">Cotações em andamento</p></div>
        <div className="border border-white/10 bg-[#0d2231] p-5"><Package className="text-[#e5bb62]" size={23} /><p className="text-3xl font-display font-black mt-4">{orders.length}</p><p className="text-white/55 text-sm">Pedidos recentes desta conta</p></div>
      </div>

      <div className="grid lg:grid-cols-[1.65fr_1fr] gap-7 mt-9 items-start">
        <section aria-labelledby="quotes-title" className="border border-white/10 bg-[#0a1a27]">
          <div className="p-5 md:p-6 border-b border-white/10 flex flex-wrap justify-between items-center gap-4"><div><p className="text-[#e5bb62] text-xs uppercase tracking-widest">Projetos</p><h2 id="quotes-title" className="font-display font-bold text-2xl mt-1">Minhas cotações</h2></div><a href="/b2b.html#b2b-catalog" className="inline-flex items-center gap-2 bg-[#e5bb62] text-[#061524] font-bold text-sm px-4 py-2.5">Nova cotação <ArrowRight size={16} /></a></div>
          {quotesError ? <p role="alert" className="p-6 text-red-300 text-sm">{quotesError}</p> : quotes.length === 0 ? <div className="p-9 text-center"><FileText className="text-white/25 mx-auto" size={33} /><p className="font-semibold mt-3">Ainda não há solicitações.</p><p className="text-white/50 text-sm mt-1">Escolha produtos para eventos, um novo produto sob medida ou uma cotação por volume.</p></div> : <div className="divide-y divide-white/10">{quotes.map(q => <article key={q.id} className="p-5 md:p-6">
            <div className="flex flex-wrap justify-between items-start gap-3"><div><p className="text-[#e5bb62] text-[11px] uppercase tracking-wider">{categoryName[q.category] || q.category}</p><h3 className="font-display font-bold text-lg mt-1">{q.product_name || 'Projeto personalizado'}</h3><p className="text-white/40 text-xs mt-1">Solicitada em {date(q.created_at)} · Protocolo {q.id.slice(0, 8).toUpperCase()}</p></div><span className={`text-xs border px-2.5 py-1.5 ${quoteStatus[q.status]?.color || 'text-white/70 border-white/20'}`}>{quoteStatus[q.status]?.label || q.status}</span></div>
            <p className="text-white/70 text-sm mt-4 whitespace-pre-wrap break-words">{q.description}</p>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-white/50 mt-4"><span>Quantidade: {q.quantity.toLocaleString('pt-BR')}</span>{q.deadline && <span>Prazo desejado: {q.deadline}</span>}<span>Atualizada em {date(q.updated_at)}</span></div>
            {q.admin_note && <div className="mt-4 border-l-2 border-[#e5bb62] pl-3"><p className="text-[11px] uppercase tracking-widest text-[#e5bb62]">Retorno da equipe</p><p className="text-sm text-white/80 mt-1 whitespace-pre-wrap break-words">{q.admin_note}</p></div>}
            <a href={`https://wa.me/5511946454111?text=${encodeURIComponent(`Olá! Quero acompanhar a cotação B2B de protocolo ${q.id}.`)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-[#9bdab5] mt-5 hover:underline"><MessageCircle size={16} /> Falar sobre esta cotação</a>
          </article>)}</div>}
        </section>

        <div className="space-y-7">
          <section aria-labelledby="company-title" className="border border-white/10 bg-[#0a1a27] p-5 md:p-6"><Building2 className="text-[#e5bb62]" size={24} /><h2 id="company-title" className="font-display font-bold text-xl mt-3">Dados da empresa</h2><dl className="mt-5 space-y-4 text-sm"><div><dt className="text-white/45">Razão social</dt><dd className="font-semibold break-words">{profile?.company_name || 'Não informada'}</dd></div><div><dt className="text-white/45">Nome fantasia</dt><dd>{profile?.trade_name || 'Não informado'}</dd></div><div><dt className="text-white/45">CNPJ</dt><dd>{cnpjDisplay(profile?.cnpj || null)}</dd></div><div><dt className="text-white/45">Contato</dt><dd>{profile?.name || email}{profile?.phone && <span className="block">{profile.phone}</span>}</dd></div><div><dt className="text-white/45">E-mail da conta</dt><dd className="break-all">{email}</dd></div></dl><a href="/dashboard.html" className="inline-flex items-center gap-2 text-[#e5bb62] text-sm mt-6 hover:underline"><UserRound size={16} /> Gerenciar conta, endereços e pagamentos</a></section>
          <section aria-labelledby="orders-title" className="border border-white/10 bg-[#0a1a27] p-5 md:p-6"><Package className="text-[#e5bb62]" size={24} /><h2 id="orders-title" className="font-display font-bold text-xl mt-3">Pedidos B2B recentes</h2><p className="text-xs text-white/45 mt-1">Compras feitas pelo catálogo empresarial.</p>{ordersError ? <p role="alert" className="text-sm text-red-300 mt-4">{ordersError}</p> : orders.length === 0 ? <p className="text-white/50 text-sm mt-5">Nenhum pedido B2B recente.</p> : <div className="divide-y divide-white/10 mt-4">{orders.map(o => <div key={o.id} className="py-3 flex justify-between gap-3 text-sm"><div><p className="font-semibold">Pedido #{String(o.id).slice(0, 8)}</p><p className="text-white/45 text-xs mt-1">{date(o.created_at)} · {orderName[(o.status || '').toLowerCase()] || o.status || 'Sem status'}</p></div><span className="text-[#e5bb62] whitespace-nowrap">{money(o.total)}</span></div>)}</div>}<a href="/meus-pedidos.html" className="inline-flex items-center gap-2 text-[#e5bb62] text-sm mt-5 hover:underline">Ver todos os pedidos <ArrowRight size={16} /></a></section>
        </div>
      </div>
    </main>}
  </div>;
}
