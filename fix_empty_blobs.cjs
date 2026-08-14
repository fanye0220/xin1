const fs = require('fs');

let content = fs.readFileSync('src/components/ImportModal.tsx', 'utf8');

// Replace the avatarBlob / originalFile assignment block
const targetBlock = `        if (isAndroid()) {
          if ((file as any).androidAbsPath) {
            // Already unzipped natively! 
            localFilePath = (file as any).androidAbsPath;
            const buffer = await file.arrayBuffer(); // read it locally just strictly if needed, but wait!
            // Actually, we don't need to read it if we skip setting avatarBlob, but we already read it during \`parseChunk\` to get metadata.
            // By NOT setting avatarBlob, we prevent it from being loaded into IDB blobs table!
            avatarBlob = undefined;
            originalFile = undefined;
          } else {
            const buffer = await file.arrayBuffer();
            if (file.type === 'image/png' || file.name.endsWith('.png')) {
              avatarBlob = file;
            }
            originalFile = file;
          }
        } else {
          if (file.type === 'image/png' || file.name.endsWith('.png')) {
            avatarBlob = file;
          }
          originalFile = file;
        }`;

const newBlock = `        if (isAndroid() && (file as any).androidAbsPath) {
            // Already unzipped natively! 
            localFilePath = (file as any).androidAbsPath;
            avatarBlob = undefined;
            originalFile = undefined;
        } else {
            const buffer = await file.arrayBuffer();
            if (file.type === 'image/png' || file.name.endsWith('.png')) {
              avatarBlob = new Blob([buffer], { type: file.type || 'image/png' });
            }
            originalFile = new File([buffer], file.name, { type: file.type || 'application/octet-stream' });
        }`;

content = content.replace(targetBlock, newBlock);

// Now fix avatarHistory realization
const historyTarget = `          data: data,
          originalFile,
          createdAt: Date.now(),
          folderId: targetFolderId,
          avatarHistory: altImagesByMain.get(item) || []
        } as any;`;

const historyNew = `          data: data,
          originalFile,
          createdAt: Date.now(),
          folderId: targetFolderId,
          avatarHistory: await Promise.all((altImagesByMain.get(item) || []).map(async altF => new Blob([await altF.arrayBuffer()], { type: altF.type || 'image/png' })))
        } as any;`;

content = content.replace(historyTarget, historyNew);

fs.writeFileSync('src/components/ImportModal.tsx', content);
console.log('Fixed empty blobs issue!');
