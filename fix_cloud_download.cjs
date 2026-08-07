const fs = require('fs');
let content = fs.readFileSync('src/lib/cloudDrive.ts', 'utf8');

const newLogic = `
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
`;

const oldStart = content.indexOf('const fName = (fileName || "").toLowerCase();');
const oldEnd = content.indexOf('if (!jsonData) throw new Error("无效的云端卡片格式或未找到卡片数据");');
if (oldStart !== -1 && oldEnd !== -1) {
  content = content.substring(0, oldStart) + newLogic + content.substring(oldEnd);
}

fs.writeFileSync('src/lib/cloudDrive.ts', content);
