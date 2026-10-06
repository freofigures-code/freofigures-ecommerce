# Produtos para eventos e conversas B2B

Execute uma vez, no SQL Editor do projeto Supabase `rrmxqpvxrpcqqxsgccqw`, o conteúdo integral de [`migrations/202610060001_b2b_event_quotes_chat.sql`](migrations/202610060001_b2b_event_quotes_chat.sql). Ele depende das migrações B2B já aplicadas. Depois execute [`diagnostics/b2b_event_chat_postflight.sql`](diagnostics/b2b_event_chat_postflight.sql): todos os campos de `verificacao_eventos_chat` precisam retornar `true` antes de publicar o frontend. Esta entrega não altera a Edge Function de checkout nem o fluxo n8n.

No administrador de produtos, use **Criar personalizado para eventos**. Preencha título, descrição, imagem e, na aba B2B, quantidade mínima e uma das regras:

- **Desconto por unidade adicional:** informe preço unitário na quantidade mínima, desconto aplicado ao preço unitário a cada peça extra e menor preço permitido. Exemplo: 10 peças a R$ 2,00; desconto de R$ 0,02 por peça extra; 20 peças a R$ 1,80 cada.
- **Faixas de quantidade:** informe a primeira faixa na quantidade mínima e as próximas faixas em ordem crescente. Exemplo: 10 peças a R$ 2,00; a partir de 20 peças, R$ 1,80 cada. A última faixa vale sem limite superior até 1.000.000 de unidades.

Esses anúncios ficam na categoria B2B **Personalizados para eventos** e usam somente cotação. O preço da página é uma estimativa dos itens; o frete, arte e condições finais são acertados no chat. O banco recalcula e grava a estimativa ao criar a cotação. Os produtos B2B existentes sem essa configuração continuam com seu comportamento anterior; nenhum estoque ou checkout de varejo é alterado.

Cada cotação tem uma conversa própria na **Área da empresa** e em **Administração → Cotações B2B**. Apenas o dono da solicitação e administradores podem ler ou enviar mensagens. Imagens JPG, PNG e WEBP de até 5 MB ficam em um bucket privado e são exibidas por links temporários. Para verificar a operação, crie uma cotação com uma conta CNPJ de teste, envie uma mensagem e uma imagem, responda como administrador e confira que outra conta CNPJ não consegue ler a conversa ou a imagem.
