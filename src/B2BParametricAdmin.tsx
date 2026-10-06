import { useEffect, useRef, useState } from 'react';
import { ParametricModelViewer } from './ParametricModelViewer';
import { useParametricModel } from './useParametricModel';

type ModelInfo = { productId: number | null; path: string; parameter: string; text: string; textLimit: number; color: string; title: string; quote: boolean; verified: boolean };
const db = () => (window as any).supabaseClient;

export default function B2BParametricAdmin() {
  const [info, setInfo] = useState<ModelInfo | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const [verifyTarget, setVerifyTarget] = useState<{ text: string; original: string; bytes: ArrayBuffer } | null>(null);
  const verifySaving = useRef(false);
  const model = useParametricModel(info?.path, info?.parameter || 'custom_text', text);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const client = db();
        const auth = await client.auth.getUser();
        if (auth.error || !auth.data.user) throw new Error('Entre como administrador para abrir esta página.');
        const profile = await client.from('profiles').select('is_admin').eq('id', auth.data.user.id).single();
        if (profile.error || profile.data?.is_admin !== true) throw new Error('Acesso exclusivo da administração.');
        const query = new URLSearchParams(location.search);
        const quoteId = query.get('quote');
        let next: ModelInfo;
        if (quoteId) {
          if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(quoteId)) throw new Error('Protocolo inválido.');
          const result = await client.from('b2b_quote_requests').select('product_name,customization').eq('id', quoteId).single();
          if (result.error) throw result.error;
          const c = result.data?.customization;
          if (!c?.model_path) throw new Error('Esta cotação não usa um modelo paramétrico.');
          next = { productId: null, path: c.model_path, parameter: c.text_parameter, text: c.text, textLimit: 40, color: c.color_hex, title: result.data.product_name || 'Cotação B2B', quote: true, verified: true };
        } else {
          const id = Number(query.get('id'));
          if (!Number.isSafeInteger(id) || id < 1) throw new Error('Produto inválido.');
          const [product, customizer] = await Promise.all([
            client.from('products').select('title').eq('id', id).single(),
            client.from('b2b_event_customizers').select('model_path,text_parameter,sample_text,text_limit,colors,model_verified_path').eq('product_id', id).single(),
          ]);
          if (product.error) throw product.error;
          if (customizer.error) throw customizer.error;
          if (!customizer.data?.model_path) throw new Error('Envie e salve o arquivo .scad na edição do produto.');
          next = { productId: id, path: customizer.data.model_path, parameter: customizer.data.text_parameter, text: customizer.data.sample_text, textLimit: customizer.data.text_limit, color: customizer.data.colors?.[0]?.hex || '#e5bb62', title: product.data.title, quote: false, verified: customizer.data.model_verified_path === customizer.data.model_path };
        }
        if (active) { setInfo(next); setText(next.text); }
      } catch (failure) {
        if (active) setError(failure instanceof Error ? failure.message : 'Não foi possível abrir o modelo.');
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!info || !verifyTarget || model.status !== 'ready' || model.renderedText !== verifyTarget.text || !model.bytes || verifySaving.current) return;
    verifySaving.current = true;
    (async () => {
      try {
        const before = new Uint8Array(verifyTarget.bytes);
        const after = new Uint8Array(model.bytes!);
        let different = before.length !== after.length;
        if (!different) for (let i = 80; i < before.length; i++) if (before[i] !== after[i]) { different = true; break; }
        if (!different) throw new Error('O arquivo gerou a mesma malha para dois nomes. Confira se a variável de texto altera a geometria no .scad.');
        const update = await db().from('b2b_event_customizers')
          .update({ model_verified_path: info.path, model_verified_at: new Date().toISOString() })
          .eq('product_id', info.productId).eq('model_path', info.path).select('product_id').single();
        if (update.error || !update.data) throw update.error || new Error('A configuração do produto mudou. Atualize a página.');
        setInfo(current => current ? { ...current, verified: true } : current);
        setVerifyError('Dois nomes produziram malhas 3D diferentes. O produto pode ser ativado no cadastro.');
      } catch (failure) {
        setVerifyError(failure instanceof Error ? failure.message : 'Não foi possível validar o modelo.');
      } finally {
        setText(verifyTarget.original);
        setVerifyTarget(null);
        verifySaving.current = false;
      }
    })();
  }, [info, model, verifyTarget]);

  useEffect(() => {
    if (verifyTarget && model.status === 'error') {
      setVerifyError(`O segundo nome não pôde ser gerado: ${model.error}`);
      setText(verifyTarget.original);
      setVerifyTarget(null);
    }
  }, [model.status, model.error, verifyTarget]);

  function verifyChange() {
    if (!info || info.quote || !model.bytes || model.status !== 'ready' || model.renderedText !== text.trim()) return;
    const candidate = text.length < info.textLimit ? `${text.trim()}X` : text.length > 1 ? text.trim().slice(0, -1) : text.trim() === 'A' ? 'B' : 'A';
    if (!candidate || candidate === text.trim()) { setVerifyError('Use um nome de exemplo diferente para testar.'); return; }
    setVerifyError('Gerando o segundo nome para comparar as malhas…');
    setVerifyTarget({ text: candidate, original: text, bytes: model.bytes });
    setText(candidate);
  }

  function download() {
    if (!info || !model.bytes || model.renderedText !== text.trim()) return;
    const url = URL.createObjectURL(new Blob([model.bytes], { type: 'model/stl' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `freo-${info.title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').slice(0, 40)}-${text.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 40)}.stl`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <main className="max-w-5xl mx-auto p-5 sm:p-8"><a className="text-[#e5bb62]" href="/admin/produtos.html">← Administração</a><h1 className="font-display text-3xl sm:text-4xl font-black mt-7">Modelo paramétrico B2B</h1>
    {error ? <p role="alert" className="mt-6 border border-red-500/40 bg-red-950/30 p-5 text-red-200">{error}</p> : !info ? <p className="mt-6">Carregando configuração…</p> : <div className="grid md:grid-cols-2 gap-7 mt-7">
      <div className="aspect-square rounded-xl overflow-hidden border border-white/15 bg-[#172734]">{model.status === 'ready' && model.bytes ? <ParametricModelViewer bytes={model.bytes} color={info.color} label={`Modelo 3D de ${text}`} /> : <div role="status" className="h-full grid place-items-center p-6 text-center text-white/60">{model.status === 'error' ? model.error : model.status === 'rendering' ? 'Gerando a geometria 3D…' : 'Carregando modelo…'}</div>}</div>
      <div className="space-y-5"><h2 className="font-display font-bold text-2xl">{info.title}</h2><p className="text-white/65">{info.quote ? 'Modelo gerado com o nome registrado na cotação. Confira e baixe o STL para produção.' : 'Altere o nome para confirmar que o corpo do modelo realmente muda. Só ative o produto após testar o arquivo enviado.'}</p>
        <label className="block">Nome no modelo<input type="text" maxLength={info.textLimit} disabled={info.quote || Boolean(verifyTarget)} value={text} onChange={event => setText(event.target.value)} className="block w-full mt-2 rounded bg-[#0d2231] border border-white/25 p-3 disabled:opacity-65" /></label>
        <p className="text-sm text-white/55">Variável OpenSCAD: <code>{info.parameter}</code>. Arraste a prévia para girar e use a roda do mouse ou gesto de pinça para aproximar.</p>
        {!info.quote && <><p className={info.verified ? 'text-green-300' : 'text-amber-300'}>{info.verified ? 'Modelo verificado com dois nomes.' : 'Rascunho: verifique a mudança de geometria antes de ativar.'}</p><button type="button" onClick={verifyChange} disabled={model.status !== 'ready' || Boolean(verifyTarget)} className="border border-[#e5bb62] text-[#e5bb62] font-bold px-5 py-3 rounded disabled:opacity-45">{verifyTarget ? 'Comparando modelos…' : 'Verificar com outro nome'}</button>{verifyError && <p role="status" className="text-sm text-white/75">{verifyError}</p>}</>}
        <button type="button" onClick={download} disabled={model.status !== 'ready' || model.renderedText !== text.trim()} className="bg-[#e5bb62] text-[#07111a] font-bold px-5 py-3 rounded disabled:opacity-45">Baixar STL gerado</button>
        {model.status === 'error' && <p role="alert" className="text-red-200">Corrija o arquivo .scad ou o nome da variável na edição do produto.</p>}
      </div>
    </div>}
  </main>;
}
