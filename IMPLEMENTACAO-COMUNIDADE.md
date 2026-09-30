# Categorias e publicação de criações

Implementação na branch `feat/community-publications`. O SQL e a Edge Function
precisam ser implantados no Supabase antes de publicar o frontend em produção.

## Comportamento

- Categorias: **Geek/Gamer**, **Religioso** e **Feito por vocês**.
- **Kits Prontos** e **Montar Kit** continuam disponíveis. Os dados dos kits,
  a montagem, os preços e o checkout dos kits permanecem como no repositório.
- Depois de consultar o preço, o cliente encontra a opção **Publicar para que
  outras pessoas vejam**, inicialmente desmarcada. A compra não exige publicação.
- O aceite pode ser enviado pelo botão **Enviar para aprovação**, sem comprar,
  ou ao seguir para o checkout com a opção marcada.
- O envio grava o consentimento, consulta o preço no servidor e cria cópias
  privadas da imagem e do modelo. Edições futuras na geração não alteram essas cópias.
- O admin acessa `/admin/criacoes.html` pelo painel ou pela página de produtos.
  Pode ver imagem, arquivo 3D e preço, informar o estoque e aprovar ou recusar.
- Aprovar cria um produto normal em **Feito por vocês**, com o preço validado.
  Recusar não publica o produto. O motivo, se preenchido, aparece para o autor
  quando ele reabre a tela de preço da criação. A compra pessoal continua disponível.
- Cada geração pode ter uma solicitação. Repetir um envio ou uma decisão não
  cria produtos duplicados nem troca uma decisão já concluída.

## Aplicar

1. O diagnóstico `supabase/diagnostics/community_preflight.sql` já foi executado
   pelo proprietário do projeto. O resultado de 29/09/2026 confirmou as colunas,
   tipos, RLS, buckets e o gatilho de proteção do administrador. O teste local
   reconstrói as colunas e os padrões reais de `products` e `generation_jobs`.
2. Execute **somente** `supabase/migrations/202609290001_generation_publications.sql`
   uma vez, como proprietário do banco,
   pelo SQL Editor ou pelo processo de migrações já usado no projeto.
   A migração é transacional e interrompe caso o esquema esperado tenha mudado.
   Ela preserva as categorias anteriores numa tabela privada. Não reaplique
   migrações antigas já instaladas.
3. Execute `supabase/diagnostics/community_postflight.sql`, apenas leitura.
   Todos os valores da resposta devem ser `true`.
4. Publique a nova Edge Function:
   `supabase functions deploy generation-publication --project-ref rrmxqpvxrpcqqxsgccqw`.
   Ela usa as variáveis padrão `SUPABASE_URL`, `SUPABASE_ANON_KEY` e
   `SUPABASE_SERVICE_ROLE_KEY` do ambiente Supabase. Nenhuma chave privilegiada
   deve ir para o frontend. Mantenha a autenticação JWT ativada.
5. A função existente `generation-price-quote` deve estar operacional. Ela não
   está versionada neste repositório, portanto seu código e sua resposta em
   produção não puderam ser verificados aqui. Para
   publicar, a geração concluída deve ter imagem e `model_path` persistidos no
   bucket privado `generations`. A publicação falha sem afetar a compra se esses
   arquivos ou o preço não estiverem disponíveis.
6. Rode `npm ci`, `npm run lint`, `npm run test:community` e `npm run build`.
   Depois publique o frontend pelo processo atual de hospedagem.
7. Valide em homologação: comprar sem publicar; enviar com consentimento; fila
   pendente; aprovação e produto no catálogo; recusa sem produto público; repetição
   de envio; acesso negado a usuário comum; Kits Prontos e Montar Kit.

### Produtos já existentes

A migração mantém Religioso e não altera os registros dos kits. Os outros produtos
existentes vão para Geek/Gamer. Nenhum produto antigo entra automaticamente em
Feito por vocês: essa categoria exige geração, consentimento e aprovação.
As categorias originais ficam preservadas em `private.product_categories_before_community`
para revisão ou recuperação manual. Não há exclusão de produtos.

## Validação realizada

- TypeScript do frontend e verificação Deno da Edge Function: aprovados.
- Build Vite: aprovado; neste ambiente Windows restrito foi necessário carregar
  uma cópia temporária da configuração com `--configLoader runner` e `__dirname`
  explícito. A configuração original do projeto foi preservada.
- Testes novos de banco PostgreSQL embutido (PGlite) e Edge Function: aprovados.
  Cobrem propriedade, consentimento, preço do servidor, autorização, recusa,
  visibilidade pública, tentativas de adulterar itens aprovados e repetição de
  solicitações/decisões.
- Prévia no navegador com dados fictícios locais: preço, consentimento,
  envio pendente, aprovação, produto na categoria e opções de kits verificados.
- Na primeira revisão, sete falhas foram reproduzidas também no commit original:
  uma na inserção do conteúdo SEO e seis no carregamento/validação das avaliações.
  Elas foram corrigidas nesta revisão: o teste carrega o script externo atual,
  a elegibilidade usa a função de banco existente, avaliações artificiais são
  excluídas e o conteúdo SEO usa o marcador atual. **24 testes passaram.**

Não foram feitos pedidos, pagamentos ou alterações no banco de produção. A
execução real do SQL e o deploy da função ainda precisam ser confirmados no
Supabase; os testes locais não substituem essa verificação.
