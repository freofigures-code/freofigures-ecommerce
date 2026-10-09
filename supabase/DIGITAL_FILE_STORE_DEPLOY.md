# Loja de arquivos STL e 3MF

A loja digital fica em `/stls.html`; o cadastro, em `/admin/arquivos-digitais.html`. Cada anúncio tem um preço único e libera os dois formatos na biblioteca da conta compradora. O fluxo é separado dos produtos físicos, do B2B, do estoque e do frete.

## Publicação

1. Execute no SQL Editor do projeto `rrmxqpvxrpcqqxsgccqw` o conteúdo integral de `supabase/migrations/20261009153413_digital_file_store.sql`.
2. Execute `supabase/diagnostics/digital_file_store_postflight.sql`. Todos os valores de `verificacao_loja_digital` devem ser `true`.
3. Implante **as duas** Edge Functions do repositório: `freo-payment-sync` (esta versão verifica também o ID do pedido digital) e `freo-digital-store`. A última deve manter `verify_jwt = true`; `freo-payment-sync` mantém `verify_jwt = false` para conciliação interna/cron. Exemplo com CLI vinculado ao projeto: `npx supabase functions deploy freo-payment-sync --project-ref rrmxqpvxrpcqqxsgccqw` e `npx supabase functions deploy freo-digital-store --project-ref rrmxqpvxrpcqqxsgccqw`.
4. Confirme que `MERCADOPAGO_ACCESS_TOKEN`, já usado pela sincronização de pagamentos, está configurado no Supabase. A nova função usa esse mesmo segredo. Publique o frontend somente depois do SQL e das duas funções.
5. Na administração, envie uma foto de capa, um `.stl` e um `.3mf`, cadastre o preço e publique. O 3MF deve ser exportado do fatiador com o perfil/configuração de impressão desejado; o site não fatia o STL nem infere parâmetros de impressora. Cada arquivo pode ter até 50 MiB.

O cliente autenticado paga por Pix ou usa Créditos Freo, inclusive até 100% do valor. O download é liberado apenas após confirmação do pagamento; cada solicitação recebe um link temporário de 60 segundos. Se o Pix ficar pendente, o cliente retoma o mesmo pedido em **Minha biblioteca**. Um Pix rejeitado cancela o pedido digital e libera os créditos reservados conforme a regra já existente.

Para conferência sem afetar o catálogo físico, publique inicialmente um anúncio de teste com preço baixo. Verifique uma compra por Pix e outra com créditos suficientes; ambas devem disponibilizar STL e 3MF na biblioteca do comprador. Confirme também que um usuário sem compra não consegue ler o bucket privado nem baixar os arquivos.
