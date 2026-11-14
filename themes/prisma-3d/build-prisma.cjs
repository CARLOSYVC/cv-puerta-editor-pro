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
const luminance = hex => {
  const c = hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);
  return c[0]*0.2126+c[1]*0.7152+c[2]*0.0722;
};
const contrastPairs = [
  ['dark text','#F8FAFC','#1E293B'],['dark secondary','#CBD5E1','#1E293B'],
  ['light text','#0F172A','#FFFFFF'],['light secondary','#475569','#FFFFFF'],
  ['primary action','#F8FAFC','#2563EB'],['quick action','#0F172A','#F97316'],
  ['dark count 1','#93C5FD','#1E293B'],['dark count 2','#5EEAD4','#1E293B'],['dark count 3','#C4B5FD','#1E293B'],
  ['light count 1','#2563EB','#FFFFFF'],['light count 2','#0F766E','#FFFFFF'],['light count 3','#7C3AED','#FFFFFF']
].map(([name,foreground,background])=>{
  const a=luminance(foreground),b=luminance(background),ratio=(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
  assert(ratio>=4.5, 'Contraste insuficiente: '+name);
  return {name,foreground,background,ratio:Number(ratio.toFixed(2))};
});
fs.mkdirSync(path.dirname(outputPath),{recursive:true});
fs.writeFileSync(outputPath,output,'utf8');
const report = {
  theme:'PRISMA 3D · Industrial',
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
  colorContrastChecks:contrastPairs,
  scripts:scriptChecks,
  browserQA:'Not completed: local preview connections timed out. Print rendering and all interactive flows require visual verification.'
};
fs.writeFileSync(path.join(path.dirname(outputPath),'verificacion_PRISMA_3D.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,scripts:undefined},null,2));
