export type B2BEventCustomizerConfig = {
  product_id: number;
  template_path: string;
  colors: { name: string; hex: string }[];
  sample_text: string;
  text_limit: number;
};

export function B2BEventCustomizer({ config, colorHex, text, onColorChange, onTextChange }: {
  config: B2BEventCustomizerConfig;
  colorHex: string;
  text: string;
  onColorChange: (hex: string) => void;
  onTextChange: (text: string) => void;
}) {
  const db = (window as any).supabaseClient;
  const imageUrl = db.storage.from('imagens').getPublicUrl(config.template_path).data.publicUrl;
  const previewText = text.trim() || config.sample_text;
  const fontSize = previewText.length > 20 ? '1rem' : previewText.length > 12 ? '1.2rem' : '1.5rem';

  return <section aria-labelledby="customizer-title" className="border border-[#e5bb62]/35 bg-[#101e28] p-4 sm:p-5 rounded-xl">
    <div className="mb-4"><p className="text-[#e5bb62] text-xs font-bold uppercase tracking-widest">Personalize sua peça</p><h2 id="customizer-title" className="font-display font-bold text-xl mt-1">Escolha a cor e escreva o nome</h2><p className="text-white/55 text-sm mt-1">Veja a ideia antes de pedir a cotação. A arte final é confirmada com nossa equipe no chat.</p></div>
    <div className="grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5 items-start">
      <div className="aspect-square w-full max-w-[360px] mx-auto relative overflow-hidden border border-white/10 bg-[#192936] rounded-lg" role="img" aria-label={`Prévia ilustrativa: ${previewText}, cor ${config.colors.find(color => color.hex === colorHex)?.name || 'selecionada'}`}>
        <div aria-hidden="true" className="absolute inset-[6%]" style={{ backgroundColor: colorHex, maskImage: `url("${imageUrl}")`, WebkitMaskImage: `url("${imageUrl}")`, maskPosition: 'center', WebkitMaskPosition: 'center', maskSize: 'contain', WebkitMaskSize: 'contain', maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat' }} />
        <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center p-[18%] text-center font-display font-black break-words leading-tight" style={{ fontSize, color: '#fff', textShadow: '0 2px 5px #000, 0 0 2px #000' }}>{previewText}</div>
      </div>
      <div className="space-y-5">
        <fieldset><legend className="text-sm font-semibold mb-2">Cor da peça</legend><div className="flex flex-wrap gap-2">{config.colors.map(color => <button type="button" key={color.hex} aria-pressed={colorHex === color.hex} onClick={() => onColorChange(color.hex)} className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm ${colorHex === color.hex ? 'border-[#e5bb62] bg-[#e5bb62]/10' : 'border-white/20 bg-[#07111a]'}`}><span className="h-5 w-5 rounded-full border border-white/30" style={{ backgroundColor: color.hex }} />{color.name}</button>)}</div></fieldset>
        <label className="block text-sm font-semibold">Texto na peça<input required value={text} onChange={event => onTextChange(event.target.value)} maxLength={config.text_limit} placeholder={`Ex.: ${config.sample_text}`} autoComplete="off" className="block w-full mt-2 p-3 rounded bg-[#07111a] border border-white/25 text-white font-normal" /><span className="block mt-1 text-xs text-white/45 font-normal">Até {config.text_limit} caracteres · {text.length}/{config.text_limit}</span></label>
        <p className="text-xs text-white/45">Prévia ilustrativa. Cor, posição e acabamento podem variar na peça física.</p>
      </div>
    </div>
  </section>;
}
