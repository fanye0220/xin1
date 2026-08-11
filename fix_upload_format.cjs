const fs = require('fs');
let content = fs.readFileSync('src/lib/cloudDrive.ts', 'utf8');

const targetFunc = `export async function uploadCharacterToCloud(token: string, charId: string, onProgress?: (msg: string) => void) {`;
const replaceWith = `export async function uploadCharacterToCloud(token: string, charId: string, onProgress?: (msg: string) => void) {
  if (onProgress) onProgress("准备云端数据...");
  const char = await getCharacter(charId);
  if (!char) throw new Error("Character not found");
  
  const folderId = await getCloudFolderId(token);
  const safeName = char.name ? char.name.replace(/[\\\\/:*?"<>|]/g, "_") : "Character";
  
  let thumbB64: string | null = null;
  if (char.avatarBlob) {
    if (onProgress) onProgress("生成云端预览图...");
    thumbB64 = await generateThumbnail(char.avatarBlob);
  }

  let folderPath = "";
  if (char.folderId) {
    const allFolders = await getFolders();
    let currentF = allFolders.find(f => f.id === char.folderId);
    const pathParts = [];
    while (currentF) {
      pathParts.unshift(currentF.name);
      currentF = allFolders.find(f => f.id === currentF.parentId);
    }
    folderPath = pathParts.join('/');
  }

  let finalBlob: Blob;
  let fileName = "";
  let mimeType = "";
  
  async function createZip(): Promise<Blob> {
    const zip = new JSZip();
    zip.file(\`\${safeName}.json\`, JSON.stringify(char.data, null, 2));
    
    if (char.avatarBlob) {
      let ext = 'png';
      if (char.avatarBlob.type === 'image/jpeg') ext = 'jpg';
      else if (char.avatarBlob.type === 'image/webp') ext = 'webp';
      else if (char.avatarBlob.type === 'image/gif') ext = 'gif';
      zip.file(\`avatar.\${ext}\`, char.avatarBlob);
    }
    
    const studioMeta = {
      folderPath,
      createdAt: char.createdAt
    };
    zip.file('studio_meta.json', JSON.stringify(studioMeta));
    return await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  }

  if (char.avatarBlob && (char.avatarBlob.type === 'image/png' || !char.avatarBlob.type)) {
    if (onProgress) onProgress("打包角色数据(PNG)...");
    try {
      const buffer = await char.avatarBlob.arrayBuffer();
      const injectedBuffer = injectTavernData(buffer, char.data);
      finalBlob = new Blob([injectedBuffer], { type: 'image/png' });
      fileName = \`\${safeName}_\${char.id}.png\`;
      mimeType = 'image/png';
    } catch (e) {
      console.error("Failed to inject PNG", e);
      finalBlob = await createZip();
      fileName = \`\${safeName}_\${char.id}.zip\`;
      mimeType = 'application/zip';
    }
  } else if (!char.avatarBlob) {
    if (onProgress) onProgress("打包角色数据(JSON)...");
    finalBlob = new Blob([JSON.stringify(char.data, null, 2)], { type: 'application/json' });
    fileName = \`\${safeName}_\${char.id}.json\`;
    mimeType = 'application/json';
  } else {
    if (onProgress) onProgress("打包角色数据(ZIP)...");
    finalBlob = await createZip();
    fileName = \`\${safeName}_\${char.id}.zip\`;
    mimeType = 'application/zip';
  }

  if (onProgress) onProgress("检查是否已存在...");
  const metadata: any = {
    name: fileName,
    appProperties: {
      isChar: "true",
      charId: char.id,
      charName: char.name || "",
      folderPath: folderPath,
      createdAt: char.createdAt.toString()
    }
  };
  
  if (thumbB64) {
    metadata.contentHints = {
      thumbnail: {
        image: thumbB64,
        mimeType: 'image/jpeg'
      }
    };
  }

  const q = \`appProperties has { key='charId' and value='\${char.id}' } and '\${folderId}' in parents and trashed=false\`;
  const searchRes = await fetch(\`https://www.googleapis.com/drive/v3/files?q=\${encodeURIComponent(q)}&spaces=drive\`, {
    headers: { Authorization: \`Bearer \${token}\` }
  });
  const searchData = await searchRes.json();
  
  let targetFileId = '';
  if (searchData.files && searchData.files.length > 0) {
    targetFileId = searchData.files[0].id;
    if (onProgress) onProgress("更新云端文件信息...");
    await fetch(\`https://www.googleapis.com/drive/v3/files/\${targetFileId}\`, {
      method: 'PATCH',
      headers: {
        Authorization: \`Bearer \${token}\`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(metadata)
    });
  } else {
    if (onProgress) onProgress("创建云端文件...");
    metadata.parents = [folderId];
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: \`Bearer \${token}\`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(metadata)
    });
    if (!createRes.ok) throw new Error("Failed to create file");
    const createdData = await createRes.json();
    targetFileId = createdData.id;
  }

  if (onProgress) onProgress("上传实体数据...");
  const uploadRes = await fetch(\`https://www.googleapis.com/upload/drive/v3/files/\${targetFileId}?uploadType=media\`, {
    method: 'PATCH',
    headers: {
      Authorization: \`Bearer \${token}\`,
      'Content-Type': mimeType
    },
    body: finalBlob
  });

  if (!uploadRes.ok) {
    throw new Error("上传失败: " + uploadRes.statusText);
  }
  
  if (onProgress) onProgress("上传完成！");
}
`;

const startIndex = content.indexOf(targetFunc);
if (startIndex !== -1) {
  const nextFunc = 'export async function listCloudCharacters';
  const endIndex = content.indexOf(nextFunc, startIndex);
  if (endIndex !== -1) {
    content = content.substring(0, startIndex) + replaceWith + '\n' + content.substring(endIndex);
    fs.writeFileSync('src/lib/cloudDrive.ts', content);
    console.log('Replaced upload function');
  }
}
