import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { getFolders, getCachedMeta, getCharacter, getAllChatsMetadata, getChatById, saveFolder, saveCharacter, saveChatsBulk, invalidateCache, initDB } from './db';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
// Request Workspace scopes
provider.addScope('https://www.googleapis.com/auth/drive.file');

// Flag to indicate if we are in the middle of a sign-in flow.
let isSigningIn = false;
// Cache the access token in memory with persistence.
let cachedAccessToken: string | null = localStorage.getItem('google_drive_access_token');
let tokenExpiration: number | null = Number(localStorage.getItem('google_drive_token_expiration')) || null;

if (tokenExpiration && Date.now() > tokenExpiration) {
  cachedAccessToken = null;
  localStorage.removeItem('google_drive_access_token');
  localStorage.removeItem('google_drive_token_expiration');
}

export type SyncState = {
  isActive: boolean;
  taskName: string;
  message: string;
  isError: boolean;
  completed: boolean;
};

let syncState: SyncState = { isActive: false, taskName: '', message: '', isError: false, completed: false };
const syncListeners = new Set<(state: SyncState) => void>();

export function onSyncStateChange(listener: (state: SyncState) => void) {
  syncListeners.add(listener);
  listener(syncState);
  return () => syncListeners.delete(listener);
}

function updateSyncState(update: Partial<SyncState>) {
  syncState = { ...syncState, ...update };
  syncListeners.forEach(fn => fn(syncState));
  
  if (!syncState.isActive && (syncState.completed || syncState.isError)) {
    setTimeout(() => {
      if (!syncState.isActive) {
        updateSyncState({ completed: false, isError: false, message: '', taskName: '' });
      }
    }, 5000);
  }
}

let autoSyncInterval: any = null;
let currentAccessToken: string | null = null;

// Initialize auth state listener. Call this on app load.
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        currentAccessToken = cachedAccessToken;
        startAutoSyncRunner();
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        currentAccessToken = null;
        localStorage.removeItem('google_drive_access_token');
        localStorage.removeItem('google_drive_token_expiration');
        stopAutoSyncRunner();
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      currentAccessToken = null;
      localStorage.removeItem('google_drive_access_token');
      localStorage.removeItem('google_drive_token_expiration');
      stopAutoSyncRunner();
      if (onAuthFailure) onAuthFailure();
    }
  });
};

function startAutoSyncRunner() {
  if (autoSyncInterval) return;
  
  autoSyncInterval = setInterval(async () => {
    const isEnabled = localStorage.getItem('auto_backup_enabled') === 'true';
    if (!isEnabled || !currentAccessToken || syncState.isActive) return;
    
    updateSyncState({ isActive: true, taskName: '自动备份', message: '准备备份...', isError: false, completed: false });
    try {
      await uploadBackupToDrive(currentAccessToken, (msg) => {
        updateSyncState({ message: msg });
      }, true);
      updateSyncState({ isActive: false, completed: true, message: '自动备份完成' });
    } catch (e: any) {
      console.error("[AutoSync] Scheduled backup failed:", e);
      updateSyncState({ isActive: false, isError: true, message: `自动备份失败: ${e.message}` });
    }
  }, 1000 * 60 * 30); // 30 minutes
}

function stopAutoSyncRunner() {
  if (autoSyncInterval) {
    clearInterval(autoSyncInterval);
    autoSyncInterval = null;
  }
}

// Must be called from a button click or user interaction
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Firebase Auth');
    }

    cachedAccessToken = credential.accessToken;
    const expiresAt = Date.now() + 3500 * 1000;
    localStorage.setItem('google_drive_access_token', cachedAccessToken);
    localStorage.setItem('google_drive_token_expiration', expiresAt.toString());
    currentAccessToken = cachedAccessToken;
    startAutoSyncRunner();
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
  localStorage.removeItem('google_drive_access_token');
  localStorage.removeItem('google_drive_token_expiration');
};

// Google Drive API Functions

// Base folder name
const FOLDER_NAME = 'AITavern_Backups';

async function getOrCreateBackupFolder(accessToken: string): Promise<string> {
  // Check if folder exists
  let res = await fetch(`https://www.googleapis.com/drive/v3/files?q=name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  let data = await res.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id; // Return existing folder ID
  }

  // Create folder
  res = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });
  data = await res.json();
  return data.id;
}

export async function exportAllDataForBackup(onProgress: (msg: string) => void): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();

  const db = await initDB();

  const getBuf = async (d: any) => {
    if (!d) return null;
    if (d instanceof ArrayBuffer || d instanceof Uint8Array) return d;
    if (typeof d.arrayBuffer === 'function') {
       try { return await d.arrayBuffer(); } catch(e) { return null; }
    }
    return null;
  };

  // 1. Lossless App Database Dump (100% accurate restore for this app)
  onProgress("正在生成完整的数据库快照...");
  const characters = await db.getAll('characters');
  
  const rawExport = {
    folders: await db.getAll('folders'),
    characters: characters,
    chats: await db.getAll('chats'),
    memos: await db.getAll('memos')
  };

  // Strip blobs before stringifying to prevent corruption (JSON.stringify ruins Blobs)
  for (const char of rawExport.characters) {
    if (char.avatarBlob) delete char.avatarBlob;
    if (char.originalFile) delete char.originalFile;
    if (char.avatarHistory) delete char.avatarHistory;
  }
  
  for (const folder of rawExport.folders) {
    if (folder.avatarBlob) {
      zip.file(`sys_blobs_folders/${folder.id}_avatar`, new Blob([folder.avatarBlob], { type: folder.avatarBlob.type || 'image/png' }));
      delete folder.avatarBlob;
    }
  }

  for (const memo of rawExport.memos) {
    if (memo.blob) {
      // It's possible that memo.blob is an empty object due to previous bad syncs. Ignore if size is falsy unless it's a real blob.
      if (memo.blob instanceof Blob || (memo.blob && typeof (memo.blob as any).size === 'number')) {
         const bType = memo.blob.type || 'application/octet-stream';
         zip.file(`sys_blobs_memos/${memo.id}`, new Blob([memo.blob as Blob], { type: bType }));
         (memo as any)._blob_type = bType;
      }
      delete memo.blob;
    }
  }

  zip.file("aitavern_sys_db.json", JSON.stringify(rawExport));

  // 2. Blob dumps (Avatars and original files)
  const characterMap = new Map(characters.map(c => [c.id, (c.name || 'Unnamed').replace(/[/\\?%*:|"<>]/g, '_')]));
  const allBlobsKeys = await db.getAllKeys('blobs');
  onProgress(`正在导出图片及源文件数据 (${allBlobsKeys.length})...`);
  for (const key of allBlobsKeys) {
    const blobData = await db.get('blobs', key);
    if (blobData) {
      if (blobData.avatarBlob) {
        const ab = await getBuf(blobData.avatarBlob);
        if (ab) zip.file(`sys_blobs/${key}_avatar`, ab);
      }
      if (blobData.originalFile) {
        const ab = await getBuf(blobData.originalFile);
        if (ab) zip.file(`sys_blobs/${key}_original`, ab);
      }
      if (blobData.avatarHistory && Array.isArray(blobData.avatarHistory)) {
        for (let j = 0; j < blobData.avatarHistory.length; j++) {
           const ab = await getBuf(blobData.avatarHistory[j]);
           if (ab) zip.file(`sys_blobs/${key}_history_${j}`, ab);
        }
      }
    }
  }

  // 3. Settings Backup
  onProgress("正在导出系统配置...");
  const appSettings: any = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.startsWith('tavern_') || key === 'ai_settings' || key === 'auto_backup_enabled')) {
      appSettings[key] = localStorage.getItem(key);
    }
  }
  zip.file("settings.json", JSON.stringify(appSettings));

  // 4. SillyTavern Compatible Manual Export (For users wanting to extract manually)
  const chars = await getCachedMeta();
  onProgress(`正在生成兼容版角色文件 (总数: ${chars.length})...`);
  
  for (let i = 0; i < chars.length; i++) {
    const char = await getCharacter(chars[i].id);
    if (!char) continue;
    
    const safeCharName = char.name.replace(/[/\\?%*:|"<>]/g, '_');
    const folderPath = `Characters/${safeCharName}_${char.id}`;
    
    // Save original file if exists, otherwise save a fallback card.json
    if (char.originalFile) {
       // Save as original png/webp so user can easily drag into SillyTavern
       const extension = char.originalFile.name ? char.originalFile.name.split('.').pop() || 'png' : 'png';
       const ab = await getBuf(char.originalFile);
       if (ab) zip.file(`${folderPath}/${safeCharName}.${extension}`, ab);
    }
    
    // Always include a raw JSON for guaranteed regex/worldbook extraction in ST
    zip.file(`${folderPath}/${safeCharName}.json`, JSON.stringify(char.data || {}));
    
    if (char.avatarBlob && !char.originalFile) {
       const ab = await getBuf(char.avatarBlob);
       if (ab) zip.file(`${folderPath}/avatar.png`, ab);
    }
  }

  const allChats = await getAllChatsMetadata();
  onProgress(`正在生成兼容版聊天记录 (总数: ${allChats.length})...`);
  for (let i = 0; i < allChats.length; i++) {
    const chat = await getChatById(allChats[i].id);
    if (!chat) continue;
    
    const charMeta = chars.find(c => c.id === chat.characterId);
    const charName = charMeta ? charMeta.name : "Unknown";
    const safeCharName = charName.replace(/[/\\?%*:|"<>]/g, '_');
    const safeChatName = chat.name ? chat.name.replace(/[/\\?%*:|"<>]/g, '_') : 'Unnamed';
    
    const formattedDate = new Date(chat.createdAt).toISOString().replace(/[:.]/g, "-");
    const filename = `${safeChatName}_${formattedDate}.jsonl`;
    
    const jsonlString = chat.messages.map((m: any) => JSON.stringify(m)).join('\n');
    zip.file(`Chats/${safeCharName}/${filename}`, jsonlString);
  }

  onProgress("打包压缩中，请勿关闭...");
  return await zip.generateAsync({ type: "blob" });
}

export async function uploadBackupToDrive(accessToken: string, onProgress: (msg: string) => void, isAutoBackup: boolean = false): Promise<void> {
  try {
    const backupBlob = await exportAllDataForBackup(onProgress);

    onProgress('正在查找/创建网盘备份文件夹...');
    const folderId = await getOrCreateBackupFolder(accessToken);

    onProgress('正在上传数据到 Google Drive... (可能需要1-3分钟)');
    const fileName = isAutoBackup ? 'aitavern_auto_backup.zip' : `aitavern_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;

    let existingFileId = null;
    if (isAutoBackup) {
      const resInfo = await fetch(`https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents and name='aitavern_auto_backup.zip' and trashed=false`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const infoData = await resInfo.json();
      if (infoData.files && infoData.files.length > 0) {
        existingFileId = infoData.files[0].id;
      }
    }

    const metadata = existingFileId ? {} : {
      name: fileName,
      parents: [folderId],
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', backupBlob);

    const url = existingFileId 
      ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`
      : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;

    const res = await fetch(url, {
      method: existingFileId ? 'PATCH' : 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: form,
    });

    if (!res.ok) {
      throw new Error(`Upload failed: ${res.statusText}`);
    }

    onProgress('上传成功, 正在清理过期备份...');
    
    // Auto-cleanup: Keep only top 5 manual backups
    if (!isAutoBackup) {
       try {
          const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents and trashed=false and name contains 'aitavern_backup_'&orderBy=createdTime desc&fields=files(id, name)`, {
             headers: { Authorization: `Bearer ${accessToken}` }
          });
          if (listRes.ok) {
             const listData = await listRes.json();
             const manualBackups = listData.files || [];
             if (manualBackups.length > 5) {
                const toDelete = manualBackups.slice(5);
                onProgress(`正在清理 ${toDelete.length} 个过期备份...`);
                for (const oldFile of toDelete) {
                   await fetch(`https://www.googleapis.com/drive/v3/files/${oldFile.id}`, {
                      method: 'DELETE',
                      headers: { Authorization: `Bearer ${accessToken}` }
                   });
                }
             }
          }
       } catch (err) {
          console.warn("Failed to cleanup old backups", err);
       }
    }

    onProgress('备份全部完成!');
  } catch (err: any) {
    console.error("Backup to drive failed", err);
    throw new Error(`备份失败: ${err.message || '未知错误'}`);
  }
}

export async function listBackupsFromDrive(accessToken: string) {
  const folderId = await getOrCreateBackupFolder(accessToken);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents and trashed=false&orderBy=createdTime desc&fields=files(id, name, createdTime, size)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('读取备份列表失败');
  const data = await res.json();
  return data.files || [];
}

export async function downloadBackupFromDrive(accessToken: string, fileId: string): Promise<Blob> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('下载备份失败');
  return res.blob();
}

export async function restoreBackupFromBlob(blob: Blob, onProgress: (msg: string) => void): Promise<void> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  onProgress("正在解压备份文件...");
  const loadedZip = await zip.loadAsync(blob);

  // Check if it's the NEW lossless backup format
  const sysDbEntry = loadedZip.file("aitavern_sys_db.json");
  if (sysDbEntry) {
    onProgress("检测到无损完整备份，正在恢复...");
    try {
      const db = await initDB();
      const content = await sysDbEntry.async("string");
      const dbDump = JSON.parse(content);
      
      // Restore blobs for folders and memos BEFORE restoring them to db
      const folderBlobsFiles = Object.values(loadedZip.files).filter(f => !f.dir && f.name.startsWith('sys_blobs_folders/'));
      const folderBlobs = new Map<string, Blob>();
      if (folderBlobsFiles.length > 0) {
         onProgress(`正在恢复文件夹图片...`);
         for (const file of folderBlobsFiles) {
            const filename = file.name.split('/')[1]; // {id}_avatar
            const id = filename.replace('_avatar', '');
            const b = await file.async("blob");
            folderBlobs.set(id, new Blob([b], { type: 'image/png' }));
         }
      }

      const memoBlobsFiles = Object.values(loadedZip.files).filter(f => !f.dir && f.name.startsWith('sys_blobs_memos/'));
      const memoBlobs = new Map<string, Blob>();
      if (memoBlobsFiles.length > 0) {
         onProgress(`正在恢复备忘录附件...`);
         for (const file of memoBlobsFiles) {
            const id = file.name.split('/')[1];
            const b = await file.async("blob");
            memoBlobs.set(id, b);
         }
      }

      // Clear and Restore stores
      const storesToRestore = ['folders', 'characters', 'chats', 'memos'] as const;
      for (const store of storesToRestore) {
        if (dbDump[store] && Array.isArray(dbDump[store])) {
           onProgress(`正在恢复 ${store} (${dbDump[store].length}条数据)...`);
           const tx = db.transaction(store as any, 'readwrite');
           const os = tx.objectStore(store as any);
           await os.clear();
           for (const item of dbDump[store]) {
              if (store === 'folders') {
                 if (folderBlobs.has(item.id)) {
                    item.avatarBlob = folderBlobs.get(item.id);
                 }
              }
              if (store === 'memos') {
                 if (memoBlobs.has(item.id)) {
                    const savedType = item._blob_type || 'application/octet-stream';
                    item.blob = new Blob([memoBlobs.get(item.id)!], { type: savedType });
                    delete item._blob_type;
                 } else if (item.blob && typeof item.blob === 'object' && Object.keys(item.blob).length === 0) {
                    // For old corrupted backups where memo.blob was turned into {}
                    delete item.blob;
                 }
              }
              await os.put(item);
           }
           await tx.done;
        }
      }

      // Restore blobs
      const sysBlobs = Object.values(loadedZip.files).filter(f => !f.dir && f.name.startsWith('sys_blobs/'));
      if (sysBlobs.length > 0) {
        onProgress(`正在恢复图片与源二进制数据 (${sysBlobs.length}个文件)...`);
        const tx = db.transaction('blobs', 'readwrite');
        const os = tx.objectStore('blobs');
        await os.clear();
        
        // Group by ID
        const blobsToSave = new Map<string, any>();
        
        // Extract known IDs to robustly match sys_blobs filenames
        const knownIds = new Set<string>();
        if (dbDump.characters && Array.isArray(dbDump.characters)) {
           dbDump.characters.forEach((c: any) => c.id && knownIds.add(String(c.id)));
        }

        for (const file of sysBlobs) {
          const parts = file.name.split('/');
          const filename = parts[1]; // e.g. charName_id_avatar, {id}_avatar, or {id}_history_{index}
          
          let type: string | null = null;
          let nameAndId: string | null = null;
          
          const historyMatch = filename.match(/^(.*)_history_(\d+)$/);
          if (historyMatch) {
            nameAndId = historyMatch[1];
            type = `history_${historyMatch[2]}`;
          } else {
            const lastUnderscore = filename.lastIndexOf('_');
            if (lastUnderscore > 0) {
              type = filename.substring(lastUnderscore + 1); // "avatar" or "original"
              nameAndId = filename.substring(0, lastUnderscore);
            }
          }
          
          if (type && nameAndId) {
            let id = nameAndId;
            
            // Try to find if any known ID is at the end of the string
            const matchedId = Array.from(knownIds).find(knownId => nameAndId === knownId || nameAndId!.endsWith(`_${knownId}`));
            if (matchedId) {
               id = matchedId;
            } else {
               // Fallback ID extraction logic
               const secondLastUnderscore = nameAndId.lastIndexOf('_');
               if (secondLastUnderscore > 0) {
                 const potentialId = nameAndId.substring(secondLastUnderscore + 1);
                 if (potentialId.length >= 13) { 
                   id = potentialId;
                 }
               }
            }

            if (!blobsToSave.has(id)) blobsToSave.set(id, {});
            
            const b = await file.async("blob");
            
            // Apply dummy MIME types so URL.createObjectURL functions correctly directly out of IndexedDB parsing
            if (type === 'avatar') {
               blobsToSave.get(id)!.avatarBlob = new Blob([b], { type: 'image/png' });
            } else if (type === 'original') {
               blobsToSave.get(id)!.originalFile = new File([b], 'original.png', { type: 'image/png' });
            } else if (type.startsWith('history_')) {
               const idx = parseInt(type.split('_')[1], 10);
               const bStore = blobsToSave.get(id)!;
               if (!bStore.avatarHistory) bStore.avatarHistory = [];
               bStore.avatarHistory[idx] = new Blob([b], { type: 'image/png' });
            }
          }
        }
        
        for (const [id, val] of blobsToSave.entries()) {
           await os.put(val, id);
        }
        await tx.done;
      }
      
      // Fallback: Restore missing blobs from Characters/ folders if sys_blobs was incomplete
      // (helps recover older/corrupted backups where blobs were lost during JSON serialization)
      onProgress("正在校验图片数据...");
      const dbAllChars = await db.getAll('characters');
      const missingBlobsIds = new Set<string>();
      
      const checkTx = db.transaction('blobs', 'readonly');
      const checkOs = checkTx.objectStore('blobs');
      for (const char of dbAllChars) {
          const b = (await checkOs.get(char.id)) as any;
          
          let isMissing = false;
          if (char.hasBlobsSeparated) {
              if (!b || (!b.avatarBlob && !b.originalFile)) isMissing = true;
          } else {
              // Not separated. Check if the inline blob is a corrupted empty object from JSON serialization
              if (char.avatarBlob && !char.avatarBlob.size && !char.avatarBlob.type) {
                  isMissing = true;
              } else if (!char.avatarBlob && char.originalFile && !char.originalFile.size) {
                  isMissing = true; 
              } else if (!char.avatarBlob && !char.originalFile) {
                  isMissing = true; // Lost completely
              }
          }
          
          if (isMissing) {
              missingBlobsIds.add(char.id);
          }
      }
      await checkTx.done;
      
      if (missingBlobsIds.size > 0) {
         onProgress(`正在尝试从兼容结构恢复 ${missingBlobsIds.size} 个丢失的图片...`);
         const fixTx = db.transaction(['blobs', 'characters'], 'readwrite');
         const fixOs = fixTx.objectStore('blobs');
         const charFixOs = fixTx.objectStore('characters');
         
         const charFiles = Object.values(loadedZip.files).filter(f => !f.dir && f.name.startsWith('Characters/'));
         
         for (const id of missingBlobsIds) {
             const existingBlobData = (await fixOs.get(id)) || {};
             let hasFoundAny = false;
             
             // Look for Characters/..._id/avatar.png or name.png
             // Note: using endWith underscore and id because folder was named `${safeCharName}_${char.id}`
             const folderPrefixRegex = new RegExp(`^Characters/[^/]+_${id}/`);
             const potentialFiles = charFiles.filter(f => folderPrefixRegex.test(f.name));
             
             for (const file of potentialFiles) {
                const fileName = file.name.split('/').pop() || '';
                if (fileName === "avatar.png" || fileName.endsWith(".png") || fileName.endsWith(".webp") || fileName.endsWith(".jpg")) {
                   const content = await file.async("blob");
                   let mimeT = "image/png";
                   if (fileName.endsWith(".webp")) mimeT = "image/webp";
                   if (fileName.endsWith(".jpg") || fileName.endsWith(".jpeg")) mimeT = "image/jpeg";
                   
                   const fileBlob = new Blob([content], { type: content.type || mimeT });
                   
                   if (fileName === "avatar.png") {
                      existingBlobData.avatarBlob = fileBlob;
                      hasFoundAny = true;
                   } else {
                      existingBlobData.originalFile = new File([content], fileName, { type: content.type || mimeT });
                      hasFoundAny = true;
                   }
                }
             }
             
             if (hasFoundAny) {
                 await fixOs.put(existingBlobData, id);
                 
                 // Clean up the character record to use the separated blobs
                 const c = await charFixOs.get(id);
                 if (c) {
                     c.hasBlobsSeparated = true;
                     delete c.avatarBlob;
                     delete c.originalFile;
                     delete c.avatarHistory;
                     await charFixOs.put(c);
                 }
             }
         }
         await fixTx.done;
      }
      
      // Restore settings
      const settingsEntry = loadedZip.file("settings.json");
      if (settingsEntry) {
         onProgress("正在恢复系统配置...");
         const settingsContent = await settingsEntry.async("string");
         const savedSettings = JSON.parse(settingsContent);
         for (const [key, val] of Object.entries(savedSettings)) {
            if (val !== null && val !== undefined) {
               localStorage.setItem(key, String(val));
            }
         }
      }

      invalidateCache();
      onProgress("无损完整备份恢复成功！");
      return;
    } catch (err: any) {
       console.error("Failed to restore lossless backup", err);
       onProgress("无损恢复报错，将尝试以兼容模式解析...");
    }
  }

  // --- OLD LOGIC FALLBACK (for strictly compatible zip or older backups) ---
  const foldersEntry = loadedZip.file("folders.json");
  if (foldersEntry) {
    onProgress("正在以兼容模式恢复分类数据...");
    const foldersJson = await foldersEntry.async("string");
    try {
      const folders = JSON.parse(foldersJson);
      for (const folder of folders) {
        await saveFolder(folder);
      }
    } catch (e) {
      console.error("Failed to restore folders", e);
    }
  }

  const settingsEntryCompat = loadedZip.file("settings.json");
  if (settingsEntryCompat) {
    onProgress("正在恢复系统配置...");
    try {
      const settingsContent = await settingsEntryCompat.async("string");
      const savedSettings = JSON.parse(settingsContent);
      for (const [key, val] of Object.entries(savedSettings)) {
         if (val !== null && val !== undefined) {
            localStorage.setItem(key, String(val));
         }
      }
    } catch (e) {
      console.error("Failed to restore settings compat", e);
    }
  }

  const filesToProcess = Object.values(loadedZip.files);
  const characterFolders = new Map<string, { meta?: any, card?: any, avatar?: Blob }>();

  for (const file of filesToProcess) {
    if (file.dir) continue;
    const lowerName = file.name.toLowerCase();
    if (lowerName.startsWith("characters/")) {
      const parts = file.name.split("/");
      if (parts.length >= 3) {
        const folderName = parts[1];
        const fileName = parts[parts.length - 1];
        if (!characterFolders.has(folderName)) characterFolders.set(folderName, {});
        
        if (fileName === "character.json") {
          const content = await file.async("string");
          try {
            characterFolders.get(folderName)!.meta = JSON.parse(content);
          } catch(e) {}
        } else if (fileName === "card.json" || fileName.endsWith(".json")) {
          const content = await file.async("string");
          try {
             if (fileName === "card.json") {
                characterFolders.get(folderName)!.card = JSON.parse(content);
             } else if (!characterFolders.get(folderName)!.meta) {
                characterFolders.get(folderName)!.meta = JSON.parse(content);
             }
          } catch(e) {}
        } else if (fileName === "avatar.png" || fileName.endsWith(".png") || fileName.endsWith(".webp") || fileName.endsWith(".jpg")) {
          const content = await file.async("blob");
          characterFolders.get(folderName)!.avatar = content;
        }
      }
    }
  }

  let charCount = 0;
  for (const [folderName, data] of characterFolders.entries()) {
    if (data.meta || data.card) {
      charCount++;
      if (charCount % 5 === 0) onProgress(`正在以兼容模式恢复角色卡片 (${charCount}/${characterFolders.size})...`);
      
      const charToSave: any = {};
      
      if (data.meta) {
        Object.assign(charToSave, data.meta);
      } else if (data.card) {
        const lastUnderscore = folderName.lastIndexOf('_');
        let fallbackId = folderName;
        let fallbackName = folderName;
        if (lastUnderscore > 0) {
          fallbackName = folderName.substring(0, lastUnderscore);
          fallbackId = folderName.substring(lastUnderscore + 1);
        }
        charToSave.id = fallbackId;
        charToSave.name = data.card.name || fallbackName;
        charToSave.data = data.card;
        charToSave.createdAt = Date.now();
      }

      if (data.avatar) {
        charToSave.avatarBlob = data.avatar;
      }
      
      try {
        await saveCharacter(charToSave);
      } catch (err) {
        console.error("Failed to restore character compat:", charToSave.id, err);
      }
    }
  }

  const chatFiles = filesToProcess.filter(f => !f.dir && f.name.toLowerCase().startsWith("chats/") && f.name.endsWith(".jsonl"));
  onProgress(`正在解析兼容版聊天记录 (${chatFiles.length})...`);
  
  const chatsToSave = [];
  let chatParseCount = 0;
  for (const file of chatFiles) {
    chatParseCount++;
    if (chatParseCount % 10 === 0) onProgress(`正在解析兼容版聊天记录 (${chatParseCount}/${chatFiles.length})...`);
    
    const content = await file.async("string");
    const lines = content.split('\n').filter(l => l.trim() !== '');
    const messages = [];
    for (const line of lines) {
      try {
        messages.push(JSON.parse(line));
      } catch(e) {}
    }
    
    if (messages.length > 0) {
      const parts = file.name.split("/");
      const fileName = parts[2];
      
      const fileNameWithoutExt = fileName.replace(".jsonl", "");
      const dateMatch = fileNameWithoutExt.match(/_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)$/);
      let safeChatName = fileNameWithoutExt;
      let createdAtStr = new Date().toISOString();
      
      if (dateMatch) {
         safeChatName = fileNameWithoutExt.substring(0, fileNameWithoutExt.length - dateMatch[0].length);
         createdAtStr = dateMatch[1].replace(/-/g, ':').replace(/T(\d{2}):(\d{2}):(\d{2}):(\d{3})Z/, 'T$1:$2:$3.$4Z');
      } else {
         createdAtStr = new Date().toISOString();
      }

      const safeCharFolderFromPath = parts[1];
      let targetCharId = "";
      for (const [folderName, data] of characterFolders.entries()) {
         if ((data.meta || data.card) && folderName.startsWith(safeCharFolderFromPath)) {
            if (data.meta && data.meta.id) {
               targetCharId = data.meta.id;
            } else {
               const lastUnderscore = folderName.lastIndexOf('_');
               if (lastUnderscore > 0) {
                 targetCharId = folderName.substring(lastUnderscore + 1);
               } else {
                 targetCharId = folderName;
               }
            }
            break;
         }
      }
      
      const newChatId = "cloud-sync-" + Math.random().toString(36).substring(2, 9) + Date.now();
      
      chatsToSave.push({
         id: newChatId,
         characterId: targetCharId,
         name: safeChatName || "Recovered Chat",
         messages: messages,
         createdAt: new Date(createdAtStr).getTime() || Date.now(),
         updatedAt: Date.now()
      });
    }
  }

  if (chatsToSave.length > 0) {
    onProgress("正在保存兼容版聊天记录...");
    await saveChatsBulk(chatsToSave, (c, t) => {
      onProgress(`正在保存兼容版聊天记录到数据库 (${c}/${t})...`);
    });
  }

  invalidateCache();
  onProgress("数据恢复成功！");
}

export async function deleteBackupFromDrive(accessToken: string, fileId: string) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('删除备份失败');
}

export const triggerManualBackup = (token: string) => {
  if (syncState.isActive) throw new Error("已有备份/恢复任务正在进行中");
  
  updateSyncState({ isActive: true, taskName: '手动备份', message: '准备备份...', isError: false, completed: false });
  
  uploadBackupToDrive(token, (msg) => {
    updateSyncState({ message: msg });
  }, false).then(() => {
    updateSyncState({ isActive: false, completed: true, message: '备份完成' });
  }).catch((e: any) => {
    updateSyncState({ isActive: false, isError: true, message: `备份失败: ${e.message}` });
  });
};

export const triggerRestore = (token: string, fileId: string) => {
  if (syncState.isActive) throw new Error("已有备份/恢复任务正在进行中");
  updateSyncState({ isActive: true, taskName: '恢复数据', message: '正在从云端下载...', isError: false, completed: false });
  
  (async () => {
    try {
      const blob = await downloadBackupFromDrive(token, fileId);
      await restoreBackupFromBlob(blob, (msg) => updateSyncState({ message: msg }));
      updateSyncState({ isActive: false, completed: true, message: '数据恢复成功，即将刷新页面...' });
      setTimeout(() => window.location.reload(), 2000);
    } catch (e: any) {
      updateSyncState({ isActive: false, isError: true, message: `恢复失败: ${e.message}` });
    }
  })();
};
