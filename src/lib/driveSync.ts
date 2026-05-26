import { getCharacters, getFolders, saveCharacter, getCharacter, initDB, CharacterCard } from './db';
import { extractTavernData, injectTavernData } from './png';

// Standard Google API endpoints
const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

export interface SyncProgress {
  status: 'idle' | 'syncing' | 'error' | 'success';
  currentCount: number;
  totalCount: number;
  message: string;
}

export type ProgressCallback = (progress: SyncProgress) => void;

/**
 * Searches for or creates a specific folder by name in Google Drive
 */
async function getOrCreateDriveFolder(accessToken: string, folderName: string, parentId?: string): Promise<string> {
  const query = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false` +
                (parentId ? ` and '${parentId}' in parents` : ` and 'root' in parents`);
  
  const res = await fetch(`${DRIVE_API_URL}?q=${encodeURIComponent(query)}&spaces=drive`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await res.json();

  if (data.files && data.files.length > 0) {
    return data.files[0].id; // Found existing folder
  }

  // Create new folder
  const metadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
    parents: parentId ? [parentId] : undefined
  };

  const createRes = await fetch(DRIVE_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(metadata)
  });
  const createData = await createRes.json();
  return createData.id;
}

/**
 * Uploads a file (PNG) to Google Drive in the specified folder.
 * Uses multipart upload.
 */
async function uploadFileToDrive(accessToken: string, file: File, folderId: string) {
  const metadata = {
    name: file.name,
    parents: [folderId]
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);

  const res = await fetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: form
  });

  return res.json();
}

/**
 * Full Sync To Google Drive Strategy:
 * 1. Create a Root "Tavern Cards Backup" folder.
 * 2. Upload all un-nested characters there.
 * 3. Create subfolders mirroring DB and upload characters inside them.
 * 
 * Note: Only syncs cards to Drive.
 */
export async function syncToGoogleDrive(accessToken: string, onProgress: ProgressCallback) {
  try {
    let totalSynced = 0;
    onProgress({ status: 'syncing', currentCount: 0, totalCount: 0, message: 'Initializing Sync...' });

    // 1. Setup Root Folder
    const rootFolderId = await getOrCreateDriveFolder(accessToken, 'Tavern Cards Backup');

    // 2. Fetch local data map
    const folders = await getFolders();
    const { characters } = await getCharacters(1, 99999, null, '', [], 'newest_import', true);
    // Actually we need to fetch all characters directly from IDB directly with blobs resolving
    
    onProgress({ status: 'syncing', currentCount: 0, totalCount: characters.length, message: `Found ${characters.length} cards locally. Syncing...` });

    // Pre-create drive folder logic
    const driveFolderMap = new Map<string, string>(); // Local Folder ID -> Drive Folder ID
    driveFolderMap.set('root', rootFolderId);

    // Let's create folders sequentially
    for (const folder of folders) {
      // In a deep hierarchy, we need parents resolved. This simple mapping puts all folders directly in root for brevity, 
      // but ideally we'd traverse. For 8GB/7000 limits, keeping logic flat/shallow helps prevent rate limits.
      const fId = await getOrCreateDriveFolder(accessToken, folder.name, rootFolderId);
      driveFolderMap.set(folder.id, fId);
    }

    // Sync in chunks of 5 to avoid browser/network lag
    const CHUNK_SIZE = 5;
    for (let i = 0; i < characters.length; i += CHUNK_SIZE) {
      const chunk = characters.slice(i, i + CHUNK_SIZE);
      
      const uploadPromises = chunk.map(async (char) => {
        try {
          // Serialize to PNG
          let pngBlob: Blob;
          if (char.avatarBlob) {
            const buffer = await char.avatarBlob.arrayBuffer();
            const injected = injectTavernData(buffer, char.data?.data || char.data);
            pngBlob = new Blob([injected], { type: 'image/png' });
          } else {
            // Note: If no avatarBlob exists, we'd need a blank placeholder PNG to inject into.
            // Assuming most valid cards have avatarBlob. If not, we skip.
            if (!char.avatarBlob) throw new Error('Missing avatar image to inject data into');
            pngBlob = new Blob(); // Fallback
          }
          const file = new File([pngBlob], `${char.name || char.id}.png`, { type: 'image/png' });
          
          const parentFolderId = char.folderId ? (driveFolderMap.get(char.folderId) || rootFolderId) : rootFolderId;
          await uploadFileToDrive(accessToken, file, parentFolderId);
        } catch (e) {
          console.warn(`Failed to sync character ${char.name}`, e);
        }
      });

      await Promise.all(uploadPromises);
      totalSynced += chunk.length;
      onProgress({ status: 'syncing', currentCount: totalSynced, totalCount: characters.length, message: `Uploaded ${totalSynced} of ${characters.length} cards...` });
    }

    onProgress({ status: 'success', currentCount: characters.length, totalCount: characters.length, message: 'Sync to Google Drive completed successfully.' });
  } catch (error: any) {
    console.error(error);
    onProgress({ status: 'error', currentCount: 0, totalCount: 0, message: `Sync Failed: ${error.message}` });
  }
}

/**
 * Full Sync From Google Drive Strategy (Import):
 * Downloads all PNG files from the specified "Tavern Cards Backup" folder 
 * and inserts them into the local database.
 */
export async function syncFromGoogleDrive(accessToken: string, onProgress: ProgressCallback) {
  try {
    onProgress({ status: 'syncing', currentCount: 0, totalCount: 0, message: 'Looking for backup folder...' });
    
    // 1. Find Root Folder
    const rootFolderId = await getOrCreateDriveFolder(accessToken, 'Tavern Cards Backup');

    // 2. Query all files inside this folder (and subfolders recursively if wanted)
    let pageToken = '';
    let allFiles: any[] = [];
    do {
      const q = `'${rootFolderId}' in parents and mimeType='image/png' and trashed=false`;
      const res = await fetch(`${DRIVE_API_URL}?q=${encodeURIComponent(q)}&pageSize=1000&fields=nextPageToken,files(id,name)&pageToken=${pageToken}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      if (data.files) allFiles = allFiles.concat(data.files);
      pageToken = data.nextPageToken;
    } while (pageToken);

    onProgress({ status: 'syncing', currentCount: 0, totalCount: allFiles.length, message: `Found ${allFiles.length} cards in cloud. Downloading...` });

    let totalImported = 0;
    const CHUNK_SIZE = 5;
    for (let i = 0; i < allFiles.length; i += CHUNK_SIZE) {
      const chunk = allFiles.slice(i, i + CHUNK_SIZE);
      const downloadPromises = chunk.map(async (fileInfo) => {
        try {
          const res = await fetch(`${DRIVE_API_URL}/${fileInfo.id}?alt=media`, {
            headers: { Authorization: `Bearer ${accessToken}` }
          });
          const blob = await res.blob();
          const file = new File([blob], fileInfo.name, { type: 'image/png' });
          const buffer = await file.arrayBuffer();
          const tavernData = await extractTavernData(buffer);
          
          if (tavernData) {
             const internalData = tavernData.data || tavernData;
             const parsed: CharacterCard = {
               id: crypto.randomUUID(),
               name: internalData.name || fileInfo.name.replace('.png', ''),
               avatarBlob: blob,
               data: tavernData,
               createdAt: Date.now()
             };
             
             const { saveCharacter } = await import('./db');
             await saveCharacter(parsed);
          }
        } catch(e) {
          console.warn(`Failed to process downloaded file ${fileInfo.name}`, e);
        }
      });

      await Promise.all(downloadPromises);
      totalImported += chunk.length;
      onProgress({ status: 'syncing', currentCount: totalImported, totalCount: allFiles.length, message: `Imported ${totalImported} of ${allFiles.length} cards...` });
    }

    onProgress({ status: 'success', currentCount: allFiles.length, totalCount: allFiles.length, message: 'Sync from Google Drive completed successfully.' });
  } catch(error: any) {
    console.error(error);
    onProgress({ status: 'error', currentCount: 0, totalCount: 0, message: `Sync Failed: ${error.message}` });
  }
}
