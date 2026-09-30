import { createElement, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Box, Clock3, ExternalLink, Heart, Image as ImageIcon, Plus, RefreshCw, TriangleAlert } from "lucide-react";
import {
  createGenerationImageUrl,
  createGenerationModelUrl,
  generationStatusLabel,
  getAuthenticatedUser,
  listGenerations,
  type GenerationJob,
} from "./generations";

type UrlMap = Record<string, string | null>;

let modelViewerScriptLoaded = false;
function useModelViewerScript() {
  const [ready, setReady] = useState(modelViewerScriptLoaded);
  useEffect(() => {
    if (modelViewerScriptLoaded) {
      setReady(true);
      return undefined;
    }
    const existing = document.querySelector('script[data-model-viewer]') as HTMLScriptElement | null;
    if (existing) {
      const loaded = () => {
        modelViewerScriptLoaded = true;
        setReady(true);
      };
      existing.addEventListener("load", loaded);
      return () => existing.removeEventListener("load", loaded);
    }
    const script = document.createElement("script");
    script.type = "module";
    script.src = "https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js";
    script.dataset.modelViewer = "true";
    script.onload = () => {
      modelViewerScriptLoaded = true;
      setReady(true);
    };
    document.head.appendChild(script);
    return undefined;
  }, []);
  return ready;
}

function supabaseClient(): any {
  // @ts-ignore
  const client = window.supabaseClient || window.supabase;
  if (!client?.channel) throw new Error("Supabase não foi inicializado nesta página.");
  return client;
}

function safeGenerationId(): string | null {
  const value = new URLSearchParams(window.location.search).get("id")?.trim();
  return value || null;
}

function redirectToLogin() {
  const returnTo = window.location.pathname + window.location.search;
  localStorage.setItem("freo_auth_return", returnTo);
  window.location.replace(`/login.html?return=${encodeURIComponent(returnTo)}`);
}

export default function MinhasCriacoes() {
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [imageUrls, setImageUrls] = useState<UrlMap>({});
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(safeGenerationId());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const modelViewerReady = useModelViewerScript();

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    setErrorMessage(null);
    try {
      const user = await getAuthenticatedUser();
      setUserId(user.id);
      const rows = await listGenerations();
      setJobs(rows);

      const entries = await Promise.all(rows.map(async job => {
        const path = job.rendered_image_path ?? job.image_path;
        if (!path) return [job.id, null] as const;
        try {
          return [job.id, await createGenerationImageUrl(path, 60 * 60)] as const;
        } catch {
          return [job.id, null] as const;
        }
      }));
      setImageUrls(Object.fromEntries(entries));

      if (selectedId && !rows.some(job => job.id === selectedId)) setSelectedId(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível carregar suas criações.";
      if (/entrar|autentic/i.test(message)) {
        redirectToLogin();
        return;
      }
      setErrorMessage(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedId]);

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    if (!userId) return undefined;
    const client = supabaseClient();
    const channel = client
      .channel(`my-web-generations-${userId}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "generation_jobs", filter: `user_id=eq.${userId}` },
        () => { void load(false); },
      )
      .subscribe();

    const poll = window.setInterval(() => void load(false), 15_000);
    return () => {
      window.clearInterval(poll);
      void client.removeChannel(channel);
    };
  }, [load, userId]);

  const selected = useMemo(() => jobs.find(job => job.id === selectedId) ?? null, [jobs, selectedId]);

  useEffect(() => {
    let cancelled = false;
    setModelUrl(null);
    if (!selected || selected.status !== "completed") return undefined;

    const resolve = async () => {
      try {
        const url = selected.model_path
          ? await createGenerationModelUrl(selected.model_path, 60 * 60)
          : selected.model_url;
        if (!cancelled) setModelUrl(url ?? null);
      } catch (error) {
        if (!cancelled) setErrorMessage(error instanceof Error ? error.message : "Não foi possível abrir o modelo salvo.");
      }
    };
    void resolve();
    return () => { cancelled = true; };
  }, [selected]);

  const select = (id: string) => {
    const next = selectedId === id ? null : id;
    setSelectedId(next);
    const url = next ? `/minhas-criacoes.html?id=${encodeURIComponent(next)}` : "/minhas-criacoes.html";
    window.history.replaceState({}, "", url);
  };

  return (
    <div className="min-h-screen bg-freo-black text-freo-light font-body">
      <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-[#0d0d0d]/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-5 py-3.5 flex items-center justify-between gap-3">
          <button onClick={() => window.location.href = "/dashboard.html"} className="flex items-center gap-2 text-white/60 hover:text-white transition-colors font-mono text-xs uppercase tracking-wider">
            <ArrowLeft className="w-4 h-4" /> Perfil
          </button>
          <div className="font-display font-black uppercase tracking-tighter text-xl">Freo<span className="text-freo-orange font-light">Figures</span></div>
          <button onClick={() => window.location.href = "/criar-modelo.html"} className="flex items-center gap-2 bg-freo-orange text-freo-black px-3 py-2 font-display font-bold uppercase tracking-wider text-xs hover:bg-white transition-colors">
            <Plus className="w-4 h-4" /> Criar
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 py-8">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-5 mb-8">
          <div>
            <div className="inline-flex items-center gap-2 border border-freo-orange/25 bg-freo-orange/5 px-3 py-1.5 mb-4">
              <Box className="w-4 h-4 text-freo-orange" />
              <span className="font-mono text-[10px] text-freo-orange uppercase tracking-[0.18em]">Sua conta</span>
            </div>
            <h1 className="font-display font-black text-4xl md:text-6xl uppercase tracking-tighter leading-[0.92]">Minhas <span className="text-freo-orange">Criações 3D</span></h1>
            <p className="text-white/45 text-sm mt-4 max-w-2xl">As mesmas criações do aplicativo ficam vinculadas ao seu usuário do Supabase e aparecem aqui automaticamente.</p>
          </div>
          <button onClick={() => void load(true)} disabled={refreshing} className="flex items-center justify-center gap-2 border border-white/15 px-4 py-3 font-display font-bold uppercase tracking-widest text-xs hover:border-freo-orange/50 transition-colors disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} /> Atualizar
          </button>
        </div>

        {errorMessage && (
          <div className="mb-5 border border-red-500/35 bg-red-500/10 p-4 flex items-start gap-3 text-red-300 text-sm">
            <TriangleAlert className="w-5 h-5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {userId && <CreatorPanel userId={userId} />}

        {loading ? (
          <div className="py-24 flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-2 border-freo-orange border-t-transparent rounded-full animate-spin" />
            <p className="font-mono text-xs text-freo-orange uppercase tracking-widest">Carregando suas criações...</p>
          </div>
        ) : jobs.length === 0 ? (
          <div className="border border-white/[0.08] bg-[#111] p-10 text-center">
            <Box className="w-12 h-12 text-white/20 mx-auto mb-4" />
            <h2 className="font-display font-black uppercase text-2xl">Nenhuma criação ainda</h2>
            <p className="text-white/40 text-sm mt-2 mb-6">Sua primeira geração aparecerá aqui assim que for criada.</p>
            <button onClick={() => window.location.href = "/criar-modelo.html"} className="bg-freo-orange text-freo-black px-6 py-3 font-display font-bold uppercase tracking-widest text-xs hover:bg-white transition-colors">Criar modelo 3D</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)] gap-5 items-start">
            <div className="space-y-3">
              {jobs.map(job => {
                const active = selectedId === job.id;
                const image = imageUrls[job.id] ?? null;
                const statusClass = job.status === "failed" ? "text-red-400" : job.status === "completed" || job.status === "image_ready" ? "text-emerald-400" : "text-freo-orange";
                return (
                  <button key={job.id} onClick={() => select(job.id)} className={`w-full text-left border p-3 flex gap-4 items-center transition-colors ${active ? "border-freo-orange/60 bg-freo-orange/5" : "border-white/[0.08] bg-[#111] hover:border-white/20"}`}>
                    <div className="w-20 h-20 shrink-0 bg-[#080808] border border-white/[0.06] overflow-hidden flex items-center justify-center">
                      {image ? <img src={image} alt="Criação" className="w-full h-full object-cover" /> : <ImageIcon className="w-7 h-7 text-white/20" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-display font-bold text-white uppercase tracking-wide truncate">{job.title}</h3>
                      <div className={`font-mono text-[10px] uppercase tracking-widest mt-2 ${statusClass}`}>{generationStatusLabel(job)}</div>
                      <div className="flex items-center gap-1.5 text-white/30 text-[11px] mt-2"><Clock3 className="w-3.5 h-3.5" /> {formatDate(job.created_at)}</div>
                      {job.status === "generating_model" && <div className="mt-2 h-1.5 bg-white/5 overflow-hidden"><div className="h-full bg-freo-orange" style={{ width: `${Math.max(0, Math.min(100, job.progress || 0))}%` }} /></div>}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="lg:sticky lg:top-24">
              {selected ? (
                <div className="border border-freo-orange/25 bg-[#111] p-4 md:p-5">
                  <p className="font-mono text-[10px] text-freo-orange uppercase tracking-[0.18em] mb-2">Detalhes da criação</p>
                  <h2 className="font-display font-black text-2xl uppercase tracking-tight mb-4">{selected.title}</h2>

                  {imageUrls[selected.id] && <div className="aspect-square bg-[#080808] border border-white/[0.07] mb-4 overflow-hidden"><img src={imageUrls[selected.id] ?? ""} alt="Imagem da criação" className="w-full h-full object-contain" /></div>}

                  {modelUrl && (
                    <div className="aspect-square bg-[#050505] border border-white/[0.08] mb-4 overflow-hidden">
                      {modelViewerReady
                        ? createElement("model-viewer" as any, { src: modelUrl, "camera-controls": true, "auto-rotate": true, "shadow-intensity": "1", exposure: "1", style: { width: "100%", height: "100%" } })
                        : <div className="w-full h-full flex items-center justify-center"><div className="w-10 h-10 border-2 border-freo-orange border-t-transparent rounded-full animate-spin" /></div>}
                    </div>
                  )}

                  <Info label="Status" value={generationStatusLabel(selected)} />
                  {selected.tripo_status && <Info label="Tripo" value={selected.tripo_status} />}
                  {selected.status === "generating_model" && <Info label="Progresso" value={`${selected.progress}%`} />}
                  <Info label="Criado em" value={formatDate(selected.created_at)} />
                  {selected.error_message && <Info label="Erro" value={selected.error_message} danger />}

                  <button onClick={() => window.location.href = `/criar-modelo.html?id=${encodeURIComponent(selected.id)}`} className="w-full mt-5 bg-freo-orange text-freo-black py-3.5 font-display font-bold uppercase tracking-widest text-xs hover:bg-white transition-colors flex items-center justify-center gap-2">
                    <ExternalLink className="w-4 h-4" /> {selected.status === "completed" ? "Abrir criação" : "Continuar criação"}
                  </button>
                </div>
              ) : (
                <div className="border border-white/[0.08] bg-[#111] p-8 text-center text-white/35 text-sm">Selecione uma criação para ver os detalhes.</div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

type CreatorProduct = { product_id: number; creator_handle: string; likes_count: number; sales_count: number; title: string; image: string | null };
function CreatorPanel({ userId }: { userId: string }) {
  const [handle, setHandle] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [products, setProducts] = useState<CreatorProduct[]>([]);
  const [earned, setEarned] = useState(0);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const loadCreator = useCallback(async () => {
    const db = supabaseClient();
    const profile = await db.from('creator_profiles').select('handle,pending_handle').eq('user_id', userId).maybeSingle();
    if (profile.error || !profile.data) return;
    setHandle(profile.data.handle); setPending(profile.data.pending_handle);
    const [catalog, sales] = await Promise.all([
      db.rpc('community_catalog_info'),
      db.from('community_sales').select('product_id,credits_awarded').eq('creator_id', userId),
    ]);
    if (catalog.error || sales.error) { setMessage('Não foi possível carregar as estatísticas. Atualize a página.'); return; }
    setEarned((sales.data || []).reduce((sum: number, row: any) => sum + Number(row.credits_awarded || 0), 0));
    const mine = (catalog.data || []).filter((row: any) => row.creator_id === userId);
    if (!mine.length) { setProducts([]); return; }
    const details = await db.from('products').select('id,title,images').in('id', mine.map((row: any) => row.product_id));
    const byId = new Map((details.data || []).map((row: any) => [Number(row.id), row]));
    setProducts(mine.map((row: any) => {
      const product: any = byId.get(Number(row.product_id));
      return { ...row, title: product?.title || 'Modelo da comunidade', image: product?.images?.[0] || null };
    }));
  }, [userId]);
  useEffect(() => { void loadCreator(); }, [loadCreator]);
  if (!handle) return null;
  const requestName = async (event: React.FormEvent) => {
    event.preventDefault(); setMessage(''); setSaving(true);
    const result = await supabaseClient().rpc('request_creator_handle', { p_handle: draft.replace(/^@/, '') });
    setSaving(false);
    if (result.error) { setMessage(result.error.message || 'Não foi possível enviar o nome.'); return; }
    setDraft(''); setMessage('Novo @nome enviado para aprovação. O atual permanece público até a decisão.');
    void loadCreator();
  };
  return <section id="criador" className="mb-8 border border-freo-orange/35 bg-[#111] p-4 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="font-mono text-[10px] uppercase tracking-widest text-freo-orange">Seu perfil de criador</p>
        <h2 className="mt-1 font-display text-2xl font-black"><a href={`/criador.html?user=${encodeURIComponent(handle)}`} className="hover:text-freo-orange">@{handle}</a></h2>
        {pending && <p className="mt-1 text-xs text-white/55">@{pending} aguarda aprovação da administração.</p>}
      </div>
      <div className="flex gap-4 font-mono text-sm"><span>{products.length} modelos</span><span>{products.reduce((n,p) => n + Number(p.sales_count || 0),0)} vendas</span><span>{earned} Créditos Freo ganhos</span></div>
    </div>
    <form onSubmit={event => void requestName(event)} className="mt-5 flex flex-wrap gap-2">
      <label htmlFor="creator-handle" className="sr-only">Novo nome público de criador</label>
      <input id="creator-handle" value={draft} onChange={event => setDraft(event.target.value)} minLength={3} maxLength={25} pattern="@?[A-Za-z][A-Za-z0-9_]{2,23}"
        placeholder="@seunome" className="min-w-0 flex-1 border border-white/20 bg-black px-3 py-2 text-sm" />
      <button type="submit" disabled={saving || !draft.trim()} className="bg-freo-orange px-4 py-2 text-xs font-bold uppercase text-black disabled:opacity-50">Enviar @nome</button>
    </form>
    <p className="mt-2 text-xs text-white/40">Use letras, números e _. O nome só fica público após aprovação.</p>
    {message && <p role="status" className="mt-2 text-xs text-freo-orange">{message}</p>}
    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {products.map(product => <a key={product.product_id} href={`/produto?id=${encodeURIComponent(product.product_id)}`} className="flex gap-3 border border-white/10 bg-black/40 p-3 hover:border-freo-orange/50">
        {product.image && <img src={product.image} alt="" className="h-16 w-16 shrink-0 object-cover" />}
        <div className="min-w-0"><strong className="block truncate text-sm">{product.title}</strong><span className="mt-1 block text-xs text-white/50">{product.sales_count} vendas</span><span className="flex items-center gap-1 text-xs text-freo-orange"><Heart className="h-3.5 w-3.5" />{product.likes_count} curtidas</span></div>
      </a>)}
    </div>
  </section>;
}

function Info({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-5 py-2.5 border-b border-white/[0.06]">
      <span className="font-mono text-[10px] text-white/30 uppercase tracking-widest">{label}</span>
      <span className={`text-xs text-right font-semibold ${danger ? "text-red-400" : "text-white/70"}`}>{value}</span>
    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
