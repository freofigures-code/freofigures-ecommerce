export const GENERATIONS_BUCKET = 'generations';
export const MAX_GENERATION_UPLOAD_BYTES = 20 * 1024 * 1024;

export type GenerationSourceType = 'prompt' | 'upload';
export type GenerationStatus =
  | 'queued'
  | 'generating_image'
  | 'image_ready'
  | 'refining_image'
  | 'generating_model'
  | 'completed'
  | 'failed';

export type GenerationOperation =
  | 'generate_image'
  | 'refine_image'
  | 'generate_model'
  | 'generate_model_from_upload';

export type GenerationJob = {
  id: string;
  user_id: string;
  user_email: string | null;
  title: string;
  source_type: GenerationSourceType;
  status: GenerationStatus;
  active_operation: GenerationOperation | null;
  active_operation_id: string | null;
  prompt: string | null;
  refinement_text: string | null;
  input_image_name: string | null;
  input_image_type: string | null;
  image_path: string | null;
  rendered_image_path: string | null;
  model_path: string | null;
  model_url: string | null;
  tripo_task_id: string | null;
  tripo_status: string | null;
  progress: number;
  retry_count: number;
  error_message: string | null;
  metadata: Record<string, unknown>;
  operation_started_at: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

type StartGenerationArgs = {
  p_action: GenerationOperation;
  p_generation_id?: string | null;
  p_prompt?: string | null;
  p_refinement_text?: string | null;
  p_input_image_path?: string | null;
  p_input_image_name?: string | null;
  p_input_image_type?: string | null;
  p_title?: string | null;
};

export type GenerationPriceQuote = {
  success: true;
  generation_id: string;
  title: string;
  valor_final: number;
  image_url: string | null;
  gramas?: number;
  tempo_estimado?: string | null;
  tempo_segundos?: number;
  horas_impressao?: number | null;
};

function getSupabase(): any {
  // O e-commerce já inicializa o mesmo projeto Supabase usado pelo app.
  // @ts-ignore
  const client = window.supabaseClient || window.supabase;
  if (!client || typeof client.from !== 'function' || !client.auth) {
    throw new Error('Supabase não foi inicializado nesta página.');
  }
  return client;
}

export async function getAuthenticatedUser(): Promise<any> {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const session = data?.session;
  if (!session?.user) throw new Error('É necessário entrar na sua conta para criar e salvar modelos 3D.');
  return session.user;
}

function normalizeJob(value: unknown): GenerationJob {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== 'object') {
    throw new Error('O Supabase não retornou os dados da geração.');
  }
  return row as GenerationJob;
}

async function callStartGeneration(args: StartGenerationArgs): Promise<GenerationJob> {
  const supabase = getSupabase();
  await getAuthenticatedUser();

  const { data, error } = await supabase.rpc('start_generation', {
    p_action: args.p_action,
    p_generation_id: args.p_generation_id ?? null,
    p_prompt: args.p_prompt ?? null,
    p_refinement_text: args.p_refinement_text ?? null,
    p_input_image_path: args.p_input_image_path ?? null,
    p_input_image_name: args.p_input_image_name ?? null,
    p_input_image_type: args.p_input_image_type ?? null,
    p_title: args.p_title ?? null,
  });

  if (error) throw error;
  return normalizeJob(data);
}

export async function createPromptGeneration(prompt: string, title?: string): Promise<GenerationJob> {
  const cleanPrompt = prompt.trim();
  if (!cleanPrompt) throw new Error('O prompt é obrigatório.');

  return callStartGeneration({
    p_action: 'generate_image',
    p_prompt: cleanPrompt,
    p_title: title?.trim() || null,
  });
}

export async function startModelGeneration(generationId: string): Promise<GenerationJob> {
  const cleanId = generationId.trim();
  if (!cleanId) throw new Error('generationId é obrigatório.');
  return callStartGeneration({
    p_action: 'generate_model',
    p_generation_id: cleanId,
  });
}

export async function startImageRefinement(
  generationId: string,
  refinementText: string,
): Promise<GenerationJob> {
  const cleanId = generationId.trim();
  const clean = refinementText.trim();
  if (!cleanId) throw new Error('generationId é obrigatório.');
  if (!clean) throw new Error('Descreva o que deseja mudar.');

  return callStartGeneration({
    p_action: 'refine_image',
    p_generation_id: cleanId,
    p_refinement_text: clean,
  });
}

export async function validateGenerationUpload(file: File): Promise<'image/png' | 'image/jpeg'> {
  if (!(file instanceof File)) throw new Error('Selecione um arquivo de imagem válido.');
  if (file.size <= 0) throw new Error('A imagem selecionada está vazia.');
  if (file.size > MAX_GENERATION_UPLOAD_BYTES) {
    throw new Error('A imagem ultrapassa o limite de 20 MB aceito pelo gerador 3D.');
  }

  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const isPng = head.length >= 8
    && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47
    && head[4] === 0x0d && head[5] === 0x0a && head[6] === 0x1a && head[7] === 0x0a;
  if (isPng) return 'image/png';

  const isJpeg = head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  if (isJpeg) return 'image/jpeg';

  throw new Error('Formato não suportado. Selecione uma imagem PNG ou JPEG/JPG.');
}

function randomUuid(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  throw new Error('Este navegador não oferece o gerador seguro de UUID necessário para o upload. Atualize o navegador e tente novamente.');
}

export async function createUploadGeneration(file: File): Promise<GenerationJob> {
  const supabase = getSupabase();
  const user = await getAuthenticatedUser();
  const mimeType = await validateGenerationUpload(file);
  const extension = mimeType === 'image/png' ? 'png' : 'jpg';
  const uploadId = randomUuid();
  const path = `${user.id}/${uploadId}/upload.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(GENERATIONS_BUCKET)
    .upload(path, file, {
      contentType: mimeType,
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) throw uploadError;

  try {
    return await callStartGeneration({
      p_action: 'generate_model_from_upload',
      p_input_image_path: path,
      p_input_image_name: file.name || `upload.${extension}`,
      p_input_image_type: mimeType,
      p_title: file.name || `upload.${extension}`,
    });
  } catch (error) {
    try {
      await supabase.storage.from(GENERATIONS_BUCKET).remove([path]);
    } catch {
      // O erro principal da criação deve ser preservado.
    }
    throw error;
  }
}

export async function getGeneration(generationId: string): Promise<GenerationJob> {
  const supabase = getSupabase();
  const cleanId = generationId.trim();
  if (!cleanId) throw new Error('generationId é obrigatório.');

  const { data, error } = await supabase
    .from('generation_jobs')
    .select('*')
    .eq('id', cleanId)
    .single();

  if (error) throw error;
  return data as GenerationJob;
}

export async function listGenerations(): Promise<GenerationJob[]> {
  const supabase = getSupabase();
  await getAuthenticatedUser();

  const { data, error } = await supabase
    .from('generation_jobs')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as GenerationJob[];
}

export async function createGenerationImageUrl(path: string | null, expiresInSeconds = 3600): Promise<string | null> {
  if (!path) return null;
  const supabase = getSupabase();
  const { data, error } = await supabase.storage
    .from(GENERATIONS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data?.signedUrl ?? null;
}

export async function createGenerationModelUrl(path: string | null, expiresInSeconds = 3600): Promise<string | null> {
  if (!path) return null;
  const supabase = getSupabase();
  const { data, error } = await supabase.storage
    .from(GENERATIONS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data?.signedUrl ?? null;
}

export async function requestGenerationPrice(generationId: string): Promise<GenerationPriceQuote> {
  const supabase = getSupabase();
  const cleanId = generationId.trim();
  if (!cleanId) throw new Error('generationId é obrigatório.');
  await getAuthenticatedUser();

  const { data, error } = await supabase.functions.invoke('generation-price-quote', {
    body: { generation_id: cleanId },
  });

  if (error) {
    const contextMessage = error?.context?.body?.error || error?.context?.error;
    throw new Error(contextMessage || error.message || 'Não foi possível consultar o preço.');
  }
  if (!data || typeof data !== 'object') {
    throw new Error('A Edge Function de preço retornou uma resposta inválida.');
  }

  const body = data as Record<string, unknown>;
  if (body.success !== true) {
    const message = typeof body.error === 'string' && body.error.trim()
      ? body.error.trim()
      : 'Não foi possível consultar o preço.';
    throw new Error(message);
  }

  const valor = Number(body.valor_final);
  if (!Number.isFinite(valor) || valor <= 0) {
    throw new Error('A Edge Function não retornou um valor_final numérico válido.');
  }

  return {
    success: true,
    generation_id: typeof body.generation_id === 'string' ? body.generation_id : cleanId,
    title: typeof body.title === 'string' ? body.title : 'Modelo 3D personalizado',
    valor_final: Number(valor.toFixed(2)),
    image_url: typeof body.image_url === 'string' ? body.image_url : null,
    gramas: Number.isFinite(Number(body.gramas)) ? Number(body.gramas) : undefined,
    tempo_estimado: typeof body.tempo_estimado === 'string' ? body.tempo_estimado : null,
    tempo_segundos: Number.isFinite(Number(body.tempo_segundos)) ? Number(body.tempo_segundos) : undefined,
    horas_impressao: Number.isFinite(Number(body.horas_impressao)) ? Number(body.horas_impressao) : null,
  };
}

export function subscribeToGeneration(
  generationId: string,
  onChange: (job: GenerationJob) => void,
  onError?: (message: string) => void,
): () => void {
  const supabase = getSupabase();
  const channel = supabase
    .channel(`generation-web-${generationId}-${randomUuid()}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'generation_jobs',
        filter: `id=eq.${generationId}`,
      },
      (payload: any) => {
        if (payload?.new && typeof payload.new === 'object') {
          onChange(payload.new as GenerationJob);
        }
      },
    )
    .subscribe((status: string) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        onError?.('A atualização em tempo real foi interrompida; o acompanhamento por consulta periódica continua ativo.');
      }
    });

  return () => {
    void supabase.removeChannel(channel);
  };
}

export function isGenerationBusy(job: GenerationJob | null): boolean {
  if (!job) return false;
  return ['queued', 'generating_image', 'refining_image', 'generating_model'].includes(job.status);
}

export function generationStatusLabel(job: GenerationJob): string {
  switch (job.status) {
    case 'queued': return 'Na fila';
    case 'generating_image': return 'Gerando imagem';
    case 'image_ready': return 'Imagem pronta';
    case 'refining_image': return 'Refazendo imagem';
    case 'generating_model': return 'Gerando modelo 3D e calculando preço';
    case 'completed': return 'Modelo 3D pronto';
    case 'failed': return 'Falhou';
  }
}
