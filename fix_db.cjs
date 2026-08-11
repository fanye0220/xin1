const fs = require('fs');
let content = fs.readFileSync('src/lib/db.ts', 'utf8');

content = content.replace(
    /const syncPaths = await syncCharacterToAndroid\(char, blobs \|\| null\);\s+if \(syncPaths && syncPaths\.length > 0\) \{[\s\S]*?await dbRef\.put\('characters', char\);\s+\}/g,
    match => match + `\n                     await new Promise(r => setTimeout(r, 10));`
);

content = content.replace(
    /const syncPaths = await syncCharacterToAndroid\(char, blobs \|\| null\);\s+if \(syncPaths && syncPaths\.length > 0\) \{[\s\S]*?await dbRef\.put\('characters', freshChar\);\s+\}/g,
    match => match + `\n              await new Promise(r => setTimeout(r, 10));`
);

fs.writeFileSync('src/lib/db.ts', content);
console.log('Fixed db.ts yields!');
