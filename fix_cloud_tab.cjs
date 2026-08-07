const fs = require('fs');
let content = fs.readFileSync('src/components/CloudSyncTab.tsx', 'utf8');

// Update imports
if (!content.includes("import { getFolders, saveFolder")) {
  content = content.replace("import { getCachedMeta, saveCharacter } from '../lib/db';", "import { getCachedMeta, saveCharacter, getFolders, saveFolder } from '../lib/db';");
}
if (!content.includes("import { Search }")) {
  content = content.replace("import { Plus, Download, Upload, Loader2, Cloud, Trash2 } from 'lucide-react';", "import { Plus, Download, Upload, Loader2, Cloud, Trash2, Search } from 'lucide-react';");
}

// Add state for search
if (!content.includes('const [searchCloudQuery, setSearchCloudQuery] = useState("");')) {
  content = content.replace('  const [downloadingId, setDownloadingId] = useState<string | null>(null);', '  const [downloadingId, setDownloadingId] = useState<string | null>(null);\n  const [searchCloudQuery, setSearchCloudQuery] = useState("");');
}

// Fix crossOrigin
content = content.replace(/crossOrigin="anonymous"/g, 'referrerPolicy="no-referrer"');

// Update download logic
const newDownloadLogic = `
  const handleDownloadCloudChar = async (fileId: string, charName: string, fileName: string) => {
    if (!token) return;
    setDownloadingId(fileId);
    try {
        const { jsonData, avatarBlob, studioMeta } = await downloadCloudCharacter(token, fileId, fileName, (msg) => console.log(msg));
        const existingChars = await getCachedMeta();
        const existing = existingChars.find(c => c.name?.trim() === jsonData.name?.trim());
        
        let targetId: string = crypto.randomUUID();
        let folderId = undefined;
        let createTime = Date.now();
        
        if (existing) {
            targetId = existing.id;
            folderId = existing.folderId;
            createTime = existing.createdAt || Date.now();
        }
        
        if (!existing && studioMeta?.folderPath) {
           const allFolders = await getFolders();
           const parts = studioMeta.folderPath.split('/');
           let currentParentId: string | undefined = undefined;
           for (const part of parts) {
               let found = allFolders.find(f => f.name === part && f.parentId === currentParentId);
               if (!found) {
                   const newFolder = {
                       id: crypto.randomUUID(),
                       name: part,
                       parentId: currentParentId,
                       createdAt: Date.now(),
                       updatedAt: Date.now(),
                       sortOrder: 0
                   };
                   await saveFolder(newFolder);
                   allFolders.push(newFolder);
                   currentParentId = newFolder.id;
               } else {
                   currentParentId = found.id;
               }
           }
           folderId = currentParentId;
        }

        if (studioMeta?.createdAt) {
           createTime = studioMeta.createdAt;
        }
        
        jsonData.id = targetId;
        
        const charToSave: any = {
            id: targetId,
            name: jsonData.name || charName,
            data: jsonData,
            createdAt: createTime,
            folderId,
            avatarHistory: []
        };
        
        if (avatarBlob) {
            charToSave.avatarBlob = avatarBlob;
        }
        
        await saveCharacter(charToSave);
        alert(\`「\${charToSave.name}」已成功下载至本地！\`);
    } catch (err: any) {
        alert("下载失败: " + err.message);
    } finally {
        setDownloadingId(null);
    }
  };
`;

const oldStart = content.indexOf('const handleDownloadCloudChar = async (fileId: string, charName: string)');
const oldEnd = content.indexOf('const handleDeleteCloudChar = async');
if (oldStart !== -1 && oldEnd !== -1) {
  content = content.substring(0, oldStart) + newDownloadLogic + content.substring(oldEnd);
}

// Add Search Input in UI and Filter
const searchInputUI = `
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <h3 className="text-lg font-semibold text-white/90">我的云端角色卡</h3>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-48">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-white/40" />
                </div>
                <input
                  type="text"
                  placeholder="搜索云端卡片..."
                  value={searchCloudQuery}
                  onChange={(e) => setSearchCloudQuery(e.target.value)}
                  className="block w-full pl-9 pr-3 py-1.5 border border-white/10 rounded-full bg-black/20 text-sm text-white placeholder-white/40 focus:outline-none focus:border-white/20 focus:bg-black/40 transition"
                />
              </div>
              <button
                onClick={() => { if(token) loadCloudChars(token); }}
                className="text-sm px-4 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-white/70 transition shrink-0"
              >
                刷新
              </button>
            </div>
          </div>
`;

content = content.replace(
`<div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white/90">我的云端角色卡</h3>
            <button
              onClick={() => { if(token) loadCloudChars(token); }}
              className="text-sm px-4 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-white/70 transition"
            >
              刷新
            </button>
          </div>`, searchInputUI
);

content = content.replace(
`{cloudChars.map(char => {`,
`{cloudChars.filter(char => {
                  if (!searchCloudQuery) return true;
                  const charName = char.appProperties?.charName || char.name?.replace('.zip', '') || '';
                  return charName.toLowerCase().includes(searchCloudQuery.toLowerCase());
                }).map(char => {`
);

content = content.replace(
`onClick={() => handleDownloadCloudChar(char.id, charName)}`,
`onClick={() => handleDownloadCloudChar(char.id, charName, char.name)}`
);


fs.writeFileSync('src/components/CloudSyncTab.tsx', content);
