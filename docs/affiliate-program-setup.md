# Programa de afiliados — implantação

O programa cobre somente produtos físicos do catálogo principal, inclusive kits e criações aprovadas da comunidade. Arquivos STL/3MF e pedidos B2B não entram na afiliação.

1. Execute no SQL Editor do projeto Supabase rrmxqpvxrpcqqxsgccqw o conteúdo integral de supabase/migrations/20261013164305_affiliate_program.sql.
2. Execute supabase/diagnostics/affiliate_program_postflight.sql. Todos os campos de verificacao_afiliados devem ser true.
3. Implante as versões deste commit de supabase/functions/freo-checkout/index.ts e supabase/functions/freo-payment-sync/index.ts. Preserve a configuração em supabase/config.toml: freo-checkout exige JWT e freo-payment-sync recebe chamadas do banco sem JWT. A última já usa MERCADOPAGO_ACCESS_TOKEN; mantenha esse segredo configurado.
4. Publique o frontend somente após a migração e ambas as Edge Functions. Teste com uma conta de afiliado e outra compradora: cadastre CPF e telefone, gere um link, abra o link, compre a peça e confira a comissão no pedido administrativo. Para Pix, registre o pagamento manual após confirmar o destinatário no banco.

A taxa inicial é 10%. A administração pode alterá-la para vendas futuras ou aplicar uma taxa individual. A base é o preço da opção escolhida antes de cupom/Créditos Freo. O pedido precisa ter algum pagamento em dinheiro verificado. O último link clicado vale por 30 dias e uma compra própria não paga comissão. Estornos revertem o saldo; se já houve Pix, o saldo fica negativo até ser compensado por vendas futuras.

Para atualizar o cadastro já implantado, execute `supabase/migrations/20261014184213_affiliate_phone_signup.sql` e depois `supabase/diagnostics/affiliate_phone_signup_postflight.sql`. Todos os campos de `verificacao_cadastro_afiliados` devem ser `true` antes de publicar o frontend atualizado. A migração substitui a função de cadastro por CPF e telefone; não exige alterar as Edge Functions do checkout ou pagamento.

O bucket `affiliate-selfies` continua privado para preservar fotos de cadastros anteriores. Novos cadastros não solicitam nem aceitam fotos. O CPF e o telefone ficam no perfil privado do afiliado; a administração vê ambos e ainda pode consultar fotos antigas. O identificador de indicação expira no navegador após 30 dias sem novo clique e os cliques antigos são eliminados diariamente do banco.
