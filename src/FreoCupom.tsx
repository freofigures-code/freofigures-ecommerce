// src/FreoCupom.tsx
// Tela de resgate de cupom — acessada via /cupom?code=XXXX
// Tema 'geek': animação de loot desbloqueado + confetes coloridos
// Tema 'religioso': animação de luz dourada + partículas suaves

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Gift, Star, ShoppingCart, Check, AlertCircle, Loader2 } from 'lucide-react';

// ─── Confete puro via canvas (sem dependência extra) ────────────────────────
function fireConfetti(theme: 'geek' | 'religioso') {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:99999;';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors = theme === 'geek'
    ? ['#00f5ff', '#7b2fff', '#ff00ff', '#00ff88', '#ffff00', '#ff4400']
    : ['#DDAF34', '#fff5e0', '#c8a000', '#f5d675', '#fffacd', '#e8c840'];

  const particles: { x:number; y:number; vx:number; vy:number; color:string; size:number; alpha:number; rot:number; rotV:number }[] = [];

  for (let i = 0; i < 180; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: -20,
      vx: (Math.random() - 0.5) * 6,
      vy: Math.random() * 4 + 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: Math.random() * 10 + 5,
      alpha: 1,
      rot: Math.random() * Math.PI * 2,
      rotV: (Math.random() - 0.5) * 0.2,
    });
  }

  let frame = 0;
  const animate = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.1;
      p.rot += p.rotV;
      p.alpha -= 0.008;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    });
    frame++;
    if (frame < 220) requestAnimationFrame(animate);
    else canvas.remove();
  };
  animate();
}

// ─── Tipos ──────────────────────────────────────────────────────────────────
type Coupon = {
  id: string;
  code: string;
  theme: 'geek' | 'religioso';
  type: 'free_product' | 'percent' | 'fixed';
  discount_value: number | null;
  description: string | null;
  max_uses: number;
  used_count: number;
  expires_at: string | null;
  is_active: boolean;
};

// ─── Animação GEEK ──────────────────────────────────────────────────────────
const GeekAnimation = ({ onDone }: { onDone: () => void }) => {
  useEffect(() => {
    fireConfetti('geek');
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#050510', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 9998 }}>
      {/* Grid lines background */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(0,245,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,245,255,0.05) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

      {/* Glow */}
      <div style={{ position: 'absolute', width: 400, height: 400, background: 'radial-gradient(circle, rgba(123,47,255,0.4) 0%, transparent 70%)', borderRadius: '50%' }} />

      <motion.div
        initial={{ scale: 0, rotate: -10 }}
        animate={{ scale: [0, 1.3, 1], rotate: [0, 5, 0] }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        style={{ fontSize: 80, lineHeight: 1, position: 'relative', zIndex: 1 }}
      >
        🎮
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.6 }}
        style={{ fontFamily: "'Orbitron', monospace", textAlign: 'center', padding: '0 24px', position: 'relative', zIndex: 1 }}
      >
        <div style={{ color: '#00f5ff', fontSize: 'clamp(18px, 5vw, 32px)', fontWeight: 900, letterSpacing: '0.05em', marginBottom: 8, textShadow: '0 0 30px rgba(0,245,255,0.8)' }}>
          VOCÊ DESBLOQUEOU
        </div>
        <div style={{ color: '#7b2fff', fontSize: 'clamp(14px, 3.5vw, 20px)', letterSpacing: '0.15em', textShadow: '0 0 20px rgba(123,47,255,0.8)' }}>
          UM LOOT NOVO E GRATUITO!
        </div>
        <motion.div
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.2, repeat: Infinity }}
          style={{ color: 'rgba(0,245,255,0.5)', fontSize: 12, marginTop: 20, letterSpacing: '0.3em', fontFamily: 'monospace' }}
        >
          &gt;&gt; CARREGANDO RECOMPENSA...
        </motion.div>
      </motion.div>
    </div>
  );
};

// ─── Animação RELIGIOSO ──────────────────────────────────────────────────────
const ReligiousAnimation = ({ onDone }: { onDone: () => void }) => {
  useEffect(() => {
    fireConfetti('religioso');
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'linear-gradient(160deg, #f5f0e8, #ede5d0)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 9998 }}>
      {/* Cruz pattern */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 50% 30%, rgba(221,175,52,0.15) 0%, transparent 60%)' }} />

      {/* Raios de luz */}
      {[0, 40, 80, 120, 160, 200, 240, 280, 320].map((angle) => (
        <motion.div
          key={angle}
          initial={{ opacity: 0, scaleY: 0 }}
          animate={{ opacity: [0, 0.3, 0], scaleY: [0, 1, 0] }}
          transition={{ delay: angle / 1800, duration: 2, repeat: 1 }}
          style={{
            position: 'absolute',
            width: 2,
            height: 300,
            background: 'linear-gradient(to bottom, rgba(221,175,52,0.8), transparent)',
            transformOrigin: 'top center',
            transform: `rotate(${angle}deg)`,
            top: '30%',
          }}
        />
      ))}

      <motion.div
        initial={{ scale: 0.3, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1, ease: 'easeOut' }}
        style={{ fontSize: 80, lineHeight: 1, position: 'relative', zIndex: 1, filter: 'drop-shadow(0 0 20px rgba(221,175,52,0.6))' }}
      >
        ✝️
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8, duration: 0.8 }}
        style={{ textAlign: 'center', padding: '0 24px', position: 'relative', zIndex: 1, fontFamily: "'Cinzel', serif" }}
      >
        <div style={{ color: '#5c3d0e', fontSize: 'clamp(18px, 5vw, 30px)', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 8 }}>
          UMA BÊNÇÃO PARA VOCÊ
        </div>
        <div style={{ color: '#8B6914', fontSize: 'clamp(13px, 3vw, 18px)', fontStyle: 'italic', letterSpacing: '0.08em' }}>
          Receba este presente com fé e gratidão
        </div>
        <motion.div
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 2, repeat: Infinity }}
          style={{ color: 'rgba(139,105,20,0.6)', fontSize: 12, marginTop: 20, letterSpacing: '0.2em', fontFamily: 'serif' }}
        >
          ✦ preparando seu presente ✦
        </motion.div>
      </motion.div>
    </div>
  );
};

// ─── Componente principal ────────────────────────────────────────────────────
export default function FreoCupom() {
  const [phase, setPhase] = useState<'loading' | 'animating' | 'reveal' | 'error'>('loading');
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [redeemed, setRedeemed] = useState(false);
  const [redeeming, setRedeeming] = useState(false);

  // Pega o code da URL: /cupom?code=XXXX
  const code = new URLSearchParams(window.location.search).get('_cupom')
    || new URLSearchParams(window.location.search).get('code')
    || '';

  useEffect(() => {
    if (!code) { setErrorMsg('Código não encontrado na URL.'); setPhase('error'); return; }
    const load = async () => {
      // @ts-ignore
      const supabase = window.supabaseClient || window.supabase;
      if (!supabase) { setErrorMsg('Erro de conexão com o servidor.'); setPhase('error'); return; }

      const { data, error } = await supabase
        .from('coupons')
        .select('*')
        .eq('code', code.toUpperCase().trim())
        .eq('is_active', true)
        .single();

      if (error || !data) { setErrorMsg('Cupom inválido ou expirado.'); setPhase('error'); return; }
      if (data.used_count >= data.max_uses) { setErrorMsg('Este cupom já foi utilizado o número máximo de vezes.'); setPhase('error'); return; }
      if (data.expires_at && new Date(data.expires_at) < new Date()) { setErrorMsg('Este cupom expirou.'); setPhase('error'); return; }

      setCoupon(data);
      setPhase('animating');
    };
    load();
  }, [code]);

  const handleRedeem = async () => {
    if (!coupon || redeeming) return;
    setRedeeming(true);
    // @ts-ignore
    const supabase = window.supabaseClient || window.supabase;

    // Cria sessão anônima se não logado
    let { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      const { data: anonData } = await supabase.auth.signInAnonymously();
      session = anonData?.session;
    }

    // Incrementa uso
    const { error: updateError } = await supabase
      .from('coupons')
      .update({ used_count: coupon.used_count + 1 })
      .eq('id', coupon.id)
      .lt('used_count', coupon.max_uses);

    if (updateError) { setErrorMsg('Erro ao resgatar o cupom. Tente novamente.'); setRedeeming(false); return; }

    // Registra resgate
    await supabase.from('coupon_redemptions').insert({
      coupon_id: coupon.id,
      user_id: session?.user?.id ?? null,
      session_info: { userAgent: navigator.userAgent, code: coupon.code },
    });

    // Salva no localStorage para o checkout usar
    localStorage.setItem('freo_active_coupon', JSON.stringify({
      code: coupon.code,
      type: coupon.type,
      discount_value: coupon.discount_value,
      description: coupon.description,
      theme: coupon.theme,
    }));

    setRedeemed(true);
    setRedeeming(false);
  };

  const goToShop = () => { window.location.href = '/'; };

  const benefitText = () => {
    if (!coupon) return '';
    if (coupon.type === 'free_product') return 'Produto GRÁTIS (você paga apenas o frete)';
    if (coupon.type === 'percent') return `${coupon.discount_value}% de desconto`;
    if (coupon.type === 'fixed') return `R$ ${coupon.discount_value?.toFixed(2).replace('.', ',')} de desconto`;
    return '';
  };

  // ── Fase: loading
  if (phase === 'loading') {
    return (
      <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <Loader2 style={{ width: 48, height: 48, color: '#DDAF34', animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace', fontSize: 14 }}>Validando cupom...</p>
      </div>
    );
  }

  // ── Fase: erro
  if (phase === 'error') {
    return (
      <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ background: '#161618', border: '1px solid rgba(233,69,96,0.3)', borderRadius: 12, padding: 40, maxWidth: 400, width: '100%', textAlign: 'center' }}>
          <AlertCircle style={{ width: 48, height: 48, color: '#e94560', margin: '0 auto 16px' }} />
          <h2 style={{ color: '#f0efeb', fontFamily: 'sans-serif', fontWeight: 700, marginBottom: 8 }}>Cupom inválido</h2>
          <p style={{ color: '#666663', fontFamily: 'sans-serif', fontSize: 14, marginBottom: 24 }}>{errorMsg}</p>
          <a href="/" style={{ display: 'inline-block', background: '#DDAF34', color: '#000', padding: '12px 28px', fontWeight: 700, textDecoration: 'none', borderRadius: 4, fontFamily: 'sans-serif', fontSize: 14, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Ir para a Loja
          </a>
        </div>
      </div>
    );
  }

  // ── Fase: animação
  if (phase === 'animating' && coupon) {
    return coupon.theme === 'geek'
      ? <GeekAnimation onDone={() => setPhase('reveal')} />
      : <ReligiousAnimation onDone={() => setPhase('reveal')} />;
  }

  // ── Fase: reveal (tela do cupom)
  if (phase === 'reveal' && coupon) {
    const isGeek = coupon.theme === 'geek';

    const styles = isGeek ? {
      bg: 'linear-gradient(135deg, #050510 0%, #0d0d25 100%)',
      cardBg: 'rgba(10,10,30,0.95)',
      cardBorder: 'rgba(0,245,255,0.25)',
      accent: '#00f5ff',
      accent2: '#7b2fff',
      titleColor: '#00f5ff',
      textColor: '#e0e0ff',
      subColor: '#7b2fff',
      btnBg: 'linear-gradient(135deg, #7b2fff, #00f5ff)',
      btnColor: '#fff',
      fontTitle: "'Orbitron', monospace",
      fontBody: "'Orbitron', monospace",
      tagline: '// RESGATE SEU LOOT',
      badgeLabel: '🎮 LOOT DESBLOQUEADO',
      shadow: '0 0 40px rgba(0,245,255,0.2)',
      inputBorder: 'rgba(0,245,255,0.3)',
    } : {
      bg: 'linear-gradient(160deg, #f5f0e8, #ede5d0)',
      cardBg: 'rgba(237,229,208,0.98)',
      cardBorder: 'rgba(139,105,20,0.3)',
      accent: '#8B6914',
      accent2: '#5c3d0e',
      titleColor: '#5c3d0e',
      textColor: '#3a2a0a',
      subColor: '#8B6914',
      btnBg: '#8B6914',
      btnColor: '#fff5e0',
      fontTitle: "'Cinzel', serif",
      fontBody: "'Cormorant Garamond', serif",
      tagline: '✦ UMA GRAÇA FOI RESERVADA PARA VOCÊ ✦',
      badgeLabel: '✝️ BÊNÇÃO ESPECIAL',
      shadow: '0 4px 40px rgba(139,105,20,0.15)',
      inputBorder: 'rgba(139,105,20,0.35)',
    };

    return (
      <div style={{ minHeight: '100vh', background: styles.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: styles.fontBody }}>
        {/* Fontes */}
        {isGeek && <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&display=swap" />}
        {!isGeek && <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Cormorant+Garamond:ital,wght@0,300;1,300&display=swap" />}

        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          style={{ background: styles.cardBg, border: `1px solid ${styles.cardBorder}`, borderRadius: 16, padding: 'clamp(24px, 5vw, 48px)', maxWidth: 460, width: '100%', boxShadow: styles.shadow, backdropFilter: 'blur(12px)' }}
        >
          {/* Badge */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 100, border: `1px solid ${styles.cardBorder}`, marginBottom: 24, fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', color: styles.accent, background: `${styles.accent}10` }}>
            {styles.badgeLabel}
          </div>

          {/* Tagline */}
          <div style={{ color: styles.subColor, fontSize: 11, letterSpacing: '0.2em', marginBottom: 8, fontFamily: styles.fontTitle }}>{styles.tagline}</div>

          {/* Benefício principal */}
          <motion.h1
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            style={{ color: styles.titleColor, fontFamily: styles.fontTitle, fontWeight: 900, fontSize: 'clamp(20px, 5vw, 28px)', lineHeight: 1.2, marginBottom: 12, textShadow: isGeek ? `0 0 20px ${styles.accent}80` : 'none' }}
          >
            {benefitText()}
          </motion.h1>

          {/* Descrição */}
          {coupon.description && (
            <p style={{ color: styles.textColor, opacity: 0.7, fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>{coupon.description}</p>
          )}

          {/* Código */}
          <div style={{ background: isGeek ? 'rgba(0,0,0,0.5)' : 'rgba(139,105,20,0.08)', border: `1px solid ${styles.inputBorder}`, borderRadius: 8, padding: '16px 20px', marginBottom: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 11, letterSpacing: '0.3em', color: styles.subColor, marginBottom: 6, fontFamily: styles.fontTitle }}>SEU CÓDIGO</div>
            <div style={{ fontFamily: 'monospace', fontSize: 'clamp(20px, 5vw, 28px)', fontWeight: 900, letterSpacing: '0.2em', color: styles.accent, textShadow: isGeek ? `0 0 15px ${styles.accent}` : 'none' }}>
              {coupon.code}
            </div>
          </div>

          {/* Instrução */}
          <p style={{ color: styles.textColor, opacity: 0.6, fontSize: 13, lineHeight: 1.6, marginBottom: 24, textAlign: 'center' }}>
            {coupon.type === 'free_product'
              ? 'Escolha o produto que deseja. Ele será 100% gratuito — você paga apenas o frete.'
              : 'Este cupom será aplicado automaticamente no checkout.'}
          </p>

          {/* Botão de resgate */}
          {!redeemed ? (
            <button
              onClick={handleRedeem}
              disabled={redeeming}
              style={{
                width: '100%', padding: '16px', background: styles.btnBg, color: styles.btnColor,
                fontFamily: styles.fontTitle, fontWeight: 700, fontSize: 13, letterSpacing: '0.15em',
                border: 'none', borderRadius: 8, cursor: redeeming ? 'not-allowed' : 'pointer',
                opacity: redeeming ? 0.7 : 1, transition: 'opacity 0.2s', marginBottom: 12,
                textTransform: 'uppercase',
              }}
            >
              {redeeming ? 'Ativando...' : isGeek ? '⚡ ATIVAR RECOMPENSA' : '✦ ACEITAR BÊNÇÃO'}
            </button>
          ) : (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ textAlign: 'center', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#22c55e', marginBottom: 8 }}>
                <Check style={{ width: 20, height: 20 }} />
                <span style={{ fontWeight: 700, fontSize: 14 }}>Cupom ativado com sucesso!</span>
              </div>
            </motion.div>
          )}

          {/* Ir para a loja */}
          {redeemed && (
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={goToShop}
              style={{
                width: '100%', padding: '14px', background: 'transparent', color: styles.accent,
                fontFamily: styles.fontTitle, fontWeight: 700, fontSize: 13, letterSpacing: '0.15em',
                border: `1px solid ${styles.cardBorder}`, borderRadius: 8, cursor: 'pointer',
                textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <ShoppingCart style={{ width: 16, height: 16 }} />
              {isGeek ? 'IR PARA A LOJA' : 'ESCOLHER MEU PRESENTE'}
            </motion.button>
          )}
        </motion.div>
      </div>
    );
  }

  return null;
}
