const client = window.supabaseClient;
const list = document.getElementById('publications');
const message = document.getElementById('message');
const filter = document.getElementById('status');
const more = document.getElementById('load-more');
const labels = { pending: 'Aguardando aprovação', approved: 'Aprovado', rejected: 'Não aprovado' };
let offset = 0;
let version = 0;
const pageSize = 24;
const element = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
};

async function renderItem(item) {
  const card = element('article', '', 'card');
  const preview = element('div', '', 'preview');
  card.append(preview);
  const content = element('div', '', 'card-content');
  content.append(element('span', labels[item.status], 'badge'), element('h2', item.title));
  content.append(element('p', `Enviado em ${new Date(item.consented_at).toLocaleString('pt-BR')}`, 'muted'));
  content.append(element('p', Number(item.quoted_price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), 'price'));
  content.append(element('p', 'Preço validado pelo servidor ao enviar a criação.', 'muted'));
  const assets = await Promise.allSettled([
    client.storage.from('generation-publications').createSignedUrl(item.image_path, 3600),
    client.storage.from('generation-publications').createSignedUrl(item.model_path, 3600),
  ]);
  const image = assets[0].status === 'fulfilled' && assets[0].value.data?.signedUrl;
  if (image) {
    const img = element('img'); img.src = image; img.alt = item.title; img.loading = 'lazy'; preview.append(img);
  } else preview.append(element('p', 'Prévia indisponível. Atualize antes de aprovar.'));
  const model = assets[1].status === 'fulfilled' && assets[1].value.data?.signedUrl;
  if (model) {
    const link = element('a', 'Abrir arquivo 3D para revisão ↗');
    link.href = model; link.target = '_blank'; link.rel = 'noopener'; content.append(link);
  }
  if (item.status === 'pending') {
    const form = element('form');
    const stockLabel = element('label', 'Quantidade disponível para venda');
    const stock = element('input'); stock.type = 'number'; stock.min = '1'; stock.max = '100000'; stock.step = '1'; stock.value = '1'; stock.required = true;
    stockLabel.append(stock);
    const reasonLabel = element('label', 'Motivo da recusa (opcional, visível ao autor)');
    const reason = element('textarea'); reason.maxLength = 1000; reason.rows = 2; reasonLabel.append(reason);
    const buttons = element('div', '', 'actions');
    const approve = element('button', 'Aprovar e publicar'); approve.type = 'submit'; approve.disabled = !image || !model;
    const reject = element('button', 'Não aprovar', 'secondary'); reject.type = 'button';
    buttons.append(approve, reject);
    const error = element('p', '', 'error'); error.setAttribute('role', 'alert');
    form.append(stockLabel, reasonLabel, buttons, error);
    const decide = async approved => {
      if (approved && !form.reportValidity()) return;
      approve.disabled = true; reject.disabled = true; error.textContent = '';
      try {
        const { data, error: failure } = await client.functions.invoke('generation-publication', { body: { action: 'review', publication_id: item.id, approve: approved, stock: Number(stock.value), reason: reason.value.trim() } });
        if (failure || !data?.publication) throw new Error(data?.error || 'Não foi possível salvar a decisão. Atualize e tente novamente.');
        message.textContent = `Decisão salva: ${labels[data.publication.status]}.`;
        await load(true);
      } catch (failure) {
        error.textContent = failure.message || 'Falha ao revisar a criação.';
        approve.disabled = !image || !model; reject.disabled = false;
      }
    };
    form.addEventListener('submit', event => { event.preventDefault(); void decide(true); });
    reject.addEventListener('click', () => { void decide(false); });
    content.append(form);
  } else {
    if (item.rejection_reason) content.append(element('p', item.rejection_reason));
    if (item.product_id) {
      const link = element('a', 'Ver produto publicado →'); link.href = `/produto?id=${encodeURIComponent(item.product_id)}`; content.append(link);
    }
  }
  card.append(content);
  return card;
}

async function load(reset = false) {
  const request = ++version;
  if (reset) { offset = 0; list.replaceChildren(); }
  more.disabled = true; filter.disabled = true;
  document.getElementById('loading').hidden = false;
  try {
    const { data, error } = await client.from('generation_publications').select('*').eq('status', filter.value)
      .order('consented_at', { ascending: false }).order('id').range(offset, offset + pageSize - 1);
    if (error) throw error;
    const cards = await Promise.all(data.map(renderItem));
    if (request !== version) return;
    list.append(...cards); offset += data.length;
    more.hidden = data.length < pageSize;
    if (!offset) list.append(element('p', 'Nenhuma criação nesta situação.', 'empty'));
  } catch {
    message.textContent = 'Não foi possível carregar as solicitações. Use Atualizar para tentar novamente.';
  } finally {
    if (request === version) { more.disabled = false; filter.disabled = false; document.getElementById('loading').hidden = true; }
  }
}

async function loadCreatorHandles() {
  const container = document.getElementById('creator-handles');
  const result = await client.from('creator_profiles').select('user_id,handle,pending_handle,requested_at')
    .not('pending_handle', 'is', null).order('requested_at', { ascending: true });
  if (result.error) { container.textContent = 'Não foi possível carregar os nomes pendentes.'; return; }
  container.replaceChildren();
  if (!result.data.length) { container.append(element('p', 'Nenhum nome aguardando aprovação.', 'muted')); return; }
  for (const row of result.data) {
    const card = element('article', '', 'card card-content');
    card.append(element('p', `Atual: @${row.handle} → Solicitado: @${row.pending_handle}`));
    const actions = element('div', '', 'actions');
    const approve = element('button', 'Aprovar @nome');
    const reject = element('button', 'Recusar', 'secondary');
    const error = element('p', '', 'error'); error.setAttribute('role', 'alert');
    const decide = async decision => {
      approve.disabled = reject.disabled = true; error.textContent = '';
      const response = await client.rpc('review_creator_handle', { p_user_id: row.user_id, p_approve: decision });
      if (response.error) { error.textContent = response.error.message || 'Falha ao salvar decisão.'; approve.disabled = reject.disabled = false; return; }
      message.textContent = decision ? `Nome @${response.data} aprovado.` : 'Nome recusado.';
      await loadCreatorHandles();
    };
    approve.onclick = () => void decide(true); reject.onclick = () => void decide(false);
    actions.append(approve, reject); card.append(actions, error); container.append(card);
  }
}

async function init() {
  try {
    const { data, error } = await client.auth.getUser();
    if (error || !data?.user) { location.href = '/login.html?return=%2Fadmin%2Fcriacoes.html'; return; }
    const result = await client.from('profiles').select('is_admin').eq('id', data.user.id).single();
    if (result.error || !result.data?.is_admin) { message.textContent = 'Acesso restrito ao administrador.'; return; }
    document.getElementById('controls').hidden = false;
    filter.addEventListener('change', () => load(true));
    document.getElementById('refresh').addEventListener('click', () => load(true));
    more.addEventListener('click', () => load());
    await load(true);
    await loadCreatorHandles();
  } catch { message.textContent = 'Não foi possível verificar seu acesso. Recarregue a página.'; }
}
void init();
