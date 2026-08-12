import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Sparkles, RefreshCw, ArrowRight, Box, DollarSign, AlertTriangle } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// CONTRATO DE INTEGRAÇÃO — ÚNICO LUGAR QUE PRECISA MUDAR QUANDO VOCÊ CONFIRMAR
// O FORMATO REAL DE RESPOSTA DOS WEBHOOKS DO N8N.
//
// Hoje o formato é genérico: {success: boolean, data: {...}}. O que NÃO
// sabemos ainda é o nome exato do campo dentro de "data" que traz a URL da
// imagem e a URL do modelo 3D (.glb). Os extractors abaixo tentam múltiplos
// nomes de campo comuns como fallback, mas o certo é você confirmar o nome
// exato assim que testar o webhook, e simplificar a função para um único
// `return json.data.NOME_EXATO_DO_CAMPO`.
// ─────────────────────────────────────────────────────────────────────────────

const WEBHOOK_GERAR_IMAGEM = "https://n8nwebhook.solviaoficial.com/webhook/GERAR_IMAGEM";
const WEBHOOK_GERAR_MODELO = "https://n8nwebhook.solviaoficial.com/webhook/GERAR_modelo";
const WEBHOOK_REFAZER_IMAGEM = "https://n8nwebhook.solviaoficial.com/webhook/refazer_imagem";

// Timeout generoso: a Tripo sozinha pode levar 10-120s, mais o tempo da OpenAI
// antes disso. 240s cobre folga de sobra sem deixar a requisição pendurada
// para sempre se o n8n cair.
const WEBHOOK_TIMEOUT_MS = 240_000;

type GerarImagemResponse = {
  success: boolean;
  data?: Record<string, any>;
  error?: string;
  message?: string;
};

type GerarModeloResponse = {
  success: boolean;
  data?: Record<string, any>;
  error?: string;
  message?: string;
};

/**
 * Extrai a URL da imagem gerada da resposta do webhook GERAR_IMAGEM.
 * AJUSTAR AQUI quando o formato real for confirmado — trocar por:
 *   return json?.data?.NOME_EXATO_DO_CAMPO ?? null;
 */
function extractImageUrl(json: GerarImagemResponse): string | null {
  const data = json?.data;
  if (!data) return null;
  return (
    data.image_url ??
    data.imageUrl ??
    data.url ??
    data.image ??
    null
  );
}

/**
 * Extrai a URL do modelo 3D (.glb) da resposta do webhook GERAR_MODELO.
 * AJUSTAR AQUI quando o formato real for confirmado — trocar por:
 *   return json?.data?.NOME_EXATO_DO_CAMPO ?? null;
 */
function extractModelUrl(json: GerarModeloResponse): string | null {
  const data = json?.data;
  if (!data) return null;
  return (
    data.model_url ??
    data.modelUrl ??
    data.glb_url ??
    data.glbUrl ??
    data.url ??
    null
  );
}

type RefazerImagemResponse = {
  success: boolean;
  data?: Record<string, any>;
  error?: string;
  message?: string;
};

/**
 * Extrai a URL da nova imagem gerada pelo webhook refazer_imagem.
 * AJUSTAR AQUI quando o formato real for confirmado — trocar por:
 *   return json?.data?.NOME_EXATO_DO_CAMPO ?? null;
 */
function extractRefinedImageUrl(json: RefazerImagemResponse): string | null {
  const data = json?.data;
  if (!data) return null;
  return (
    data.image_url ??
    data.imageUrl ??
    data.url ??
    data.image ??
    null
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FETCH COM TIMEOUT
// ─────────────────────────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MENSAGENS ROTATIVAS DE LOADING (sem barra de progresso falsa)
// ─────────────────────────────────────────────────────────────────────────────

const IMAGE_LOADING_MESSAGES = [
  "Desenhando sua imagem...",
  "Interpretando sua ideia...",
  "Aplicando os detalhes...",
  "Isso pode levar até 1 minuto...",
  "Quase lá...",
];

const MODEL_LOADING_MESSAGES = [
  "Transformando em 3D...",
  "Esculpindo camada por camada...",
  "Calculando a geometria do modelo...",
  "Isso pode levar até 2 minutos...",
  "A Tripo está processando seu modelo...",
  "Quase lá, só mais um pouco...",
];

function useRotatingMessages(messages: string[], active: boolean, intervalMs = 3200) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!active) {
      setIndex(0);
      return;
    }
    const timer = setInterval(() => {
      setIndex(previous => (previous + 1) % messages.length);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [active, messages, intervalMs]);

  return messages[index];
}

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS DE ESTADO DO FLUXO
// ─────────────────────────────────────────────────────────────────────────────

type FlowStep =
  | "question-1"
  | "question-2"
  | "question-3"
  | "question-4"
  | "loading-image"
  | "image-ready"
  | "loading-model"
  | "model-ready"
  | "refine-question"
  | "loading-refine";

// ─────────────────────────────────────────────────────────────────────────────
// MODEL VIEWER (carrega <model-viewer> do Google via CDN, sem npm install)
// ─────────────────────────────────────────────────────────────────────────────

let modelViewerScriptLoaded = false;

function useModelViewerScript() {
  const [ready, setReady] = useState(modelViewerScriptLoaded);

  useEffect(() => {
    if (modelViewerScriptLoaded) {
      setReady(true);
      return;
    }
    const existing = document.querySelector('script[data-model-viewer]');
    if (existing) {
      existing.addEventListener("load", () => {
        modelViewerScriptLoaded = true;
        setReady(true);
      });
      return;
    }
    const script = document.createElement("script");
    script.type = "module";
    script.src = "https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js";
    script.setAttribute("data-model-viewer", "true");
    script.onload = () => {
      modelViewerScriptLoaded = true;
      setReady(true);
    };
    document.head.appendChild(script);
  }, []);

  return ready;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

export default function FreoCriarModelo() {
  const [step, setStep] = useState<FlowStep>("question-1");

  // Respostas das 4 perguntas fixas. Nada disso é enviado individualmente —
  // só são combinadas em um único texto no momento em que a pergunta 4 é
  // confirmada (handleFinalizarPerguntas), que é quem dispara handleGerarImagem.
  const [answerSubject, setAnswerSubject] = useState("");       // O que transformar em figure
  const [answerStyle, setAnswerStyle] = useState("");            // Estilo da figure
  const [answerPose, setAnswerPose] = useState("");               // Pose
  const [answerOutfit, setAnswerOutfit] = useState("");           // Roupa/acessórios/cores (opcional)
  const [answerNotes, setAnswerNotes] = useState("");             // Observações extras (opcional)

  const [promptText, setPromptText] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Texto do que o usuário quer mudar na imagem já gerada, e de qual tela ele
  // veio ("image-ready" ou "model-ready") para poder devolvê-lo lá em caso de erro.
  const [refineText, setRefineText] = useState("");
  const [refineOrigin, setRefineOrigin] = useState<"image-ready" | "model-ready">("image-ready");

  const modelViewerReady = useModelViewerScript();
  const abortRef = useRef<AbortController | null>(null);

  const imageLoadingMessage = useRotatingMessages(IMAGE_LOADING_MESSAGES, step === "loading-image");
  const modelLoadingMessage = useRotatingMessages(MODEL_LOADING_MESSAGES, step === "loading-model");

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // ── Monta o prompt final combinando as 4 respostas e dispara a geração ───
  // Chamada SOMENTE ao confirmar a pergunta 4. É o único ponto que aciona o
  // envio ao webhook GERAR_IMAGEM — nenhuma resposta é enviada isoladamente.
  const handleFinalizarPerguntas = () => {
    const partes: string[] = [];

    partes.push(`Sujeito: ${answerSubject.trim()}`);
    partes.push(`Estilo: ${answerStyle.trim()}`);
    partes.push(`Pose: ${answerPose.trim()}`);

    if (answerOutfit.trim()) {
      partes.push(`Roupa/acessórios/cores: ${answerOutfit.trim()}`);
    }
    if (answerNotes.trim()) {
      partes.push(`Observações extras: ${answerNotes.trim()}`);
    }

    const promptFinal = partes.join(". ");
    setPromptText(promptFinal);

    // handleGerarImagem lê de promptText via closure teria valor antigo (state
    // assíncrono), então chamamos a geração passando o texto explicitamente.
    handleGerarImagem(promptFinal);
  };

  // ── Última etapa das perguntas → gerar imagem ─────────────────────────────
  // Recebe o prompt combinado como parâmetro (não lê de promptText no state,
  // que ainda estaria desatualizado por causa da assincronia do setState).
  const handleGerarImagem = async (promptFinal: string) => {
    const clean = promptFinal.trim();
    if (!clean) return;

    setErrorMessage(null);
    setStep("loading-image");

    try {
      const response = await fetchWithTimeout(
        WEBHOOK_GERAR_IMAGEM,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: clean }),
        },
        WEBHOOK_TIMEOUT_MS
      );
      if (!response.ok) {
        throw new Error(`Erro do servidor (${response.status})`);
      }

      const json: GerarImagemResponse = await response.json();

      if (!json.success) {
        throw new Error(json.error || json.message || "Não foi possível gerar a imagem.");
      }

      const url = extractImageUrl(json);
      if (!url) {
        throw new Error(
          "A imagem foi gerada mas a URL não foi encontrada na resposta. Verifique o formato retornado pelo webhook GERAR_IMAGEM (campo esperado em data.image_url)."
        );
      }

      setImageUrl(url);
      setStep("image-ready");
    } catch (error: any) {
      if (error?.name === "AbortError") {
        setErrorMessage("A geração da imagem demorou demais e foi cancelada. Tente novamente.");
      } else {
        setErrorMessage(error?.message || "Erro de conexão ao gerar a imagem.");
      }
      setStep("question-4");
    }
  };

  // ── Passo 2 → 3: gerar modelo 3D ──────────────────────────────────────────
  const handleGerarModelo = async () => {
    if (!imageUrl) return;

    setErrorMessage(null);
    setStep("loading-model");

    try {
      const response = await fetchWithTimeout(
        WEBHOOK_GERAR_MODELO,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_url: imageUrl, prompt: promptText.trim() }),
        },
        WEBHOOK_TIMEOUT_MS
      );

      if (!response.ok) {
        throw new Error(`Erro do servidor (${response.status})`);
      }

      const json: GerarModeloResponse = await response.json();

      if (!json.success) {
        throw new Error(json.error || json.message || "Não foi possível gerar o modelo 3D.");
      }

      const url = extractModelUrl(json);
      if (!url) {
        throw new Error(
          "O modelo foi gerado mas a URL não foi encontrada na resposta. Verifique o formato retornado pelo webhook GERAR_modelo (campo esperado em data.model_url)."
        );
      }

      setModelUrl(url);
      setStep("model-ready");
    } catch (error: any) {
      if (error?.name === "AbortError") {
        setErrorMessage("A geração do modelo demorou demais e foi cancelada. Tente novamente.");
      } else {
        setErrorMessage(error?.message || "Erro de conexão ao gerar o modelo 3D.");
      }
      setStep("image-ready");
    }
  };

  // ── Enviar pedido de mudança na imagem já gerada ──────────────────────────
  // Único ponto que envia dados ao webhook refazer_imagem. Envia a imagem
  // atual (imageUrl), o prompt original combinado (promptText) e o texto do
  // que o usuário quer mudar (refineText). Ao voltar, substitui imageUrl pela
  // nova imagem e leva o usuário para "image-ready".
  const handleEnviarRefinamento = async () => {
    const mudanca = refineText.trim();
    if (!mudanca || !imageUrl) return;

    setErrorMessage(null);
    setStep("loading-refine");

    try {
      const response = await fetchWithTimeout(
        WEBHOOK_REFAZER_IMAGEM,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image_url: imageUrl,
            prompt: promptText.trim(),
            mudanca,
          }),
        },
        WEBHOOK_TIMEOUT_MS
      );

      if (!response.ok) {
        throw new Error(`Erro do servidor (${response.status})`);
      }

      const json: RefazerImagemResponse = await response.json();

      if (!json.success) {
        throw new Error(json.error || json.message || "Não foi possível refazer a imagem.");
      }

      const url = extractRefinedImageUrl(json);
      if (!url) {
        throw new Error(
          "A imagem foi gerada mas a URL não foi encontrada na resposta. Verifique o formato retornado pelo webhook refazer_imagem (campo esperado em data.image_url)."
        );
      }

      setImageUrl(url);
      setModelUrl(null);
      setRefineText("");
      setStep("image-ready");
    } catch (error: any) {
      if (error?.name === "AbortError") {
        setErrorMessage("A geração da nova imagem demorou demais e foi cancelada. Tente novamente.");
      } else {
        setErrorMessage(error?.message || "Erro de conexão ao refazer a imagem.");
      }
      setStep("refine-question");
    }
  };

  // ── Refazer imagem (volta pro início a partir de qualquer etapa) ─────────
  const handleRefazerImagem = () => {
    setImageUrl(null);
    setModelUrl(null);
    setErrorMessage(null);
    setPromptText("");
    setAnswerSubject("");
    setAnswerStyle("");
    setAnswerPose("");
    setAnswerOutfit("");
    setAnswerNotes("");
    setStep("question-1");
  };

  // ── Ver preço (placeholder — comportamento futuro a definir) ─────────────
  const handleVerPreco = () => {
    // Por enquanto, apenas placeholder. Fluxo de preço não faz parte deste escopo.
    window.location.href = "https://wa.me/5511946454111?text=" + encodeURIComponent(
      "Olá! Gerei um modelo 3D personalizado no site e gostaria de saber o preço."
    );
  };

  return (
    <div className="min-h-screen bg-freo-black text-freo-light font-body antialiased flex flex-col">
      <style>{`
        .fcm-grid-bg {
          background-image:
            linear-gradient(rgba(221,175,52,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(221,175,52,0.03) 1px, transparent 1px);
          background-size: 48px 48px;
        }
        @keyframes fcm-pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .fcm-pulse { animation: fcm-pulse-dot 1.6s ease-in-out infinite; }
        model-viewer {
          width: 100%;
          height: 100%;
          --poster-color: transparent;
        }
      `}</style>

      {/* Header simples */}
      <header className="border-b border-white/[0.07] bg-[#0d0d0d] py-4">
        <div className="max-w-4xl mx-auto px-5 flex items-center gap-3">
          <img
            src="https://rrmxqpvxrpcqqxsgccqw.supabase.co/storage/v1/object/public/imagens/logo.jpg"
            alt="Logo"
            className="w-9 h-9 rounded-full object-cover border-2 border-freo-orange shadow-[0_0_8px_rgba(221,175,52,0.4)]"
            onError={(event) => { (event.target as HTMLImageElement).style.display = "none"; }}
          />
          <span className="font-display font-black text-xl tracking-tighter uppercase">
            Freo<span className="text-freo-orange font-light">Figures</span>
          </span>
          <span className="ml-auto font-mono text-[10px] text-freo-orange border border-freo-orange/30 bg-freo-orange/8 px-3 py-1 uppercase tracking-widest">
            Criar Modelo 3D
          </span>
        </div>
      </header>

      <main className="flex-1 fcm-grid-bg relative">
        <div className="max-w-2xl mx-auto px-5 py-14 md:py-20">

          {/* Erro global */}
          <AnimatePresence>
            {errorMessage && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mb-6 flex items-start gap-3 border border-red-500/40 bg-red-500/10 text-red-400 text-sm font-mono p-4"
              >
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">

            {/* ── PERGUNTA 1: O QUE TRANSFORMAR EM FIGURE ───────────────── */}
            {step === "question-1" && (
              <motion.div
                key="question-1"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.35 }}
              >
                <div className="text-center mb-8">
                  <div className="inline-flex items-center gap-2 border border-freo-orange/20 bg-freo-orange/5 px-3 py-1.5 mb-5">
                    <Sparkles className="w-3.5 h-3.5 text-freo-orange" />
                    <span className="font-mono text-[10px] text-freo-orange uppercase tracking-[0.18em]">
                      Passo 1 de 4
                    </span>
                  </div>
                  <h1 className="font-display font-black text-3xl md:text-5xl uppercase tracking-tighter leading-[0.95] mb-3">
                    O que você quer <span className="text-freo-orange">transformar em figure?</span>
                  </h1>
                  <p className="text-freo-light/50 font-body text-sm md:text-base max-w-lg mx-auto">
                    Ex.: "meu cachorro", "um guerreiro medieval", "um personagem inspirado em anime"
                  </p>
                </div>

                <div className="bg-[#111111] border border-white/[0.07] p-5 md:p-6">
                  <label className="block font-mono text-[10px] uppercase tracking-[0.1em] text-white/35 mb-2">
                    Sua resposta
                  </label>
                  <textarea
                    value={answerSubject}
                    onChange={event => setAnswerSubject(event.target.value)}
                    placeholder="Ex: meu cachorro, um guerreiro medieval..."
                    rows={3}
                    className="w-full bg-[#0A0A0A] border border-white/[0.08] text-freo-light px-4 py-3 font-body text-sm outline-none focus:border-freo-orange transition-colors resize-none placeholder:text-white/20"
                  />
                  <button
                    onClick={() => setStep("question-2")}
                    disabled={!answerSubject.trim()}
                    className="w-full mt-4 bg-freo-orange text-freo-black font-display font-bold uppercase tracking-widest py-3.5 hover:bg-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.99]"
                  >
                    Próximo
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── PERGUNTA 2: ESTILO DA FIGURE ──────────────────────────── */}
            {step === "question-2" && (
              <motion.div
                key="question-2"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.35 }}
              >
                <div className="text-center mb-8">
                  <div className="inline-flex items-center gap-2 border border-freo-orange/20 bg-freo-orange/5 px-3 py-1.5 mb-5">
                    <Sparkles className="w-3.5 h-3.5 text-freo-orange" />
                    <span className="font-mono text-[10px] text-freo-orange uppercase tracking-[0.18em]">
                      Passo 2 de 4
                    </span>
                  </div>
                  <h1 className="font-display font-black text-3xl md:text-5xl uppercase tracking-tighter leading-[0.95] mb-3">
                    Qual <span className="text-freo-orange">estilo da figure?</span>
                  </h1>
                  <p className="text-freo-light/50 font-body text-sm md:text-base max-w-lg mx-auto">
                    Ex.: "fofa", "colecionável premium", "anime", "realista estilizada"
                  </p>
                </div>

                <div className="bg-[#111111] border border-white/[0.07] p-5 md:p-6">
                  <label className="block font-mono text-[10px] uppercase tracking-[0.1em] text-white/35 mb-2">
                    Sua resposta
                  </label>
                  <textarea
                    value={answerStyle}
                    onChange={event => setAnswerStyle(event.target.value)}
                    placeholder="Ex: fofa, colecionável premium, anime..."
                    rows={3}
                    className="w-full bg-[#0A0A0A] border border-white/[0.08] text-freo-light px-4 py-3 font-body text-sm outline-none focus:border-freo-orange transition-colors resize-none placeholder:text-white/20"
                  />
                  <div className="grid grid-cols-2 gap-3 mt-4">
                    <button
                      onClick={() => setStep("question-1")}
                      className="flex items-center justify-center gap-2 border border-white/15 text-white font-display font-bold uppercase tracking-widest px-6 py-3.5 hover:border-freo-orange/50 hover:bg-freo-orange/5 transition-all active:scale-[0.99]"
                    >
                      Voltar
                    </button>
                    <button
                      onClick={() => setStep("question-3")}
                      disabled={!answerStyle.trim()}
                      className="bg-freo-orange text-freo-black font-display font-bold uppercase tracking-widest px-6 py-3.5 hover:bg-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.99]"
                    >
                      Próximo
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── PERGUNTA 3: POSE ──────────────────────────────────────── */}
            {step === "question-3" && (
              <motion.div
                key="question-3"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.35 }}
              >
                <div className="text-center mb-8">
                  <div className="inline-flex items-center gap-2 border border-freo-orange/20 bg-freo-orange/5 px-3 py-1.5 mb-5">
                    <Sparkles className="w-3.5 h-3.5 text-freo-orange" />
                    <span className="font-mono text-[10px] text-freo-orange uppercase tracking-[0.18em]">
                      Passo 3 de 4
                    </span>
                  </div>
                  <h1 className="font-display font-black text-3xl md:text-5xl uppercase tracking-tighter leading-[0.95] mb-3">
                    Qual <span className="text-freo-orange">pose?</span>
                  </h1>
                  <p className="text-freo-light/50 font-body text-sm md:text-base max-w-lg mx-auto">
                    Ex.: "em pé", "pose de ação", "braços cruzados", "segurando espada"
                  </p>
                </div>

                <div className="bg-[#111111] border border-white/[0.07] p-5 md:p-6">
                  <label className="block font-mono text-[10px] uppercase tracking-[0.1em] text-white/35 mb-2">
                    Sua resposta
                  </label>
                  <textarea
                    value={answerPose}
                    onChange={event => setAnswerPose(event.target.value)}
                    placeholder="Ex: em pé, pose de ação, braços cruzados..."
                    rows={3}
                    className="w-full bg-[#0A0A0A] border border-white/[0.08] text-freo-light px-4 py-3 font-body text-sm outline-none focus:border-freo-orange transition-colors resize-none placeholder:text-white/20"
                  />
                  <div className="grid grid-cols-2 gap-3 mt-4">
                    <button
                      onClick={() => setStep("question-2")}
                      className="flex items-center justify-center gap-2 border border-white/15 text-white font-display font-bold uppercase tracking-widest px-6 py-3.5 hover:border-freo-orange/50 hover:bg-freo-orange/5 transition-all active:scale-[0.99]"
                    >
                      Voltar
                    </button>
                    <button
                      onClick={() => setStep("question-4")}
                      disabled={!answerPose.trim()}
                      className="bg-freo-orange text-freo-black font-display font-bold uppercase tracking-widest px-6 py-3.5 hover:bg-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.99]"
                    >
                      Próximo
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── PERGUNTA 4: ROUPA/ACESSÓRIOS/CORES + OBSERVAÇÕES (OPCIONAIS) ── */}
            {step === "question-4" && (
              <motion.div
                key="question-4"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.35 }}
              >
                <div className="text-center mb-8">
                  <div className="inline-flex items-center gap-2 border border-freo-orange/20 bg-freo-orange/5 px-3 py-1.5 mb-5">
                    <Sparkles className="w-3.5 h-3.5 text-freo-orange" />
                    <span className="font-mono text-[10px] text-freo-orange uppercase tracking-[0.18em]">
                      Passo 4 de 4
                    </span>
                  </div>
                  <h1 className="font-display font-black text-3xl md:text-5xl uppercase tracking-tighter leading-[0.95] mb-3">
                    Últimos <span className="text-freo-orange">detalhes</span>
                  </h1>
                  <p className="text-freo-light/50 font-body text-sm md:text-base max-w-lg mx-auto">
                    Ambos os campos abaixo são opcionais — pode enviar em branco.
                  </p>
                </div>

                <div className="bg-[#111111] border border-white/[0.07] p-5 md:p-6 space-y-5">
                  <div>
                    <label className="block font-mono text-[10px] uppercase tracking-[0.1em] text-white/35 mb-2">
                      Roupa / acessórios / cores (opcional)
                    </label>
                    <textarea
                      value={answerOutfit}
                      onChange={event => setAnswerOutfit(event.target.value)}
                      placeholder="Ex: roupa preta com detalhes dourados, espada nas costas"
                      rows={3}
                      className="w-full bg-[#0A0A0A] border border-white/[0.08] text-freo-light px-4 py-3 font-body text-sm outline-none focus:border-freo-orange transition-colors resize-none placeholder:text-white/20"
                    />
                  </div>

                  <div>
                    <label className="block font-mono text-[10px] uppercase tracking-[0.1em] text-white/35 mb-2">
                      Observações extras (opcional)
                    </label>
                    <textarea
                      value={answerNotes}
                      onChange={event => setAnswerNotes(event.target.value)}
                      placeholder='Ex: "quero cabeça levemente maior", "base simples", "sem cenário"'
                      rows={3}
                      className="w-full bg-[#0A0A0A] border border-white/[0.08] text-freo-light px-4 py-3 font-body text-sm outline-none focus:border-freo-orange transition-colors resize-none placeholder:text-white/20"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setStep("question-3")}
                      className="flex items-center justify-center gap-2 border border-white/15 text-white font-display font-bold uppercase tracking-widest px-6 py-3.5 hover:border-freo-orange/50 hover:bg-freo-orange/5 transition-all active:scale-[0.99]"
                    >
                      Voltar
                    </button>
                    <button
                      onClick={handleFinalizarPerguntas}
                      className="bg-freo-orange text-freo-black font-display font-bold uppercase tracking-widest px-6 py-3.5 hover:bg-white transition-colors flex items-center justify-center gap-2 active:scale-[0.99]"
                    >
                      Gerar Imagem
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── LOADING: GERANDO IMAGEM ───────────────────────────────── */}
            {step === "loading-image" && (
              <motion.div
                key="loading-image"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35 }}
                className="flex flex-col items-center justify-center text-center py-20"
              >
                <div className="w-14 h-14 border-2 border-freo-orange border-t-transparent rounded-full animate-spin mb-6" />
                <p className="font-display font-bold text-lg uppercase tracking-wide text-white mb-2">
                  Gerando sua imagem
                </p>
                <p className="font-mono text-sm text-freo-orange fcm-pulse">
                  {imageLoadingMessage}
                </p>
              </motion.div>
            )}

            {/* ── ETAPA 2: IMAGEM PRONTA ────────────────────────────────── */}
            {step === "image-ready" && imageUrl && (
              <motion.div
                key="image-ready"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.35 }}
              >
                <div className="text-center mb-6">
                  <h2 className="font-display font-black text-2xl md:text-3xl uppercase tracking-tighter mb-2">
                    Sua imagem está <span className="text-freo-orange">pronta</span>
                  </h2>
                  <p className="text-freo-light/50 font-body text-sm">
                    Gostou? Vamos transformar em modelo 3D. Ou prefere tentar outra descrição?
                  </p>
                </div>

                <div className="bg-[#111111] border border-white/[0.07] p-3 mb-5">
                  <div className="aspect-square w-full bg-[#0A0A0A] overflow-hidden">
                    <img
                      src={imageUrl}
                      alt="Imagem gerada"
                      className="w-full h-full object-contain"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    onClick={() => { setRefineOrigin("image-ready"); setRefineText(""); setStep("refine-question"); }}
                    className="flex items-center justify-center gap-2 border border-white/15 text-white font-display font-bold uppercase tracking-widest px-6 py-3.5 hover:border-freo-orange/50 hover:bg-freo-orange/5 transition-all active:scale-[0.99]"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Refazer Imagem
                  </button>
                  <button
                    onClick={handleGerarModelo}
                    className="flex items-center justify-center gap-2 bg-freo-orange text-freo-black font-display font-bold uppercase tracking-widest px-6 py-3.5 hover:bg-white transition-colors active:scale-[0.99]"
                  >
                    <Box className="w-4 h-4" />
                    Gerar Modelo 3D
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── LOADING: GERANDO MODELO 3D ────────────────────────────── */}
            {step === "loading-model" && (
              <motion.div
                key="loading-model"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35 }}
                className="flex flex-col items-center justify-center text-center py-20"
              >
                {imageUrl && (
                  <div className="w-28 h-28 mb-6 border border-white/10 bg-[#111111] overflow-hidden opacity-60">
                    <img src={imageUrl} alt="Imagem base" className="w-full h-full object-contain" />
                  </div>
                )}
                <div className="w-14 h-14 border-2 border-freo-orange border-t-transparent rounded-full animate-spin mb-6" />
                <p className="font-display font-bold text-lg uppercase tracking-wide text-white mb-2">
                  Gerando modelo 3D
                </p>
                <p className="font-mono text-sm text-freo-orange fcm-pulse">
                  {modelLoadingMessage}
                </p>
              </motion.div>
            )}

            {/* ── ETAPA 3: MODELO 3D PRONTO ─────────────────────────────── */}
            {step === "model-ready" && modelUrl && (
              <motion.div
                key="model-ready"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.35 }}
              >
                <div className="text-center mb-6">
                  <h2 className="font-display font-black text-2xl md:text-3xl uppercase tracking-tighter mb-2">
                    Seu modelo <span className="text-freo-orange">3D está pronto</span>
                  </h2>
                  <p className="text-freo-light/50 font-body text-sm">
                    Arraste para girar. Quando estiver satisfeito, veja o preço.
                  </p>
                </div>

                <div className="bg-[#111111] border border-white/[0.07] p-3 mb-5">
                  <div className="aspect-square w-full bg-[#0A0A0A] overflow-hidden">
                    {modelViewerReady ? (
                      // @ts-ignore — custom element do Google, sem tipos React
                      <model-viewer
                        src={modelUrl}
                        camera-controls
                        auto-rotate
                        shadow-intensity="1"
                        exposure="1"
                        style={{ width: "100%", height: "100%" }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="w-10 h-10 border-2 border-freo-orange border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    onClick={() => { setRefineOrigin("model-ready"); setRefineText(""); setStep("refine-question"); }}
                    className="flex items-center justify-center gap-2 border border-white/15 text-white font-display font-bold uppercase tracking-widest px-6 py-3.5 hover:border-freo-orange/50 hover:bg-freo-orange/5 transition-all active:scale-[0.99]"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Refazer Imagem
                  </button>
                  <button
                    onClick={handleVerPreco}
                    className="flex items-center justify-center gap-2 bg-freo-orange text-freo-black font-display font-bold uppercase tracking-widest px-6 py-3.5 hover:bg-white transition-colors active:scale-[0.99]"
                  >
                    <DollarSign className="w-4 h-4" />
                    Ver Preço
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── PERGUNTA DE REFINAMENTO: O QUE VOCÊ DESEJA MUDAR? ─────── */}
            {step === "refine-question" && imageUrl && (
              <motion.div
                key="refine-question"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.35 }}
              >
                <div className="text-center mb-6">
                  <h2 className="font-display font-black text-2xl md:text-3xl uppercase tracking-tighter mb-2">
                    O que você deseja <span className="text-freo-orange">mudar?</span>
                  </h2>
                  <p className="text-freo-light/50 font-body text-sm">
                    Descreva o ajuste na imagem atual, ou refaça tudo do zero.
                  </p>
                </div>

                <div className="bg-[#111111] border border-white/[0.07] p-3 mb-5">
                  <div className="aspect-square w-full bg-[#0A0A0A] overflow-hidden">
                    <img
                      src={imageUrl}
                      alt="Imagem atual"
                      className="w-full h-full object-contain"
                    />
                  </div>
                </div>

                <div className="bg-[#111111] border border-white/[0.07] p-5 md:p-6">
                  <label className="block font-mono text-[10px] uppercase tracking-[0.1em] text-white/35 mb-2">
                    O que você deseja mudar
                  </label>
                  <textarea
                    value={refineText}
                    onChange={event => setRefineText(event.target.value)}
                    placeholder="Ex: deixar a roupa azul, remover a espada, cabeça um pouco maior..."
                    rows={4}
                    className="w-full bg-[#0A0A0A] border border-white/[0.08] text-freo-light px-4 py-3 font-body text-sm outline-none focus:border-freo-orange transition-colors resize-none placeholder:text-white/20"
                  />
                  <button
                    onClick={handleEnviarRefinamento}
                    disabled={!refineText.trim()}
                    className="w-full mt-4 bg-freo-orange text-freo-black font-display font-bold uppercase tracking-widest py-3.5 hover:bg-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.99]"
                  >
                    Enviar
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleRefazerImagem}
                    className="w-full mt-3 flex items-center justify-center gap-2 border border-white/15 text-white font-display font-bold uppercase tracking-widest px-6 py-3.5 hover:border-freo-orange/50 hover:bg-freo-orange/5 transition-all active:scale-[0.99]"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Refazer totalmente o modelo
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── LOADING: REFAZENDO IMAGEM COM AJUSTE ──────────────────── */}
            {step === "loading-refine" && (
              <motion.div
                key="loading-refine"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35 }}
                className="flex flex-col items-center justify-center text-center py-20"
              >
                {imageUrl && (
                  <div className="w-28 h-28 mb-6 border border-white/10 bg-[#111111] overflow-hidden opacity-60">
                    <img src={imageUrl} alt="Imagem atual" className="w-full h-full object-contain" />
                  </div>
                )}
                <div className="w-14 h-14 border-2 border-freo-orange border-t-transparent rounded-full animate-spin mb-6" />
                <p className="font-display font-bold text-lg uppercase tracking-wide text-white mb-2">
                  Aplicando a mudança
                </p>
                <p className="font-mono text-sm text-freo-orange fcm-pulse">
                  Isso pode levar até 1 minuto...
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      <footer className="border-t border-white/[0.06] py-6">
        <div className="max-w-4xl mx-auto px-5 text-center">
          <p className="font-mono text-[10px] text-white/20">© 2026 FreoFigures. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
