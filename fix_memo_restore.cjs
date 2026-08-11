const fs = require('fs');
let content = fs.readFileSync('src/lib/drive.ts', 'utf8');

content = content.replace(
    /for \(const m of memos\) \{\s+await os\.put\(m\);\s+\}/g,
    `for (const m of memos) {
        if (m._blobFilename) {
            const blobEntry = loadedZip.file(\`Memos/\${m._blobFilename}\`);
            if (blobEntry) {
                const b = await blobEntry.async("blob");
                m.blob = new Blob([b], { type: m._blobFilename.endsWith('jpg') ? 'image/jpeg' : (m._blobFilename.endsWith('webp') ? 'image/webp' : 'image/png') });
            }
            delete m._blobFilename;
        }
        await os.put(m);
      }`
);

fs.writeFileSync('src/lib/drive.ts', content);
console.log('Fixed memo restore!');
