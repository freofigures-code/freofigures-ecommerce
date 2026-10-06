import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Send } from 'lucide-react';

type Message = {
  id: number;
  sender_id: string;
  body: string;
  attachment_path: string | null;
  created_at: string;
};
const bucket = 'b2b-quote-images';
const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
const extension: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export default function B2BQuoteChat({ quoteId, userId }: { quoteId: string; userId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [images, setImages] = useState<Record<string, string>>({});
  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const bottom = useRef<HTMLDivElement>(null);
  const signedCache = useRef<Record<string, { url: string; expires: number }>>({});
  const db = (window as any).supabaseClient;

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const result = await db.from('b2b_quote_messages')
          .select('id,sender_id,body,attachment_path,created_at')
          .eq('quote_id', quoteId).order('created_at').order('id');
        if (!active) return;
        if (result.error) throw result.error;
        const rows: Message[] = result.data || [];
        setMessages(rows);
        const paths = rows.map(row => row.attachment_path).filter((path): path is string => Boolean(path));
        if (paths.length) {
          const signed = await Promise.all(paths.map(async path => {
            const cached = signedCache.current[path];
            if (cached && cached.expires > Date.now()) return [path, cached.url] as const;
            const response = await db.storage.from(bucket).createSignedUrl(path, 3600);
            const url = response.data?.signedUrl || '';
            if (url) signedCache.current[path] = { url, expires: Date.now() + 50 * 60 * 1000 };
            return [path, url] as const;
          }));
          if (active) setImages(Object.fromEntries(signed));
        }
        if (active) setError('');
      } catch {
        if (active) setError('Não foi possível carregar a conversa. Atualize a página.');
      }
    }
    void load();
    const timer = window.setInterval(() => { void load(); }, 8000);
    return () => { active = false; window.clearInterval(timer); };
  }, [db, quoteId]);

  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest' }); }, [messages.length]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (busy || (!text && !file)) return;
    if (text.length > 4000) { setError('A mensagem pode ter até 4.000 caracteres.'); return; }
    if (file && (!allowed.has(file.type) || file.size > 5 * 1024 * 1024)) {
      setError('Envie JPG, PNG ou WEBP com até 5 MB.'); return;
    }
    setBusy(true); setError('');
    let path: string | null = null;
    let saved = false;
    try {
      const auth = await db.auth.getUser();
      if (auth.error || auth.data.user?.id !== userId) throw new Error('Sua sessão expirou. Entre novamente.');
      if (file) {
        path = `${quoteId}/${userId}/${crypto.randomUUID()}.${extension[file.type]}`;
        const upload = await db.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false });
        if (upload.error) throw upload.error;
      }
      const result = await db.from('b2b_quote_messages').insert({
        quote_id: quoteId, sender_id: userId, body: text, attachment_path: path,
      });
      if (result.error) throw result.error;
      saved = true;
      setBody(''); setFile(null);
      const refreshed = await db.from('b2b_quote_messages')
        .select('id,sender_id,body,attachment_path,created_at').eq('quote_id', quoteId).order('created_at').order('id');
      if (!refreshed.error) {
        setMessages(refreshed.data || []);
        if (path) {
          const signed = await db.storage.from(bucket).createSignedUrl(path, 3600);
          if (signed.data?.signedUrl) {
            signedCache.current[path] = { url: signed.data.signedUrl, expires: Date.now() + 50 * 60 * 1000 };
            setImages(previous => ({ ...previous, [path!]: signed.data.signedUrl }));
          }
        }
      }
    } catch (cause) {
      if (path && !saved) await db.storage.from(bucket).remove([path]);
      setError(saved ? 'Mensagem enviada. Atualize a conversa para vê-la.'
        : cause instanceof Error ? cause.message : 'Não foi possível enviar. Tente novamente.');
    } finally { setBusy(false); }
  }

  return <section aria-label="Conversa da cotação" className="mt-5 border border-[#e5bb62]/30 bg-[#07111a]">
    <div className="border-b border-white/10 px-4 py-3"><h4 className="font-display font-bold">Conversa com a FreoFigures</h4><p className="text-xs text-white/50">Mensagens e imagens desta cotação ficam visíveis somente para sua empresa e a administração.</p></div>
    <div className="max-h-96 overflow-y-auto p-4 space-y-3" aria-live="polite">
      {messages.length === 0 && <p className="text-sm text-white/50">Envie uma mensagem ou imagem para começar a conversa.</p>}
      {messages.map(message => <div key={message.id} className={`max-w-[90%] sm:max-w-[75%] p-3 rounded ${message.sender_id === userId ? 'ml-auto bg-[#15394f]' : 'bg-[#24313a]'}`}>
        <p className="text-[11px] text-[#e5bb62] mb-1">{message.sender_id === userId ? 'Você' : 'Equipe FreoFigures'} · {new Date(message.created_at).toLocaleString('pt-BR')}</p>
        {message.body && <p className="text-sm whitespace-pre-wrap break-words">{message.body}</p>}
        {message.attachment_path && (images[message.attachment_path] ? <a href={images[message.attachment_path]} target="_blank" rel="noopener noreferrer"><img src={images[message.attachment_path]} alt="Imagem enviada na cotação" className="mt-2 max-h-64 rounded object-contain" /></a> : <p className="text-xs text-white/50 mt-2">Carregando imagem privada...</p>)}
      </div>)}
      <div ref={bottom} />
    </div>
    <form onSubmit={send} className="border-t border-white/10 p-4 space-y-3">
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <textarea value={body} onChange={event => setBody(event.target.value)} maxLength={4000} rows={3} placeholder="Escreva sobre personalização, prazo ou acabamento..." className="w-full bg-[#0d2231] border border-white/20 p-3 text-sm text-white resize-y" />
      <div className="flex flex-wrap items-center justify-between gap-3"><label className="inline-flex items-center gap-2 text-sm text-[#e5bb62] cursor-pointer"><ImagePlus size={18} /> {file ? file.name : 'Anexar imagem'}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={event => setFile(event.target.files?.[0] || null)} /></label><button disabled={busy || (!body.trim() && !file)} type="submit" className="inline-flex items-center gap-2 bg-[#e5bb62] text-[#07111a] font-bold px-5 py-2.5 disabled:opacity-50"><Send size={16} />{busy ? 'Enviando...' : 'Enviar'}</button></div>
    </form>
  </section>;
}
