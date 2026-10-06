# Modelos paramétricos para personalizados B2B

O botão de personalização agora pode reconstruir a geometria 3D a partir de
um projeto OpenSCAD (`.scad`). A imagem PNG continua disponível para anúncios
antigos, mas não altera o sólido. Nenhum modelo de produto é incluído por esta
funcionalidade: o administrador cadastra cada projeto quando estiver pronto.

## Contrato do arquivo

- Envie **um arquivo `.scad` autocontido**, de até 256 KiB. Arquivos locais
  referenciados por `include`, `use`, `import` ou `surface` não acompanham o
  upload e, portanto, não funcionarão no navegador.
- Declare uma variável de texto no topo do arquivo, por exemplo
  `custom_text = "Seu nome";`. Configure o mesmo identificador no admin.
- Use essa variável nas operações de modelagem que precisam mudar com o nome.
  Para um chaveiro cujo corpo acompanha o texto, o contorno, a base, o furo da
  argola e as letras precisam ser construídos pelo script; desenhar apenas
  `text(custom_text)` sobre uma base fixa não fará o corpo acompanhar o nome.
- Use fontes disponíveis no OpenSCAD em WebAssembly (o pacote contém fontes
  Liberation). O teste no admin detecta arquivos sem fonte ou geometria válida.
- Escolha um texto de exemplo e limite de até 40 caracteres. Nomes maiores
  podem exigir um limite menor para respeitar as dimensões da peça.

## Cadastro e publicação

1. No admin, crie ou edite um produto da categoria **Personalizados para
   eventos**, configure preço e selecione **Modelo 3D paramétrico (.scad)**.
2. Envie o `.scad`, informe a variável de texto, cores e exemplo. Salve o
   produto **inativo**. Fotos do catálogo continuam sendo cadastradas na aba
   Imagens.
3. Reabra o produto e clique em **Testar e baixar o modelo 3D salvo**. Gire a
   peça, confira o resultado e clique em **Verificar com outro nome**. O teste
   gera duas malhas e exige que elas sejam diferentes.
4. Reabra o produto e ative o anúncio. A proteção no banco impede a ativação
   antes do teste. Trocar o arquivo ou a variável invalida a verificação.
5. O cliente B2B altera nome e cor, vê a malha regenerada e solicita cotação.
   A cotação salva o arquivo e o texto utilizados. Em **Cotações B2B**, abra o
   modelo da conversa para regenerar e baixar o STL de produção.

O STL contém **geometria, não cor de filamento**. A cor escolhida é salva na
cotação para a produção e é simulada na visualização. Materiais, acabamento e
eventuais peças em múltiplas cores são confirmados no chat da cotação.

Para gerar a malha no navegador sem um servidor CAD, o arquivo `.scad` é
disponibilizado a contas B2B autenticadas que podem ver o produto. O bucket
permanece privado para visitantes e contas pessoais, mas o código-fonte não
deve conter segredos nem um projeto que precise ficar oculto dos clientes B2B.

O projeto usa [OpenSCAD WASM](https://github.com/lofcz/openscad-wasm) no
navegador. Esse componente é distribuído sob GPL-2.0; o código-fonte e a
licença estão disponíveis no repositório do componente e no pacote npm.
