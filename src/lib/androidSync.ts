import { isAndroid, saveToGallery, deleteLocalGalleryFile, readLocalFileBuffer } from './appBridge';
import { CharacterCard, getFolders, getCharacter, ChatLog } from './db';

const getSafeFilename = (name: string) => {
  return name.replace(/[\\/:*?"<>|]/g, '_') || 'character';
};

export async function resolveFolderPath(folderId?: string | null): Promise<string> {
  const defaultUncategorized = '未分类';
  if (!folderId || folderId === 'all') return defaultUncategorized;

  const folders = await getFolders();
  let currentId: string | undefined | null = folderId;
  const pathParts: string[] = [];

  while (currentId) {
    const folder = folders.find(f => f.id === currentId);
    if (!folder) break;
    pathParts.unshift(folder.name);
    currentId = folder.parentId;

    if (pathParts.length > 50) break;
  }

  if (pathParts.length === 0) return defaultUncategorized;
  // Make sure each folder name is safe
  return pathParts.map(getSafeFilename).join('/');
}

function getCharacterCategoryPrefix(char: CharacterCard): string {
  const rawData = char.data?.data || char.data || {};
  const isPreset = rawData.temperature !== undefined || rawData.prompts !== undefined || rawData.top_p !== undefined;
  const isStandaloneWorldbook = rawData.entries !== undefined || (rawData.data && rawData.data.entries !== undefined);
  const isTheme = rawData.blur_strength !== undefined || rawData.main_text_color !== undefined || rawData.chat_display !== undefined;
  const isQR = Array.isArray(rawData) ? rawData.length > 0 && rawData[0].label !== undefined : rawData.quick_replies !== undefined || rawData.qrList !== undefined;
  const isScript = rawData.run !== undefined || rawData.type === 'tool' || (rawData.type === 'script' && rawData.content !== undefined && rawData.name !== undefined);
  
  if (isTheme) return '美化';
  if (isPreset) return '预设';
  if (isStandaloneWorldbook) return '世界书';
  if (isQR) return '快速回复';
  if (isScript) return '工具区';
  
  return '';
}

export async function tryCleanupOldAndroidFiles(char: CharacterCard) {
  if (!isAndroid()) return;
  const targetPath = char.localFilePath || (char as any)._androidSyncPath;
  if (!targetPath) return;
  
  const { initDB, getSafeFilename } = await import('./db');
  const db = await initDB();
  const tx = db.transaction('characters', 'readonly');
  const allChars = await tx.store.getAll();
  await tx.done;
  
  const parts = targetPath.split('/');
  const safeName = getSafeFilename(char.name);
  let isFolder = false;
  let dirPath = '';
  
  if (parts.length >= 2 && parts[parts.length - 2] === safeName) {
    isFolder = true;
    dirPath = parts.slice(0, parts.length - 1).join('/');
  }

  // Check if any other character is using the exact file or exactly the same folder
  for (const c of allChars) {
    if (c.id === char.id) continue;
    const p = c.localFilePath || (c as any)._androidSyncPath;
    if (p) {
       if (isFolder && p.startsWith(dirPath + '/')) {
          // Another character is still using files in this folder (or the folder itself)
          return;
       } else if (!isFolder && p === targetPath) {
          // Another character is using this exact standalone file
          return;
       }
    }
  }

  if (isFolder) {
    // Attempt to delete entire subfolder
    await deleteLocalGalleryFile(dirPath);
  } else {
    // Attempt to delete the single file
    await deleteLocalGalleryFile(targetPath);
  }
}

export async function syncCharacterToAndroid(
  char: CharacterCard,
  blobStoreValue: { avatarBlob?: Blob, originalFile?: File, avatarHistory?: Blob[] } | null,
  _allCharsCache?: CharacterCard[],
  _allChatsCache?: Map<string, any[]>
): Promise<string[]> {
  if (!isAndroid()) return [];

  // Determine prefix and folder
  let prefix = getCharacterCategoryPrefix(char);
  let folderPath = await resolveFolderPath(char.folderId);
  
  if (char.deletedAt) {
    folderPath = '回收站';
  } else if ((folderPath === '未归类' || folderPath === '未分类') && prefix) {
    folderPath = prefix;
  }

  const safeName = getSafeFilename(char.name);

  const rawData = char.data?.data || char.data || {};
  const isPreset = rawData.temperature !== undefined || rawData.prompts !== undefined || rawData.top_p !== undefined;
  const isStandaloneWorldbook = rawData.entries !== undefined || (rawData.data && rawData.data.entries !== undefined);
  const isTheme = rawData.blur_strength !== undefined || rawData.main_text_color !== undefined || rawData.chat_display !== undefined;
  const isQR = Array.isArray(rawData) ? rawData.length > 0 && rawData[0].label !== undefined : rawData.quick_replies !== undefined || rawData.qrList !== undefined;
  const isScript = rawData.run !== undefined || rawData.type === 'tool' || (rawData.type === 'script' && rawData.content !== undefined && rawData.name !== undefined);

  // Predict new path to see if it changed
  const previousFilePath = char.localFilePath || (char as any)._androidSyncPath;

  let savedPaths: string[] = [];

  if (isPreset || isStandaloneWorldbook || isTheme || isQR || isScript) {
    let buffer: ArrayBuffer;
    let ext = 'json';
    let fileName = '';
    if (blobStoreValue?.originalFile) {
      buffer = await blobStoreValue.originalFile.arrayBuffer();
      if ((blobStoreValue.originalFile as File).name) {
        fileName = (blobStoreValue.originalFile as File).name;
        const parts = fileName.split('.');
        if (parts.length > 1) {
           ext = parts[parts.length - 1];
        }
      }
    } else {
      const jsonStr = JSON.stringify(char.data, null, 2);
      buffer = new TextEncoder().encode(jsonStr).buffer;
    }
    if (!fileName) {
       fileName = `${safeName}.${ext}`;
    }
    const path = await saveToGallery(`${folderPath}/${fileName}`, buffer);
    if (path) {
       savedPaths.push(path);
       if (previousFilePath && previousFilePath !== path) {
         await tryCleanupOldAndroidFiles({ ...char, localFilePath: previousFilePath } as CharacterCard);
       }
    }
    return savedPaths;
  }

  let baseBlob = blobStoreValue?.avatarBlob || blobStoreValue?.originalFile;
  let localBuffer: ArrayBuffer | null = null;

  if (!baseBlob && previousFilePath) {
    localBuffer = await readLocalFileBuffer(previousFilePath);
  } else if (baseBlob) {
    localBuffer = await baseBlob.arrayBuffer();
  }

  if (localBuffer) {
    const { injectTavernData } = await import('./png');
    let injectedBuffer: ArrayBuffer;
    let isPng = false;
    try {
      const uint8 = new Uint8Array(localBuffer);
      if (uint8.length >= 8 && uint8[0] === 0x89 && uint8[1] === 0x50 && uint8[2] === 0x4e && uint8[3] === 0x47) {
        isPng = true;
      }
    } catch(e) {}
    
    let cardExt = isPng ? 'png' : 'json';
    if (!isPng && baseBlob instanceof File && baseBlob.name) {
       const parts = baseBlob.name.split('.');
       if (parts.length > 1) {
          cardExt = parts[parts.length - 1];
       }
    }
    
    try {
      if (isPng) {
        injectedBuffer = injectTavernData(localBuffer, char.data);
      } else {
        injectedBuffer = localBuffer;
      }
    } catch (e) {
      console.warn("Failed to inject tavern data, using raw buffer", e);
      injectedBuffer = localBuffer;
    }

    const targetData = char.data.data ? char.data.data : char.data;
    const hasQR = targetData.extensions?.quick_replies && targetData.extensions.quick_replies.length > 0;
    const avatarHistory = blobStoreValue?.avatarHistory || [];
    const hasAvatars = avatarHistory.length > 0;

    const { getChatsForCharacter } = await import('./db');
    const chats = await getChatsForCharacter(char.id);
    const hasChats = chats.length > 0;

    let mainCardPath = '';
    
    if (hasQR || hasAvatars || hasChats) {
      // Put everything in a subfolder
      const subFolder = `${folderPath}/${safeName}`;
      mainCardPath = await saveToGallery(`${subFolder}/${safeName}.${cardExt}`, injectedBuffer) || '';
      
      if (hasChats) {
        for (const c of chats) {
          const dateStr = new Date(c.createdAt).toISOString().replace(/:/g, '-');
          const cName = getSafeFilename(c.name || 'Chat');
          const lines = c.messages ? c.messages.map(m => JSON.stringify(m)).join('\n') : '';
          const b = new TextEncoder().encode(lines).buffer;
          await saveToGallery(`${subFolder}/聊天记录/${cName}_${dateStr}.jsonl`, b);
        }
      }
      
      if (hasQR) {
        const qrFileName = targetData.extensions?.qr_filename || `${safeName}_qr.json`;
        let qrContentToExport: any = targetData.extensions.quick_replies;
        if (targetData.extensions.tavern_qr_sets && targetData.extensions.tavern_qr_sets.length > 0) {
          const metadata = targetData.extensions.tavern_qr_sets.find((s: any) => s.metadata)?.metadata;
          if (metadata) {
            qrContentToExport = { ...metadata };
            if (qrContentToExport.qrList) qrContentToExport.qrList = targetData.extensions.quick_replies;
            else if (qrContentToExport.quick_replies) qrContentToExport.quick_replies = targetData.extensions.quick_replies;
          } else {
            qrContentToExport = { version: 2, name: char.name, qrList: targetData.extensions.quick_replies };
          }
        } else {
          qrContentToExport = { version: 2, name: char.name, qrList: targetData.extensions.quick_replies };
        }
        const qrBuffer = new TextEncoder().encode(JSON.stringify(qrContentToExport, null, 2)).buffer;
        await saveToGallery(`${subFolder}/${qrFileName}`, qrBuffer);
      }
      
      if (hasAvatars) {
        for (let i = 0; i < avatarHistory.length; i++) {
          const avatarBlob = avatarHistory[i];
          let ext = 'png';
          let fileName = `替换卡面_${i + 1}.${ext}`;
          if (typeof File !== 'undefined' && avatarBlob instanceof File) {
            fileName = avatarBlob.name;
          } else {
            if (avatarBlob.type === 'image/jpeg') ext = 'jpg';
            else if (avatarBlob.type === 'image/webp') ext = 'webp';
            fileName = `替换卡面_${i + 1}.${ext}`;
          }
          const b = await avatarBlob.arrayBuffer();
          await saveToGallery(`${subFolder}/替换卡面/${fileName}`, b);
        }
      }
    } else {
      mainCardPath = await saveToGallery(`${folderPath}/${safeName}.${cardExt}`, injectedBuffer) || '';
    }

    if (mainCardPath) {
      savedPaths.push(mainCardPath);
      if (previousFilePath && previousFilePath !== mainCardPath) {
         await tryCleanupOldAndroidFiles({ ...char, localFilePath: previousFilePath } as CharacterCard);
         const { getChatsForCharacter } = await import('./db');
         const chats = await getChatsForCharacter(char.id);
         for (const c of chats) await syncChatToAndroid(c);
      }
    }
  } else {
    // Only json fallback if it's not an image based card, e.g. imported as json and no avatar fallback worked
    const jsonStr = JSON.stringify(char.data, null, 2);
    const buffer = new TextEncoder().encode(jsonStr).buffer;
    const path = await saveToGallery(`${folderPath}/${safeName}.json`, buffer);
    if (path) {
       savedPaths.push(path);
       if (previousFilePath && previousFilePath !== path) {
         await tryCleanupOldAndroidFiles({ ...char, localFilePath: previousFilePath } as CharacterCard);
         const { getChatsForCharacter } = await import('./db');
         const chats = await getChatsForCharacter(char.id);
         for (const c of chats) await syncChatToAndroid(c);
       }
    }
  }

  return savedPaths;
}

export async function syncChatToAndroid(chat: ChatLog): Promise<void> {
  if (!isAndroid()) return;
  const safeName = getSafeFilename(chat.name || 'Chat');
  
  const { getCharacter, resolveFolderPath, initDB } = await import('./db');
  // Get character associated with chat to potentially place it nicely
  const char = await getCharacter(chat.characterId);
  const dateStr = new Date(chat.createdAt).toISOString().replace(/:/g, '-');
  const chatFileName = `${safeName}_${dateStr}.jsonl`; // Or whatever format, jsonl is tavern style
  
  // Format to standard jsonl format
  const jsonlLines = chat.messages ? chat.messages.map(m => JSON.stringify(m)).join('\n') : '';
  const buffer = new TextEncoder().encode(jsonlLines).buffer;
  
  if (char) {
    const charName = getSafeFilename(char.name);
    let prefix = getCharacterCategoryPrefix(char);
    let folderPath = await resolveFolderPath(char.folderId);
    if (char.deletedAt) {
      folderPath = '回收站';
    } else if ((folderPath === '未归类' || folderPath === '未分类') && prefix) {
      folderPath = prefix;
    }
    
    // Save to FolderPath/CharacterName/聊天记录/ChatName.jsonl
    await saveToGallery(`${folderPath}/${charName}/聊天记录/${chatFileName}`, buffer);

    // Sync character so it also moves into the subfolder if it hasn't yet
    const db = await initDB();
    const blobs = await db.get('blobs', char.id);
    const syncPaths = await syncCharacterToAndroid(char, blobs || null);
    if (syncPaths && syncPaths.length > 0 && syncPaths[0] !== char.localFilePath) {
      char.localFilePath = syncPaths[0];
      await db.put('characters', char);
    }
  } else {
    // If unbounded chat, put into a default unbound directory
    await saveToGallery(`未绑定聊天记录/${chatFileName}`, buffer);
  }
}


// Since Android doesn't have an API to list directories and delete them easily, 
// when we soft delete or hard delete a character, we should ideally delete its files.
export async function deleteCharacterFromAndroid(char: CharacterCard): Promise<void> {
  await tryCleanupOldAndroidFiles(char);
}

export async function fastMoveCharacterOnAndroid(char: CharacterCard): Promise<string[] | null> {
  if (!isAndroid()) return null;
  const previousFilePath = char.localFilePath || (char as any)._androidSyncPath;
  if (!previousFilePath) return null; // No file synced

  const { getCharacterCategoryPrefix, resolveFolderPath, getSafeFilename } = await import('./db');
  const safeName = getSafeFilename(char.name);

  // Figure out the old directory or file name
  // Note: previousFilePath usually looks like `.../MIU_Sync/文件夹/角色名/角色名.png` or `.../MIU_Sync/文件夹/角色名.png`
  let oldDirPath = '';
  let oldIsFolder = false;
  const oldParts = previousFilePath.split('/');
  if (oldParts.length >= 2 && oldParts[oldParts.length - 2] === safeName) {
     oldIsFolder = true;
     oldDirPath = oldParts.slice(0, oldParts.length - 1).join('/');
  }

  // Calculate new logical path relative to root
  let newFolderPath = await resolveFolderPath(char.folderId);
  let prefix = getCharacterCategoryPrefix(char);
  if (char.deletedAt) {
    newFolderPath = '回收站';
  } else if ((newFolderPath === '未归类' || newFolderPath === '未分类') && prefix) {
    newFolderPath = prefix;
  }

  const { renameLocalGalleryFile } = await import('./appBridge');

  if (oldIsFolder) {
     // We rename the entire folder
     // e.g. from `/storage/.../Imported/myChar` to `回收站/myChar`
     // renameLocalGalleryFile handles translating newFolderPath to the absolute native path
     const newDirRelative = `${newFolderPath}/${safeName}`;
     const success = await renameLocalGalleryFile(oldDirPath, newDirRelative);
     if (success) {
        // Return constructed new previousFilePath
        // replace oldDirPath with newDirAbsolute ? Wait, renameLocalGalleryFile prepends getSaveDirectory() but to return it safely:
        // We actually need the absolute path. But replacing the oldDirPath string with something else is tricky because oldDirPath is absolute.
        // It's safer to just return a dummy relative path like `${newDirRelative}/${oldParts[oldParts.length - 1]}`
        // and let DB set it. Wait, `localFilePath` holds an absolute path...
        const newFilePath = previousFilePath.replace(oldDirPath, ((window as any).Android?.getSaveDirectoryInterface ? ((window as any).Android.getSaveDirectoryInterface() + '/' + newDirRelative) : newDirRelative));
        return [newFilePath];
     }
  } else {
     // Standalone file move
     const extractedName = oldParts[oldParts.length - 1]; // e.g. myChar.png
     const newFileRelative = `${newFolderPath}/${extractedName}`;
     const success = await renameLocalGalleryFile(previousFilePath, newFileRelative);
     if (success) {
        const newFilePath = previousFilePath.replace(previousFilePath, ((window as any).Android?.getSaveDirectoryInterface ? ((window as any).Android.getSaveDirectoryInterface() + '/' + newFileRelative) : newFileRelative));
        return [newFilePath];
     }
  }
  return null;
}

export async function deleteChatFromAndroid(chat: ChatLog): Promise<void> {
  if (!isAndroid()) return;
  const safeName = getSafeFilename(chat.name || 'Chat');
  
  const { getCharacter, resolveFolderPath, getCharacterCategoryPrefix } = await import('./db');
  const char = await getCharacter(chat.characterId);
  const dateStr = new Date(chat.createdAt).toISOString().replace(/:/g, '-');
  const chatFileName = `${safeName}_${dateStr}.jsonl`;
  
  if (char) {
    const charName = getSafeFilename(char.name);
    let folderPath = await resolveFolderPath(char.folderId);
    let prefix = getCharacterCategoryPrefix(char);
    if (char.deletedAt) {
      folderPath = '回收站';
    } else if ((folderPath === '未归类' || folderPath === '未分类') && prefix) {
      folderPath = prefix;
    }
    const targetPath = `${folderPath}/${charName}/聊天记录/${chatFileName}`;
    await deleteLocalGalleryFile(targetPath);
  } else {
    // If unbounded chat
    const targetPath = `未绑定聊天记录/${chatFileName}`;
    await deleteLocalGalleryFile(targetPath);
  }
}
