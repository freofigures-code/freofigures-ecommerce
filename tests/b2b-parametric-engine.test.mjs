import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import createOpenSCAD from '@lofcz/openscad-wasm';
import { addFonts } from '@lofcz/openscad-wasm/fonts';

const wasmPath = join(dirname(fileURLToPath(import.meta.resolve('@lofcz/openscad-wasm'))), 'openscad.wasm');
const wasmBytes = readFileSync(wasmPath);
const source = `
custom_text = "FREO";
module name_shape() { offset(r=1.8) text(custom_text, size=11, font="Liberation Sans:style=Bold"); }
linear_extrude(height=3) name_shape();
translate([0,0,3]) linear_extrude(height=0.8) text(custom_text, size=11, font="Liberation Sans:style=Bold");
`;

async function render(text) {
  const diagnostics = [];
  const instance = await createOpenSCAD({
    noInitialRun: true,
    printErr: line => diagnostics.push(line),
    instantiateWasm(imports, done) {
      WebAssembly.instantiate(wasmBytes, imports).then(result => done(result.instance));
      return {};
    },
  });
  addFonts(instance);
  instance.FS.writeFile('/model.scad', source);
  const status = instance.callMain(['/model.scad', '-D', `custom_text=${JSON.stringify(text)}`, '--backend', 'Manifold', '--export-format', 'binstl', '-o', '/model.stl']);
  assert.equal(status, 0, diagnostics.join('\n'));
  const stl = instance.FS.readFile('/model.stl', { encoding: 'binary' });
  assert.ok(stl.byteLength > 84);
  return stl;
}

test('changing the OpenSCAD text rebuilds a different printable 3D mesh', { timeout: 120000 }, async () => {
  const shortName = await render('ANA');
  const longName = await render('ALEXANDRA');
  const accentedName = await render('JOÃO');
  assert.notDeepEqual(shortName, longName);
  assert.ok(new DataView(longName.buffer, longName.byteOffset, longName.byteLength).getUint32(80, true) > 0);
  assert.ok(new DataView(accentedName.buffer, accentedName.byteOffset, accentedName.byteLength).getUint32(80, true) > 0);
});
