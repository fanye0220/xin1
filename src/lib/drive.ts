import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { getFolders, getCachedMeta, getCharacter, getAllChatsMetadata, getChatById, saveFolder, saveCharacter, saveChatsBulk, invalidateCache } from './db';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
// Request Workspace scopes
provider.addScope('https://www.googleapis.com/auth/drive.file');

// Flag to indicate if we are in the middle of a sign-in flow.
let isSigningIn = false;
// Cache the access token in memory.
let cachedAccessToken: string | null = null;

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
        stopAutoSyncRunner();
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      currentAccessToken = null;
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

  onProgress("正在获取角色与分类数据...");
  // Save folders
  const folders = await getFolders();
  zip.file("folders.json", JSON.stringify(folders));

  const chars = await getCachedMeta();
  onProgress(`正在导出角色卡片 (总数: ${chars.length})...`);
  for (let i = 0; i < chars.length; i++) {
    const char = await getCharacter(chars[i].id);
    if (!char) continue;
    // We can save char.data as json, and avatarBlob as png
    const charFolder = zip.folder(`Characters/${char.name.replace(/[/\\?%*:|"<>]/g, '_')}_${char.id}`)!;
    charFolder.file("card.json", JSON.stringify(char.data));
    if (char.avatarBlob) {
      charFolder.file("avatar.png", char.avatarBlob);
    }
  }

  const allChats = await getAllChatsMetadata();
  onProgress(`正在导出聊天记录 (总数: ${allChats.length})...`);
  for (let i = 0; i < allChats.length; i++) {
    const chat = await getChatById(allChats[i].id);
    if (!chat) continue;
    
    // Group by character
    const charMeta = chars.find(c => c.id === chat.characterId);
    const charName = charMeta ? charMeta.name : "Unknown";
    const safeCharName = charName.replace(/[/\\?%*:|"<>]/g, '_');
    const safeChatName = chat.name.replace(/[/\\?%*:|"<>]/g, '_');
    
    const formattedDate = new Date(chat.createdAt).toISOString().replace(/[:.]/g, "-");
    const filename = `${safeChatName}_${formattedDate}.jsonl`;
    
    const jsonlString = chat.messages.map((m: any) => JSON.stringify(m)).join('\\n');
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

    onProgress('上传成功!');
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

  // 1. Restore folders
  const foldersEntry = loadedZip.file("folders.json");
  if (foldersEntry) {
    onProgress("正在恢复分类数据...");
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

  // 2. Restore Characters
  const filesToProcess = Object.values(loadedZip.files);
  const characterFolders = new Map<string, { card?: any, avatar?: Blob }>();

  for (const file of filesToProcess) {
    if (file.dir) continue;
    if (file.name.startsWith("Characters/")) {
      const parts = file.name.split("/");
      if (parts.length === 3) {
        const folderName = parts[1];
        const fileName = parts[2];
        if (!characterFolders.has(folderName)) characterFolders.set(folderName, {});
        
        if (fileName === "card.json") {
          const content = await file.async("string");
          try {
            characterFolders.get(folderName)!.card = JSON.parse(content);
          } catch(e) {}
        } else if (fileName === "avatar.png") {
          const content = await file.async("blob");
          characterFolders.get(folderName)!.avatar = content;
        }
      }
    }
  }

  let charCount = 0;
  for (const [folderName, data] of characterFolders.entries()) {
    if (data.card) {
      charCount++;
      if (charCount % 5 === 0) onProgress(`正在恢复角色卡片 (${charCount}/${characterFolders.size})...`);
      const charToSave = { ...data.card };
      if (data.avatar) {
        charToSave.avatarBlob = data.avatar;
      }
      await saveCharacter(charToSave);
    }
  }
  onProgress("角色卡片恢复完成。");

  // 3. Restore Chats
  const chatFiles = filesToProcess.filter(f => !f.dir && f.name.startsWith("Chats/") && f.name.endsWith(".jsonl"));
  onProgress(`正在解析聊天记录 (总数: ${chatFiles.length})...`);
  
  const chatsToSave = [];
  let chatParseCount = 0;
  for (const file of chatFiles) {
    chatParseCount++;
    if (chatParseCount % 10 === 0) onProgress(`正在解析聊天记录 (${chatParseCount}/${chatFiles.length})...`);
    
    const content = await file.async("string");
    const lines = content.split('\n').filter(l => l.trim() !== '');
    const messages = [];
    for (const line of lines) {
      try {
        messages.push(JSON.parse(line));
      } catch(e) {}
    }
    
    if (messages.length > 0) {
      // 提取文件名信息：Chats/SafeCharName/SafeChatName_Date.jsonl
      const parts = file.name.split("/");
      const fileName = parts[2]; // safeChatName_date.jsonl
      
      const fileNameWithoutExt = fileName.replace(".jsonl", "");
      const dateMatch = fileNameWithoutExt.match(/_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)$/);
      let safeChatName = fileNameWithoutExt;
      let createdAtStr = new Date().toISOString();
      
      if (dateMatch) {
         safeChatName = fileNameWithoutExt.substring(0, fileNameWithoutExt.length - dateMatch[0].length);
         createdAtStr = dateMatch[1].replace(/-/g, ':').replace(/T(\d{2}):(\d{2}):(\d{2}):(\d{3})Z/, 'T$1:$2:$3.$4Z'); // Best effort to fix ISO string
      } else {
         createdAtStr = new Date().toISOString();
      }

      // 找对应的角色
      const safeCharFolderFromPath = parts[1]; // Parts[1] is the folder name in zip
      // We need to find the characterId! We look into characterFolders
      let targetCharId = "";
      for (const [folderName, data] of characterFolders.entries()) {
         if (data.card && folderName.startsWith(safeCharFolderFromPath)) {
            targetCharId = data.card.id;
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
    onProgress("正在保存聊天记录...");
    await saveChatsBulk(chatsToSave, (c, t) => {
      onProgress(`正在保存聊天记录到数据库 (${c}/${t})...`);
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
