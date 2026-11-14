const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const originalPath = process.argv[2] || path.join(__dirname, 'original.html');
const outputPath = process.argv[3] || path.join(__dirname, '../outputs/cv_puerta_editor_PRISMA_3D.html');
const cssPath = path.join(__dirname, 'prisma-3d.css');
const original = fs.readFileSync(originalPath);
const source = original.toString('utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
assert.equal(hash(original), '0e6f8da18f86c317287fad44b28bc5498c278f4f3f86d683ab02c8aa6040c47f', 'El archivo de entrada no es la versión V13.2CV reorganizada verificada.');
assert.notEqual(path.resolve(originalPath), path.resolve(outputPath), 'Usa otro destino: se conserva el original.');
assert(!source.includes('id="cv-prisma-3d"'), 'El tema ya está incluido.');
assert(!/<\/?(?:script|style)\b/i.test(css), 'La capa visual debe ser CSS puro.');
const block = '\n<style id="cv-prisma-3d">\n' + css + '\n</style>\n';
const end = source.lastIndexOf('</body>');
assert(end >= 0, 'Falta el cierre del documento.');
const output = source.slice(0, end) + block + source.slice(end);
assert(Buffer.from(output.replace(block, ''), 'utf8').equals(original), 'El archivo original debe recuperarse byte a byte.');
const scripts = text => [...text.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi)].map(m=>m[0]);
const before = scripts(source), after = scripts(output);
assert.deepEqual(after, before, 'Todos los scripts deben ser idénticos y conservar su orden.');
const scriptChecks = before.map((script,i)=>{
  const body = script.replace(/^<script[^>]*>/i,'').replace(/<\/script>$/i,'');
  new vm.Script(body, {filename:'original-script-'+i+'.js'});
  return {index:i,sha256:hash(script),unchanged:true,syntax:'valid'};
});
const context = vm.createContext({});
vm.runInContext(before[0].replace(/^<script[^>]*>/i,'').replace(/<\/script>$/i,''),context);
assert.equal(context.cvFormatInchFraction(2.375),'2 3/8');
assert.equal(context.cvFormatInchFraction(-0.125),'-1/8');
assert.equal(context.cvParseProfileMeasure('2 3/8'),2.375);
assert.equal(context.cvParseProfileMeasure('0.125'),0.125);
assert.equal(context.cvExactInchFraction(1.625),'1 5/8');
assert(Number.isNaN(context.cvParseProfileMeasure('1/0')));
fs.mkdirSync(path.dirname(outputPath),{recursive:true});
fs.writeFileSync(outputPath,output,'utf8');
const report = {
  theme:'PRISMA 3D',
  sourceFile:path.basename(originalPath),
  sourceSHA256:hash(original),
  outputSHA256:hash(Buffer.from(output)),
  cssSHA256:hash(css),
  sourceByteForByteRecoverable:true,
  originalScripts:before.length,
  unchangedScripts:after.length,
  originalMarkupAndStylesUnchanged:true,
  newExecutableCode:false,
  screenOnlyCSS:true,
  fractionChecks:6,
  scripts:scriptChecks,
  browserQA:'Not completed: local preview connections timed out. Print rendering and all interactive flows require visual verification.'
};
fs.writeFileSync(path.join(path.dirname(outputPath),'verificacion_PRISMA_3D.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,scripts:undefined},null,2));
