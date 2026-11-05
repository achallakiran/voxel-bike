import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';

const [html,css,bundle]=await Promise.all([
  readFile('src/template.html','utf8'),
  readFile('src/style.css','utf8'),
  build({entryPoints:['src/main.ts'],bundle:true,minify:true,write:false,format:'iife',target:['es2022','safari16'],legalComments:'inline'})
]);
const output=html.replace('/* STYLE */',()=>css)
  .replace('/* BUNDLE */',()=>bundle.outputFiles[0].text.replace(/<\/script/gi,'<\\/script'));
await mkdir('dist',{recursive:true});
await Promise.all([
  writeFile('dist/index.html',output),
  writeFile('dist/Voxel-Bikes-Offline.html',output),
  writeFile('dist/.nojekyll',''),
]);
