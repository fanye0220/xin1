const fs = require('fs');
let content = fs.readFileSync('src/components/CloudSyncTab.tsx', 'utf8');

// I will completely replace the whole `{activeTab === 'backup' && ...` up to the end of the file.

const marker = "{activeTab === 'backup' && (";
const idx = content.indexOf(marker);
if (idx !== -1) {
    const endStr = content.substring(0, idx);
    const correctEnding = `
      {activeTab === 'backup' && (
        <>
          {/* Action Area */}
          <div className="flex flex-col gap-3">
            <label className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl cursor-pointer hover:bg-white/10 transition">
              <div>
                <div className="text-sm font-medium text-white">挂机自动同步</div>
                <div className="text-xs text-white/50 mt-1">
                  开启后，网页打开期间每隔30分钟自动静默覆盖备份到云端。
                </div>
              </div>
              <div className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={localStorage.getItem('auto_backup_enabled') === 'true'}
                  onChange={(e) => {
                    localStorage.setItem('auto_backup_enabled', e.target.checked ? 'true' : 'false');
                    setActionFileId(actionFileId === 'refresh' ? null : 'refresh');
                  }}
                />
                <div className="w-11 h-6 toggle-track toggle-knob peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:border after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
              </div>
            </label>

            <button
              onClick={handleUploadBackup}
              disabled={syncInfo.isActive}
              className="w-full py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-medium flex justify-center items-center gap-2 transition disabled:opacity-50"
            >
              {syncInfo.isActive && syncInfo.taskName === '手动备份' ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>请求已发送...</span>
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5" />
                  创建并上传新备份
                </>
              )}
            </button>
          </div>

          {/* Backup List */}
          <div className="p-4 bg-white/5 border border-white/10 rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-white/80">历史备份档案</h4>
              <button onClick={() => {if(token) loadBackups(token)}} className="text-xs text-blue-400 hover:text-blue-300 transition px-2 py-1 bg-blue-500/10 rounded-md">
                刷新
              </button>
            </div>
            
            {isLoadingBackups ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-6 h-6 animate-spin text-white/30" />
              </div>
            ) : backups.length === 0 ? (
              <div className="text-center py-8 text-sm text-white/40 bg-black/20 rounded-lg">
                暂无备份记录
              </div>
            ) : (
              <div className="space-y-2">
                {backups.map(b => (
                  <div key={b.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-black/40 border border-white/5 rounded-xl group hover:border-white/10 transition gap-3 sm:gap-4 w-full">
                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-2">
                         <div className="text-sm text-white font-medium truncate min-w-0 flex-shrink" title={b.name}>{b.name}</div>
                         <span className="text-xs text-white/40 flex-shrink-0">{formatSize(b.size)}</span>
                      </div>
                      <div className="text-xs text-white/50 w-full">
                        {new Date(b.createdTime).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 justify-end sm:opacity-0 sm:group-hover:opacity-100 transition shrink-0 border-t sm:border-t-0 border-white/5 pt-2 sm:pt-0">
                      <button 
                        title="下载并恢复到本应用"
                        disabled={syncInfo.isActive || actionFileId === b.id}
                        onClick={() => handleDownloadBackup(b.id)}
                        className="flex-1 sm:flex-none flex items-center justify-center py-1.5 px-3 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 hover:text-blue-400 text-blue-400/80 transition disabled:opacity-50"
                      >
                        {syncInfo.isActive && syncInfo.taskName === '恢复数据' && actionFileId === b.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        <span className="text-xs ml-1 sm:hidden">恢复</span>
                      </button>
                      <button 
                        title="删除"
                        disabled={syncInfo.isActive || actionFileId === b.id}
                        onClick={() => handleDeleteBackup(b.id)}
                        className="flex-1 sm:flex-none flex items-center justify-center py-1.5 px-3 rounded-lg bg-red-500/10 hover:bg-red-500/20 hover:text-red-400 text-red-400/80 transition disabled:opacity-50"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span className="text-xs ml-1 sm:hidden">删除</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'cloud_drive' && (
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
    </div>
  );
}
`;
    fs.writeFileSync('src/components/CloudSyncTab.tsx', endStr + correctEnding);
}
