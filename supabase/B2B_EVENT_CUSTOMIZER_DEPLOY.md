# Personalizador simples de eventos B2B

## Publicação

1. Execute `migrations/202610060002_b2b_event_customizer.sql` no SQL Editor do projeto Supabase, depois da migração `202610060001_b2b_event_quotes_chat.sql` já aplicada.
2. Execute `diagnostics/b2b_event_customizer_postflight.sql`. Todos os campos de `verificacao_personalizador_eventos` precisam retornar `true`.
3. Só então publique o frontend desta alteração. Não há Edge Function nem mudança no checkout ou no n8n.

## Cadastro de um produto

1. Entre em **Administração → Produtos → Criar personalizado para eventos**.
2. Na aba **Básico**, cadastre nome, descrição e mantenha o produto ativo apenas quando estiver pronto. Na aba **Imagens**, envie fotos reais do produto; a primeira é a capa do catálogo.
3. Na aba **B2B**, configure a quantidade mínima e o preço (desconto por unidade adicional ou faixas).
4. Marque **Permitir que o cliente escolha cor e texto**. Envie **um PNG quadrado transparente da parte que muda de cor**, sem texto, idealmente 1200 × 1200 px (mínimo 600 × 600 px; até 5 MB). Para um chaveiro, o PNG deve mostrar apenas o disco liso; não inclua a argola se ela não muda de cor. O PNG é a silhueta da prévia, separado das fotos reais.
5. Cadastre de 1 a 8 cores com nomes simples, escolha um texto de exemplo e o limite de caracteres. Confira a prévia e salve.

O cliente vê a foto real e, na página B2B, altera cor e texto numa prévia ilustrativa. Ao solicitar cotação, as escolhas e a estimativa ficam registradas no pedido de cotação e visíveis para cliente e administração. O arquivo de fabricação, posição exata do texto, acabamento e proposta final são combinados no chat privado. O PNG não é convertido automaticamente em arquivo 3D imprimível.
