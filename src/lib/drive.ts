import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import { getStorage, ref, uploadBytesResumable, getDownloadURL, listAll, deleteObject, getMetadata } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';
import { getFolders, getCachedMeta, getCharacter, getAllChatsMetadata, getChatById, saveFolder, saveCharacter, saveChatsBulk, invalidateCache, initDB } from './db';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const storage = getStorage(app);

const provider = new GoogleAuthProvider();

// Flag to indicate if we are in the middle of a sign-in flow.
let isSigningIn = false;

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

// Initialize auth state listener. Call this on app load.
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      startAutoSyncRunner();
      if (onAuthSuccess) onAuthSuccess(user, "firebase");
    } else {
      stopAutoSyncRunner();
      if (onAuthFailure) onAuthFailure();
    }
  });
};

function startAutoSyncRunner() {
  if (autoSyncInterval) return;
  
  autoSyncInterval = setInterval(async () => {
    const isEnabled = localStorage.getItem('auto_backup_enabled') === 'true';
    if (!isEnabled || !auth.currentUser || syncState.isActive) return;
    
    updateSyncState({ isActive: true, taskName: '自动备份', message: '准备备份...', isError: false, completed: false });
    try {
      await uploadBackupToFirebase((msg) => {
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
    startAutoSyncRunner();
    return { user: result.user, accessToken: "firebase" };
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return auth.currentUser ? "firebase" : null;
};

export const logout = async () => {
  await auth.signOut();
  stopAutoSyncRunner();
};

export async function exportAllDataForBackup(onProgress: (msg: string) => void): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();

  const db = await initDB();

  // Lossless App Database Dump (100% accurate restore for this app)
  onProgress("正在生成完整的数据库快照...");
  const rawExport = {
    folders: await db.getAll('folders'),
    characters: await db.getAll('characters'),
    chats: await db.getAll('chats'),
    memos: await db.getAll('memos')
  };
  zip.file("aitavern_sys_db.json", JSON.stringify(rawExport));

  // Blob dumps (Avatars and original files)
  const allBlobsKeys = await db.getAllKeys('blobs');
  onProgress(`正在导出图片及源文件数据 (${allBlobsKeys.length})...`);
  for (const key of allBlobsKeys) {
    const blobData = await db.get('blobs', key);
    if (blobData) {
      if (blobData.avatarBlob) {
        zip.file(`sys_blobs/${key}_avatar`, new Blob([blobData.avatarBlob], { type: blobData.avatarBlob.type || 'image/png' }));
      }
      if (blobData.originalFile) {
        zip.file(`sys_blobs/${key}_original`, new Blob([blobData.originalFile], { type: blobData.originalFile.type || 'image/png' }));
      }
    }
  }

  // Settings Backup
  onProgress("正在导出系统配置...");
  const appSettings: any = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.startsWith('tavern_') || key === 'ai_settings' || key === 'auto_backup_enabled')) {
      appSettings[key] = localStorage.getItem(key);
    }
  }
  zip.file("settings.json", JSON.stringify(appSettings));

  onProgress("打包压缩中，请勿关闭...");
  return await zip.generateAsync({ type: "blob" });
}

export async function uploadBackupToFirebase(onProgress: (msg: string) => void, isAutoBackup: boolean = false): Promise<void> {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error("未登录");

    const backupBlob = await exportAllDataForBackup(onProgress);

    onProgress('正在上传数据到云端备份区... (可能需要1-3分钟)');
    const fileName = isAutoBackup ? 'aitavern_auto_backup.zip' : `aitavern_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
    
    const storageRef = ref(storage, `users/${user.uid}/backups/${fileName}`);
    const uploadTask = uploadBytesResumable(storageRef, backupBlob);

    await new Promise<void>((resolve, reject) => {
      uploadTask.on('state_changed', 
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          onProgress(`上传中: ${Math.round(progress)}%`);
        }, 
        (error) => {
          reject(error);
        }, 
        () => {
          resolve();
        }
      );
    });

    onProgress('上传成功!');
  } catch (err: any) {
    console.error("Backup to firebase failed", err);
    throw new Error(`备份失败: ${err.message || '未知错误'}`);
  }
}

export async function listBackupsFromFirebase() {
  const user = auth.currentUser;
  if (!user) throw new Error("未登录");

  const listRef = ref(storage, `users/${user.uid}/backups`);
  const res = await listAll(listRef);
  
  const filesInfo = [];
  for (const itemRef of res.items) {
    const metadata = await getMetadata(itemRef);
    filesInfo.push({
      id: itemRef.fullPath,
      name: itemRef.name,
      createdTime: metadata.timeCreated,
      size: metadata.size
    });
  }
  
  return filesInfo.sort((a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime());
}

export async function downloadBackupFromFirebase(filePath: string): Promise<Blob> {
  const fileRef = ref(storage, filePath);
  const url = await getDownloadURL(fileRef);
  const res = await fetch(url);
  if (!res.ok) throw new Error('下载备份失败');
  return res.blob();
}

export async function restoreBackupFromBlob(blob: Blob, onProgress: (msg: string) => void): Promise<void> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  onProgress("正在解压备份文件...");
  const loadedZip = await zip.loadAsync(blob);

  const sysDbEntry = loadedZip.file("aitavern_sys_db.json");
  if (!sysDbEntry) {
    throw new Error("无效的备份文件，缺少核心数据。");
  }

  onProgress("检测到无损完整备份，正在恢复...");
  try {
    const db = await initDB();
    const content = await sysDbEntry.async("string");
    const dbDump = JSON.parse(content);
    
    // Clear and Restore stores
    const storesToRestore = ['folders', 'characters', 'chats', 'memos'] as const;
    for (const store of storesToRestore) {
      if (dbDump[store] && Array.isArray(dbDump[store])) {
         onProgress(`正在恢复 ${store} (${dbDump[store].length}条数据)...`);
         const tx = db.transaction(store as any, 'readwrite');
         const os = tx.objectStore(store as any);
         await os.clear();
         for (const item of dbDump[store]) {
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
      
      const blobsToSave = new Map<string, any>();
      
      for (const file of sysBlobs) {
        const parts = file.name.split('/');
        const filename = parts[1];
        const lastUnderscore = filename.lastIndexOf('_');
        if (lastUnderscore > 0) {
          const id = filename.substring(0, lastUnderscore);
          const type = filename.substring(lastUnderscore + 1);
          if (!blobsToSave.has(id)) blobsToSave.set(id, {});
          
          const b = await file.async("blob");
          if (type === 'avatar') blobsToSave.get(id)!.avatarBlob = b;
          if (type === 'original') {
              blobsToSave.get(id)!.originalFile = new File([b], 'original.png', { type: b.type });
          }
        }
      }
      
      for (const [id, val] of blobsToSave.entries()) {
         await os.put(val, id);
      }
      await tx.done;
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
     throw new Error("无损恢复报错：" + err.message);
  }
}

export async function deleteBackupFromFirebase(filePath: string) {
  const fileRef = ref(storage, filePath);
  await deleteObject(fileRef);
}

export const triggerManualBackup = (token: string) => {
  if (syncState.isActive) throw new Error("已有备份/恢复任务正在进行中");
  
  updateSyncState({ isActive: true, taskName: '手动备份', message: '准备备份...', isError: false, completed: false });
  
  uploadBackupToFirebase((msg) => {
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
      const blob = await downloadBackupFromFirebase(fileId);
      await restoreBackupFromBlob(blob, (msg) => updateSyncState({ message: msg }));
      updateSyncState({ isActive: false, completed: true, message: '数据恢复成功，即将刷新页面...' });
      setTimeout(() => window.location.reload(), 2000);
    } catch (e: any) {
      updateSyncState({ isActive: false, isError: true, message: `恢复失败: ${e.message}` });
    }
  })();
};

