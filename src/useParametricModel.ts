import { useEffect, useState } from 'react';

type State = { status: 'idle' | 'loading' | 'rendering' | 'ready' | 'error'; bytes: ArrayBuffer | null; renderedText: string; error: string };
const sourceCache = new Map<string, Promise<string>>();

function loadSource(modelPath: string): Promise<string> {
  const existing = sourceCache.get(modelPath);
  if (existing) return existing;
  const request = (async () => {
    const db = (window as any).supabaseClient;
    const result = await db.storage.from('b2b-parametric-models').download(modelPath);
    if (result.error) throw result.error;
    return result.data.text();
  })();
  sourceCache.set(modelPath, request);
  request.catch(() => sourceCache.delete(modelPath));
  return request;
}

export function useParametricModel(modelPath: string | null | undefined, parameter: string, text: string) {
  const [state, setState] = useState<State>({ status: 'idle', bytes: null, renderedText: '', error: '' });
  useEffect(() => {
    if (!modelPath) return;
    let cancelled = false;
    let worker: Worker | null = null;
    let timeout = 0;
    const name = text.trim();
    if (!name) { setState({ status: 'idle', bytes: null, renderedText: '', error: '' }); return; }
    const timer = setTimeout(async () => {
      setState({ status: 'loading', bytes: null, renderedText: '', error: '' });
      try {
        const source = await loadSource(modelPath);
        if (cancelled) return;
        if (!source || source.length > 262144) throw new Error('O arquivo OpenSCAD é inválido ou excede 256 KiB.');
        setState({ status: 'rendering', bytes: null, renderedText: '', error: '' });
        worker = new Worker(new URL('./parametricModelWorker.ts', import.meta.url), { type: 'module' });
        timeout = window.setTimeout(() => {
          if (!cancelled) setState({ status: 'error', bytes: null, renderedText: '', error: 'A geração demorou demais. Reduza o texto ou peça a revisão do modelo.' });
          worker?.terminate(); worker = null;
        }, 60000);
        worker.onmessage = (event: MessageEvent<{ ok: boolean; bytes?: ArrayBuffer; error?: string }>) => {
          if (cancelled) return;
          window.clearTimeout(timeout);
          if (event.data.ok && event.data.bytes) setState({ status: 'ready', bytes: event.data.bytes, renderedText: name, error: '' });
          else setState({ status: 'error', bytes: null, renderedText: '', error: event.data.error || 'Não foi possível gerar o modelo.' });
          worker?.terminate(); worker = null;
        };
        worker.onerror = () => {
          window.clearTimeout(timeout);
          if (!cancelled) setState({ status: 'error', bytes: null, renderedText: '', error: 'O navegador não conseguiu iniciar o gerador 3D.' });
          worker?.terminate(); worker = null;
        };
        worker.postMessage({ source, parameter, text: name });
      } catch (error) {
        if (!cancelled) setState({ status: 'error', bytes: null, renderedText: '', error: error instanceof Error ? error.message : 'Não foi possível abrir o modelo 3D.' });
      }
    }, 500);
    return () => { cancelled = true; clearTimeout(timer); window.clearTimeout(timeout); worker?.terminate(); };
  }, [modelPath, parameter, text]);
  return state;
}
