# Upload com prévia, foto real e ajuste por texto

O upload deixa de ir direto para o Tripo. A imagem enviada vira uma geração
`image_ready`; o cliente escolhe se é **personagem pronto**, **foto de pessoa**
ou **foto de pet/objeto**. Fotos passam por uma conversão em figure (o mesmo
`refine_image` de sempre) e, em todos os casos, o cliente pode ajustar por texto
antes de gerar o 3D.

O front converte todo upload para PNG (máx. 2048 px), porque o webhook
`GERAR_modelo` só aceita PNG.

## Ordem de deploy

1. **n8n primeiro.** Substitua o código do node `Preparar edição` (webhook
   `refazer_imagem`) pelo código abaixo. Ele continua aceitando as edições
   atuais, então pode ir para produção antes do resto.
2. **Banco.** Execute no SQL Editor o conteúdo de
   [`migrations/20261030120000_upload_preview.sql`](migrations/20261030120000_upload_preview.sql).
   Ele recria `start_generation` igual à de produção (copiada em 2026-10-30)
   com a nova ação `register_upload`. Pode ser executado mais de uma vez.
3. **Front.** Publique esta versão.

Se o front for publicado antes do n8n, a conversão de foto chega ao n8n como
uma edição comum com o texto `[modo:foto]` e o resultado fica errado.

## Créditos

Inalterado: a criação do job desconta 10 créditos (trigger
`freo_charge_generation`). A conversão de foto e os ajustes usam `refine_image`
e não descontam créditos, mas cada um gasta uma edição na OpenAI.

## Código do node `Preparar edição`

O worker repassa `refinement_text` como `prompt`. O front prefixa
`[modo:foto]` ou `[modo:objeto]` na conversão; sem prefixo é edição normal.
Um único node Code faz o papel do Switch, sem mudar as conexões.

```js
const body = $json.body ?? {};

const imageUrl = body.image_url;
const rawPrompt = body.prompt;

if (typeof imageUrl !== 'string' || !imageUrl.trim()) {
  throw new Error('Campo "image_url" é obrigatório.');
}

if (typeof rawPrompt !== 'string' || !rawPrompt.trim()) {
  throw new Error('Campo "prompt" é obrigatório.');
}

const cleanImageUrl = imageUrl.trim();

const isDataUrl = /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(cleanImageUrl);
const isHttpUrl = /^https?:\/\//i.test(cleanImageUrl);

if (!isDataUrl && !isHttpUrl) {
  throw new Error('image_url precisa ser uma data URL base64 de imagem ou uma URL HTTPS pública.');
}

// [modo:foto] / [modo:objeto] no início do prompt = conversão de foto real.
const modeMatch = rawPrompt.trim().match(/^\[modo:(foto|objeto)\]\s*/i);
const mode = modeMatch ? modeMatch[1].toLowerCase() : 'edit';
const userText = (modeMatch ? rawPrompt.trim().slice(modeMatch[0].length) : rawPrompt).trim();

const extra = userText ? `\n\nEXTRA CUSTOMER REQUEST:\n${userText}` : '';

const PROMPTS = {
  foto: `Transform the person in the provided photo into a premium collectible action figure / 3D-printed figurine.

MANDATORY REQUIREMENTS:
- Keep the person's identity recognizable: face shape, hairstyle, hair color, skin tone, clothing and colors.
- Sculpted figurine look: smooth simplified surfaces, no photographic skin texture, no photo noise.
- Full body visible from head to feet, standing on the ground, one subject only.
- Centered, clear silhouette suitable for later 3D reconstruction.
- Arms and legs visually readable, no unnecessary occlusion.
- Simple clean light background, no scenery.
- Details thick enough to be printed; no thin floating parts, no transparencies.
- Do not crop body parts.${extra}`,
  objeto: `Transform the animal or object in the provided photo into a premium collectible figurine / 3D-printed statue.

MANDATORY REQUIREMENTS:
- Keep the subject recognizable: shape, proportions, colors and markings.
- Sculpted figurine look: smooth simplified surfaces, no photographic texture, no photo noise.
- The whole subject visible, nothing cropped, one subject only, resting on the ground.
- Centered, clear silhouette suitable for later 3D reconstruction.
- Simple clean light background, no scenery.
- Details thick enough to be printed; no thin floating parts, no transparencies.${extra}`,
  edit: `Edit the provided image according to the user's request below.

USER REQUEST:
${userText}

MANDATORY REQUIREMENTS:
- Preserve the same main subject/character and its recognizable identity.
- Preserve the collectible action figure / physical figurine appearance.
- Keep the full figure visible from head to feet.
- Keep the figure centered with a clear silhouette suitable for later 3D reconstruction.
- Keep arms and legs visually readable and avoid unnecessary occlusion.
- Keep a simple clean background.
- Do not add a complex environment unless the user explicitly asks for it.
- Do not crop body parts.
- Do not introduce floating or physically implausible parts unless explicitly requested.
- Change only what is necessary to satisfy the user's request.`,
};

if (mode === 'edit' && !userText) {
  throw new Error('Descreva o que deseja mudar.');
}

return [
  {
    json: {
      model: 'gpt-image-2',
      images: [
        {
          image_url: cleanImageUrl
        }
      ],
      prompt: PROMPTS[mode],
      quality: 'medium',
      size: '1024x1024',
      output_format: 'png'
    }
  }
];
```

## Verificação

- Upload de personagem pronto: aparece a prévia, "Refazer Imagem" ajusta por
  texto, "Gerar Modelo 3D" segue para o Tripo.
- Upload de foto: a tela "Transformando sua foto em figure" termina numa
  imagem de figure; depois disso os ajustes são edições normais.
- Upload em JPEG chega ao Tripo sem o erro "image_url precisa ser uma data URL PNG".
