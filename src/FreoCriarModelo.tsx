import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Sparkles, RefreshCw, ArrowRight, Box, DollarSign, AlertTriangle } from "lucide-react";
import {
  MAX_GENERATION_UPLOAD_BYTES,
  createGenerationImageUrl,
  createGenerationModelUrl,
  createPromptGeneration,
  createUploadGeneration,
  getAuthenticatedUser,
  getGeneration,
  isGenerationBusy,
  requestGenerationPrice,
  startImageRefinement,
  startModelGeneration,
  subscribeToGeneration,
  validateGenerationUpload,
  type GenerationJob,
} from "./generations";

const ACTIVE_GENERATION_KEY = "freo_active_generation_id";

const IMAGE_LOADING_MESSAGES = [
  "Sua solicitação já está no servidor...",
  "Desenhando sua imagem...",
  "Interpretando sua ideia...",
  "Aplicando os detalhes...",
  "Você pode fechar esta página; a criação continuará salva na sua conta...",
];

const MODEL_LOADING_MESSAGES = [
  "Sua solicitação já está no servidor...",
  "Transformando em 3D...",
  "Esculpindo camada por camada...",
  "Preparando o arquivo para impressão...",
  "Fatiando e calculando o preço...",
  "Você pode fechar esta página; o processamento continua no servidor...",
];

const GCODE_LOADING_MESSAGES = [
  "Consultando o preço calculado pelo servidor...",
  "Validando os dados do fatiamento...",
  "Carregando o valor final...",
];

function useRotatingMessages(messages: string[], active: boolean, intervalMs = 3200) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!active) {
      setIndex(0);
      return undefined;
    }
    const timer = window.setInterval(() => {
      setIndex(previous => (previous + 1) % messages.length);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [active, intervalMs, messages]);

  return messages[index] ?? messages[0] ?? "";
}

type FlowStep =
  | "start"
  | "upload-image"
  | "loading-model-from-upload"
  | "question-1"
  | "question-2"
  | "question-3"
  | "question-4"
  | "loading-image"
  | "image-ready"
  | "loading-model"
  | "model-ready"
  | "loading-gcode"
  | "price-ready"
  | "refine-question"
  | "loading-refine";

function stepFromJob(job: GenerationJob): FlowStep {
  if (job.status === "completed") return "model-ready";
  if (job.status === "image_ready") return "image-ready";
  if (job.status === "generating_image") return "loading-image";
  if (job.status === "refining_image") return "loading-refine";
  if (job.status === "generating_model") {
    return job.source_type === "upload" ? "loading-model-from-upload" : "loading-model";
  }
  if (job.status === "queued") {
    if (job.active_operation === "generate_image") return "loading-image";
    if (job.active_operation === "refine_image") return "loading-refine";
    if (job.active_operation === "generate_model_from_upload") return "loading-model-from-upload";
    if (job.active_operation === "generate_model") return "loading-model";
  }
  if (job.status === "failed") {
    if (job.image_path) return "image-ready";
    return job.source_type === "upload" ? "upload-image" : "question-4";
  }
  return "start";
}

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
      const onLoad = () => {
        modelViewerScriptLoaded = true;
        setReady(true);
      };
      existing.addEventListener("load", onLoad);
      return () => existing.removeEventListener("load", onLoad);
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
    return undefined;
  }, []);

  return ready;
}

export default function FreoCriarModelo() {
  const mountedRef = useRef(true);
  const currentJobIdRef = useRef<string | null>(null);
  const applyingJobRef = useRef(0);

  const [step, setStep] = useState<FlowStep>("start");
  const [answerSubject, setAnswerSubject] = useState("");
  const [answerStyle, setAnswerStyle] = useState("");
  const [answerPose, setAnswerPose] = useState("");
  const [answerOutfit, setAnswerOutfit] = useState("");
  const [answerNotes, setAnswerNotes] = useState("");
  const [promptText, setPromptText] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [refineText, setRefineText] = useState("");
  const [, setRefineOrigin] = useState<"image-ready" | "model-ready">("image-ready");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedPreviewUrl, setUploadedPreviewUrl] = useState<string | null>(null);
  const [currentJob, setCurrentJob] = useState<GenerationJob | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [restoring, setRestoring] = useState(true);

  const modelViewerReady = useModelViewerScript();
  const imageLoadingMessage = useRotatingMessages(
    IMAGE_LOADING_MESSAGES,
    step === "loading-image" || step === "loading-refine",
  );
  const modelLoadingMessage = useRotatingMessages(
    MODEL_LOADING_MESSAGES,
    step === "loading-model" || step === "loading-model-from-upload",
  );
  const gcodeLoadingMessage = useRotatingMessages(GCODE_LOADING_MESSAGES, step === "loading-gcode");

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (uploadedPreviewUrl) URL.revokeObjectURL(uploadedPreviewUrl);
    };
  }, [uploadedPreviewUrl]);

  const redirectToLogin = useCallback(() => {
    const returnTo = window.location.pathname + window.location.search;
    window.location.href = `/login.html?return=${encodeURIComponent(returnTo)}`;
  }, []);

  const requireAccount = useCallback(async (): Promise<any | null> => {
    try {
      return await getAuthenticatedUser();
    } catch {
      redirectToLogin();
      return null;
    }
  }, [redirectToLogin]);

  const applyJob = useCallback(async (job: GenerationJob) => {
    const applyVersion = ++applyingJobRef.current;
    const sameJob = currentJobIdRef.current === job.id;
    currentJobIdRef.current = job.id;
    localStorage.setItem(ACTIVE_GENERATION_KEY, job.id);
    if (!mountedRef.current) return;

    setCurrentJob(job);
    setPromptText(job.prompt ?? "");
    if (!sameJob || job.status !== "completed") setPrice(null);
    setStep(current => sameJob && job.status === "completed" && current === "price-ready" ? current : stepFromJob(job));

    if (job.status === "failed") {
      setErrorMessage(job.error_message || "Não foi possível concluir a geração.");
    } else {
      setErrorMessage(null);
    }

    let nextImageUrl: string | null = null;
    if (job.image_path) {
      try {
        nextImageUrl = await createGenerationImageUrl(job.image_path, 24 * 60 * 60);
      } catch (error) {
        if (mountedRef.current && currentJobIdRef.current === job.id) {
          setErrorMessage(error instanceof Error ? error.message : "Não foi possível abrir a imagem salva.");
        }
      }
    }

    let nextModelUrl: string | null = null;
    if (job.status === "completed") {
      if (job.model_path) {
        try {
          nextModelUrl = await createGenerationModelUrl(job.model_path, 60 * 60);
        } catch (error) {
          if (mountedRef.current && currentJobIdRef.current === job.id) {
            setErrorMessage(error instanceof Error ? error.message : "Não foi possível abrir o modelo 3D salvo.");
          }
        }
      } else if (job.model_url) {
        nextModelUrl = job.model_url;
      }
    }

    if (!mountedRef.current || currentJobIdRef.current !== job.id || applyVersion !== applyingJobRef.current) return;
    setImageUrl(nextImageUrl);
    setModelUrl(nextModelUrl);
  }, []);

  const restoreJob = useCallback(async (generationId: string, showLoader = false) => {
    const cleanId = generationId.trim();
    if (!cleanId) return;
    if (showLoader) setRestoring(true);
    try {
      const job = await getGeneration(cleanId);
      await applyJob(job);
    } catch (error) {
      if (!mountedRef.current) return;
      localStorage.removeItem(ACTIVE_GENERATION_KEY);
      currentJobIdRef.current = null;
      setCurrentJob(null);
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível recuperar a geração.");
      setStep("start");
    } finally {
      if (mountedRef.current && showLoader) setRestoring(false);
    }
  }, [applyJob]);

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      try {
        await getAuthenticatedUser();
      } catch {
        if (!cancelled) redirectToLogin();
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const explicit = params.get("id")?.trim() || "";
      const saved = explicit ? "" : (localStorage.getItem(ACTIVE_GENERATION_KEY)?.trim() || "");
      const generationId = explicit || saved;
      if (generationId && !cancelled) {
        await restoreJob(generationId, false);
      }
      if (!cancelled && mountedRef.current) setRestoring(false);
    };
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [redirectToLogin, restoreJob]);

  useEffect(() => {
    if (!currentJob?.id) return undefined;
    const generationId = currentJob.id;
    const unsubscribe = subscribeToGeneration(
      generationId,
      nextJob => { void applyJob(nextJob); },
      () => undefined,
    );

    const poll = isGenerationBusy(currentJob)
      ? window.setInterval(() => {
          if (currentJobIdRef.current === generationId) {
            void restoreJob(generationId, false);
          }
        }, 10_000)
      : null;

    const onFocus = () => {
      if (currentJobIdRef.current === generationId) {
        void restoreJob(generationId, false);
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      unsubscribe();
      if (poll !== null) window.clearInterval(poll);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [applyJob, currentJob?.id, currentJob?.status, restoreJob]);

  const handleFinalizarPerguntas = async () => {
    if (submitting || !(await requireAccount())) return;

    const partes = [
      `Sujeito: ${answerSubject.trim()}`,
      `Estilo: ${answerStyle.trim()}`,
      `Pose: ${answerPose.trim()}`,
    ];
    if (answerOutfit.trim()) partes.push(`Roupa/acessórios/cores: ${answerOutfit.trim()}`);
    if (answerNotes.trim()) partes.push(`Observações extras: ${answerNotes.trim()}`);
    const promptFinal = partes.join(". ");

    setPromptText(promptFinal);
    setPrice(null);
    setErrorMessage(null);
    setStep("loading-image");
    setSubmitting(true);

    try {
      const job = await createPromptGeneration(promptFinal, answerSubject.trim());
      await applyJob(job);
    } catch (error) {
      if (!mountedRef.current) return;
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível iniciar a geração da imagem.");
      setStep("question-4");
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  };

  const handleGerarModelo = async () => {
    if (submitting || !currentJob || !imageUrl || !(await requireAccount())) return;
    setPrice(null);
    setErrorMessage(null);
    setStep("loading-model");
    setSubmitting(true);

    try {
      const job = await startModelGeneration(currentJob.id);
      await applyJob(job);
    } catch (error) {
      if (!mountedRef.current) return;
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível iniciar a geração do modelo 3D.");
      setStep("image-ready");
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  };

  const handleFatiarModelo = async () => {
    if (submitting || !currentJob || !modelUrl || !(await requireAccount())) return;
    setErrorMessage(null);
    setStep("loading-gcode");
    setSubmitting(true);

    try {
      const quote = await requestGenerationPrice(currentJob.id);
      if (!mountedRef.current) return;
      setPrice(quote.valor_final);
      setStep("price-ready");
    } catch (error) {
      if (!mountedRef.current) return;
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível consultar o preço calculado.");
      setStep("model-ready");
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  };

  const handleEnviarRefinamento = async () => {
    const mudanca = refineText.trim();
    if (submitting || !mudanca || !currentJob || !imageUrl || !(await requireAccount())) return;
    setPrice(null);
    setErrorMessage(null);
    setStep("loading-refine");
    setSubmitting(true);

    try {
      const job = await startImageRefinement(currentJob.id, mudanca);
      setRefineText("");
      await applyJob(job);
    } catch (error) {
      if (!mountedRef.current) return;
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível solicitar a alteração da imagem.");
      setStep("refine-question");
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  };

  const handleEnviarImagemPropria = async () => {
    if (submitting || !uploadedFile || !(await requireAccount())) return;
    setPrice(null);
    setErrorMessage(null);
    setStep("loading-model-from-upload");
    setSubmitting(true);

    try {
      const job = await createUploadGeneration(uploadedFile);
      await applyJob(job);
    } catch (error) {
      if (!mountedRef.current) return;
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível enviar a imagem e iniciar o modelo 3D.");
      setStep("upload-image");
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  };

  const handleRefazerImagem = () => {
    currentJobIdRef.current = null;
    localStorage.removeItem(ACTIVE_GENERATION_KEY);
    setCurrentJob(null);
    setImageUrl(null);
    setModelUrl(null);
    setPrice(null);
    setErrorMessage(null);
    setPromptText("");
    setAnswerSubject("");
    setAnswerStyle("");
    setAnswerPose("");
    setAnswerOutfit("");
    setAnswerNotes("");
    setRefineText("");
    setUploadedFile(null);
    if (uploadedPreviewUrl) URL.revokeObjectURL(uploadedPreviewUrl);
    setUploadedPreviewUrl(null);
    setStep("start");
    window.history.replaceState({}, "", "/criar-modelo.html");
  };

  const handleIrParaPagamento = async () => {
    if (submitting || !currentJob?.id || price === null) return;

    const user = await requireAccount();
    if (!user) return;

    setErrorMessage(null);
    setSubmitting(true);

    try {
      // Revalida o preço no backend imediatamente antes de abrir o checkout.
      // O checkout faz a mesma validação novamente e NÃO confia em preço vindo da URL/client.
      const quote = await requestGenerationPrice(currentJob.id);
      if (!mountedRef.current) return;

      const valorServidor = Number(quote.valor_final);
      if (!Number.isFinite(valorServidor) || valorServidor <= 0) {
        throw new Error("O servidor não retornou um preço válido para esta criação.");
      }

      setPrice(valorServidor);

      window.location.href =
        `/checkout.html?custom=1&generation_id=${encodeURIComponent(currentJob.id)}`;
    } catch (error) {
      if (!mountedRef.current) return;
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível abrir o checkout desta criação."
      );
      setStep("price-ready");
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  };

  const handleSelecionarArquivo = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      await validateGenerationUpload(file);
      if (uploadedPreviewUrl) URL.revokeObjectURL(uploadedPreviewUrl);
      setUploadedFile(file);
      setUploadedPreviewUrl(URL.createObjectURL(file));
      setErrorMessage(null);
    } catch (error) {
      event.target.value = "";
      setUploadedFile(null);
      if (uploadedPreviewUrl) URL.revokeObjectURL(uploadedPreviewUrl);
      setUploadedPreviewUrl(null);
      setErrorMessage(error instanceof Error ? error.message : `A imagem deve ser PNG/JPEG e ter no máximo ${MAX_GENERATION_UPLOAD_BYTES / (1024 * 1024)} MB.`);
    }
  };

  const handleVoltarAoMenu = () => {
    window.location.href = "https://freofigures.com.br";
  };

  if (restoring) {
    return (
      <div className="min-h-screen bg-freo-black text-freo-light font-body flex items-center justify-center px-5">
        <div className="text-center">
          <div className="w-14 h-14 border-2 border-freo-orange border-t-transparent rounded-full animate-spin mx-auto mb-6" />
          <p className="font-display font-bold text-lg uppercase tracking-wide text-white mb-2">Recuperando sua criação</p>
          <p className="font-mono text-sm text-freo-orange">Consultando o status salvo no Supabase...</p>
        </div>
      </div>
    );
  }
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
          <button
            onClick={handleVoltarAoMenu}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
            aria-label="Voltar ao menu principal do site"
          >
            <img
              src="https://rrmxqpvxrpcqqxsgccqw.supabase.co/storage/v1/object/public/imagens/logo.jpg"
              alt="Logo"
              className="w-9 h-9 rounded-full object-cover border-2 border-freo-orange shadow-[0_0_8px_rgba(221,175,52,0.4)]"
              onError={(event) => { (event.target as HTMLImageElement).style.display = "none"; }}
            />
            <span className="font-display font-black text-xl tracking-tighter uppercase">
              Freo<span className="text-freo-orange font-light">Figures</span>
            </span>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => { window.location.href = "/minhas-criacoes.html"; }}
              className="font-mono text-[10px] text-white/50 border border-white/10 px-3 py-1.5 uppercase tracking-widest hover:text-freo-orange hover:border-freo-orange/30 transition-colors"
            >
              Minhas Criações
            </button>
            <span className="hidden sm:inline font-mono text-[10px] text-freo-orange border border-freo-orange/30 bg-freo-orange/8 px-3 py-1 uppercase tracking-widest">
              Criar Modelo 3D
            </span>
          </div>
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

            {/* ── TELA INICIAL: ESCOLHER FLUXO ──────────────────────────── */}
            {step === "start" && (
              <motion.div
                key="start"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.35 }}
              >
                <div className="text-center mb-8">
                  <div className="inline-flex items-center gap-2 border border-freo-orange/20 bg-freo-orange/5 px-3 py-1.5 mb-5">
                    <Sparkles className="w-3.5 h-3.5 text-freo-orange" />
                    <span className="font-mono text-[10px] text-freo-orange uppercase tracking-[0.18em]">
                      Gerado por IA
                    </span>
                  </div>
                  <h1 className="font-display font-black text-3xl md:text-5xl uppercase tracking-tighter leading-[0.95] mb-3">
                    Como você quer <span className="text-freo-orange">começar?</span>
                  </h1>
                  <p className="text-freo-light/50 font-body text-sm md:text-base max-w-lg mx-auto">
                    Responda algumas perguntas para gerar sua imagem do zero, ou envie uma imagem sua para virar modelo 3D direto.
                  </p>
                </div>

                <div className="mb-4 border border-freo-orange/20 bg-freo-orange/5 px-4 py-3 font-mono text-[11px] text-white/45 leading-relaxed">
                  Tudo fica vinculado à sua conta: você pode fechar esta página durante o processamento e acompanhar depois em <button onClick={() => { window.location.href = "/minhas-criacoes.html"; }} className="text-freo-orange hover:underline">Minhas Criações 3D</button>.
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button
                    onClick={() => setStep("question-1")}
                    className="bg-[#111111] border border-white/[0.07] hover:border-freo-orange/50 transition-all p-6 text-left group"
                  >
                    <Sparkles className="w-6 h-6 text-freo-orange mb-3" />
                    <p className="font-display font-bold text-lg uppercase tracking-wide text-white mb-1">
                      Responder perguntas
                    </p>
                    <p className="text-freo-light/50 font-body text-sm">
                      A IA cria sua imagem com base nas suas respostas.
                    </p>
                  </button>
                  <button
                    onClick={() => setStep("upload-image")}
                    className="bg-[#111111] border border-white/[0.07] hover:border-freo-orange/50 transition-all p-6 text-left group"
                  >
                    <Box className="w-6 h-6 text-freo-orange mb-3" />
                    <p className="font-display font-bold text-lg uppercase tracking-wide text-white mb-1">
                      Enviar minha imagem
                    </p>
                    <p className="text-freo-light/50 font-body text-sm">
                      Já tenho uma imagem pronta — gerar o modelo 3D direto.
                    </p>
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── UPLOAD: ENVIAR IMAGEM PRÓPRIA ─────────────────────────── */}
            {step === "upload-image" && (
              <motion.div
                key="upload-image"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.35 }}
              >
                <div className="text-center mb-8">
                  <div className="inline-flex items-center gap-2 border border-freo-orange/20 bg-freo-orange/5 px-3 py-1.5 mb-5">
                    <Box className="w-3.5 h-3.5 text-freo-orange" />
                    <span className="font-mono text-[10px] text-freo-orange uppercase tracking-[0.18em]">
                      Enviar imagem
                    </span>
                  </div>
                  <h1 className="font-display font-black text-3xl md:text-5xl uppercase tracking-tighter leading-[0.95] mb-3">
                    Envie sua <span className="text-freo-orange">imagem</span>
                  </h1>
                  <p className="text-freo-light/50 font-body text-sm md:text-base max-w-lg mx-auto">
                    Vamos gerar o modelo 3D diretamente a partir da imagem que você enviar.
                  </p>
                </div>

                <div className="bg-[#111111] border border-white/[0.07] p-5 md:p-6">
                  <label className="block font-mono text-[10px] uppercase tracking-[0.1em] text-white/35 mb-2">
                    Arquivo de imagem
                  </label>

                  {uploadedPreviewUrl ? (
                    <div className="aspect-square w-full bg-[#0A0A0A] overflow-hidden mb-4">
                      <img
                        src={uploadedPreviewUrl}
                        alt="Prévia da imagem enviada"
                        className="w-full h-full object-contain"
                      />
                    </div>
                  ) : (
                    <div className="aspect-square w-full bg-[#0A0A0A] border border-dashed border-white/15 flex items-center justify-center mb-4">
                      <p className="font-mono text-xs text-white/30 uppercase tracking-widest">
                        Nenhuma imagem selecionada
                      </p>
                    </div>
                  )}

                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleSelecionarArquivo}
                    className="w-full text-sm text-freo-light/70 font-mono file:mr-4 file:py-2.5 file:px-4 file:border-0 file:font-display file:font-bold file:uppercase file:tracking-widest file:bg-freo-orange file:text-freo-black hover:file:bg-white file:transition-colors file:cursor-pointer"
                  />

                  <div className="grid grid-cols-2 gap-3 mt-4">
                    <button
                      onClick={() => setStep("start")}
                      className="flex items-center justify-center gap-2 border border-white/15 text-white font-display font-bold uppercase tracking-widest px-6 py-3.5 hover:border-freo-orange/50 hover:bg-freo-orange/5 transition-all active:scale-[0.99]"
                    >
                      Voltar
                    </button>
                    <button
                      onClick={handleEnviarImagemPropria}
                      disabled={!uploadedFile}
                      className="bg-freo-orange text-freo-black font-display font-bold uppercase tracking-widest px-6 py-3.5 hover:bg-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.99]"
                    >
                      Gerar Modelo 3D
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── LOADING: GERANDO MODELO 3D A PARTIR DO UPLOAD ─────────── */}
            {step === "loading-model-from-upload" && (
              <motion.div
                key="loading-model-from-upload"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35 }}
                className="flex flex-col items-center justify-center text-center py-20"
              >
                {uploadedPreviewUrl && (
                  <div className="w-28 h-28 mb-6 border border-white/10 bg-[#111111] overflow-hidden opacity-60">
                    <img src={uploadedPreviewUrl} alt="Imagem enviada" className="w-full h-full object-contain" />
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
                <button
                  onClick={() => { window.location.href = `/minhas-criacoes.html?id=${encodeURIComponent(currentJob?.id ?? "")}`; }}
                  className="w-full mt-3 flex items-center justify-center gap-2 border border-white/10 text-white/60 font-display font-bold uppercase tracking-widest px-6 py-3 hover:border-freo-orange/30 hover:text-freo-orange transition-all"
                >
                  Ver em Minhas Criações 3D
                </button>
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
                    onClick={handleFatiarModelo}
                    className="flex items-center justify-center gap-2 bg-freo-orange text-freo-black font-display font-bold uppercase tracking-widest px-6 py-3.5 hover:bg-white transition-colors active:scale-[0.99]"
                  >
                    <DollarSign className="w-4 h-4" />
                    Ver Preço
                  </button>
                </div>
                <button
                  onClick={() => { window.location.href = `/minhas-criacoes.html?id=${encodeURIComponent(currentJob?.id ?? "")}`; }}
                  className="w-full mt-3 flex items-center justify-center gap-2 border border-white/10 text-white/60 font-display font-bold uppercase tracking-widest px-6 py-3 hover:border-freo-orange/30 hover:text-freo-orange transition-all"
                >
                  Ver em Minhas Criações 3D
                </button>
              </motion.div>
            )}

            {/* ── LOADING: FATIANDO MODELO E CALCULANDO PREÇO ───────────── */}
            {step === "loading-gcode" && (
              <motion.div
                key="loading-gcode"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35 }}
                className="flex flex-col items-center justify-center text-center py-20"
              >
                <div className="w-14 h-14 border-2 border-freo-orange border-t-transparent rounded-full animate-spin mb-6" />
                <p className="font-display font-bold text-lg uppercase tracking-wide text-white mb-2">
                  Calculando o preço
                </p>
                <p className="font-mono text-sm text-freo-orange fcm-pulse">
                  {gcodeLoadingMessage}
                </p>
              </motion.div>
            )}

            {/* ── ETAPA 4: PREÇO PRONTO ─────────────────────────────────── */}
            {step === "price-ready" && price !== null && (
              <motion.div
                key="price-ready"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.35 }}
              >
                <div className="text-center mb-6">
                  <h2 className="font-display font-black text-2xl md:text-3xl uppercase tracking-tighter mb-2">
                    Preço da sua <span className="text-freo-orange">peça</span>
                  </h2>
                  <p className="text-freo-light/50 font-body text-sm">
                    Valor calculado após o fatiamento do modelo 3D.
                  </p>
                </div>

                {modelUrl && (
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
                )}

                <div className="bg-[#111111] border border-freo-orange/30 p-6 mb-5 text-center">
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-white/35 mb-2">
                    Preço estimado
                  </p>
                  <p className="font-display font-black text-4xl md:text-5xl text-freo-orange tracking-tighter">
                    {price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    onClick={() => setStep("model-ready")}
                    className="flex items-center justify-center gap-2 border border-white/15 text-white font-display font-bold uppercase tracking-widest px-6 py-3.5 hover:border-freo-orange/50 hover:bg-freo-orange/5 transition-all active:scale-[0.99]"
                  >
                    Voltar
                  </button>
                  <button
                    onClick={handleIrParaPagamento}
                    disabled={submitting}
                    className="flex items-center justify-center gap-2 bg-freo-orange text-freo-black font-display font-bold uppercase tracking-widest px-6 py-3.5 hover:bg-white transition-colors active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <DollarSign className="w-4 h-4" />
                    {submitting ? "Abrindo Checkout..." : "Seguir para Checkout"}
                  </button>
                </div>
                <button
                  onClick={() => { window.location.href = `/minhas-criacoes.html?id=${encodeURIComponent(currentJob?.id ?? "")}`; }}
                  className="w-full mt-3 flex items-center justify-center gap-2 border border-white/10 text-white/60 font-display font-bold uppercase tracking-widest px-6 py-3 hover:border-freo-orange/30 hover:text-freo-orange transition-all"
                >
                  Ver em Minhas Criações 3D
                </button>
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
