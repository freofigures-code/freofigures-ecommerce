# Catálogo B2B: ordem de publicação

> Este documento registra a primeira versão do catálogo. Para o fluxo atual de produtos de eventos, preços e chat interno, siga [B2B_EVENT_CHAT_DEPLOY.md](B2B_EVENT_CHAT_DEPLOY.md).

1. Execute `migrations/202610030001_b2b_categories.sql` no projeto Supabase da loja. A coluna nova classifica os produtos B2B; todos os produtos existentes ficam em `loja`.
2. Publique a versão desta revisão da Edge Function `freo-checkout`, que impede pagamento direto de produtos das áreas de cotação.
3. Publique o frontend desta revisão. A vitrine comum e o gerador de sitemap dependem da coluna criada no passo 1.

No admin, abra um produto e use **B2B → Área do catálogo B2B**. `loja` mantém a compra no checkout. `eventos` e `sob_medida` aparecem apenas na respectiva área B2B e recebem cotação pelo WhatsApp. Novos produtos podem ser cadastrados depois; as duas áreas já aceitam um pedido de projeto sem produto cadastrado.

As faixas `product_price_tiers` são referenciais para cotação. O checkout atual valida o preço normal/promocional do produto, não aplica as faixas automaticamente. O cliente pode comprar vários itens da loja pelo preço exibido no checkout ou pedir proposta por volume.
