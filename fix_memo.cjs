const fs = require('fs');
let content = fs.readFileSync('src/lib/drive.ts', 'utf8');

content = content.replace(
    /const memos = await db\.getAll\('memos'\);\s+zip\.file\("memos\.json", JSON\.stringify\(memos\)\);/g,
    `const memos = await db.getAll('memos');
  const processedMemos = memos.map(m => {
      if (m.blob) {
          const extension = m.blob.type === 'image/jpeg' ? 'jpg' : (m.blob.type === 'image/webp' ? 'webp' : 'png');
          const filename = \`memo_\${m.id}.\${extension}\`;
          zip.file(\`Memos/\${filename}\`, m.blob, { compression: "STORE" });
          return { ...m, _blobFilename: filename, blob: undefined };
      }
      return m;
  });
  zip.file("memos.json", JSON.stringify(processedMemos));`
);

fs.writeFileSync('src/lib/drive.ts', content);
console.log('Fixed memos in backup!');
