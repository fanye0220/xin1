import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { getFolders, getCachedMeta, getCharacter, getAllChatsMetadata, getChatById } from './db';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
// Request Workspace scopes
provider.addScope('https://www.googleapis.com/auth/drive.file');

// Flag to indicate if we are in the middle of a sign-in flow.
let isSigningIn = false;
// Cache the access token in memory.
let cachedAccessToken: string | null = null;

// Initialize auth state listener. Call this on app load.
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

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

export async function uploadBackupToDrive(accessToken: string, onProgress: (msg: string) => void): Promise<void> {
  try {
    const backupBlob = await exportAllDataForBackup(onProgress);

    onProgress('正在查找/创建网盘备份文件夹...');
    const folderId = await getOrCreateBackupFolder(accessToken);

    onProgress('正在上传数据到 Google Drive... (可能需要1-3分钟)');
    const fileName = `aitavern_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;

    const metadata = {
      name: fileName,
      parents: [folderId],
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', backupBlob);

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
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

export async function deleteBackupFromDrive(accessToken: string, fileId: string) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('删除备份失败');
}
