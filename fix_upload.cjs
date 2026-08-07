const fs = require('fs');
let content = fs.readFileSync('src/lib/cloudDrive.ts', 'utf8');

const convertToPNGCod = `
async function convertToPNG(blob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.drawImage(img, 0, 0);
      canvas.toBlob((b) => {
        URL.revokeObjectURL(url);
        if (b) resolve(b);
        else reject(new Error("Canvas toBlob failed"));
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image load failed"));
    };
    img.src = url;
  });
}
`;

const uploadLogic = `
export async function uploadCharacterToCloud(token: string, charId: string, onProgress?: (msg: string) => void) {
  if (onProgress) onProgress("准备云端数据...");
  const char = await getCharacter(charId);
  if (!char) throw new Error("Character not found");
  
  const folderId = await getCloudFolderId(token);
  const safeName = char.name ? char.name.replace(/[\\\\/:*?"<>|]/g, "_") : "Character";
  
  let finalBlob: Blob;
  let fileName = '';
  let thumbB64: string | null = null;
  
  if (char.avatarBlob) {
    if (onProgress) onProgress("生成云端预览图...");
    thumbB64 = await generateThumbnail(char.avatarBlob);
    
    if (onProgress) onProgress("处理图片格式...");
    try {
      let pngBlob = char.avatarBlob;
      if (char.avatarBlob.type !== 'image/png') {
         pngBlob = await convertToPNG(char.avatarBlob);
      }
      
      const arrayBuffer = await pngBlob.arrayBuffer();
      const injected = injectTavernData(arrayBuffer, char.data);
      finalBlob = new Blob([injected], { type: 'image/png' });
      fileName = \`\${safeName}_\${char.id}.png\`;
    } catch(err) {
      console.warn("Failed to inject PNG, fallback to zip", err);
      if (onProgress) onProgress("打包ZIP...");
      const zip = new JSZip();
      zip.file(\`\${safeName}.json\`, JSON.stringify(char.data, null, 2));
      let ext = 'png';
      if (char.avatarBlob.type === 'image/jpeg') ext = 'jpg';
      else if (char.avatarBlob.type === 'image/webp') ext = 'webp';
      zip.file(\`avatar.\${ext}\`, char.avatarBlob);
      finalBlob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
      fileName = \`\${safeName}_\${char.id}.zip\`;
    }
  } else {
    finalBlob = new Blob([JSON.stringify(char.data, null, 2)], { type: 'application/json' });
    fileName = \`\${safeName}_\${char.id}.json\`;
  }
  
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

  // search if exists
  const q = \`appProperties has { key='charId' and value='\${char.id}' } and '\${folderId}' in parents and trashed=false\`;
  const searchRes = await fetch(\`https://www.googleapis.com/drive/v3/files?q=\${encodeURIComponent(q)}&spaces=drive\`, {
    headers: { Authorization: \`Bearer \${token}\` }
  });
  const searchData = await searchRes.json();
  
  let targetFileId = '';
  
  if (searchData.files && searchData.files.length > 0) {
    targetFileId = searchData.files[0].id;
    if (onProgress) onProgress("更新云端文件信息...");
    // Update metadata
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
    // Create new file with metadata
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
  // Upload content
  const uploadRes = await fetch(\`https://www.googleapis.com/upload/drive/v3/files/\${targetFileId}?uploadType=media\`, {
    method: 'PATCH',
    headers: {
      Authorization: \`Bearer \${token}\`,
      'Content-Type': finalBlob.type || 'application/octet-stream'
    },
    body: finalBlob
  });

  if (!uploadRes.ok) {
    throw new Error("上传失败: " + uploadRes.statusText);
  }
  
  if (onProgress) onProgress("上传完成！");
}
`;

const oldUploadStart = content.indexOf('export async function uploadCharacterToCloud');
const oldUploadEnd = content.indexOf('export async function listCloudCharacters');
if (oldUploadStart !== -1 && oldUploadEnd !== -1) {
  content = content.substring(0, oldUploadStart) + convertToPNGCod + uploadLogic + content.substring(oldUploadEnd);
}

fs.writeFileSync('src/lib/cloudDrive.ts', content);
