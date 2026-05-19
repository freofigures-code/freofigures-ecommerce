// ─────────────────────────────────────────────────────────────────────────────
// FREO FIGURES — CHAT WIDGET (FreoChat)
// ─────────────────────────────────────────────────────────────────────────────
//
// COMO USAR NO SEU App.tsx:
//
//   1. Coloque este arquivo em src/FreoChat.tsx (mesma pasta do App.tsx)
//
//   2. No App.tsx, importe logo abaixo dos outros imports:
//        import FreoChat from './FreoChat';
//
//   3. Cole <FreoChat /> logo antes do fechamento do return principal,
//      ANTES do </div> final do App:
//
//        return (
//          <div className="min-h-screen">
//            <CookieBanner />
//            <Navbar ... />
//            { currentView === 'home' ? <HomeView ... /> : <ShopView ... /> }
//            <Footer />
//            <AuthModal ... />
//            <CartDrawer ... />
//
//            <FreoChat />   // ← COLE AQUI
//          </div>
//        );
//
// 
//
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, Send, Paperclip, Minus } from 'lucide-react';

// ─── CONFIG — EDITE AQUI ────────────────────────────────────────────────────

const N8N_WEBHOOK_URL = 'https://n8nwebhook.solviaoficial.com/webhook/freozinho';
// Exemplo: 'https://n8nwebhook.solviaoficial.com/webhook/freo-chat-uuid'

// ID único da sessão — mantém contexto por aba/visita
const SESSION_ID = (() => {
  const key = 'freo_session_id';
  let id = sessionStorage.getItem(key);
  if (!id) { id = crypto.randomUUID(); sessionStorage.setItem(key, id); }
  return id;
})();

// ─── TIPOS ──────────────────────────────────────────────────────────────────

type Message = {
  id: string;
  role: 'user' | 'bot';
  text: string;
  time: string;
};

// ─── HELPERS ────────────────────────────────────────────────────────────────

const now = () => {
  const d = new Date();
  return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
};

const uid = () => Math.random().toString(36).slice(2);

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

// ─── MASCOTE SVG (inline, sem dependências externas) ────────────────────────

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [badge, setBadge] = useState(1);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Rotaciona callout
  useEffect(() => {
    if (!calloutVisible) return;
    const t = setInterval(() => {
      setCalloutIdx(i => (i + 1) % CALLOUT_MSGS.length);
    }, 4000);
    return () => clearInterval(t);
  }, [calloutVisible]);

  // Scroll ao fundo
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, loading]);

  // Foca input ao abrir
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 120);
  }, [open]);

  const handleOpen = () => {
    setOpen(true);
    setBadge(0);
    setCalloutVisible(false);
  };

  const handleClose = () => setOpen(false);

  // ── Envio de mensagem ────────────────────────────────────────────────────

  const sendMessage = async (text: string) => {
    const clean = text.trim();
    if (!clean || loading) return;

    setInputVal('');
    setError('');

    const userMsg: Message = { id: uid(), role: 'user', text: clean, time: now() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: SESSION_ID,
          message: clean,
          timestamp: new Date().toISOString(),
          source: 'freo-widget',
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();

      // Aceita { reply: "..." } ou { message: "..." } ou string pura
      const reply =
        typeof data === 'string'
          ? data
          : data.reply ?? data.message ?? data.output ?? data.text ?? 'Recebi! Logo te respondo.';

      setMessages(prev => [...prev, { id: uid(), role: 'bot', text: reply, time: now() }]);
    } catch (err) {
      console.error('[FreoChat] n8n error:', err);
      setError('Ops, tive um problema de conexão. Tenta de novo?');
      setMessages(prev => [
        ...prev,
        {
          id: uid(),
          role: 'bot',
          text: 'Eita, tive uma falha aqui. Me chama no WhatsApp: (11) 94645-4111.',
          time: now(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = () => sendMessage(inputVal);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // ────────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Estilos injetados (independente do Tailwind) ── */}
      <style>{WIDGET_CSS}</style>

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
              {/* Header */}
              <div className="ff-panel-header">
                <div className="ff-panel-stripe" />
                <div className="ff-panel-header-inner">
                  <div className="ff-panel-av-wrap">
                    <div className="ff-panel-av">
                      <FreoFace size={38} />
                    </div>
                    <span className="ff-panel-dot" />
                  </div>
                  <div className="ff-panel-info">
                    <div className="ff-panel-name">
                      Freozinho
                      <span className="ff-ai-pill">IA</span>
                    </div>
                    <div className="ff-panel-sub">
                      <span className="ff-sub-dot" />
                      Online agora · n8n powered
                    </div>
                  </div>
                  <div className="ff-panel-actions">
                    <button className="ff-icon-btn" onClick={handleClose} aria-label="Minimizar">
                      <Minus size={15} />
                    </button>
                    <button className="ff-icon-btn" onClick={handleClose} aria-label="Fechar">
                      <X size={15} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Corpo das mensagens */}
              <div className="ff-messages" ref={bodyRef}>
                <div className="ff-date-label">Hoje</div>

                {messages.map(msg => (
                  <div key={msg.id} className={`ff-row ${msg.role === 'user' ? 'ff-row-out' : ''}`}>
                    {msg.role === 'bot' && (
                      <div className="ff-mini-av"><FreoFace size={26} /></div>
                    )}
                    <div>
                      <div className={`ff-bubble ${msg.role === 'user' ? 'ff-bubble-out' : 'ff-bubble-in'}`}>
                        {msg.text}
                      </div>
                      <div className={`ff-time ${msg.role === 'user' ? 'ff-time-out' : ''}`}>
                        {msg.role === 'user' && <span className="ff-checks">✓✓</span>}
                        {msg.time}
                      </div>
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="ff-row">
                    <div className="ff-mini-av"><FreoFace size={26} /></div>
                    <div className="ff-typing">
                      <span className="ff-dot" /><span className="ff-dot" /><span className="ff-dot" />
                    </div>
                  </div>
                )}

                {error && <div className="ff-error">{error}</div>}
              </div>

              {/* Quick replies */}
              <div className="ff-qr-zone">
                {QUICK_REPLIES.map(qr => (
                  <button key={qr} className="ff-qr" onClick={() => sendMessage(qr)}>
                    {qr}
                  </button>
                ))}
              </div>

              {/* Barra n8n */}
              <div className="ff-n8n-bar">
                <span className="ff-n8n-dot" />
                <span className="ff-n8n-label">IA via n8n</span>
                <span className="ff-n8n-sep" />
                <span className="ff-n8n-model">Agente conectado</span>
              </div>

              {/* Input */}
              <div className="ff-input-zone">
                <button className="ff-attach-btn" aria-label="Enviar imagem">
                  <Paperclip size={15} />
                </button>
                <textarea
                  ref={inputRef}
                  className="ff-textarea"
                  value={inputVal}
                  onChange={e => setInputVal(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Mensagem para o Freozinho..."
                  rows={1}
                  disabled={loading}
                />
                <button
                  className="ff-send-btn"
                  onClick={handleSubmit}
                  disabled={loading || !inputVal.trim()}
                  aria-label="Enviar"
                >
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
              onClick={handleOpen}
              role="button"
              tabIndex={0}
              aria-label="Abrir chat"
              onKeyDown={e => e.key === 'Enter' && handleOpen()}
            >
              <div className="ff-callout-av">
                <FreoFace size={30} />
              </div>
              <div className="ff-callout-body">
                <div className="ff-callout-name">Freozinho <span className="ff-ai-pill">IA</span></div>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={calloutIdx}
                    className="ff-callout-msg"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.2 }}
                  >
                    {CALLOUT_MSGS[calloutIdx]}
                  </motion.div>
                </AnimatePresence>
              </div>
              <button
                className="ff-callout-x"
                onClick={e => { e.stopPropagation(); setCalloutVisible(false); }}
                aria-label="Fechar aviso"
              >
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
            <motion.span
              className="ff-fab-badge"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 22, delay: 1 }}
            >
              {badge}
            </motion.span>
          )}
        </motion.button>

      </div>
    </>
  );
}

// ─── CSS INJETADO ────────────────────────────────────────────────────────────
// Isolado com prefixo ff- para não conflitar com Tailwind

const WIDGET_CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&display=swap');

.ff-widget-root {
  position: fixed;
  bottom: 28px;
  right: 28px;
  z-index: 9000;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12px;
  font-family: 'DM Sans', system-ui, sans-serif;
}

/* ── Painel ── */
.ff-panel {
  width: 340px;
  background: #0e0e0f;
  border: 1px solid rgba(221,175,52,0.2);
  border-radius: 18px 18px 4px 18px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transform-origin: bottom right;
  box-shadow: 0 8px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(221,175,52,0.06);
}

.ff-panel-stripe {
  height: 3px;
  background: #DDAF34;
  width: 100%;
  flex-shrink: 0;
}

.ff-panel-header {
  background: #111110;
  border-bottom: 1px solid rgba(221,175,52,0.1);
  flex-shrink: 0;
}

.ff-panel-header-inner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
}

.ff-panel-av-wrap { position: relative; flex-shrink: 0; }

.ff-panel-av {
  width: 42px; height: 42px;
  border-radius: 50%;
  border: 2px solid #DDAF34;
  background: #DDAF34;
  overflow: hidden;
  display: flex; align-items: center; justify-content: center;
}

.ff-panel-dot {
  position: absolute;
  bottom: 1px; right: 1px;
  width: 10px; height: 10px;
  background: #c8ff3e;
  border-radius: 50%;
  border: 2px solid #111110;
  animation: ff-pulse-dot 2.5s infinite;
}

@keyframes ff-pulse-dot {
  0%, 100% { box-shadow: 0 0 0 0 rgba(200,255,62,0.5); }
  50%       { box-shadow: 0 0 0 5px rgba(200,255,62,0); }
}

.ff-panel-info { flex: 1; min-width: 0; }

.ff-panel-name {
  font-size: 13px;
  font-weight: 700;
  color: #f0efeb;
  display: flex;
  align-items: center;
  gap: 5px;
  line-height: 1;
}

.ff-ai-pill {
  font-size: 8px;
  font-weight: 700;
  background: rgba(200,255,62,0.12);
  color: #c8ff3e;
  border: 1px solid rgba(200,255,62,0.28);
  border-radius: 4px;
  padding: 1px 5px;
  letter-spacing: 0.06em;
  line-height: 1.7;
  text-transform: uppercase;
}

.ff-panel-sub {
  font-size: 10px;
  color: rgba(200,255,62,0.75);
  margin-top: 3px;
  display: flex;
  align-items: center;
  gap: 4px;
  line-height: 1;
}

.ff-sub-dot {
  width: 5px; height: 5px;
  background: #c8ff3e;
  border-radius: 50%;
  flex-shrink: 0;
}

.ff-panel-actions {
  display: flex;
  gap: 2px;
}

.ff-icon-btn {
  width: 30px; height: 30px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  color: rgba(240,239,235,0.35);
  transition: background 0.15s, color 0.15s;
}
.ff-icon-btn:hover { background: rgba(221,175,52,0.1); color: #DDAF34; }

/* ── Mensagens ── */
.ff-messages {
  flex: 1;
  overflow-y: auto;
  padding: 14px 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 240px;
  max-height: 280px;
  scrollbar-width: thin;
  scrollbar-color: rgba(221,175,52,0.12) transparent;
}

.ff-date-label {
  text-align: center;
  font-size: 9px;
  color: rgba(240,239,235,0.2);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 500;
  margin-bottom: 4px;
}

.ff-row {
  display: flex;
  align-items: flex-end;
  gap: 6px;
}

.ff-row-out {
  flex-direction: row-reverse;
}

.ff-mini-av {
  width: 26px; height: 26px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  background: #DDAF34;
}

.ff-bubble {
  max-width: 210px;
  padding: 9px 12px;
  font-size: 12.5px;
  line-height: 1.55;
  word-break: break-word;
}

.ff-bubble-in {
  background: #181818;
  border: 1px solid rgba(221,175,52,0.1);
  border-radius: 14px 14px 14px 3px;
  color: #f0efeb;
}

.ff-bubble-out {
  background: #DDAF34;
  color: #0e0e0f;
  font-weight: 500;
  border-radius: 14px 14px 3px 14px;
}

.ff-time {
  font-size: 9px;
  color: rgba(240,239,235,0.25);
  margin-top: 3px;
  display: flex;
  align-items: center;
  gap: 3px;
  padding-left: 2px;
}

.ff-time-out {
  justify-content: flex-end;
  color: rgba(14,14,15,0.4);
  padding-left: 0;
  padding-right: 2px;
}

.ff-checks { opacity: 0.8; }

/* ── Typing ── */
.ff-typing {
  background: #181818;
  border: 1px solid rgba(221,175,52,0.1);
  border-radius: 14px 14px 14px 3px;
  padding: 10px 14px;
  display: flex;
  gap: 4px;
  align-items: center;
}

.ff-dot {
  width: 5px; height: 5px;
  border-radius: 50%;
  background: #DDAF34;
  opacity: 0.5;
  animation: ff-bounce 1.3s infinite;
}
.ff-dot:nth-child(2) { animation-delay: 0.18s; }
.ff-dot:nth-child(3) { animation-delay: 0.36s; }

@keyframes ff-bounce {
  0%, 70%, 100% { transform: translateY(0); opacity: 0.5; }
  35%            { transform: translateY(-5px); opacity: 1; }
}

.ff-error {
  font-size: 11px;
  color: rgba(255,80,80,0.75);
  text-align: center;
  padding: 4px 8px;
  background: rgba(255,80,80,0.07);
  border-radius: 6px;
  border: 1px solid rgba(255,80,80,0.15);
}

/* ── Quick replies ── */
.ff-qr-zone {
  padding: 4px 12px 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex-shrink: 0;
}

.ff-qr {
  font-size: 11px;
  font-weight: 500;
  color: #DDAF34;
  border: 1px solid rgba(221,175,52,0.25);
  border-radius: 999px;
  padding: 5px 12px;
  background: transparent;
  cursor: pointer;
  transition: all 0.15s;
  font-family: 'DM Sans', system-ui, sans-serif;
  white-space: nowrap;
}
.ff-qr:hover { background: rgba(221,175,52,0.1); border-color: rgba(221,175,52,0.5); }
.ff-qr:active { transform: scale(0.96); }

/* ── Barra n8n ── */
.ff-n8n-bar {
  padding: 6px 14px;
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(0,0,0,0.2);
  border-top: 1px solid rgba(221,175,52,0.07);
  flex-shrink: 0;
}

.ff-n8n-dot {
  width: 6px; height: 6px;
  background: #c8ff3e;
  border-radius: 50%;
  flex-shrink: 0;
  animation: ff-pulse-dot 2.5s infinite;
}

.ff-n8n-label {
  font-size: 9px;
  color: rgba(200,255,62,0.5);
  letter-spacing: 0.07em;
  text-transform: uppercase;
  font-weight: 600;
}

.ff-n8n-sep {
  width: 1px; height: 10px;
  background: rgba(221,175,52,0.15);
}

.ff-n8n-model {
  font-size: 9px;
  color: rgba(221,175,52,0.35);
  letter-spacing: 0.04em;
}

/* ── Input ── */
.ff-input-zone {
  background: #0a0a0b;
  border-top: 1px solid rgba(221,175,52,0.1);
  padding: 10px 12px;
  display: flex;
  align-items: flex-end;
  gap: 8px;
  flex-shrink: 0;
}

.ff-attach-btn {
  width: 32px; height: 32px;
  border-radius: 50%;
  background: transparent;
  border: 1px solid rgba(221,175,52,0.15);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  color: rgba(240,239,235,0.3);
  transition: all 0.15s;
  flex-shrink: 0;
  margin-bottom: 2px;
}
.ff-attach-btn:hover { border-color: rgba(221,175,52,0.45); color: #DDAF34; }

.ff-textarea {
  flex: 1;
  min-height: 36px;
  max-height: 80px;
  background: #1a1a1a;
  border: 1px solid rgba(221,175,52,0.15);
  border-radius: 18px;
  padding: 8px 14px;
  font-size: 12.5px;
  color: #f0efeb;
  font-family: 'DM Sans', system-ui, sans-serif;
  outline: none;
  resize: none;
  overflow-y: auto;
  line-height: 1.5;
  transition: border-color 0.2s;
  scrollbar-width: none;
}
.ff-textarea::placeholder { color: rgba(240,239,235,0.22); }
.ff-textarea:focus { border-color: rgba(221,175,52,0.45); }
.ff-textarea:disabled { opacity: 0.5; }

.ff-send-btn {
  width: 36px; height: 36px;
  border-radius: 50%;
  background: #DDAF34;
  border: none;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  color: #0e0e0f;
  transition: background 0.15s, transform 0.1s;
  flex-shrink: 0;
}
.ff-send-btn:hover:not(:disabled) { background: #c8ff3e; }
.ff-send-btn:active:not(:disabled) { transform: scale(0.92); }
.ff-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* ── Callout ── */
.ff-callout {
  background: #0e0e0f;
  border: 1px solid rgba(221,175,52,0.22);
  border-radius: 14px 14px 4px 14px;
  padding: 10px 34px 10px 12px;
  display: flex;
  align-items: center;
  gap: 9px;
  cursor: pointer;
  position: relative;
  transition: border-color 0.2s;
  box-shadow: 0 4px 20px rgba(0,0,0,0.4);
  max-width: 230px;
}
.ff-callout:hover { border-color: rgba(221,175,52,0.45); }

.ff-callout-av {
  width: 32px; height: 32px;
  border-radius: 50%;
  background: #DDAF34;
  overflow: hidden;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}

.ff-callout-body { min-width: 0; }

.ff-callout-name {
  font-size: 10px;
  font-weight: 700;
  color: #DDAF34;
  letter-spacing: 0.04em;
  line-height: 1;
  display: flex;
  align-items: center;
  gap: 4px;
}

.ff-callout-msg {
  font-size: 11.5px;
  color: rgba(240,239,235,0.7);
  margin-top: 3px;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ff-callout-x {
  position: absolute;
  top: 6px; right: 7px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: rgba(240,239,235,0.25);
  display: flex; align-items: center; justify-content: center;
  padding: 2px;
  transition: color 0.15s;
}
.ff-callout-x:hover { color: rgba(240,239,235,0.65); }

/* ── FAB ── */
.ff-fab {
  width: 62px; height: 62px;
  border-radius: 50%;
  background: #DDAF34;
  border: none;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  position: relative;
  box-shadow: 0 4px 20px rgba(221,175,52,0.3);
  overflow: visible;
  transition: background 0.18s;
}
.ff-fab:hover { background: #c8ff3e; }

.ff-fab-ring {
  position: absolute;
  inset: -5px;
  border-radius: 50%;
  border: 1.5px solid rgba(221,175,52,0.3);
  animation: ff-ring 3s infinite;
  pointer-events: none;
}

@keyframes ff-ring {
  0%   { opacity: 0.8; transform: scale(1); }
  60%  { opacity: 0;   transform: scale(1.22); }
  100% { opacity: 0;   transform: scale(1.22); }
}

.ff-fab-f {
  font-family: 'DM Serif Display', Georgia, serif;
  font-size: 36px;
  color: #0e0e0f;
  font-style: italic;
  line-height: 1;
  user-select: none;
  letter-spacing: -0.02em;
  margin-top: 3px;
}

.ff-fab-badge {
  position: absolute;
  top: -2px; right: -2px;
  width: 20px; height: 20px;
  background: #c8ff3e;
  border-radius: 50%;
  border: 2.5px solid #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 9px;
  font-weight: 700;
  color: #0e0e0f;
  font-family: 'DM Sans', system-ui, sans-serif;
  pointer-events: none;
  z-index: 2;
}

/* ── Mobile ── */
@media (max-width: 480px) {
  .ff-widget-root { bottom: 16px; right: 16px; }
  .ff-panel { width: calc(100vw - 32px); border-radius: 16px 16px 4px 16px; }
}
`;
