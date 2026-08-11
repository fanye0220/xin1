const fs = require('fs');
let content = fs.readFileSync('src/lib/db.ts', 'utf8');
content = content.replace(/\n                     await new Promise\(r => setTimeout\(r, 10\)\); else \{/g, ' else {');
fs.writeFileSync('src/lib/db.ts', content);
console.log('Fixed syntax error!');
