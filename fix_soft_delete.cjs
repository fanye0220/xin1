const fs = require('fs');
let content = fs.readFileSync('src/lib/db.ts', 'utf8');

const target = `     await tx.done;
     
     if (isAndroid()) {
       import('./androidSync').then(async ({ fastMoveCharacterOnAndroid`;

const replacement = `     await tx.done;
     invalidateCache();
     
     if (isAndroid()) {
       import('./androidSync').then(async ({ fastMoveCharacterOnAndroid`;

content = content.replace(target, replacement);
fs.writeFileSync('src/lib/db.ts', content);
