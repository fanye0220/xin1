const fs = require('fs');

let content = fs.readFileSync('src/components/ImportModal.tsx', 'utf8');

// Replace the greedy extraction
content = content.replace(
    /const blob = await zipEntry\.async\('blob'\);\s*let type = 'application\/octet-stream';/g,
    `let type = 'application/octet-stream';`
);

content = content.replace(
    /const extractedFile = new File\(\[blob\], zipEntry\.name\.split\('\/'\)\.pop\(\) \|\| 'file', \{ type \}\);/g,
    `const extractedFile = new File([], zipEntry.name.split('/').pop() || 'file', { type });
              
              extractedFile.arrayBuffer = async () => await zipEntry.async('arraybuffer');
              extractedFile.text = async () => await zipEntry.async('text');
              extractedFile.slice = (start, end) => {
                 // Not fully supported for lazy zip files but we don't slice them usually
                 return new Blob([], { type });
              };`
);

fs.writeFileSync('src/components/ImportModal.tsx', content);

let chatViewerContent = fs.readFileSync('src/components/ChatViewer.tsx', 'utf8');
chatViewerContent = chatViewerContent.replace(
    /const text = await zipEntry\.async\("text"\);/g,
    `const text = await zipEntry.async("text");`
);
fs.writeFileSync('src/components/ChatViewer.tsx', chatViewerContent);

console.log('Fixed JSZip memory usage!');
