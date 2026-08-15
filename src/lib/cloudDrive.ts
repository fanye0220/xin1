import { getAuth } from 'firebase/auth';
import { getCharacter, getFolders, getCachedMeta } from './db';

const CLOUD_FOLDER_NAME = 'AIs_Studio_Cloud_Cards';

export async function getCloudFolderId(token: string): Promise<string> {
  const q = `name='${CLOUD_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&spaces=drive`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) throw new Error("Failed to query folder");
  const data = await response.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }
  
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: CLOUD_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder'
    })
  });
  if (!createRes.ok) throw new Error("Failed to create cloud folder");
  const createData = await createRes.json();
  return createData.id;
}

import JSZip from 'jszip';
import { getSafeFilename } from './db';
import { injectTavernData } from './png';
import { extractTavernData } from './png';

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const b64 = dataUrl.split(',')[1];
      resolve(b64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function generateThumbnail(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 256;
      const MAX_HEIGHT = 256;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(null);
      ctx.drawImage(img, 0, 0, width, height);
      
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      URL.revokeObjectURL(url);
      
      const b64 = dataUrl.split(',')[1];
      resolve(b64);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}



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


export async function uploadCharacterToCloud(token: string, charId: string, onProgress?: (msg: string) => void) {
  if (onProgress) onProgress("准备云端数据...");
  const char = await getCharacter(charId);
  if (!char) throw new Error("Character not found");
  

  const rawData = char.data;
  let charType = 'character';
  if (rawData) {
      if (!!(rawData.prompts || rawData.temperature !== undefined || rawData.top_p !== undefined)) charType = 'preset';
      else if (rawData.entries !== undefined || (rawData.data && rawData.data.entries !== undefined)) charType = 'worldbook';
      else if (rawData.blur_strength !== undefined || rawData.main_text_color !== undefined || rawData.chat_display !== undefined) charType = 'theme';
      else if (Array.isArray(rawData) && rawData.length > 0 && rawData[0].message !== undefined) charType = 'qr';
      else if (rawData.name && rawData.code !== undefined && rawData.trigger !== undefined) charType = 'script';
  }

  const folderId = await getCloudFolderId(token);
  const safeName = char.name ? char.name.replace(/[\\/:*?"<>|]/g, "_") : "Character";
  
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
    zip.file(`${safeName}.json`, JSON.stringify(char.data, null, 2));
    
    if (char.avatarBlob) {
      let ext = 'png';
      if (char.avatarBlob.type === 'image/jpeg') ext = 'jpg';
      else if (char.avatarBlob.type === 'image/webp') ext = 'webp';
      else if (char.avatarBlob.type === 'image/gif') ext = 'gif';
      zip.file(`avatar.${ext}`, char.avatarBlob);
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
      fileName = `${safeName}_${char.id}.png`;
      mimeType = 'image/png';
    } catch (e) {
      console.error("Failed to inject PNG", e);
      finalBlob = await createZip();
      fileName = `${safeName}_${char.id}.zip`;
      mimeType = 'application/zip';
    }
  } else if (!char.avatarBlob) {
    if (onProgress) onProgress("打包角色数据(JSON)...");
    finalBlob = new Blob([JSON.stringify(char.data, null, 2)], { type: 'application/json' });
    fileName = `${safeName}_${char.id}.json`;
    mimeType = 'application/json';
  } else {
    if (onProgress) onProgress("打包角色数据(ZIP)...");
    finalBlob = await createZip();
    fileName = `${safeName}_${char.id}.zip`;
    mimeType = 'application/zip';
  }

  
  if (onProgress) onProgress("计算数据指纹...");
  const dataStr = JSON.stringify(char.data);
  const avatarInfo = char.avatarBlob ? char.avatarBlob.size.toString() : 'no-avatar';
  const rawHashData = dataStr + "|" + avatarInfo;
  const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawHashData));
  const contentHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

  if (onProgress) onProgress("检查是否已存在...");
  const metadata: any = {
    name: fileName,
    appProperties: {
      isChar: "true",
      charId: char.id,
      charName: char.name || "",
      cardType: charType,
      folderPath: folderPath,
      createdAt: char.createdAt.toString(),
      contentHash: contentHash
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

  const q = `appProperties has { key='charId' and value='${char.id}' } and '${folderId}' in parents and trashed=false`;
  const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&spaces=drive&fields=files(id,name,appProperties)`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const searchData = await searchRes.json();
  
  let targetFileId = '';
  let finalCharName = char.name || "未命名";

  if (searchData.files && searchData.files.length > 0) {
    const existingFile = searchData.files[0];
    if (existingFile.appProperties?.contentHash === contentHash) {
      if (onProgress) onProgress("内容未变更，跳过上传");
      return;
    }
    targetFileId = existingFile.id;
    finalCharName = existingFile.appProperties?.charName || finalCharName;
    metadata.appProperties.charName = finalCharName;
    
    if (onProgress) onProgress("更新云端文件信息...");
    await fetch(`https://www.googleapis.com/drive/v3/files/${targetFileId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(metadata)
    });
  } else {
    if (onProgress) onProgress("检查同名卡片...");
    const safeQueryName = finalCharName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const qName = `name contains '${safeQueryName}' and '${folderId}' in parents and trashed=false`;
    const searchResName = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(qName)}&spaces=drive&fields=files(id,name,appProperties)`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const searchDataName = await searchResName.json();
    
    if (searchDataName.files && searchDataName.files.length > 0) {
       const exactMatches = searchDataName.files.filter((f:any) => f.appProperties?.charName === finalCharName || f.appProperties?.charName?.startsWith(finalCharName + '_'));
       if (exactMatches.length > 0) {
          const identical = exactMatches.find((f:any) => f.appProperties?.contentHash === contentHash);
          if (identical) {
             if (onProgress) onProgress("云端已有相同内容的卡片，跳过");
             return;
          }
          finalCharName = `${finalCharName}_${exactMatches.length}`;
          metadata.appProperties.charName = finalCharName;
       }
    }

    if (onProgress) onProgress("创建云端文件...");
    metadata.parents = [folderId];
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(metadata)
    });
    if (!createRes.ok) throw new Error("Failed to create file");
    const createdData = await createRes.json();
    targetFileId = createdData.id;
  }

  if (onProgress) onProgress("上传实体数据...");
  const uploadRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${targetFileId}?uploadType=media`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': mimeType
    },
    body: finalBlob
  });

  if (!uploadRes.ok) {
    throw new Error("上传失败: " + uploadRes.statusText);
  }
  
  if (onProgress) onProgress("上传完成！");
}

export async function listCloudCharacters(token: string) {
  const folderId = await getCloudFolderId(token);
  const q = `'${folderId}' in parents and trashed=false`;
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,thumbnailLink,appProperties,size,createdTime)&pageSize=1000`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) throw new Error("Failed to list cloud characters");
  const data = await response.json();
  return data.files || [];
}



export async function downloadCloudCharacter(token: string, fileId: string, fileName?: string, onProgress?: (msg: string) => void) {
  if (onProgress) onProgress("正在下载云端文件...");
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) throw new Error("Download failed");
  
  const blob = await response.blob();
  
  let jsonData: any = null;
  let avatarBlob: Blob | null = null;
  let studioMeta: any = null;
  
  
  const fName = (fileName || "").toLowerCase();
  
  const tryParseZip = async (blobData) => {
     const zip = await JSZip.loadAsync(blobData);
     let zipJson = null;
     let zipAvatar = null;
     let zipMeta = null;
     for (const [filename, file] of Object.entries(zip.files)) {
       if (filename === 'studio_meta.json') {
         const text = await file.async('text');
         try { zipMeta = JSON.parse(text); } catch(e){}
       } else if (filename.endsWith('.json') && !filename.includes('/')) {
         const text = await file.async('text');
         zipJson = JSON.parse(text);
       } else if (filename.startsWith('avatar.')) {
         const ext = filename.split('.').pop()?.toLowerCase();
         let mime = 'image/png';
         if (ext === 'jpg' || ext === 'jpeg') mime = 'image/jpeg';
         else if (ext === 'webp') mime = 'image/webp';
         else if (ext === 'gif') mime = 'image/gif';
         const b = await file.async('blob');
         zipAvatar = new Blob([b], { type: mime });
       }
     }
     return { jsonData: zipJson, avatarBlob: zipAvatar, studioMeta: zipMeta };
  };

  if (fName.endsWith('.zip')) {
     if (onProgress) onProgress("正在解压卡片...");
     const res = await tryParseZip(blob);
     jsonData = res.jsonData;
     avatarBlob = res.avatarBlob;
     studioMeta = res.studioMeta;
  } else if (fName.endsWith('.json')) {
     const text = await blob.text();
     jsonData = JSON.parse(text);
  } else if (fName.endsWith('.png') || fName.endsWith('.webp') || fName.endsWith('.jpg') || fName.endsWith('.jpeg')) {
     avatarBlob = blob;
     if (onProgress) onProgress("正在提取图片中的角色数据...");
     const buffer = await blob.arrayBuffer();
     try {
       const data = await extractTavernData(buffer);
       if (data) {
          jsonData = data;
       } else {
          throw new Error("extractTavernData returned null");
       }
     } catch (e) {
       console.error("Failed to extract tavern data from image, attempting to parse as ZIP fallback", e);
       try {
          const res = await tryParseZip(blob);
          if (res.jsonData) {
              jsonData = res.jsonData;
              if (res.avatarBlob) avatarBlob = res.avatarBlob;
              if (res.studioMeta) studioMeta = res.studioMeta;
          }
       } catch (zipErr) {
          console.error("Also failed to parse as ZIP", zipErr);
       }
     }
  }
if (!jsonData) throw new Error("无效的云端卡片格式或未找到卡片数据");
  
  return { jsonData, avatarBlob, studioMeta };
}
export async function syncLibraryToCloud(token: string, onProgress?: (msg: string) => void) {
  if (onProgress) onProgress('准备同步到云端卡库...');
  const { getCachedMeta } = await import('./db');
  const allChars = await getCachedMeta();
  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;
  for (let i = 0; i < allChars.length; i++) {
    const char = allChars[i];
    if (onProgress) onProgress(`正在同步 [${i + 1}/${allChars.length}] ${char.name || '未命名'}...`);
    try {
      // uploadCharacterToCloud is smart enough to skip if contentHash matches
      const skipped = await uploadCharacterToCloud(token, char.id, (msg) => {
         // optionally pass progress, but we might want to stay quiet for each char to not overwrite our main progress
      });
      // We can't strictly tell if skipped from return val right now, but it's ok.
      successCount++;
    } catch (e) {
      console.error("Sync char error", char.id, e);
      failCount++;
    }
  }
  if (onProgress) onProgress(`同步完成! 成功: ${successCount} 个, 失败: ${failCount} 个`);
}

export async function deleteCloudCharacter(token: string, fileId: string) {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) throw new Error("Delete failed");
}
