/* FreoFigures / Coleção viva — v2. Sem dependências adicionais.
   A página utiliza o mesmo Supabase, tabelas e checkout do projeto original. */
'use strict';
var product = null, currentUser = null, qty = 1, maxStock = 0;
var selectedVariants = {}, variantGroups = [], kitFixedItems = [], kitFixedPrice = null;
var galleryItems = [], galleryIndex = 0, purchaseBusy = false, toastTimer;
var viewerProduct = false, viewerExternal = null, zoom = 1, pan = { x: 0, y: 0 }, drag = null;
var lastSwipeAt = 0, stickyObserver, dialogOpener = null;
var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
var formatCurrency = function (value) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0); };
function el(id) { return document.getElementById(id); }
function text(id, value) { var node = el(id); if (node)
    node.textContent = value; }
function escapeHtml(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function asArray(value) { if (Array.isArray(value))
    return value; if (typeof value === 'string') {
    try {
        var parsed = JSON.parse(value);
        if (Array.isArray(parsed))
            return parsed;
    }
    catch (_) { }
} return []; }
function normalized(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function safeUrl(value) { if (typeof value !== 'string' || !value.trim())
    return ''; try {
    var u = new URL(value.trim(), location.href);
    return /^https?:$/.test(u.protocol) ? u.href : '';
}
catch (_) {
    return '';
} }
function imageUrls(p) { return asArray(p.images).map(safeUrl).filter(Boolean); }
function basePrice(p) { var price = Number(p.price), promo = p.promotional_price; return promo != null && Number.isFinite(Number(promo)) && Number(promo) >= 0 && Number(promo) < price ? Number(promo) : price; }
function normalizeVariants(p) {
    return asArray(p.variants).filter(function (v) { return v && v.name && asArray(v.options).length; }).map(function (v) {
        return { name: String(v.name), priced: !!v.per_option_price, options: asArray(v.options).map(function (o) {
                var name = typeof o === 'object' && o ? String(o.name || '') : String(o || '');
                var price = v.per_option_price && o && typeof o === 'object' && o.price != null && o.price !== '' && Number.isFinite(Number(o.price)) && Number(o.price) >= 0 ? Number(o.price) : null;
                return { name: name, price: price };
            }).filter(function (o) { return o.name; }) };
    }).filter(function (v) { return v.options.length; });
}
function applyKitDiscount(sum, type, value) { var result = type === 'fixed' ? sum - (Number(value) || 0) : sum * (1 - (Number(value) || 0) / 100); return Math.max(0, Math.round(result * 100) / 100); }
function getEffectivePrice() {
    if (product && product.is_kit && product.kit_type === 'fixed')
        return kitFixedPrice;
    // Preserva a regra do catálogo: o primeiro grupo com preço substitui o preço-base.
    var keys = Object.keys(selectedVariants).sort(function (a, b) { return Number(a) - Number(b); });
    for (var i = 0; i < keys.length; i++) {
        var selected = selectedVariants[keys[i]];
        if (selected.optionPrice != null)
            return selected.optionPrice;
    }
    return product ? basePrice(product) : 0;
}
function allSelected() { return variantGroups.every(function (_, i) { return !!selectedVariants[i]; }); }
function selectionText() { return Object.keys(selectedVariants).map(function (k) { var s = selectedVariants[k]; return s.variantName + ': ' + s.optionName; }).join(' · '); }
function scrollToNode(node) { if (node)
    node.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'center' }); }
function showToast(message, type, duration) { var node = el('toast'); node.textContent = message; node.className = 'show ' + (type || 'success'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { node.classList.remove('show'); }, duration || 3800); }
window.trackEvent = function (type, id, name) {
    try {
        var db = window.supabaseClient;
        if (!db)
            return;
        var sid = sessionStorage.getItem('freo_sid');
        if (!sid) {
            sid = 'sid_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
            sessionStorage.setItem('freo_sid', sid);
        }
        Promise.resolve(db.from('analytics_events').insert({ event_type: type, product_id: id || null, product_name: name || null, page: location.pathname + location.search, session_id: sid, referrer: document.referrer || null, user_agent: navigator.userAgent.slice(0, 200) })).catch(function () { });
    }
    catch (_) { }
};
function getYouTubeEmbed(value) {
    try {
        var u = new URL(value), host = u.hostname.replace(/^www\./, '');
        var id = host === 'youtu.be' ? u.pathname.slice(1) : (['youtube.com', 'm.youtube.com', 'youtube-nocookie.com'].includes(host) ? (u.searchParams.get('v') || u.pathname.split('/').pop()) : '');
        return /^[A-Za-z0-9_-]{11}$/.test(id) ? 'https://www.youtube-nocookie.com/embed/' + id : null;
    }
    catch (_) {
        return null;
    }
}
async function loadKitFixedItems(p) {
    var db = window.supabaseClient;
    var relations = await db.from('product_kit_items').select('child_product_id').eq('kit_product_id', p.id);
    if (relations.error || !relations.data || !relations.data.length)
        throw new Error('Não foi possível carregar os itens deste kit. Tente novamente.');
    var ids = relations.data.map(function (r) { return r.child_product_id; });
    var children = await db.from('products').select('id,title,price,promotional_price,images').in('id', ids);
    if (children.error || !children.data || children.data.length !== new Set(ids).size)
        throw new Error('Não foi possível calcular este kit. Tente novamente.');
    kitFixedItems = ids.map(function (id) { return children.data.find(function (c) { return String(c.id) === String(id); }); });
    var sum = kitFixedItems.reduce(function (total, item) { return total + basePrice(item); }, 0);
    if (!Number.isFinite(sum))
        throw new Error('O preço deste kit está indisponível.');
    kitFixedPrice = applyKitDiscount(sum, p.kit_discount_type, p.kit_discount_value);
}
function applyEditorial(p) {
    var category = normalized(p.category), copy = ['Seu universo.', 'Bem de perto.'];
    if (/anime|games|filmes|series|geek/.test(category))
        copy = ['Seu universo.', 'Fora da tela.'];
    else if (/keycap|setup/.test(category))
        copy = ['Seu setup.', 'Sua assinatura.'];
    else if (/religio|sacro|catolic/.test(category))
        copy = ['Sua fé.', 'Mais presente.'];
    else if (/decor/.test(category))
        copy = ['Seu espaço.', 'Mais seu.'];
    text('editorial-line-one', copy[0]);
    text('editorial-line-two', copy[1]);
    text('edition-number', 'FIG. ' + String(p.id).padStart(4, '0'));
    text('edition-category', String(p.category || 'FREOFIGURES').toUpperCase());
    text('stage-label', 'FREO / ' + String(p.category || 'FIGURES').toUpperCase());
}
function optionVisual(group, option) {
    if (/cor|color/.test(normalized(group.name))) {
        var colors = { preto: '#252525', branco: '#f7f5ea', vermelho: '#c43e38', amarelo: '#e4c65e', azul: '#4c75bd', verde: '#6c9362', roxo: '#8b6aba', rosa: '#df9ebd', laranja: '#e78940', dourado: '#c3a34f', prata: '#b9bdc1', cinza: '#929792', marrom: '#775f49', translucido: '#d9e6e8' };
        var found = normalized(option.name).split(/\W+/).filter(function (w) { return colors[w]; }).map(function (w) { return colors[w]; });
        if (found.length)
            return '<span class="color-swatch" aria-hidden="true" style="background:' + (found.length > 1 ? 'linear-gradient(135deg,' + found[0] + ' 50%,' + found[1] + ' 50%)' : found[0]) + '"></span>';
    }
    if (/tamanho|altura/.test(normalized(group.name)) && /^\d+([.,]\d+)?\s*(cm|mm)$/i.test(option.name.trim())) {
        var measures = group.options.map(function (o) { return parseFloat(o.name.replace(',', '.')) || 0; }), max = Math.max.apply(null, measures);
        return '<span class="size-mark" aria-hidden="true"><i style="height:' + Math.max(25, Math.round(parseFloat(option.name.replace(',', '.')) / max * 100)) + '%"></i></span>';
    }
    return '';
}
function renderVariants() {
    el('variants-section').innerHTML = variantGroups.map(function (group, i) {
        var options = group.options.map(function (option, j) { return '<button type="button" class="variant-btn" data-group="' + i + '" data-option="' + j + '" aria-pressed="false">' + optionVisual(group, option) + '<span class="variant-copy">' + escapeHtml(option.name) + (option.price != null ? '<span class="variant-price-tag">' + formatCurrency(option.price) + '</span>' : '') + '</span><span class="option-check" aria-hidden="true">✓</span></button>'; }).join('');
        return '<fieldset class="variant-step" id="variant-step-' + i + '"><legend><span class="step-number" aria-hidden="true">' + String(i + 1).padStart(2, '0') + '</span>' + escapeHtml(group.name) + '<span class="step-selection" id="step-selected-' + i + '">Escolha a sua</span></legend><div class="variant-options">' + options + '</div><p class="variant-error" id="variant-error-' + i + '" hidden>Escolha uma opção para continuar.</p></fieldset>';
    }).join('');
    el('configuration-heading').hidden = variantGroups.length === 0;
    el('variants-section').hidden = variantGroups.length === 0;
    variantGroups.forEach(function (group, i) { if (group.options.length === 1)
        selectOption(i, 0, false); });
    el('variants-detail').classList.toggle('hidden', !variantGroups.length);
    el('variants-detail-content').innerHTML = variantGroups.map(function (g) { return '<div class="spec-row"><strong>' + escapeHtml(g.name) + '</strong><span>' + g.options.map(function (o) { return escapeHtml(o.name) + (o.price != null ? ' — ' + formatCurrency(o.price) : ''); }).join('<br>') + '</span></div>'; }).join('');
}
function selectOption(groupIndex, optionIndex, animate) {
    if (purchaseBusy)
        return;
    var group = variantGroups[groupIndex], option = group && group.options[optionIndex];
    if (!option)
        return;
    selectedVariants[groupIndex] = { variantName: group.name, optionName: option.name, optionPrice: option.price };
    var section = el('variant-step-' + groupIndex);
    section.classList.add('complete');
    section.classList.remove('invalid');
    section.querySelector('.step-number').textContent = '✓';
    text('step-selected-' + groupIndex, option.name);
    el('variant-error-' + groupIndex).hidden = true;
    section.querySelectorAll('.variant-btn').forEach(function (button) { var active = Number(button.dataset.option) === optionIndex; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); button.removeAttribute('aria-invalid'); });
    text('purchase-message', '');
    syncPurchase(animate !== false);
}
function syncPurchase(animate) {
    if (!product)
        return;
    var effective = getEffectivePrice(), ready = allSelected(), count = Object.keys(selectedVariants).length;
    if (!Number.isFinite(effective))
        effective = 0;
    text('price-main', formatCurrency(effective));
    text('summary-total', formatCurrency(effective * qty));
    text('summary-quantity', qty + (qty === 1 ? ' peça' : ' peças'));
    text('qty-display', qty);
    text('configuration-progress', count + ' de ' + variantGroups.length + ' escolhas');
    text('selection-state', ready ? 'Pronta para ir com você' : 'Faltam ' + (variantGroups.length - count) + ' escolhas');
    el('selection-receipt').classList.toggle('ready', ready);
    el('selection-chips').innerHTML = variantGroups.length ? variantGroups.map(function (group, i) { var selected = selectedVariants[i]; return '<button type="button" class="selection-chip' + (selected ? '' : ' missing') + '" data-edit-group="' + i + '">' + escapeHtml(group.name) + ': ' + escapeHtml(selected ? selected.optionName : 'escolher') + (selected ? ' ↗' : ' +') + '</button>'; }).join('') : '<span class="selection-chip">' + (product.is_kit ? 'Kit completo' : 'Peça selecionada') + '</span>';
    text('sticky-product-title', product.title);
    text('sticky-selection', ready ? (selectionText() || 'Sua peça está pronta') : 'Escolha as opções da sua peça');
    text('sticky-price', formatCurrency(effective * qty));
    var out = maxStock <= 0;
    text('sticky-buy-button', out ? 'Indisponível' : (ready ? 'Quero essa peça ↗' : 'Escolher opções ↗'));
    el('qty-minus').disabled = purchaseBusy || qty <= 1 || out;
    el('qty-plus').disabled = purchaseBusy || qty >= maxStock || out;
    ['btn-cart', 'btn-buynow', 'sticky-buy-button'].forEach(function (id) { el(id).disabled = purchaseBusy || out; });
    document.querySelectorAll('.variant-btn,.selection-chip').forEach(function (b) { b.disabled = purchaseBusy; });
    var oldPrice = product.is_kit && product.kit_type === 'fixed' ? kitFixedItems.reduce(function (s, p) { return s + basePrice(p); }, 0) : Number(product.price);
    var hasOverride = Object.values(selectedVariants).some(function (s) { return s.optionPrice != null; });
    var promo = !hasOverride && oldPrice > effective && effective >= 0;
    el('price-promo').classList.toggle('hidden', !promo);
    el('price-discount-badge').classList.toggle('hidden', !promo);
    if (promo) {
        text('price-original', formatCurrency(oldPrice));
        text('price-discount-pct', Math.round((1 - effective / oldPrice) * 100));
    }
    text('price-caption', (!ready && variantGroups.some(function (g) { return g.priced; }) ? 'O preço acompanha a opção escolhida' : 'Valor por ' + (product.is_kit ? 'kit' : 'peça')) + ' · frete no checkout');
    if (animate && !reduceMotion.matches) {
        el('summary-total').classList.remove('price-flash');
        void el('summary-total').offsetWidth;
        el('summary-total').classList.add('price-flash');
    }
}
function changeQty(delta) { if (purchaseBusy)
    return; qty = Math.max(1, Math.min(Math.max(1, maxStock), qty + delta)); text('purchase-message', ''); syncPurchase(true); }
function validateVariantSelection() {
    var missing = variantGroups.findIndex(function (_, i) { return !selectedVariants[i]; });
    if (missing === -1)
        return true;
    var section = el('variant-step-' + missing);
    section.classList.add('invalid');
    el('variant-error-' + missing).hidden = false;
    section.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-invalid', 'true'); b.setAttribute('aria-describedby', 'variant-error-' + missing); });
    section.querySelector('button').focus({ preventScroll: true });
    scrollToNode(section);
    text('purchase-message', 'Escolha ' + variantGroups[missing].name.toLowerCase() + ' para continuar.');
    return false;
}
function renderStock() {
    maxStock = Math.max(0, Math.floor(Number(product.stock) || 0));
    qty = Math.max(1, Math.min(qty, maxStock || 1));
    el('estoque-badge').className = 'stock-badge' + (maxStock === 0 ? ' out' : maxStock <= 5 ? ' low' : '');
    text('estoque-badge', maxStock === 0 ? 'Esgotado' : maxStock <= 5 ? (maxStock === 1 ? 'Última peça disponível' : maxStock + ' peças disponíveis') : 'Disponível na coleção');
    el('out-of-stock-alert').classList.toggle('hidden', maxStock > 0);
}
function renderDescription(p) {
    var lines = String(p.description || '').split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean), container = el('product-description');
    container.innerHTML = '';
    if (!lines.length) {
        container.innerHTML = '<p>Quer saber mais sobre materiais, medidas ou acabamento? Nossa equipe ajuda você a escolher.</p><a href="https://wa.me/5511961789176" target="_blank" rel="noopener noreferrer">Perguntar sobre esta peça ↗</a>';
        return;
    }
    var intro = document.createElement('div'), rest = document.createElement('div');
    rest.id = 'description-more';
    rest.hidden = true;
    lines.forEach(function (line, i) { var paragraph = document.createElement('p'); paragraph.textContent = line; (i < 3 ? intro : rest).appendChild(paragraph); });
    container.append(intro);
    if (lines.length > 3) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'description-toggle';
        button.textContent = 'Ler a história completa +';
        button.setAttribute('aria-expanded', 'false');
        button.setAttribute('aria-controls', 'description-more');
        button.addEventListener('click', function () { rest.hidden = !rest.hidden; button.setAttribute('aria-expanded', String(!rest.hidden)); button.textContent = rest.hidden ? 'Ler a história completa +' : 'Mostrar menos −'; });
        container.append(rest, button);
    }
}
function renderGalleryThumbnails() {
    el('thumbs-grid').innerHTML = galleryItems.map(function (item, i) { return '<button type="button" class="thumb" data-gallery-index="' + i + '" aria-label="' + (item.type === 'image' ? 'Ver foto ' : 'Ver vídeo ') + (i + 1) + '" aria-pressed="false">' + (item.type === 'image' ? '<img src="' + escapeHtml(item.src) + '" alt="" loading="lazy">' : '<span class="play-icon" aria-hidden="true">▷</span>') + '</button>'; }).join('');
    el('thumbs-grid').hidden = galleryItems.length < 2;
    document.querySelectorAll('.gallery-nav').forEach(function (b) { b.hidden = galleryItems.length < 2; });
}
function createMedia(item, large) {
    if (item.type === 'image') {
        var img = document.createElement('img');
        img.src = item.src;
        img.alt = (product ? product.title : 'Foto') + ' — ' + (large ? 'detalhe ampliado' : 'foto ' + (galleryIndex + 1));
        img.draggable = false;
        img.decoding = 'async';
        img.addEventListener('error', function () { var error = document.createElement('p'); error.className = 'media-empty'; error.textContent = 'Esta foto não carregou. Experimente outra imagem.'; img.replaceWith(error); });
        return img;
    }
    if (item.type === 'youtube') {
        var frame = document.createElement('iframe');
        frame.src = item.src;
        frame.title = 'Vídeo de ' + (product ? product.title : 'produto');
        frame.allow = 'encrypted-media; fullscreen; picture-in-picture';
        frame.allowFullscreen = true;
        return frame;
    }
    var video = document.createElement('video');
    video.src = item.src;
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.setAttribute('aria-label', 'Vídeo do produto');
    return video;
}
function renderGalleryItem(index) {
    var wrap = el('gallery-media');
    wrap.replaceChildren();
    if (!galleryItems.length) {
        wrap.innerHTML = '<p class="media-empty"><span aria-hidden="true">◇</span>As fotos desta peça estarão aqui em breve.</p>';
        el('open-gallery').hidden = true;
        text('gallery-count', 'SEM FOTOS');
        text('media-caption', 'Conheça as opções ao lado');
        return;
    }
    galleryIndex = (index + galleryItems.length) % galleryItems.length;
    var item = galleryItems[galleryIndex], media = createMedia(item, false);
    if (item.type === 'image') {
        var button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('aria-label', 'Ampliar foto ' + (galleryIndex + 1));
        button.append(media);
        button.addEventListener('click', function () { if (Date.now() - lastSwipeAt > 400)
            openProductZoom(); });
        wrap.append(button);
    }
    else
        wrap.append(media);
    media.classList.add('media-enter');
    el('open-gallery').hidden = false;
    text('gallery-count', String(galleryIndex + 1).padStart(2, '0') + ' / ' + String(galleryItems.length).padStart(2, '0'));
    text('media-caption', item.type === 'image' ? 'FOTO ' + String(galleryIndex + 1).padStart(2, '0') + ' / A PEÇA DE PERTO' : 'APERTE O PLAY');
    el('gallery-progress-fill').style.width = ((galleryIndex + 1) / galleryItems.length * 100) + '%';
    document.querySelectorAll('.thumb').forEach(function (b) { var active = Number(b.dataset.galleryIndex) === galleryIndex; b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active)); });
}
function navigateGallery(delta) { if (galleryItems.length)
    renderGalleryItem(galleryIndex + delta); }
function selectGalleryItem(index) { renderGalleryItem(index); }
function syncDialogLock() { document.body.classList.toggle('modal-open', !!document.querySelector('dialog[open]')); }
function openDialog(dialog) { dialogOpener = document.activeElement; if (!dialog.open)
    dialog.showModal(); syncDialogLock(); }
function resetZoom() { zoom = 1; pan = { x: 0, y: 0 }; el('zoom-range').value = '1'; applyZoom(); }
function applyZoom() { var img = el('lightbox-content').querySelector('img'), viewport = el('lightbox-viewport'); var maxX = viewport.clientWidth * (zoom - 1) / 2, maxY = viewport.clientHeight * (zoom - 1) / 2; pan.x = Math.max(-maxX, Math.min(maxX, pan.x)); pan.y = Math.max(-maxY, Math.min(maxY, pan.y)); if (img)
    img.style.transform = 'translate(' + pan.x + 'px,' + pan.y + 'px) scale(' + zoom + ')'; viewport.classList.toggle('zoomed', zoom > 1); text('zoom-value', zoom.toFixed(1).replace('.0', '') + '×'); }
function renderViewer() {
    var item = viewerProduct ? galleryItems[galleryIndex] : viewerExternal;
    if (!item)
        return;
    el('lightbox-content').replaceChildren(createMedia(item, true));
    resetZoom();
    var isImage = item.type === 'image';
    document.querySelector('.zoom-control').hidden = !isImage;
    el('zoom-reset').hidden = !isImage;
    var more = viewerProduct && galleryItems.length > 1;
    el('lightbox-prev').hidden = !more;
    el('lightbox-next').hidden = !more;
    text('lightbox-counter', viewerProduct ? (galleryIndex + 1) + ' / ' + galleryItems.length : '');
    text('lightbox-title', viewerProduct ? product.title : 'Foto ou vídeo da avaliação');
    text('lightbox-help', isImage ? 'Aproxime e arraste a imagem para explorar.' : 'Use os controles do vídeo.');
}
function openProductZoom(index) { if (Number.isInteger(index))
    renderGalleryItem(index); if (!galleryItems.length)
    return; viewerProduct = true; renderViewer(); openDialog(el('review-lightbox')); }
function openLightbox(url, type) { var safe = safeUrl(url); if (!safe)
    return; viewerProduct = false; viewerExternal = { src: safe, type: type === 'video' ? 'video' : 'image' }; renderViewer(); openDialog(el('review-lightbox')); }
function closeLightbox() { el('review-lightbox').close(); }
function viewerStep(delta) { if (!viewerProduct || !galleryItems.length)
    return; navigateGallery(delta); renderViewer(); }
async function renderProduct(p) {
    product = p;
    qty = 1;
    selectedVariants = {};
    variantGroups = normalizeVariants(p);
    kitFixedItems = [];
    kitFixedPrice = null;
    if (p.is_kit && p.kit_type === 'fixed')
        await loadKitFixedItems(p);
    if (!Number.isFinite(getEffectivePrice()) || getEffectivePrice() < 0)
        throw new Error('O preço desta peça está indisponível. Fale com a FreoFigures.');
    document.title = (p.title || 'Produto') + ' | FreoFigures';
    text('product-title', p.title);
    el('product-title').classList.toggle('long-title', String(p.title).length > 55);
    text('product-category', p.category || 'Coleção Freo');
    applyEditorial(p);
    var tags = asArray(p.tags);
    if (!tags.length && typeof p.tags === 'string' && !p.tags.startsWith('['))
        tags = p.tags.split(',');
    el('product-tags').innerHTML = tags.filter(Boolean).slice(0, 4).map(function (t) { return '<span class="tag-pill">' + escapeHtml(t) + '</span>'; }).join('');
    renderStock();
    renderVariants();
    renderDescription(p);
    syncPurchase(false);
    galleryItems = imageUrls(p).map(function (url) { return { type: 'image', src: url }; });
    var youtube = getYouTubeEmbed(p.video_url), videoUrl = safeUrl(p.video_url);
    if (youtube)
        galleryItems.push({ type: 'youtube', src: youtube });
    else if (videoUrl)
        galleryItems.push({ type: 'video', src: videoUrl });
    renderGalleryThumbnails();
    renderGalleryItem(0);
    var photos = imageUrls(p), detail = el('detail-photo-button');
    detail.hidden = !photos.length;
    document.querySelector('.details-layout').classList.toggle('no-photo', !photos.length);
    if (photos.length) {
        el('detail-photo').src = photos[1] || photos[0];
        el('detail-photo').alt = p.title + ' — detalhes';
        detail.onclick = function () { openProductZoom(photos.length > 1 ? 1 : 0); };
        el('detail-photo').onerror = function () { detail.hidden = true; document.querySelector('.details-layout').classList.add('no-photo'); };
    }
    el('kit-items-detail').classList.toggle('hidden', !kitFixedItems.length);
    el('kit-items-detail-content').innerHTML = kitFixedItems.map(function (item) { var url = imageUrls(item)[0]; return '<div>' + (url ? '<img src="' + escapeHtml(url) + '" alt="" loading="lazy">' : '') + '<p>' + escapeHtml(item.title) + '</p></div>'; }).join('');
    el('page-loading').hidden = true;
    el('page-content').classList.remove('hidden');
    setupStickyBuyBar();
    window.trackEvent('page_view', String(p.id), p.title);
    Promise.resolve(loadReviews(p.id)).catch(function () { text('product-rating-summary', 'Avaliações indisponíveis'); });
    Promise.resolve(loadRelatedProducts(p.id, p.category)).catch(function () { el('related-section').classList.add('hidden'); });
}
function setBusy(busy, action) {
    purchaseBusy = busy;
    syncPurchase(false);
    ['btn-cart', 'btn-buynow'].forEach(function (id) { el(id).setAttribute('aria-busy', String(busy && id === (action === 'buy' ? 'btn-buynow' : 'btn-cart'))); });
    el('btn-cart').innerHTML = busy && action === 'cart' ? 'Preparando sua sacola…' : 'Adicionar à sacola <span aria-hidden="true">+</span>';
    el('btn-buynow').innerHTML = busy && action === 'buy' ? 'Preparando sua compra…' : 'Quero essa peça <span aria-hidden="true">↗</span>';
}
async function savePurchase(action) {
    if (purchaseBusy || !product)
        return;
    if (maxStock <= 0) {
        showToast('Esta peça está esgotada.', 'error');
        return;
    }
    if (!validateVariantSelection())
        return;
    var db = window.supabaseClient;
    if (!db) {
        showToast('A conexão não está disponível. Recarregue a página.', 'error');
        return;
    }
    text('purchase-message', '');
    setBusy(true, action);
    try {
        // Confere novamente preço e disponibilidade antes de salvar a escolha.
        var fresh = await db.from('products').select('*').eq('id', product.id).eq('is_active', true).single();
        if (fresh.error || !fresh.data)
            throw new Error('Não foi possível confirmar esta peça. Tente novamente.');
        if (fresh.data.is_kit && fresh.data.kit_type === 'configurable') {
            location.href = '/montar-kit.html?id=' + encodeURIComponent(fresh.data.id);
            return;
        }
        var groups = normalizeVariants(fresh.data), previousPrice = getEffectivePrice();
        if (groups.length !== variantGroups.length || groups.some(function (g, i) { var s = selectedVariants[i]; return !s || g.name !== s.variantName || !g.options.some(function (o) { return o.name === s.optionName; }); })) {
            setBusy(false, action);
            await renderProduct(fresh.data);
            throw new Error('As opções foram atualizadas. Escolha novamente sua versão.');
        }
        product = fresh.data;
        variantGroups = groups;
        groups.forEach(function (g, i) { var option = g.options.find(function (o) { return o.name === selectedVariants[i].optionName; }); selectedVariants[i].optionPrice = option.price; });
        if (product.is_kit && product.kit_type === 'fixed')
            await loadKitFixedItems(product);
        var requestedQty = qty;
        renderStock();
        syncPurchase(false);
        if (maxStock < requestedQty)
            throw new Error(maxStock ? 'A disponibilidade mudou. Confira a quantidade e tente novamente.' : 'Esta peça acabou de esgotar.');
        var unitPrice = getEffectivePrice();
        if (!Number.isFinite(unitPrice) || unitPrice < 0)
            throw new Error('Não foi possível confirmar o preço desta peça.');
        if (Math.abs(unitPrice - previousPrice) > .009)
            throw new Error('O preço foi atualizado. Confira o novo subtotal e confirme novamente.');
        var sessionResult = await db.auth.getSession();
        if (sessionResult.error)
            throw sessionResult.error;
        var session = sessionResult.data && sessionResult.data.session;
        if (!session) {
            var anonymous = await db.auth.signInAnonymously();
            if (anonymous.error || !anonymous.data || !anonymous.data.session)
                throw new Error('Não foi possível iniciar sua sacola. Tente novamente.');
            session = anonymous.data.session;
            try {
                localStorage.setItem('freo_anon_user_id', session.user.id);
            }
            catch (_) { }
        }
        currentUser = session.user;
        var variant = product.is_kit && product.kit_type === 'fixed' ? 'Kit: ' + kitFixedItems.map(function (p) { return p.title; }).join(', ') : (Object.keys(selectedVariants).map(function (k) { var s = selectedVariants[k]; return s.variantName + ': ' + s.optionName; }).join(' | ') || null);
        var existing = await db.from('cart_items').select('id,quantity,variant').eq('user_id', session.user.id).eq('product_id', String(product.id));
        if (existing.error)
            throw new Error('Não foi possível consultar sua sacola. Tente novamente.');
        var rows = existing.data || [], already = rows.reduce(function (sum, row) { return sum + (Number(row.quantity) || 0); }, 0);
        if (already + qty > maxStock)
            throw new Error('Você já tem ' + already + ' peça(s) deste produto na sacola. O estoque total disponível é ' + maxStock + '. Ajuste sua sacola para continuar.');
        var match = rows.find(function (row) { return (row.variant || null) === variant; }), quantity = qty + (match ? (Number(match.quantity) || 0) : 0), image = imageUrls(product)[0] || null;
        var payload = { user_id: session.user.id, product_id: String(product.id), product_name: product.title, quantity: quantity, price: unitPrice, total_price: Math.round(unitPrice * quantity * 100) / 100, image_url: image, variant: variant };
        var saved = match ? await db.from('cart_items').update(payload).eq('id', match.id).eq('user_id', session.user.id) : await db.from('cart_items').insert(payload);
        if (saved.error)
            throw new Error('Não conseguimos salvar sua peça. Tente novamente.');
        window.trackEvent(action === 'buy' ? 'buy_now' : 'add_to_cart', String(product.id), product.title);
        var guest = session.user.is_anonymous === true || (session.user.user_metadata || {}).is_anonymous === true;
        var checkout = '/checkout.html' + (guest ? '?guest=1' : '');
        if (action === 'buy') {
            location.href = checkout;
            return;
        }
        text('bag-name', product.title);
        text('bag-options', qty + ' × ' + (selectionText() || 'Peça selecionada'));
        text('bag-total', formatCurrency(unitPrice * qty));
        el('bag-image').hidden = !image;
        if (image)
            el('bag-image').src = image;
        el('bag-checkout').href = checkout;
        setBusy(false, action);
        openDialog(el('bag-dialog'));
    }
    catch (error) {
        text('purchase-message', error && error.message || 'Não foi possível concluir. Tente novamente.');
        showToast('Confira a mensagem junto aos botões de compra.', 'error');
    }
    finally {
        setBusy(false, action);
    }
}
function addToCart() { return savePurchase('cart'); }
function buyNow() { return savePurchase('buy'); }
function setupStickyBuyBar() { if (stickyObserver)
    stickyObserver.disconnect(); if (!('IntersectionObserver' in window))
    return; stickyObserver = new IntersectionObserver(function (entries) { var entry = entries[0]; el('sticky-buy-bar').hidden = entry.isIntersecting || entry.boundingClientRect.top > 0; }, { rootMargin: '-85px 0px 0px 0px', threshold: 0 }); stickyObserver.observe(document.querySelector('.purchase-actions')); }
function jumpToReviews() { if (!el('reviews-section').classList.contains('hidden'))
    scrollToNode(el('reviews-section'));
else
    showToast('As avaliações não estão disponíveis neste momento.', 'error'); }
async function loadRelatedProducts(id, category) { if (!category)
    return; var result = await window.supabaseClient.from('products').select('id,title,price,promotional_price,images,category').eq('category', category).eq('is_active', true).neq('id', id).limit(8); if (result.error || !result.data || !result.data.length)
    return; text('related-category-label', category); el('related-grid').innerHTML = result.data.map(function (p) { var image = imageUrls(p)[0]; return '<a class="related-card" href="/produto?id=' + encodeURIComponent(p.id) + '"><div class="related-image">' + (image ? '<img src="' + escapeHtml(image) + '" alt="' + escapeHtml(p.title) + '" loading="lazy" onerror="this.hidden=true">' : '<span>FREOFIGURES</span>') + '</div><div class="related-copy"><p>' + escapeHtml(p.title) + '</p><div><strong>' + formatCurrency(basePrice(p)) + '</strong><span aria-hidden="true">↗</span></div></div></a>'; }).join(''); el('related-section').classList.remove('hidden'); }
async function init() {
    el('page-loading').hidden = false;
    el('page-notfound').classList.add('hidden');
    el('page-content').classList.add('hidden');
    el('sticky-buy-bar').hidden = true;
    var id = new URLSearchParams(location.search).get('id');
    try {
        if (!id) {
            text('error-title', 'Qual é a sua próxima peça?');
            throw new Error('Abra um produto do catálogo para explorar os detalhes e escolher sua versão.');
        }
        if (!window.supabaseClient || !window.supabaseClient.from)
            throw new Error('Não foi possível conectar ao catálogo. Confira sua conexão e tente novamente.');
        var result = await window.supabaseClient.from('products').select('*').eq('id', id).eq('is_active', true).single();
        if (result.error || !result.data)
            throw new Error('Esta peça não está disponível ou não foi possível carregar o catálogo.');
        if (result.data.is_kit && result.data.kit_type === 'configurable') {
            location.replace('/montar-kit.html?id=' + encodeURIComponent(id));
            return;
        }
        await renderProduct(result.data);
        // Restaura somente escolhas pendentes que ainda existem no catálogo.
        if (new URLSearchParams(location.search).get('autoAddToCart') === '1') {
            var pending;
            try {
                pending = JSON.parse(sessionStorage.getItem('pendingCart') || 'null');
            }
            catch (_) { }
            if (pending && String(pending.productId) === String(id)) {
                qty = Math.max(1, Math.min(maxStock || 1, Number(pending.quantity) || 1));
                variantGroups.forEach(function (g, i) { var s = (pending.variants || {})[i]; var oi = s ? g.options.findIndex(function (o) { return o.name === s.optionName; }) : -1; if (oi >= 0)
                    selectOption(i, oi, false); });
                syncPurchase(false);
                sessionStorage.removeItem('pendingCart');
                await addToCart();
            }
        }
    }
    catch (error) {
        el('page-loading').hidden = true;
        el('page-content').classList.add('hidden');
        el('page-notfound').classList.remove('hidden');
        text('error-copy', error.message || 'Não foi possível carregar a peça. Tente novamente.');
    }
}
function setupInteractions() {
    el('retry-load').addEventListener('click', init);
    el('qty-minus').addEventListener('click', function () { changeQty(-1); });
    el('qty-plus').addEventListener('click', function () { changeQty(1); });
    el('btn-cart').addEventListener('click', addToCart);
    el('btn-buynow').addEventListener('click', buyNow);
    el('sticky-buy-button').addEventListener('click', function () { if (allSelected())
        buyNow();
    else
        validateVariantSelection(); });
    el('variants-section').addEventListener('click', function (event) { var button = event.target.closest('[data-group]'); if (button)
        selectOption(Number(button.dataset.group), Number(button.dataset.option), true); });
    el('selection-chips').addEventListener('click', function (event) { var button = event.target.closest('[data-edit-group]'); if (!button)
        return; var step = el('variant-step-' + button.dataset.editGroup); scrollToNode(step); step.querySelector('.active,button').focus({ preventScroll: true }); });
    el('thumbs-grid').addEventListener('click', function (event) { var button = event.target.closest('[data-gallery-index]'); if (button)
        selectGalleryItem(Number(button.dataset.galleryIndex)); });
    document.querySelectorAll('[data-gallery-step]').forEach(function (button) { button.addEventListener('click', function () { navigateGallery(Number(button.dataset.galleryStep)); }); });
    document.querySelectorAll('.tone-switch button').forEach(function (button) { button.addEventListener('click', function () { document.querySelector('.media-stage').dataset.tone = button.dataset.tone; document.querySelectorAll('.tone-switch button').forEach(function (b) { b.setAttribute('aria-pressed', String(b === button)); }); }); });
    el('open-gallery').addEventListener('click', function () { openProductZoom(); });
    el('lightbox-close').addEventListener('click', closeLightbox);
    el('lightbox-prev').addEventListener('click', function () { viewerStep(-1); });
    el('lightbox-next').addEventListener('click', function () { viewerStep(1); });
    el('zoom-range').addEventListener('input', function (event) { zoom = Number(event.target.value); applyZoom(); });
    el('zoom-reset').addEventListener('click', resetZoom);
    ['bag-close', 'bag-continue'].forEach(function (id) { el(id).addEventListener('click', function () { el('bag-dialog').close(); }); });
    document.querySelectorAll('dialog').forEach(function (dialog) { dialog.addEventListener('close', function () { if (dialog.id === 'review-lightbox') {
        el('lightbox-content').replaceChildren();
        drag = null;
    } syncDialogLock(); if (dialogOpener && dialogOpener.isConnected)
        dialogOpener.focus({ preventScroll: true }); }); dialog.addEventListener('click', function (event) { if (event.target !== dialog)
        return; var r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)
        dialog.close(); }); });
    el('review-lightbox').addEventListener('keydown', function (event) { if (event.target.tagName === 'INPUT')
        return; if (event.key === 'ArrowLeft') {
        event.preventDefault();
        viewerStep(-1);
    } if (event.key === 'ArrowRight') {
        event.preventDefault();
        viewerStep(1);
    } });
    var viewport = el('lightbox-viewport');
    viewport.addEventListener('pointerdown', function (event) { if (zoom <= 1 || !el('lightbox-content').querySelector('img'))
        return; drag = { x: event.clientX, y: event.clientY, px: pan.x, py: pan.y }; viewport.setPointerCapture(event.pointerId); viewport.classList.add('dragging'); });
    viewport.addEventListener('pointermove', function (event) { if (!drag)
        return; pan = { x: drag.px + event.clientX - drag.x, y: drag.py + event.clientY - drag.y }; applyZoom(); });
    ['pointerup', 'pointercancel'].forEach(function (type) { viewport.addEventListener(type, function () { drag = null; viewport.classList.remove('dragging'); }); });
    var stage = document.querySelector('.media-stage'), gesture = null;
    stage.addEventListener('pointermove', function (event) { if (event.pointerType !== 'mouse' || reduceMotion.matches)
        return; var r = stage.getBoundingClientRect(), x = (event.clientX - r.left) / r.width, y = (event.clientY - r.top) / r.height; stage.style.setProperty('--pointer-x', x * 100 + '%'); stage.style.setProperty('--pointer-y', y * 100 + '%'); stage.style.setProperty('--move-x', (x - .5) * 7 + 'px'); stage.style.setProperty('--move-y', (y - .5) * 7 + 'px'); });
    stage.addEventListener('pointerleave', function () { stage.style.setProperty('--move-x', '0px'); stage.style.setProperty('--move-y', '0px'); });
    stage.addEventListener('pointerdown', function (event) { if (event.pointerType === 'mouse' || ['VIDEO', 'IFRAME'].includes(event.target.tagName))
        return; gesture = { x: event.clientX, y: event.clientY }; });
    stage.addEventListener('pointerup', function (event) { if (!gesture)
        return; var dx = event.clientX - gesture.x, dy = event.clientY - gesture.y; gesture = null; if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        lastSwipeAt = Date.now();
        navigateGallery(dx > 0 ? -1 : 1);
    } });
    stage.addEventListener('pointercancel', function () { gesture = null; });
    document.querySelector('.product-gallery').addEventListener('keydown', function (event) { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        navigateGallery(event.key === 'ArrowLeft' ? -1 : 1);
    } });
    ['prev', 'next'].forEach(function (direction) { el('related-' + direction).addEventListener('click', function () { var rail = el('related-grid'); rail.scrollBy({ left: (direction === 'prev' ? -1 : 1) * rail.clientWidth * .8, behavior: reduceMotion.matches ? 'auto' : 'smooth' }); }); });
    window.addEventListener('resize', applyZoom);
    window.addEventListener('auth-data-loaded', function (event) { currentUser = event.detail.user; });
}
document.addEventListener('DOMContentLoaded', function () { setupInteractions(); init(); });
// Avaliações e envio de mídia do projeto existente.
var allReviews = [];
var reviewPage = 1;
var reviewsPerPage = 5;
var selectedRating = 5;
var selectedFiles = [];
var reviewProductId = null;
// ── Renderiza estrelas (0–5, suporta .5) ────────────────────
// ── Barras de distribuição ───────────────────────────────────
function renderRatingBars(reviews) {
    var counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    reviews.forEach(function (r) { var k = Math.round(r.rating); counts[k] = (counts[k] || 0) + 1; });
    var total = reviews.length || 1;
    var html = '';
    for (var s = 5; s >= 1; s--) {
        var pct = Math.round((counts[s] / total) * 100);
        html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'
            + '<span style="font-family:ui-monospace,monospace;font-size:0.65rem;color:rgba(245,245,245,0.4);width:8px;text-align:right">' + s + '</span>'
            + '<svg style="width:11px;height:11px;color:#DDAF34;flex-shrink:0" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>'
            + '<div style="flex:1;height:5px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden">'
            + '<div style="height:100%;width:' + pct + '%;background:#DDAF34;border-radius:2px;transition:width 0.4s"></div>'
            + '</div>'
            + '<span style="font-family:ui-monospace,monospace;font-size:0.65rem;color:rgba(245,245,245,0.3);width:26px">' + pct + '%</span>'
            + '</div>';
    }
    document.getElementById('rating-bars').innerHTML = html;
}
// ── Formata data ─────────────────────────────────────────────
function fmtDate(iso) {
    if (!iso)
        return '';
    var d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}
// ── Renderiza um card ────────────────────────────────────────
function starsHTML(rating, size) {
    size = Number(size) || 16;
    rating = Math.max(0, Math.min(5, Number(rating) || 0));
    var path = '<path d="m12 2 3.1 6.3 7 .9-5 4.9 1.2 6.9-6.3-3.3-6.3 3.3 1.2-6.9-5-4.9 7-.9z"/>';
    return [0, 1, 2, 3, 4].map(function (i) { var fill = Math.max(0, Math.min(1, rating - i)) * 100; return '<span aria-hidden="true" style="position:relative;display:inline-block;width:' + size + 'px;height:' + size + 'px"><svg viewBox="0 0 24 24" fill="currentColor" style="position:absolute;width:100%;height:100%;color:#585b4e">' + path + '</svg><svg viewBox="0 0 24 24" fill="currentColor" style="position:absolute;width:100%;height:100%;color:#e9c972;clip-path:inset(0 ' + (100 - fill) + '% 0 0)">' + path + '</svg></span>'; }).join('');
}
function reviewCardHTML(review) {
    var name = String(review.reviewer_name || 'Cliente FreoFigures');
    var avatar = safeUrl(review.reviewer_avatar);
    var media = asArray(review.media_urls).map(safeUrl).filter(Boolean).map(function (url) {
        var video = /\.(mp4|webm|mov)(\?|$)/i.test(url);
        // O handler usa somente uma URL validada e JSON escapado para o atributo HTML.
        var handler = 'openLightbox(' + JSON.stringify(url) + ',' + JSON.stringify(video ? 'video' : 'image') + ')';
        return '<button type="button" class="' + (video ? 'review-video-thumb' : 'review-media-thumb') + '" aria-label="Abrir ' + (video ? 'vídeo' : 'foto') + ' da avaliação" onclick="' + escapeHtml(handler) + '">' + (video ? '<span aria-hidden="true">▷</span>' : '<img src="' + escapeHtml(url) + '" alt="Foto enviada na avaliação" loading="lazy" style="width:100%;height:100%;object-fit:cover;border-radius:7px">') + '</button>';
    }).join('');
    var verified = review.verified_purchase === true && review.is_artificial !== true;
    return '<article class="review-card"><div style="display:flex;align-items:center;gap:12px">' + (avatar ? '<img class="review-avatar" src="' + escapeHtml(avatar) + '" alt="">' : '<span class="review-initial" aria-hidden="true">' + escapeHtml(name.slice(0, 1).toUpperCase()) + '</span>') + '<div><span class="review-name">' + escapeHtml(name) + '</span>' + (verified ? ' <span class="verified-badge">Compra verificada</span>' : '') + '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap"><span class="stars-row" aria-label="Nota ' + Math.min(5, Math.max(0, Number(review.rating) || 0)) + ' de 5">' + starsHTML(Math.min(5, Math.max(0, Number(review.rating) || 0)), 15) + '</span><time class="review-date">' + escapeHtml(fmtDate(review.created_at)) + '</time></div></div></div><p class="review-text">' + escapeHtml(review.comment || '') + '</p>' + (media ? '<div class="review-media-grid">' + media + '</div>' : '') + '</article>';
}
// ── Renderiza página de avaliações ───────────────────────────
function renderReviewsPage() {
    var start = (reviewPage - 1) * reviewsPerPage;
    var slice = allReviews.slice(start, start + reviewsPerPage);
    var listEl = document.getElementById('reviews-list');
    if (!listEl)
        return;
    if (allReviews.length === 0) {
        listEl.innerHTML = '<p style="font-family:ui-monospace,monospace;font-size:0.75rem;color:rgba(245,245,245,0.25);text-align:center;padding:2rem 0;text-transform:uppercase;letter-spacing:0.08em">Nenhuma avaliação ainda. Seja o primeiro!</p>';
    }
    else {
        listEl.innerHTML = slice.map(reviewCardHTML).join('');
    }
    // Paginação
    var pages = Math.ceil(allReviews.length / reviewsPerPage);
    var pagEl = document.getElementById('reviews-pagination');
    if (pagEl) {
        pagEl.innerHTML = '';
        if (pages > 1) {
            for (var i = 1; i <= pages; i++) {
                var btn = document.createElement('button');
                btn.className = 'page-btn' + (i === reviewPage ? ' active' : '');
                btn.textContent = i;
                btn.setAttribute('data-page', i);
                btn.onclick = (function (pg) { return function () { reviewPage = pg; renderReviewsPage(); document.getElementById('reviews-section').scrollIntoView({ behavior: 'smooth', block: 'start' }); }; })(i);
                pagEl.appendChild(btn);
            }
        }
    }
}
// ── Carrega avaliações do Supabase ───────────────────────────
async function loadReviews(productId) {
    reviewProductId = productId;
    var result = await window.supabaseClient
        .from('product_reviews')
        .select('*')
        .eq('product_id', String(productId))
        .order('created_at', { ascending: false });
    if (result.error) {
        console.error('Erro ao carregar avaliações:', result.error);
        return;
    }
    allReviews = result.data || [];
    reviewPage = 1;
    // Resumo
    var total = allReviews.length;
    var avg = total > 0 ? (allReviews.reduce(function (s, r) { return s + parseFloat(r.rating || 0); }, 0) / total) : 0;
    var avgDisplay = total > 0 ? avg.toFixed(1) : '—';
    var avgNumEl = document.getElementById('rating-avg-num');
    if (avgNumEl)
        avgNumEl.textContent = avgDisplay;
    var avgStarsEl = document.getElementById('rating-avg-stars');
    if (avgStarsEl)
        avgStarsEl.innerHTML = total > 0 ? starsHTML(avg, 18) : '';
    var countLabelEl = document.getElementById('rating-count-label');
    if (countLabelEl)
        countLabelEl.textContent = total + (total === 1 ? ' avaliação' : ' avaliações');
    var totalLabelEl = document.getElementById('review-total-label');
    if (totalLabelEl)
        totalLabelEl.textContent = total + (total === 1 ? ' avaliação' : ' avaliações');
    var productRatingEl = document.getElementById('product-rating-summary');
    if (productRatingEl) {
        productRatingEl.textContent = total > 0 ? '★ ' + avg.toFixed(1) + ' · ' + total : 'Sem avaliações';
        productRatingEl.setAttribute('aria-label', total > 0
            ? 'Nota ' + avg.toFixed(1) + ' de 5, com ' + total + (total === 1 ? ' avaliação' : ' avaliações')
            : 'Ainda sem avaliações');
    }
    renderRatingBars(allReviews);
    renderReviewsPage();
    // Verifica se o usuário pode avaliar (compra entregue)
    renderReviewFormArea(productId).catch(function () {
        document.getElementById('review-form-area').innerHTML = '<p class="review-locked">Não foi possível carregar o formulário. Recarregue a página para tentar novamente.</p>';
    });
    // Exibe a seção
    var sec = document.getElementById('reviews-section');
    if (sec)
        sec.classList.remove('hidden');
}
// ── Verifica compra entregue ────────────────────────────────
async function checkVerifiedBuyer(productId) {
    var sessionRes = await window.supabaseClient.auth.getSession();
    var session = sessionRes.data && sessionRes.data.session;
    if (!session || session.user.is_anonymous)
        return { loggedIn: false, verified: false };
    // Checa se já avaliou
    var existingRes = await window.supabaseClient
        .from('product_reviews')
        .select('id')
        .eq('product_id', String(productId))
        .eq('user_id', session.user.id)
        .eq('is_artificial', false)
        .maybeSingle();
    if (existingRes.data)
        return { loggedIn: true, verified: false, alreadyReviewed: true };
    // Checa pedido entregue
    var ordersRes = await window.supabaseClient
        .from('orders')
        .select('id, items')
        .eq('user_id', session.user.id)
        .ilike('status', '%entregue%')
        .limit(50);
    if (ordersRes.error || !ordersRes.data || ordersRes.data.length === 0) {
        return { loggedIn: true, verified: false };
    }
    // Verifica se algum pedido contém o produto
    var hasProduct = ordersRes.data.some(function (o) {
        return asArray(o.items).some(function (item) {
            return item && String(item.product_id) === String(productId);
        });
    });
    return { loggedIn: true, verified: hasProduct, user: session.user };
}
// ── Renderiza área do formulário ─────────────────────────────
async function renderReviewFormArea(productId) {
    var area = document.getElementById('review-form-area');
    if (!area)
        return;
    var check = await checkVerifiedBuyer(productId);
    if (!check.loggedIn) {
        area.innerHTML = '<div class="review-locked">'
            + '<svg style="width:16px;height:16px;flex-shrink:0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>'
            + '<span>Faça <a href="/login.html" style="color:#DDAF34;text-decoration:underline">login</a> para deixar sua avaliação após receber o produto.</span>'
            + '</div>';
        return;
    }
    if (check.alreadyReviewed) {
        area.innerHTML = '<div class="review-locked" style="color:rgba(74,222,128,0.6);border-color:rgba(74,222,128,0.15)">'
            + '<svg style="width:16px;height:16px;flex-shrink:0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>'
            + '<span>Você já avaliou este produto. Obrigado!</span>'
            + '</div>';
        return;
    }
    if (!check.verified) {
        area.innerHTML = '<div class="review-locked">'
            + '<svg style="width:16px;height:16px;flex-shrink:0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>'
            + '<span>Somente clientes com pedido entregue podem avaliar este produto.</span>'
            + '</div>';
        return;
    }
    // Formulário completo
    area.innerHTML = '<div class="review-form-wrap">'
        + '<div class="review-form-title">Deixe sua avaliação</div>'
        + '<div>'
        + '<div style="font-family:ui-monospace,monospace;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.07em;color:rgba(245,245,245,0.4);margin-bottom:6px">Sua nota</div>'
        + '<div class="star-select" id="star-select-row">'
        + [1, 2, 3, 4, 5].map(function (n) {
            return '<button type="button" class="star-select-btn" data-val="' + n + '" onclick="setReviewRating(' + n + ')">'
                + '<svg style="width:28px;height:28px;color:' + (n <= 5 ? '#DDAF34' : 'rgba(221,175,52,0.2)') + '" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>'
                + '</button>';
        }).join('')
        + '</div>'
        + '</div>'
        + '<textarea id="review-comment-input" class="review-input" rows="4" placeholder="Conte sua experiência com o produto..."></textarea>'
        + '<div>'
        + '<label class="review-file-label" for="review-file-input">'
        + '<svg style="width:14px;height:14px" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>'
        + 'Adicionar fotos / vídeos (opcional)'
        + '</label>'
        + '<input type="file" id="review-file-input" accept="image/*,video/mp4,video/webm" multiple style="display:none" onchange="handleReviewFiles(this)">'
        + '</div>'
        + '<div id="review-previews-container" class="review-previews"></div>'
        + '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">'
        + '<button class="btn-submit-review" id="btn-submit-review" onclick="submitReview()">Publicar avaliação</button>'
        + '<span style="font-family:ui-monospace,monospace;font-size:0.65rem;color:rgba(245,245,245,0.25);text-transform:uppercase;letter-spacing:0.06em">Máx. 5 arquivos · 10 MB cada</span>'
        + '</div>'
        + '<div id="review-submit-msg" style="margin-top:8px;font-family:ui-monospace,monospace;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.07em"></div>'
        + '</div>';
    selectedFiles = [];
    selectedRating = 5;
    updateStarSelectUI(5);
}
// ── UI de estrelas selecionáveis ─────────────────────────────
function setReviewRating(val) {
    selectedRating = val;
    updateStarSelectUI(val);
}
function updateStarSelectUI(val) {
    var btns = document.querySelectorAll('#star-select-row .star-select-btn');
    btns.forEach(function (btn) {
        var n = parseInt(btn.getAttribute('data-val'));
        btn.querySelector('svg').style.color = n <= val ? '#DDAF34' : 'rgba(221,175,52,0.2)';
    });
}
// ── Preview de arquivos ──────────────────────────────────────
function handleReviewFiles(input) {
    var files = Array.from(input.files);
    if (files.length + selectedFiles.length > 5) {
        alert('Máximo de 5 arquivos por avaliação.');
        input.value = '';
        return;
    }
    files.forEach(function (f) {
        if (f.size > 10 * 1024 * 1024) {
            alert('Arquivo "' + f.name + '" excede 10 MB.');
            return;
        }
        selectedFiles.push(f);
    });
    input.value = '';
    renderFilePreviews();
}
function renderFilePreviews() {
    var container = document.getElementById('review-previews-container');
    if (!container)
        return;
    container.innerHTML = '';
    selectedFiles.forEach(function (f, idx) {
        var wrap = document.createElement('div');
        wrap.className = 'review-preview-item';
        var reader = new FileReader();
        reader.onload = function (e) {
            if (f.type.startsWith('video/')) {
                var vid = document.createElement('video');
                vid.src = e.target.result;
                vid.muted = true;
                wrap.appendChild(vid);
            }
            else {
                var img = document.createElement('img');
                img.src = e.target.result;
                wrap.appendChild(img);
            }
            var rmBtn = document.createElement('button');
            rmBtn.className = 'review-preview-remove';
            rmBtn.innerHTML = '×';
            rmBtn.onclick = (function (i) { return function () { selectedFiles.splice(i, 1); renderFilePreviews(); }; })(idx);
            wrap.appendChild(rmBtn);
            container.appendChild(wrap);
        };
        reader.readAsDataURL(f);
    });
}
// ── Upload de mídia ──────────────────────────────────────────
async function uploadReviewMedia(userId) {
    var urls = [];
    for (var i = 0; i < selectedFiles.length; i++) {
        var f = selectedFiles[i];
        var ext = f.name.split('.').pop();
        var path = userId + '/' + Date.now() + '_' + i + '.' + ext;
        var up = await window.supabaseClient.storage
            .from('review-media')
            .upload(path, f, { cacheControl: '3600', upsert: false });
        if (up.error) {
            console.error('Erro upload:', up.error);
            continue;
        }
        var pub = window.supabaseClient.storage.from('review-media').getPublicUrl(path);
        urls.push(pub.data.publicUrl);
    }
    return urls;
}
// ── Submeter avaliação ───────────────────────────────────────
async function submitReview() {
    var msgEl = document.getElementById('review-submit-msg');
    var btnEl = document.getElementById('btn-submit-review');
    var textEl = document.getElementById('review-comment-input');
    var comment = (textEl && textEl.value || '').trim();
    if (!comment) {
        if (msgEl) {
            msgEl.style.color = '#f87171';
            msgEl.textContent = '⚠ Escreva um comentário antes de publicar.';
        }
        return;
    }
    if (btnEl) {
        btnEl.disabled = true;
        btnEl.textContent = 'Enviando...';
    }
    if (msgEl) {
        msgEl.style.color = 'rgba(245,245,245,0.4)';
        msgEl.textContent = 'Aguarde...';
    }
    try {
        var sessionRes = await window.supabaseClient.auth.getSession();
        var session = sessionRes.data && sessionRes.data.session;
        if (!session)
            throw new Error('Sem sessão');
        // Nome do usuário
        var uMeta = session.user.user_metadata || {};
        var reviewerName = uMeta.name || uMeta.full_name || (session.user.email || 'Cliente').split('@')[0];
        // Avatar
        var reviewerAvatar = uMeta.avatar_url || uMeta.picture || null;
        // Upload de mídia
        var mediaUrls = [];
        if (selectedFiles.length > 0) {
            if (msgEl)
                msgEl.textContent = 'Enviando arquivos...';
            mediaUrls = await uploadReviewMedia(session.user.id);
        }
        var ins = await window.supabaseClient.from('product_reviews').insert({
            product_id: String(reviewProductId),
            user_id: session.user.id,
            reviewer_name: reviewerName,
            reviewer_avatar: reviewerAvatar,
            rating: selectedRating,
            comment: comment,
            media_urls: mediaUrls,
            is_artificial: false
        });
        if (ins.error)
            throw ins.error;
        if (msgEl) {
            msgEl.style.color = '#4ade80';
            msgEl.textContent = '✅ Avaliação publicada! Obrigado.';
        }
        // Recarrega avaliações
        setTimeout(function () { loadReviews(reviewProductId); }, 1000);
    }
    catch (err) {
        console.error('Erro ao publicar avaliação:', err);
        var errMsg = 'Erro ao publicar.';
        if (err.message && err.message.includes('violates row-level security')) {
            errMsg = 'Somente clientes com pedido entregue podem avaliar.';
        }
        if (msgEl) {
            msgEl.style.color = '#f87171';
            msgEl.textContent = '⚠ ' + errMsg;
        }
        if (btnEl) {
            btnEl.disabled = false;
            btnEl.textContent = 'Publicar avaliação';
        }
    }
}
