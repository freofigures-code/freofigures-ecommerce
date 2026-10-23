# API de automação da Freo Figures

A API fica no backend da própria loja, em `https://rrmxqpvxrpcqqxsgccqw.supabase.co/functions/v1/freo-automation-api`. Ela é destinada a integrações servidor a servidor. Não coloque seus tokens em navegador, aplicativo público, planilha compartilhada ou código versionado. Uma automação pode usar qualquer ferramenta capaz de fazer HTTPS.

## O que está disponível

| Método e rota | Permissão | Resultado |
| --- | --- | --- |
| `GET /products?limit=50&before_id=123` | leitura | Produtos em ordem decrescente de ID; inclui inativos e especiais. |
| `GET /products/:id` | leitura | Um produto. |
| `POST /products` | escrita | Cria produto comum, inicialmente inativo salvo se `is_active: true` for explícito. |
| `PATCH /products/:id` | escrita | Atualiza campos permitidos de produto comum. |
| `DELETE /products/:id` | escrita | Desativa o produto (`is_active: false`); mantém pedidos e histórico. |
| `POST /images` | escrita | Recebe bytes de JPEG, PNG ou WebP (até 8 MiB) e devolve URL pública do bucket `imagens`. |
| `GET /orders?limit=50&after_id=123` | leitura | Pedidos em ordem crescente após o ID informado. `before_id` usa ordem decrescente. |
| `GET /orders/:id` | leitura | Um pedido. |
| `GET /analytics/funnel?from=...&to=...` | leitura | Etapas e saídas do funil, mais totais operacionais de pedidos. |
| `GET /analytics/pages?from=...&to=...` | leitura | Até 100 caminhos com mais visualizações. |
| `GET /webhooks/events` | leitura | Últimos 50 eventos e estado de entrega. |
| `POST /webhooks/events/:id/retry` | escrita | Recoloca na fila um evento falho, ainda não entregue. |

Todas as rotas exigem `Authorization: Bearer <TOKEN>`. Configure `FREO_API_READ_TOKEN` para leitura e `FREO_API_WRITE_TOKEN` para escrita e leitura, com valores distintos e pelo menos 32 caracteres aleatórios. O token de leitura permite consultar dados pessoais de pedidos e deve ficar restrito ao servidor autorizado. Respostas têm JSON no formato `{ "data": ... }` ou `{ "error": { "code": "...", "message": "..." } }`.

`POST` e `PATCH /products` aceitam apenas `title`, `description`, `price`, `promotional_price`, `stock`, `preparation_days`, `category`, `images`, `tags`, `variants`, `seo_title`, `seo_description` e `is_active`. Criação exige `title`, `price` e `category` (`games` ou `religioso`). `preparation_days` aceita de 1 a 365 dias. O preço é em reais, como número JSON; imagens devem ser URLs retornadas pelo upload ao bucket desta loja. Produtos de kits, eventos, encomendas B2B e publicações da comunidade ficam sob seus fluxos especializados no painel. A API não altera preço, pagamento ou status de pedidos.

Exemplos, substituindo os tokens por segredos do seu gerenciador:

```bash
BASE='https://rrmxqpvxrpcqqxsgccqw.supabase.co/functions/v1/freo-automation-api'

curl -H "Authorization: Bearer $FREO_API_READ_TOKEN" "$BASE/orders?after_id=1000&limit=50"

curl -X POST "$BASE/images" \
  -H "Authorization: Bearer $FREO_API_WRITE_TOKEN" \
  -H 'Content-Type: image/webp' --data-binary @figure.webp

curl -X POST "$BASE/products" \
  -H "Authorization: Bearer $FREO_API_WRITE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Figure de exemplo","category":"games","price":89.90,"stock":5,"images":["URL_RETORNADA_PELO_UPLOAD"]}'

curl -H "Authorization: Bearer $FREO_API_READ_TOKEN" \
  "$BASE/analytics/funnel?from=2026-10-01T00:00:00Z&to=2026-10-08T00:00:00Z"
```

As datas do painel usam intervalo `[from,to)` de até 31 dias. Os números de `visits`, `product_views`, `carts`, `checkouts` e `observed_purchases` contam sessões com consentimento **Analíticos**; `left_after_*` indica uma etapa vista sem a etapa seguinte dentro do período. A loja registra visualizações das páginas estáticas e da vitrine, produtos, carrinho, entrada no checkout e compra confirmada. `created_orders` e `paid_orders_created_in_period` vêm do banco de pedidos e são totais operacionais, não dependem do consentimento de medição. Visitas sem consentimento não são reconstruídas. `pages` usa só o caminho, sem parâmetros de URL. GA4 e Clarity não são lidos por esta API; ela agrega os eventos próprios da loja.

## Pedidos enviados automaticamente

O gatilho no banco cria um evento `order.created` quando um pedido entra e `order.status_changed` quando seu status muda. Ele registra `order_id`, `status`, `total` e `created_at`. A função `freo-automation-dispatch`, chamada a cada minuto, entrega o evento via `POST` para `FREO_AUTOMATION_WEBHOOK_URL`. O destino deve ter HTTPS. Para obter itens e endereço, o receptor consulta `GET /orders/:id` com o token de leitura; o webhook não transporta CPF, identificador de pagamento ou endereço.

O corpo enviado é `{"id":7,"type":"order.created","occurred_at":"...","data":{"order_id":123,"status":"pendente","total":89.9,"created_at":"..."}}`. Os cabeçalhos são `x-freo-event-id`, `x-freo-timestamp` (segundos Unix) e `x-freo-signature: sha256=<hex>`. A assinatura é HMAC-SHA256, com `FREO_AUTOMATION_WEBHOOK_SECRET`, sobre `timestamp + '.' + corpo bruto`. O receptor deve validar assinatura e tolerância do timestamp antes de processar, e deduplicar pelo ID do evento. Um HTTP `2xx` confirma a entrega. Falhas são tentadas novamente com intervalo crescente, no máximo 10 tentativas no total; a API permite inspecionar e reencaminhar eventos falhos. Eventos anteriores à instalação do gatilho não são enviados retroativamente; podem ser obtidos via `GET /orders`.

## Ativação no projeto Supabase correto

O projeto da loja é `rrmxqpvxrpcqqxsgccqw`. Confira essa referência antes de executar qualquer comando. A migração deve ser aplicada **antes** do deploy das funções. É necessário acesso administrativo a esse projeto para concluir estes passos.

1. Faça backup e aplique `supabase/migrations/20261023182546_automation_api_v1.sql` pelo fluxo de migrações da loja. Confira se as tabelas `public.orders` e `public.analytics_events` existem e se a migração termina sem erro.
2. Gere cinco segredos independentes com um gerador criptográfico: `FREO_API_READ_TOKEN`, `FREO_API_WRITE_TOKEN`, `FREO_AUTOMATION_WORKER_TOKEN`, `FREO_AUTOMATION_WEBHOOK_SECRET` (ao menos 32 caracteres cada) e `FREO_AUTOMATION_WEBHOOK_URL` (URL HTTPS do seu sistema receptor). Defina-os nas Edge Function Secrets do projeto. O endpoint de webhook pode ser configurado mais tarde; sem ele a entrega retorna `not_configured` e a fila permanece intacta.
3. Implante `freo-automation-api` e `freo-automation-dispatch` com `verify_jwt=false` de `supabase/config.toml`. A autenticação própria de cada função verifica os tokens antes de consultar dados ou despachar eventos.
4. Em produção, verifique apenas `GET /products`, `GET /orders` e os agregados com o token de leitura, além de `401` sem token e `403` ao tentar escrever com o token de leitura. Testes de criação, edição, envio de imagem e desativação devem ocorrer apenas em ambiente isolado; a ativação não exige alterar produtos reais.
5. Ative as extensões `pg_cron`, `pg_net` e Vault no projeto. Guarde `FREO_AUTOMATION_WORKER_TOKEN` também no Vault com o nome `freo_automation_worker_token`, usando `select vault.create_secret('<TOKEN>', 'freo_automation_worker_token');` no SQL Editor. Depois agende o despachante:

```sql
select cron.schedule(
  'freo-automation-dispatch',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://rrmxqpvxrpcqqxsgccqw.supabase.co/functions/v1/freo-automation-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'freo_automation_worker_token')
    ),
    body := '{}'::jsonb
  );
  $$
);
```

6. Quando um pedido novo ocorrer naturalmente, confira `order.created` em `GET /webhooks/events` e valide assinatura, recebimento e detalhes via `GET /orders/:id`. Confira `order.status_changed` quando o status mudar pelo fluxo normal. Não crie nem altere pedidos reais apenas para testar. Se o destino falhar, observe `attempts`/`last_error` antes de reencaminhar.

Para expor a API como `https://freofigures.com.br/api/v1/`, configure um proxy HTTPS do servidor web para a função Supabase, preservando o cabeçalho `Authorization` e a rota após `/api/v1`. O repositório não contém a configuração atual do proxy da VPS; essa etapa depende do servidor. O endereço Supabase acima funciona independentemente do proxy.

Referências: [Secrets de Edge Functions](https://supabase.com/docs/guides/functions/secrets) e [agendamento de Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions).
