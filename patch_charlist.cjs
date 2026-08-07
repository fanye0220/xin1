const fs = require('fs');
let content = fs.readFileSync('src/components/CharacterList.tsx', 'utf8');

if (!content.includes("import { uploadCharacterToCloud }")) {
  content = content.replace("import { getSafeFilename", "import { uploadCharacterToCloud } from '../lib/cloudDrive';\nimport { getSafeFilename");
}
if (!content.includes("getAccessToken")) {
  content = content.replace("import { backupToDrive", "import { backupToDrive, getAccessToken");
} else if (!content.includes("getAccessToken") && content.includes("import { getFolders")) {
    content = content.replace("import { getFolders", "import { getAccessToken } from '../lib/drive';\nimport { getFolders");
}

const batchCloudBackupFunc = `
  const handleBatchCloudBackup = async () => {
    if (selectedIds.size === 0) return;
    
    const token = await import('../lib/drive').then(m => m.getAccessToken());
    if (!token) {
      alert("请先前往「云端同步」页面登录 Google 账号。");
      return;
    }
    
    try {
      setExporting(true);
      const allFolders = await getFolders();
      const charIdsToExport = new Set();
      
      for (const id of Array.from(selectedIds)) {
        const folder = allFolders.find(f => f.id === id);
        if (folder) {
          const addFolderChars = async (fId) => {
            const { characters: fc } = await getCharacters(1, 10000, fId);
            fc.forEach(c => charIdsToExport.add(c.id));
            const subs = allFolders.filter(f => f.parentId === fId);
            for (const sub of subs) {
              await addFolderChars(sub.id);
            }
          };
          await addFolderChars(folder.id);
        } else {
          charIdsToExport.add(id);
        }
      }

      const charsArray = Array.from(charIdsToExport);
      let success = 0;
      
      for (let i = 0; i < charsArray.length; i++) {
         setExportMessage(\`正在同步至云端 (\${i + 1}/\${charsArray.length})...\`);
         await uploadCharacterToCloud(token, charsArray[i]);
         success++;
         setExportProgress(((i + 1) / charsArray.length) * 100);
      }
      alert(\`云端备份成功！共备份 \${success} 个角色资料。\`);
    } catch (err) {
      console.error(err);
      alert("备份失败: " + err.message);
    } finally {
      setExporting(false);
      setSelectionMode(false);
      setSelectedIds(new Set());
    }
  };
`;

if (!content.includes("const handleBatchCloudBackup")) {
  content = content.replace("const handleBatchDelete =", batchCloudBackupFunc + "\n\n  const handleBatchDelete =");
}

const cloudButton = `
                <div className="w-px h-8 bg-white/10 shrink-0" />
                <button
                  onClick={handleBatchCloudBackup}
                  disabled={selectedIds.size === 0}
                  className="flex flex-col items-center gap-1 px-4 py-2 rounded-full hover:bg-blue-500/10 text-white/70 hover:text-blue-400 transition disabled:opacity-50 group shrink-0"
                >
                  <div className="p-2 rounded-full bg-white/5 group-hover:bg-blue-400/20 transition">
                    <Cloud className="w-5 h-5" />
                  </div>
                  <span className="font-medium text-[10px]">传云盘</span>
                </button>`;

if (!content.includes("传云盘")) {
  content = content.replace(
    `<div className="w-px h-8 bg-white/10 shrink-0" />
                <button
                  onClick={handleBatchExport}`,
    cloudButton + `\n                <div className="w-px h-8 bg-white/10 shrink-0" />\n                <button\n                  onClick={handleBatchExport}`
  );
}

fs.writeFileSync('src/components/CharacterList.tsx', content);
