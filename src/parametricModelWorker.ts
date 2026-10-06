/// <reference lib="webworker" />
import createOpenSCAD from '@lofcz/openscad-wasm';
import { addFonts } from '@lofcz/openscad-wasm/fonts';

type RenderRequest = { source: string; parameter: string; text: string };

self.onmessage = async (event: MessageEvent<RenderRequest>) => {
  const { source, parameter, text } = event.data;
  const diagnostics: string[] = [];
  try {
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,39}$/.test(parameter) || text.length < 1 || text.length > 40 || source.length > 262144) {
      throw new Error('Parâmetros do modelo inválidos.');
    }
    const instance = await createOpenSCAD({
      noInitialRun: true,
      printErr: line => { if (diagnostics.length < 12) diagnostics.push(line); },
    });
    addFonts(instance);
    instance.FS.writeFile('/model.scad', source);
    // callMain receives separate arguments, so text cannot become a command.
    const status = instance.callMain([
      '/model.scad', '-D', `${parameter}=${JSON.stringify(text)}`,
      '--backend', 'Manifold', '--export-format', 'binstl', '-o', '/model.stl',
    ]);
    if (status !== 0) throw new Error(diagnostics.join('\n') || 'O OpenSCAD não conseguiu gerar o modelo.');
    const result = instance.FS.readFile('/model.stl', { encoding: 'binary' });
    if (!(result instanceof Uint8Array) || result.byteLength < 84 || result.byteLength > 20 * 1024 * 1024) throw new Error('O arquivo 3D gerado está vazio ou grande demais.');
    const view = new DataView(result.buffer, result.byteOffset, result.byteLength);
    const triangles = view.getUint32(80, true);
    if (triangles < 1 || 84 + triangles * 50 !== result.byteLength) throw new Error('A geometria 3D gerada é inválida.');
    const bytes = Uint8Array.from(result);
    self.postMessage({ ok: true, bytes: bytes.buffer, diagnostics }, [bytes.buffer]);
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : 'Falha ao gerar o modelo 3D.', diagnostics });
  }
};
