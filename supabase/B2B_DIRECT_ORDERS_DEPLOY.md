# Compra B2B por quantidade

1. Execute `migrations/202610050001_b2b_direct_orders.sql` no SQL Editor do mesmo projeto Supabase. Esta migração pressupõe as migrações de categorias, cotações e criadores já aplicadas.
2. Execute `diagnostics/b2b_direct_orders_postflight.sql`. Todos os campos em `verificacao_pedidos_b2b` devem retornar `true`.
3. Publique a versão atual da Edge Function `freo-checkout`.
4. Publique o frontend. O fluxo n8n `criar-pagamento` permanece igual.

No admin, **Produtos → editar produto → B2B**, defina o modo **Normal** e crie ao menos uma faixa. O campo **Mín.** da primeira faixa é o mínimo de compra; o preço da faixa é o preço unitário B2B. Deixe **Máx.** vazio na última faixa para aceitar quantidades maiores, sem consultar o estoque da loja. Produtos em **Somente cotação** continuam sem compra direta. Kits continuam no fluxo existente e, no B2B, recebem cotação.

O botão **Empresas B2B** no cabeçalho abre a área pública. Só contas PJ ou administradoras carregam o catálogo e os preços. Cada cartão leva a `b2b-produto.html`. O carrinho B2B é separado do carrinho da loja, mas abre o mesmo checkout com `?b2b=1`; o servidor valida a conta, os preços e as quantidades. Os três pontos do checkout que chamavam `decrementar_estoque` ignoram pedidos B2B.

O código do webhook de notificação de pagamento do n8n não está neste repositório. Antes de ativar vendas B2B, confirme que esse webhook não executa outra baixa de estoque. A busca no repositório encontrou chamadas de baixa apenas no checkout tradicional, todas condicionadas para ignorar B2B nesta revisão.
