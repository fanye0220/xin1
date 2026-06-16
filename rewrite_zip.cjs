const fs = require('fs');

let content = fs.readFileSync('src/components/ChatViewer.tsx', 'utf8');

const targetStr = `        if (file.name.toLowerCase().endsWith(".zip")) {
          const { default: JSZip } = await import("jszip");`;

const replacement = `        if (file.name.toLowerCase().endsWith(".zip")) {
          if (isAndroid() && (window as any).Android?.startTempFile) {
            const { startAndroidTempFile, appendAndroidTempFile, unzipAndroidTempFile, readLocalFileBuffer, deleteLocalGalleryFile } = await import('../lib/appBridge');
            const tempFilename = \`upload_chats_\${Date.now()}.zip\`;
            await startAndroidTempFile(tempFilename);

            const chunkSize = 1 * 1024 * 1024;
            const totalChunks = Math.ceil(file.size / chunkSize);
            for (let c = 0; c < totalChunks; c++) {
               const chunk = file.slice(c * chunkSize, (c + 1) * chunkSize);
               const buffer = await chunk.arrayBuffer();
               await appendAndroidTempFile(tempFilename, buffer);
               setImportProgress({ show: true, current: c + 1, total: totalChunks, message: \`上传 ZIP 进度: \${Math.round(((c + 1)/totalChunks)*100)}%\` });
            }

            setImportProgress({ show: true, current: 0, total: 100, message: '原生引擎解压聊天记录中...' });
            const extractedRoot = \`Imported_Chats_\${Date.now()}\`;
            const extractedPaths = await unzipAndroidTempFile(tempFilename, extractedRoot);
            
            const filesToProcess = extractedPaths.filter(p => p.toLowerCase().endsWith('.json') || p.toLowerCase().endsWith('.jsonl'));

            for (let j = 0; j < filesToProcess.length; j++) {
              const absPath = filesToProcess[j];
              const fileName = absPath.split('/').pop() || '';
              const lowerName = fileName.toLowerCase();

              if (j % 10 === 0) {
                setImportProgress({
                  show: true,
                  current: j + 1,
                  total: filesToProcess.length,
                  message: \`正在解析原生文件: \${fileName}\`,
                });
                await new Promise((r) => setTimeout(r, 0));
              }

              try {
                const buf = await readLocalFileBuffer(absPath);
                if (!buf) continue;
                const text = new TextDecoder().decode(buf);
                deleteLocalGalleryFile(absPath).catch(console.error);

                let parsedMessages = [];

                if (lowerName.endsWith(".jsonl")) {
                  const lines = text.trim().split("\\n");
                  for (let k = 0; k < lines.length; k++) {
                    try {
                      const parsed = JSON.parse(lines[k]);
                      if (parsed) parsedMessages.push(parsed);
                    } catch (e) {}
                    if (k % 500 === 0) await new Promise((r) => setTimeout(r, 0));
                  }
                } else {
                  try {
                    const data = JSON.parse(text);
                    if (Array.isArray(data)) parsedMessages = data;
                    else if (data.chat && Array.isArray(data.chat))
                      parsedMessages = data.chat;
                    else parsedMessages = [data];
                  } catch (err) {
                    if (text.trim().split("\\n").length > 1) {
                      const lines = text.trim().split("\\n");
                      for (let k = 0; k < lines.length; k++) {
                        try {
                          const parsed = JSON.parse(lines[k]);
                          if (parsed) parsedMessages.push(parsed);
                        } catch (e) {}
                        if (k % 500 === 0)
                          await new Promise((r) => setTimeout(r, 0));
                      }
                    }
                  }
                }

                if (parsedMessages.length === 0) continue;

                let charId = "";
                const pathParts = absPath.split("/");
                if (pathParts.length > 1) {
                  let charNameIndex = pathParts.length - 2;
                  if (
                    pathParts[charNameIndex] === "聊天记录" &&
                    pathParts.length > 2
                  ) {
                    charNameIndex = pathParts.length - 3;
                  }
                  const parentFolderName = pathParts[charNameIndex];
                  const folderMatch = characters.find(
                    (c) =>
                      c.name.toLowerCase() === parentFolderName.toLowerCase(),
                  );
                  if (folderMatch) charId = folderMatch.id;
                }

                if (!charId) {
                  const aiMessage = parsedMessages.find(
                    (m) => !m.is_user && m.name,
                  );
                  if (aiMessage && aiMessage.name) {
                    const match = characters.find(
                      (c) =>
                        c.name.toLowerCase() === aiMessage.name?.toLowerCase(),
                    );
                    if (match) charId = match.id;
                  }
                }

                pendingChats.push({
                  id: crypto.randomUUID(),
                  characterId: charId,
                  name: fileName,
                  messages: parsedMessages,
                  createdAt: Date.now(),
                });
                imported++;
              } catch (e) {
                console.error(\`Failed to parse native file: \${absPath}\`, e);
              }
            }
          } else {
          const { default: JSZip } = await import("jszip");`;

content = content.replace(targetStr, replacement);

const targetStrClose = `          }
        } else {
          setImportProgress({`;
          
const replacementClose = `          }
          }
        } else {
          setImportProgress({`;
          
content = content.replace(targetStrClose, replacementClose);
fs.writeFileSync('src/components/ChatViewer.tsx', content, 'utf8');

// For CharacterChatsSection
let content2 = fs.readFileSync('src/components/CharacterChatsSection.tsx', 'utf8');
const targetStr2 = `        if (file.name.toLowerCase().endsWith(".zip")) {
          const { default: JSZip } = await import("jszip");`;

const replacement2 = `        if (file.name.toLowerCase().endsWith(".zip")) {
          if (isAndroid() && (window as any).Android?.startTempFile) {
            const { startAndroidTempFile, appendAndroidTempFile, unzipAndroidTempFile, readLocalFileBuffer, deleteLocalGalleryFile } = await import('../lib/appBridge');
            const tempFilename = \`upload_chats_\${Date.now()}.zip\`;
            await startAndroidTempFile(tempFilename);

            const chunkSize = 1 * 1024 * 1024;
            const totalChunks = Math.ceil(file.size / chunkSize);
            for (let c = 0; c < totalChunks; c++) {
               const chunk = file.slice(c * chunkSize, (c + 1) * chunkSize);
               const buffer = await chunk.arrayBuffer();
               await appendAndroidTempFile(tempFilename, buffer);
               setImportProgress({ show: true, current: c + 1, total: totalChunks, message: \`上传 ZIP 进度: \${Math.round(((c + 1)/totalChunks)*100)}%\` });
            }

            setImportProgress({ show: true, current: 0, total: 100, message: '原生引擎解压聊天记录中...' });
            const extractedRoot = \`Imported_Chats_\${Date.now()}\`;
            const extractedPaths = await unzipAndroidTempFile(tempFilename, extractedRoot);
            
            const filesToProcess = extractedPaths.filter(p => p.toLowerCase().endsWith('.json') || p.toLowerCase().endsWith('.jsonl'));

            for (let j = 0; j < filesToProcess.length; j++) {
              const absPath = filesToProcess[j];
              const fileName = absPath.split('/').pop() || '';
              const lowerName = fileName.toLowerCase();

              if (j % 10 === 0) {
                setImportProgress({
                  show: true,
                  current: j + 1,
                  total: filesToProcess.length,
                  message: \`正在解析原生文件: \${fileName}\`,
                });
                await new Promise((r) => setTimeout(r, 0));
              }

              try {
                const buf = await readLocalFileBuffer(absPath);
                if (!buf) continue;
                const text = new TextDecoder().decode(buf);
                deleteLocalGalleryFile(absPath).catch(console.error);

                let parsedMessages = [];

                if (lowerName.endsWith(".jsonl")) {
                  const lines = text.trim().split("\\n");
                  for (let k = 0; k < lines.length; k++) {
                    try {
                      const parsed = JSON.parse(lines[k]);
                      if (parsed) parsedMessages.push(parsed);
                    } catch (e) {}
                    if (k % 500 === 0) await new Promise((r) => setTimeout(r, 0));
                  }
                } else {
                  try {
                    const data = JSON.parse(text);
                    if (Array.isArray(data)) parsedMessages = data;
                    else if (data.chat && Array.isArray(data.chat))
                      parsedMessages = data.chat;
                    else parsedMessages = [data];
                  } catch (err) {
                    if (text.trim().split("\\n").length > 1) {
                      const lines = text.trim().split("\\n");
                      for (let k = 0; k < lines.length; k++) {
                        try {
                          const parsed = JSON.parse(lines[k]);
                          if (parsed) parsedMessages.push(parsed);
                        } catch (e) {}
                        if (k % 500 === 0)
                          await new Promise((r) => setTimeout(r, 0));
                      }
                    }
                  }
                }

                if (parsedMessages.length === 0) continue;

                pendingChats.push({
                  id: crypto.randomUUID(),
                  characterId,
                  name: fileName,
                  messages: parsedMessages,
                  createdAt: Date.now(),
                });
                imported++;
              } catch (e) {
                console.error(\`Failed to parse native file: \${absPath}\`, e);
              }
            }
          } else {
          const { default: JSZip } = await import("jszip");`;

content2 = content2.replace(targetStr2, replacement2);
content2 = content2.replace(targetStrClose, replacementClose);

fs.writeFileSync('src/components/CharacterChatsSection.tsx', content2, 'utf8');

console.log('done replacing');
