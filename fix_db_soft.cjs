const fs = require('fs');
let content = fs.readFileSync('src/lib/db.ts', 'utf8');
content = content.replace(
    /     await tx\.done;\n          \n     if \(isAndroid\(\)\) \{\n       import\('\.\/androidSync'\)/g,
    '     await tx.done;\n     invalidateCache();\n     \n     if (isAndroid()) {\n       import(\'./androidSync\')'
);
fs.writeFileSync('src/lib/db.ts', content);
