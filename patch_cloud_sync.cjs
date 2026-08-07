const fs = require('fs');
let content = fs.readFileSync('src/components/CloudSyncTab.tsx', 'utf8');

// Imports
content = content.replace("import { initAuth,", "import { listCloudCharacters, downloadCloudCharacter, deleteCloudCharacter } from '../lib/cloudDrive';\nimport { getCachedMeta, saveCharacter } from '../lib/db';\nimport { initAuth,");

// States
const states = `  const [activeTab, setActiveTab] = useState<'backup' | 'cloud_drive'>('backup');
  const [cloudChars, setCloudChars] = useState<any[]>([]);
  const [isLoadingCloud, setIsLoadingCloud] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const loadCloudChars = async (t: string) => {
    setIsLoadingCloud(true);
    try {
        const list = await listCloudCharacters(t);
        setCloudChars(list);
    } catch (err: any) {
        console.error('List cloud chars failed:', err);
    } finally {
        setIsLoadingCloud(false);
    }
  };

  useEffect(() => {
    if (token && activeTab === 'cloud_drive') {
        loadCloudChars(token);
    }
  }, [token, activeTab]);

  const handleDownloadCloudChar = async (fileId: string, charName: string) => {
    if (!token) return;
    setDownloadingId(fileId);
    try {
        const { jsonData, avatarBlob } = await downloadCloudCharacter(token, fileId, (msg) => console.log(msg));
        const existingChars = await getCachedMeta();
        const existing = existingChars.find(c => c.name?.trim() === jsonData.name?.trim());
        
        let targetId = crypto.randomUUID();
        let folderId = undefined;
        let createTime = Date.now();
        
        if (existing) {
            targetId = existing.id;
            folderId = existing.folderId;
            createTime = existing.createdAt || Date.now();
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

  const handleDeleteCloudChar = async (fileId: string, name: string) => {
      if (!token) return;
      if (!window.confirm(\`确定要从云盘彻底删除「\${name}」吗？\`)) return;
      try {
          await deleteCloudCharacter(token, fileId);
          setCloudChars(prev => prev.filter(c => c.id !== fileId));
      } catch (err: any) {
          alert("删除失败: " + err.message);
      }
  };
`;

content = content.replace("useEffect(() => {", states + "\n  useEffect(() => {");

// UI modifications
const tabsUI = `
      <div className="flex bg-black/20 p-1 rounded-xl mb-6">
        <button
          onClick={() => setActiveTab('backup')}
          className={\`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition \${activeTab === 'backup' ? 'bg-white/10 text-white shadow-sm' : 'text-white/50 hover:text-white/80 hover:bg-white/5'}\`}
        >
          完整备份库
        </button>
        <button
          onClick={() => setActiveTab('cloud_drive')}
          className={\`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition \${activeTab === 'cloud_drive' ? 'bg-white/10 text-white shadow-sm' : 'text-white/50 hover:text-white/80 hover:bg-white/5'}\`}
        >
          云端卡库
        </button>
      </div>
`;

content = content.replace("      {/* Backup Controls */}", tabsUI + "\n      {activeTab === 'backup' && (\n        <>\n      {/* Backup Controls */}");
content = content.replace("        </div>\n\n        {/* Backups List */}", "        </div>\n\n        {/* Backups List */}");
content = content.replace("      </div>\n    </div>\n  );\n}", "        </>\n      )}\n\n" + 
`      {activeTab === 'cloud_drive' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white/90">我的云端角色卡</h3>
            <button
              onClick={() => { if(token) loadCloudChars(token); }}
              className="text-sm px-4 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-white/70 transition"
            >
              刷新
            </button>
          </div>
          
          <div className="bg-black/20 rounded-2xl p-4 border border-white/5 min-h-[300px]">
            {isLoadingCloud ? (
              <div className="flex flex-col items-center justify-center py-12 text-white/50">
                <Loader2 className="w-8 h-8 animate-spin mb-4" />
                <p>正在拉取云端卡库...</p>
              </div>
            ) : cloudChars.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-white/40">
                <Cloud className="w-12 h-12 mb-4 opacity-20" />
                <p>云端卡库空空如也</p>
                <p className="text-sm mt-2">在角色列表中勾选卡片即可上传至云盘</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
                {cloudChars.map(char => {
                  const charName = char.appProperties?.charName || char.name?.replace('.zip', '');
                  return (
                    <div key={char.id} className="relative group rounded-xl overflow-hidden bg-white/5 border border-white/10 aspect-[3/4] flex flex-col">
                      <div className="flex-1 relative overflow-hidden bg-black/40">
                        {char.thumbnailLink ? (
                          <img src={char.thumbnailLink} alt={charName} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" crossOrigin="anonymous" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Cloud className="w-8 h-8 text-white/20" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-60 group-hover:opacity-80 transition" />
                        
                        {/* Hover Actions */}
                        <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-sm">
                           <button 
                             onClick={() => handleDownloadCloudChar(char.id, charName)}
                             disabled={downloadingId === char.id}
                             className="p-2 rounded-full bg-blue-500/80 hover:bg-blue-500 text-white transition"
                           >
                             {downloadingId === char.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                           </button>
                           <button
                             onClick={() => handleDeleteCloudChar(char.id, charName)}
                             className="p-2 rounded-full bg-red-500/80 hover:bg-red-500 text-white transition"
                           >
                             <Trash2 className="w-4 h-4" />
                           </button>
                        </div>
                      </div>
                      
                      <div className="p-2 truncate text-center text-xs text-white/80 font-medium">
                        {charName}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
`
+ "      </div>\n    </div>\n  );\n}");

fs.writeFileSync('src/components/CloudSyncTab.tsx', content);
