const fs = require('fs');
let content = fs.readFileSync('src/lib/cloudDrive.ts', 'utf8');

const newLogic = `
export async function uploadCharacterToCloud(token: string, charId: string, onProgress?: (msg: string) => void) {
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
  
  if (onProgress) onProgress("打包角色数据...");
  const zip = new JSZip();
  zip.file(\`\${safeName}.json\`, JSON.stringify(char.data, null, 2));
  
  if (char.avatarBlob) {
    let ext = 'png';
    if (char.avatarBlob.type === 'image/jpeg') ext = 'jpg';
    else if (char.avatarBlob.type === 'image/webp') ext = 'webp';
    else if (char.avatarBlob.type === 'image/gif') ext = 'gif';
    zip.file(\`avatar.\${ext}\`, char.avatarBlob);
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
  
  const studioMeta = {
    folderPath,
    createdAt: char.createdAt
  };
  zip.file('studio_meta.json', JSON.stringify(studioMeta));
  
  const finalBlob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  const fileName = \`\${safeName}_\${char.id}.zip\`;
  
  if (onProgress) onProgress("检查是否已存在...");
  const metadata: any = {
    name: fileName,
    appProperties: {
      isChar: "true",
      charId: char.id,
      charName: char.name || ""
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
      'Content-Type': 'application/zip'
    },
    body: finalBlob
  });

  if (!uploadRes.ok) {
    throw new Error("上传失败: " + uploadRes.statusText);
  }
  
  if (onProgress) onProgress("上传完成！");
}

export async function listCloudCharacters(token: string) {
`;

const oldUploadStart = content.indexOf('export async function uploadCharacterToCloud');
const oldUploadEnd = content.indexOf('export async function listCloudCharacters');
if (oldUploadStart !== -1 && oldUploadEnd !== -1) {
  content = content.substring(0, oldUploadStart) + newLogic + content.substring(oldUploadEnd + 'export async function listCloudCharacters'.length);
}

const newDownloadLogic = `
export async function downloadCloudCharacter(token: string, fileId: string, fileName?: string, onProgress?: (msg: string) => void) {
  if (onProgress) onProgress("正在下载云端文件...");
  const response = await fetch(\`https://www.googleapis.com/drive/v3/files/\${fileId}?alt=media\`, {
    headers: { Authorization: \`Bearer \${token}\` }
  });
  if (!response.ok) throw new Error("Download failed");
  
  const blob = await response.blob();
  
  let jsonData: any = null;
  let avatarBlob: Blob | null = null;
  let studioMeta: any = null;
  
  const fName = (fileName || "").toLowerCase();
  
  if (fName.endsWith('.zip')) {
     if (onProgress) onProgress("正在解压卡片...");
     const zip = await JSZip.loadAsync(blob);
     for (const [filename, file] of Object.entries(zip.files)) {
       if (filename === 'studio_meta.json') {
         const text = await file.async('text');
         try { studioMeta = JSON.parse(text); } catch(e){}
       } else if (filename.endsWith('.json') && !filename.includes('/')) {
         const text = await file.async('text');
         jsonData = JSON.parse(text);
       } else if (filename.startsWith('avatar.')) {
         const ext = filename.split('.').pop()?.toLowerCase();
         let mime = 'image/png';
         if (ext === 'jpg' || ext === 'jpeg') mime = 'image/jpeg';
         else if (ext === 'webp') mime = 'image/webp';
         else if (ext === 'gif') mime = 'image/gif';
         const b = await file.async('blob');
         avatarBlob = new Blob([b], { type: mime });
       }
     }
  } else if (fName.endsWith('.json')) {
     const text = await blob.text();
     jsonData = JSON.parse(text);
  } else if (fName.endsWith('.png') || fName.endsWith('.webp') || fName.endsWith('.jpg') || fName.endsWith('.jpeg')) {
     avatarBlob = blob;
     if (onProgress) onProgress("正在提取图片中的角色数据...");
     const buffer = await blob.arrayBuffer();
     try {
       const data = await extractTavernData(buffer);
       if (data) jsonData = data;
     } catch (e) {
       console.error("Failed to extract tavern data from image", e);
     }
  }
  
  if (!jsonData) throw new Error("无效的云端卡片格式或未找到卡片数据");
  
  return { jsonData, avatarBlob, studioMeta };
}
`;

const oldDownloadStart = content.indexOf('export async function downloadCloudCharacter');
const oldDownloadEnd = content.indexOf('export async function deleteCloudCharacter');
if (oldDownloadStart !== -1 && oldDownloadEnd !== -1) {
  content = content.substring(0, oldDownloadStart) + newDownloadLogic + content.substring(oldDownloadEnd);
}

fs.writeFileSync('src/lib/cloudDrive.ts', content);
