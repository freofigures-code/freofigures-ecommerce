import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, Send, Paperclip, Minus, ImageIcon, ExternalLink, Tag } from 'lucide-react';

// ─── CONFIG — EDITE AQUI ────────────────────────────────────────────────────

const N8N_WEBHOOK_URL = 'https://n8nwebhook.solviaoficial.com/webhook/freozinho';

const AVATAR_URL = 'https://rrmxqpvxrpcqqxsgccqw.supabase.co/storage/v1/object/public/imagens/freozinho.png';

// ─── ID DO LEAD ─────────────────────────────────────────────────────────────

const getLeadId = (): string => {
  const key = 'freo_lead_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = 'anon_' + crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
};

const LEAD_ID = getLeadId();

const SESSION_ID = (() => {
  const key = 'freo_session_id';
  let id = sessionStorage.getItem(key);
  if (!id) { id = crypto.randomUUID(); sessionStorage.setItem(key, id); }
  return id;
})();

// ─── TIPOS ──────────────────────────────────────────────────────────────────

type Produto = {
  id?: string;
  nome: string;
  preco?: string;
  imagem: string;
  link?: string;
  variante?: string | null;
};

type Message = {
  id: string;
  role: 'user' | 'bot';
  text: string;
  time: string;
  imagePreview?: string;
  produtos?: Produto[] | null;
};

// ─── HELPERS ────────────────────────────────────────────────────────────────

const now = () => {
  const d = new Date();
  return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
};

const uid = () => Math.random().toString(36).slice(2);

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

// ─── QUICK REPLIES ──────────────────────────────────────────────────────────

const QUICK_REPLIES = [
  'Ver catálogo',
  'Keycaps artesanais',
  'Projeto custom',
  'Prazo de entrega',
];

// ─── CALLOUT MESSAGES ───────────────────────────────────────────────────────

const CALLOUT_MSGS = [
  'Oi! Posso te ajudar?',
  'Keycaps artesanais aqui!',
  'Projeto custom? Fala comigo.',
  'Dúvidas? É só perguntar!',
];

// ─── MASCOTE SVG (fallback quando AVATAR_URL estiver vazio) ─────────────────

const FreoFace = ({ size = 32 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="20" cy="20" r="20" fill="#DDAF34" />
    <circle cx="20" cy="14" r="7" fill="#0e0e0f" />
    <circle cx="17" cy="13" r="1.5" fill="#DDAF34" />
    <circle cx="23" cy="13" r="1.5" fill="#DDAF34" />
    <path d="M17 16.5 Q20 18.5 23 16.5" stroke="#DDAF34" strokeWidth="1.3" strokeLinecap="round" />
    <path d="M10 34 Q10 26 20 26 Q30 26 30 34" fill="#0e0e0f" />
  </svg>
);

const Avatar = ({ size = 32 }: { size?: number }) =>
  AVATAR_URL ? (
    <img
      src={AVATAR_URL}
      alt="Freozinho"
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: 'cover', borderRadius: '50%', display: 'block' }}
    />
  ) : (
    <FreoFace size={size} />
  );

// ─── CARD DE PRODUTO ─────────────────────────────────────────────────────────

const ProductCard = ({
  produto,
  index,
  onAsk,
}: {
  produto: Produto;
  index: number;
  onAsk: (msg: string) => void;
}) => {
  const [imgError, setImgError] = useState(false);

  return (
    <motion.div
      className="ff-product-card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, type: 'spring', stiffness: 340, damping: 26 }}
    >
      <div className="ff-product-img-wrap">
        {!imgError ? (
          <img
            src={produto.imagem}
            alt={produto.nome}
            className="ff-product-img"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="ff-product-img-fallback">
            <ImageIcon size={22} color="rgba(221,175,52,0.3)" />
          </div>
        )}
        {produto.variante && (
          <div className="ff-product-variante-badge">
            <Tag size={8} />
            {produto.variante}
          </div>
        )}
      </div>
      <div className="ff-product-body">
        <div className="ff-product-nome">{produto.nome}</div>
        {produto.preco && (
          <div className="ff-product-preco">{produto.preco}</div>
        )}
      </div>
      {produto.link ? (
        <a
          href={produto.link}
          target="_blank"
          rel="noopener noreferrer"
          className="ff-product-btn"
        >
          <span>Ver produto</span>
          <ExternalLink size={11} />
        </a>
      ) : (
        <button
          className="ff-product-btn ff-product-btn-ask"
          onClick={() => {
            const msg = produto.id
              ? `Quero saber mais sobre o produto #${produto.id}: ${produto.nome}`
              : `Quero saber mais sobre: ${produto.nome}`;
            onAsk(msg);
          }}
        >
          <span>Quero este!</span>
          <Send size={11} />
        </button>
      )}
    </motion.div>
  );
};

// ─── PARSE DA RESPOSTA DO N8N ─────────────────────────────────────────────────
//
// Suporta todos esses formatos de saída do n8n:
//
//  Formato A — objeto com resultado_busca (seu agente atual):
//    { interesse: true, resultado_busca: [{id, nome, imagem, variante}], reply?: "..." }
//
//  Formato B — array com primeiro item contendo resultado_busca:
//    [{ interesse: true, resultado_busca: [...], reply?: "..." }]
//
//  Formato C — texto com delimitador %%PRODUTO%% (legado):
//    "Texto da resposta%%PRODUTO%%{...json...}%%PRODUTO%%{...json...}"
//
//  Formato D — campo produtos explícito:
//    { reply: "...", produtos: [{nome, imagem, link, preco}] }

const parseN8nResponse = (data: any): { text: string; produtos: Produto[] | null } => {
  // Formato B — array, pega o primeiro item
  const item = Array.isArray(data) ? data[0] : data;

  // Formatos A e B — objeto com resultado_busca
  if (item && typeof item === 'object' && Array.isArray(item.resultado_busca)) {
    return {
      text: item.reply ?? item.message ?? item.output ?? item.text ?? 'Encontrei esses produtos pra você!',
      produtos: item.resultado_busca.length > 0 ? item.resultado_busca : null,
    };
  }

  // Formato D — campo produtos explícito
  if (item?.produtos && Array.isArray(item.produtos)) {
    return {
      text: item.reply ?? item.message ?? item.output ?? item.text ?? 'Encontrei esses produtos pra você!',
      produtos: item.produtos.length > 0 ? item.produtos : null,
    };
  }

  // Pega o texto bruto para Formato C
  const rawReply: string =
    typeof data === 'string'
      ? data
      : item?.reply ?? item?.message ?? item?.output ?? item?.text ?? 'Recebi! Logo te respondo.';

  // Formato C — %%PRODUTO%% delimitador legado
  if (typeof rawReply === 'string' && rawReply.includes('%%PRODUTO%%')) {
    const partes = rawReply.split('%%PRODUTO%%');
    const replyTexto = partes[0].trim();
    const produtos = partes
      .slice(1)
      .map((p: string) => { try { return JSON.parse(p.trim()) as Produto; } catch { return null; } })
      .filter((p): p is Produto => p !== null);
    return { text: replyTexto, produtos: produtos.length > 0 ? produtos : null };
  }

  return { text: rawReply, produtos: null };
};

// ─── COMPONENTE PRINCIPAL ───────────────────────────────────────────────────

export default function FreoChat() {
  const [open, setOpen] = useState(false);
  const [calloutVisible, setCalloutVisible] = useState(true);
  const [calloutIdx, setCalloutIdx] = useState(0);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: uid(),
      role: 'bot',
      text: 'Fala! Aqui é o Freozinho — seu guia na Freo Figures. Peças forjadas camada por camada. No que posso te ajudar?',
      time: now(),
    },
  ]);
  const [inputVal, setInputVal] = useState('');
  const [pendingImage, setPendingImage] = useState<{ base64: string; preview: string; mediaType: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [badge, setBadge] = useState(1);
  const [userId, setUserId] = useState<string | null>(null);

  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // @ts-ignore
    const supabase = window.supabaseClient || window.supabase;
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: { session } }: any) => {
      if (session?.user) setUserId(session.user.id);
    });
  }, []);

  useEffect(() => {
    if (!calloutVisible) return;
    const t = setInterval(() => {
      setCalloutIdx(i => (i + 1) % CALLOUT_MSGS.length);
    }, 4000);
    return () => clearInterval(t);
  }, [calloutVisible]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, loading]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 120);
  }, [open]);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!open) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) processImageFile(file);
          break;
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [open]);

  const processImageFile = async (file: File) => {
    const preview = URL.createObjectURL(file);
    const base64 = await fileToBase64(file);
    setPendingImage({ base64, preview, mediaType: file.type });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) processImageFile(file);
    e.target.value = '';
  };

  const handleOpen = () => { setOpen(true); setBadge(0); setCalloutVisible(false); };
  const handleClose = () => setOpen(false);

  // ── Envio de mensagem ────────────────────────────────────────────────────

  const sendMessage = async (text: string, imageOverride?: typeof pendingImage) => {
    const clean = text.trim();
    const img = imageOverride ?? pendingImage;
    if ((!clean && !img) || loading) return;

    setInputVal('');
    setPendingImage(null);
    setError('');

    const userMsg: Message = {
      id: uid(), role: 'user',
      text: clean || '📎 Imagem enviada',
      time: now(),
      imagePreview: img?.preview,
    };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const payload: Record<string, unknown> = {
        lead_id: userId ?? LEAD_ID,
        lead_type: userId ? 'registered' : 'anonymous',
        session_id: SESSION_ID,
        message: clean,
        timestamp: new Date().toISOString(),
        source: 'freo-widget',
        has_image: !!img,
      };
      if (img) payload.image = { base64: img.base64, media_type: img.mediaType };

      const res = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const { text: replyTexto, produtos } = parseN8nResponse(data);

      setMessages(prev => [
        ...prev,
        { id: uid(), role: 'bot', text: replyTexto, time: now(), produtos },
      ]);
    } catch (err) {
      console.error('[FreoChat] webhook error:', err);
      setError('Ops, tive um problema de conexão. Tenta de novo?');
      setMessages(prev => [
        ...prev,
        { id: uid(), role: 'bot', text: 'Eita, tive uma falha aqui. Me chama no WhatsApp: (11) 94645-4111.', time: now() },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = () => sendMessage(inputVal);
  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  return (
    <>
      <style>{WIDGET_CSS}</style>

      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />

      <div className="ff-widget-root">

        {/* ── Painel de chat ── */}
        <AnimatePresence>
          {open && (
            <motion.div
              className="ff-panel"
              initial={{ opacity: 0, scale: 0.88, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.88, y: 16 }}
              transition={{ type: 'spring', stiffness: 360, damping: 28 }}
            >
              <div className="ff-panel-header">
                <div className="ff-panel-stripe" />
                <div className="ff-panel-header-inner">
                  <div className="ff-panel-av-wrap">
                    <div className="ff-panel-av"><Avatar size={38} /></div>
                    <span className="ff-panel-dot" />
                  </div>
                  <div className="ff-panel-info">
                    <div className="ff-panel-name">Freozinho</div>
                    <div className="ff-panel-sub"><span className="ff-sub-dot" />Online agora</div>
                  </div>
                  <div className="ff-panel-actions">
                    <button className="ff-icon-btn" onClick={handleClose} aria-label="Minimizar"><Minus size={15} /></button>
                    <button className="ff-icon-btn" onClick={handleClose} aria-label="Fechar"><X size={15} /></button>
                  </div>
                </div>
              </div>

              <div className="ff-messages" ref={bodyRef}>
                <div className="ff-date-label">Hoje</div>
                {messages.map(msg => (
                  <div key={msg.id} className={`ff-row ${msg.role === 'user' ? 'ff-row-out' : ''}`}>
                    {msg.role === 'bot' && <div className="ff-mini-av"><Avatar size={26} /></div>}
                    <div className="ff-msg-group">
                      {msg.imagePreview && (
                        <div className={`ff-img-preview-wrap ${msg.role === 'user' ? 'ff-img-out' : ''}`}>
                          <img src={msg.imagePreview} alt="imagem enviada" className="ff-img-preview" />
                        </div>
                      )}
                      {msg.text && msg.text !== '📎 Imagem enviada' && (
                        <div className={`ff-bubble ${msg.role === 'user' ? 'ff-bubble-out' : 'ff-bubble-in'}`}>
                          {msg.text}
                        </div>
                      )}
                      {msg.text === '📎 Imagem enviada' && !msg.imagePreview && (
                        <div className={`ff-bubble ${msg.role === 'user' ? 'ff-bubble-out' : 'ff-bubble-in'}`}>
                          {msg.text}
                        </div>
                      )}

                      {/* ── Cards de produto vindos do n8n ── */}
                      {msg.produtos && msg.produtos.length > 0 && (
                        <div className="ff-cards-wrap">
                          <div className="ff-cards-header">
                            <span className="ff-cards-label">
                              {msg.produtos.length} produto{msg.produtos.length > 1 ? 's' : ''} encontrado{msg.produtos.length > 1 ? 's' : ''}
                            </span>
                          </div>
                          {msg.produtos.map((p, i) => (
                            <ProductCard
                              key={p.id ?? i}
                              produto={p}
                              index={i}
                              onAsk={sendMessage}
                            />
                          ))}
                        </div>
                      )}

                      <div className={`ff-time ${msg.role === 'user' ? 'ff-time-out' : ''}`}>
                        {msg.role === 'user' && <span className="ff-checks">✓✓</span>}
                        {msg.time}
                      </div>
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="ff-row">
                    <div className="ff-mini-av"><Avatar size={26} /></div>
                    <div className="ff-typing">
                      <span className="ff-dot" /><span className="ff-dot" /><span className="ff-dot" />
                    </div>
                  </div>
                )}
                {error && <div className="ff-error">{error}</div>}
              </div>

              <div className="ff-qr-zone">
                {QUICK_REPLIES.map(qr => (
                  <button key={qr} className="ff-qr" onClick={() => sendMessage(qr)}>{qr}</button>
                ))}
              </div>

              {pendingImage && (
                <div className="ff-pending-img">
                  <img src={pendingImage.preview} alt="imagem a enviar" className="ff-pending-thumb" />
                  <div className="ff-pending-label"><ImageIcon size={11} />Imagem pronta para enviar</div>
                  <button className="ff-pending-remove" onClick={() => setPendingImage(null)} aria-label="Remover imagem">
                    <X size={12} />
                  </button>
                </div>
              )}

              <div className="ff-input-zone">
                <button className="ff-attach-btn" aria-label="Enviar imagem" onClick={() => fileInputRef.current?.click()} title="Anexar imagem (ou cole com Ctrl+V)">
                  <Paperclip size={15} />
                </button>
                <textarea
                  ref={inputRef}
                  className="ff-textarea"
                  value={inputVal}
                  onChange={e => setInputVal(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder={pendingImage ? 'Adicione uma legenda... (opcional)' : 'Mensagem para o Freozinho...'}
                  rows={1}
                  disabled={loading}
                />
                <button className="ff-send-btn" onClick={handleSubmit} disabled={loading || (!inputVal.trim() && !pendingImage)} aria-label="Enviar">
                  <Send size={15} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Balão callout ── */}
        <AnimatePresence>
          {calloutVisible && !open && (
            <motion.div
              className="ff-callout"
              initial={{ opacity: 0, x: 16, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 16, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26, delay: 1.2 }}
              onClick={handleOpen} role="button" tabIndex={0} aria-label="Abrir chat"
              onKeyDown={e => e.key === 'Enter' && handleOpen()}
            >
              <div className="ff-callout-av"><Avatar size={30} /></div>
              <div className="ff-callout-body">
                <div className="ff-callout-name">Freozinho</div>
                <AnimatePresence mode="wait">
                  <motion.div key={calloutIdx} className="ff-callout-msg" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }}>
                    {CALLOUT_MSGS[calloutIdx]}
                  </motion.div>
                </AnimatePresence>
              </div>
              <button className="ff-callout-x" onClick={e => { e.stopPropagation(); setCalloutVisible(false); }} aria-label="Fechar aviso">
                <X size={12} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── FAB ── */}
        <motion.button
          className="ff-fab"
          onClick={open ? handleClose : handleOpen}
          aria-label={open ? 'Fechar chat' : 'Abrir chat Freo Figures'}
          initial={{ scale: 0, rotate: -15 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 360, damping: 24, delay: 0.6 }}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.93 }}
        >
          <span className="ff-fab-ring" />
          <span className="ff-fab-f">F</span>
          {badge > 0 && !open && (
            <motion.span className="ff-fab-badge" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 22, delay: 1 }}>
              {badge}
            </motion.span>
          )}
        </motion.button>

      </div>
    </>
  );
}

// ─── CSS ─────────────────────────────────────────────────────────────────────

const WIDGET_CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&display=swap');

.ff-widget-root {
  position: fixed; bottom: 28px; right: 28px; z-index: 9000;
  display: flex; flex-direction: column; align-items: flex-end; gap: 12px;
  font-family: 'DM Sans', system-ui, sans-serif;
}
.ff-panel {
  width: 340px; background: #0e0e0f;
  border: 1px solid rgba(221,175,52,0.2); border-radius: 18px 18px 4px 18px;
  display: flex; flex-direction: column; overflow: hidden; transform-origin: bottom right;
  box-shadow: 0 8px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(221,175,52,0.06);
}
.ff-panel-stripe { height: 3px; background: #DDAF34; width: 100%; flex-shrink: 0; }
.ff-panel-header { background: #111110; border-bottom: 1px solid rgba(221,175,52,0.1); flex-shrink: 0; }
.ff-panel-header-inner { display: flex; align-items: center; gap: 10px; padding: 12px 14px; }
.ff-panel-av-wrap { position: relative; flex-shrink: 0; }
.ff-panel-av { width: 42px; height: 42px; border-radius: 50%; border: 2px solid #DDAF34; background: #DDAF34; overflow: hidden; display: flex; align-items: center; justify-content: center; }
.ff-panel-dot { position: absolute; bottom: 1px; right: 1px; width: 10px; height: 10px; background: #c8ff3e; border-radius: 50%; border: 2px solid #111110; animation: ff-pulse-dot 2.5s infinite; }
@keyframes ff-pulse-dot { 0%, 100% { box-shadow: 0 0 0 0 rgba(200,255,62,0.5); } 50% { box-shadow: 0 0 0 5px rgba(200,255,62,0); } }
.ff-panel-info { flex: 1; min-width: 0; }
.ff-panel-name { font-size: 13px; font-weight: 700; color: #f0efeb; display: flex; align-items: center; gap: 5px; line-height: 1; }
.ff-panel-sub { font-size: 10px; color: rgba(200,255,62,0.75); margin-top: 3px; display: flex; align-items: center; gap: 4px; line-height: 1; }
.ff-sub-dot { width: 5px; height: 5px; background: #c8ff3e; border-radius: 50%; flex-shrink: 0; }
.ff-panel-actions { display: flex; gap: 2px; }
.ff-icon-btn { width: 30px; height: 30px; border: none; background: transparent; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: rgba(240,239,235,0.35); transition: background 0.15s, color 0.15s; }
.ff-icon-btn:hover { background: rgba(221,175,52,0.1); color: #DDAF34; }

.ff-messages { flex: 1; overflow-y: auto; padding: 14px 12px 8px; display: flex; flex-direction: column; gap: 8px; min-height: 240px; max-height: 360px; scrollbar-width: thin; scrollbar-color: rgba(221,175,52,0.12) transparent; }
.ff-date-label { text-align: center; font-size: 9px; color: rgba(240,239,235,0.2); letter-spacing: 0.08em; text-transform: uppercase; font-weight: 500; margin-bottom: 4px; }
.ff-row { display: flex; align-items: flex-start; gap: 6px; }
.ff-row-out { flex-direction: row-reverse; }
.ff-mini-av { width: 26px; height: 26px; border-radius: 50%; overflow: hidden; flex-shrink: 0; background: #DDAF34; margin-top: 2px; }
.ff-msg-group { display: flex; flex-direction: column; max-width: 268px; }
.ff-bubble { padding: 9px 12px; font-size: 12.5px; line-height: 1.55; word-break: break-word; }
.ff-bubble-in { background: #181818; border: 1px solid rgba(221,175,52,0.1); border-radius: 14px 14px 14px 3px; color: #f0efeb; }
.ff-bubble-out { background: #DDAF34; color: #0e0e0f; font-weight: 500; border-radius: 14px 14px 3px 14px; align-self: flex-end; }
.ff-time { font-size: 9px; color: rgba(240,239,235,0.25); margin-top: 3px; display: flex; align-items: center; gap: 3px; padding-left: 2px; }
.ff-time-out { justify-content: flex-end; color: rgba(14,14,15,0.4); padding-left: 0; padding-right: 2px; }
.ff-checks { opacity: 0.8; }
.ff-img-preview-wrap { max-width: 210px; margin-bottom: 4px; }
.ff-img-out { display: flex; justify-content: flex-end; }
.ff-img-preview { max-width: 100%; border-radius: 10px; display: block; border: 1px solid rgba(221,175,52,0.2); }
.ff-typing { background: #181818; border: 1px solid rgba(221,175,52,0.1); border-radius: 14px 14px 14px 3px; padding: 10px 14px; display: flex; gap: 4px; align-items: center; }
.ff-dot { width: 5px; height: 5px; border-radius: 50%; background: #DDAF34; opacity: 0.5; animation: ff-bounce 1.3s infinite; }
.ff-dot:nth-child(2) { animation-delay: 0.18s; }
.ff-dot:nth-child(3) { animation-delay: 0.36s; }
@keyframes ff-bounce { 0%, 70%, 100% { transform: translateY(0); opacity: 0.5; } 35% { transform: translateY(-5px); opacity: 1; } }
.ff-error { font-size: 11px; color: rgba(255,80,80,0.75); text-align: center; padding: 4px 8px; background: rgba(255,80,80,0.07); border-radius: 6px; border: 1px solid rgba(255,80,80,0.15); }
.ff-qr-zone { padding: 4px 12px 10px; display: flex; flex-wrap: wrap; gap: 6px; flex-shrink: 0; }
.ff-qr { font-size: 11px; font-weight: 500; color: #DDAF34; border: 1px solid rgba(221,175,52,0.25); border-radius: 999px; padding: 5px 12px; background: transparent; cursor: pointer; transition: all 0.15s; font-family: 'DM Sans', system-ui, sans-serif; white-space: nowrap; }
.ff-qr:hover { background: rgba(221,175,52,0.1); border-color: rgba(221,175,52,0.5); }
.ff-qr:active { transform: scale(0.96); }
.ff-pending-img { margin: 0 12px 8px; padding: 8px 10px; background: rgba(221,175,52,0.06); border: 1px solid rgba(221,175,52,0.2); border-radius: 10px; display: flex; align-items: center; gap: 8px; position: relative; flex-shrink: 0; }
.ff-pending-thumb { width: 40px; height: 40px; object-fit: cover; border-radius: 6px; flex-shrink: 0; }
.ff-pending-label { font-size: 10.5px; color: rgba(221,175,52,0.75); display: flex; align-items: center; gap: 4px; flex: 1; }
.ff-pending-remove { background: transparent; border: none; cursor: pointer; color: rgba(240,239,235,0.3); display: flex; align-items: center; justify-content: center; padding: 4px; border-radius: 50%; transition: color 0.15s, background 0.15s; }
.ff-pending-remove:hover { color: #f0efeb; background: rgba(255,80,80,0.12); }
.ff-input-zone { background: #0a0a0b; border-top: 1px solid rgba(221,175,52,0.1); padding: 10px 12px; display: flex; align-items: flex-end; gap: 8px; flex-shrink: 0; }
.ff-attach-btn { width: 32px; height: 32px; border-radius: 50%; background: transparent; border: 1px solid rgba(221,175,52,0.15); cursor: pointer; display: flex; align-items: center; justify-content: center; color: rgba(240,239,235,0.3); transition: all 0.15s; flex-shrink: 0; margin-bottom: 2px; }
.ff-attach-btn:hover { border-color: rgba(221,175,52,0.45); color: #DDAF34; }
.ff-textarea { flex: 1; min-height: 36px; max-height: 80px; background: #1a1a1a; border: 1px solid rgba(221,175,52,0.15); border-radius: 18px; padding: 8px 14px; font-size: 12.5px; color: #f0efeb; font-family: 'DM Sans', system-ui, sans-serif; outline: none; resize: none; overflow-y: auto; line-height: 1.5; transition: border-color 0.2s; scrollbar-width: none; }
.ff-textarea::placeholder { color: rgba(240,239,235,0.22); }
.ff-textarea:focus { border-color: rgba(221,175,52,0.45); }
.ff-textarea:disabled { opacity: 0.5; }
.ff-send-btn { width: 36px; height: 36px; border-radius: 50%; background: #DDAF34; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #0e0e0f; transition: background 0.15s, transform 0.1s; flex-shrink: 0; }
.ff-send-btn:hover:not(:disabled) { background: #c8ff3e; }
.ff-send-btn:active:not(:disabled) { transform: scale(0.92); }
.ff-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.ff-callout { background: #0e0e0f; border: 1px solid rgba(221,175,52,0.22); border-radius: 14px 14px 4px 14px; padding: 10px 34px 10px 12px; display: flex; align-items: center; gap: 9px; cursor: pointer; position: relative; transition: border-color 0.2s; box-shadow: 0 4px 20px rgba(0,0,0,0.4); max-width: 230px; }
.ff-callout:hover { border-color: rgba(221,175,52,0.45); }
.ff-callout-av { width: 32px; height: 32px; border-radius: 50%; background: #DDAF34; overflow: hidden; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.ff-callout-body { min-width: 0; }
.ff-callout-name { font-size: 10px; font-weight: 700; color: #DDAF34; letter-spacing: 0.04em; line-height: 1; }
.ff-callout-msg { font-size: 11.5px; color: rgba(240,239,235,0.7); margin-top: 3px; line-height: 1.35; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ff-callout-x { position: absolute; top: 6px; right: 7px; background: transparent; border: none; cursor: pointer; color: rgba(240,239,235,0.25); display: flex; align-items: center; justify-content: center; padding: 2px; transition: color 0.15s; }
.ff-callout-x:hover { color: rgba(240,239,235,0.65); }
.ff-fab { width: 62px; height: 62px; border-radius: 50%; background: #DDAF34; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; position: relative; box-shadow: 0 4px 20px rgba(221,175,52,0.3); overflow: visible; transition: background 0.18s; }
.ff-fab:hover { background: #c8ff3e; }
.ff-fab-ring { position: absolute; inset: -5px; border-radius: 50%; border: 1.5px solid rgba(221,175,52,0.3); animation: ff-ring 3s infinite; pointer-events: none; }
@keyframes ff-ring { 0% { opacity: 0.8; transform: scale(1); } 60% { opacity: 0; transform: scale(1.22); } 100% { opacity: 0; transform: scale(1.22); } }
.ff-fab-f { font-family: 'DM Serif Display', Georgia, serif; font-size: 36px; color: #0e0e0f; font-style: italic; line-height: 1; user-select: none; letter-spacing: -0.02em; margin-top: 3px; }
.ff-fab-badge { position: absolute; top: -2px; right: -2px; width: 20px; height: 20px; background: #c8ff3e; border-radius: 50%; border: 2.5px solid #fff; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 700; color: #0e0e0f; pointer-events: none; z-index: 2; }

/* ── Cards de produto vindos do n8n ── */
.ff-cards-wrap { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; width: 260px; }
.ff-cards-header { display: flex; align-items: center; gap: 6px; margin-bottom: 2px; }
.ff-cards-label { font-size: 9.5px; font-weight: 600; color: rgba(221,175,52,0.55); letter-spacing: 0.06em; text-transform: uppercase; }

.ff-product-card { background: #111110; border: 1px solid rgba(221,175,52,0.18); border-radius: 12px; overflow: hidden; transition: border-color 0.18s, box-shadow 0.18s; }
.ff-product-card:hover { border-color: rgba(221,175,52,0.45); box-shadow: 0 4px 16px rgba(221,175,52,0.08); }

.ff-product-img-wrap { position: relative; width: 100%; height: 120px; background: #0e0e0f; overflow: hidden; }
.ff-product-img { width: 100%; height: 100%; object-fit: cover; display: block; border-bottom: 1px solid rgba(221,175,52,0.08); transition: transform 0.3s ease; }
.ff-product-card:hover .ff-product-img { transform: scale(1.03); }
.ff-product-img-fallback { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #0e0e0f; }

.ff-product-variante-badge { position: absolute; bottom: 6px; left: 6px; background: rgba(14,14,15,0.85); border: 1px solid rgba(221,175,52,0.25); border-radius: 999px; padding: 2px 7px; font-size: 9px; font-weight: 600; color: rgba(221,175,52,0.8); display: flex; align-items: center; gap: 3px; backdrop-filter: blur(4px); max-width: calc(100% - 12px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.ff-product-body { padding: 8px 10px 6px; }
.ff-product-nome { font-size: 11px; font-weight: 600; color: #f0efeb; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.ff-product-preco { font-size: 13px; font-weight: 700; color: #DDAF34; margin-top: 4px; }

.ff-product-btn { display: flex; align-items: center; justify-content: center; gap: 5px; margin: 0 10px 10px; padding: 7px 0; background: #DDAF34; color: #0e0e0f; font-size: 11.5px; font-weight: 700; border-radius: 8px; border: none; cursor: pointer; width: calc(100% - 20px); text-decoration: none; transition: background 0.15s, transform 0.1s; font-family: 'DM Sans', system-ui, sans-serif; }
.ff-product-btn:hover { background: #c8ff3e; }
.ff-product-btn:active { transform: scale(0.97); }
.ff-product-btn-ask { background: transparent !important; border: 1px solid rgba(221,175,52,0.4) !important; color: #DDAF34 !important; }
.ff-product-btn-ask:hover { background: rgba(221,175,52,0.1) !important; border-color: rgba(221,175,52,0.7) !important; }

@media (max-width: 480px) {
  .ff-widget-root { bottom: 16px; right: 16px; }
  .ff-panel { width: calc(100vw - 32px); border-radius: 16px 16px 4px 16px; }
  .ff-cards-wrap { width: 100%; }
}
`;
