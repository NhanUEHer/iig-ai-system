const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

function sourceFiles(directory){return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
  const target=path.join(directory,entry.name);
  if(entry.isDirectory())return sourceFiles(target);
  return /\.(js|jsx)$/.test(entry.name)&&!entry.name.endsWith('.bak')?[target]:[];
});}

test('active frontend source uses system dialogs instead of browser-native dialogs',()=>{
  const root=path.join(__dirname,'..','frontend','src');
  const violations=sourceFiles(root).flatMap(file=>{
    const source=fs.readFileSync(file,'utf8');
    return /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/.test(source)?[path.relative(root,file)]:[];
  });
  assert.deepEqual(violations,[]);
  assert.match(fs.readFileSync(path.join(root,'main.jsx'),'utf8'),/<DialogProvider><App \/><\/DialogProvider>/);
});
