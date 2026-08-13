import { useState, useEffect } from 'react';
import { Cloud, Download, Upload, Trash2, Github, Loader2, Search } from 'lucide-react';
import { listCloudCharacters, downloadCloudCharacter, deleteCloudCharacter } from '../lib/cloudDrive';
import { getCachedMeta, saveCharacter, getFolders, saveFolder } from '../lib/db';
import { initAuth, googleSignIn, logout, getAccessToken, listBackupsFromDrive, deleteBackupFromDrive, triggerManualBackup, triggerRestore, onSyncStateChange, SyncState } from '../lib/drive';

export function CloudSyncTab() {
  const [needsAuth, setNeedsAuth] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  
  const [backups, setBackups] = useState<any[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);
  
  const [actionFileId, setActionFileId] = useState<string | null>(null);
  const [syncInfo, setSyncInfo] = useState<SyncState>({ isActive: false, taskName: '', message: '', isError: false, completed: false });

    const [activeTab, setActiveTab] = useState<'backup' | 'cloud_drive'>('backup');
  const [cloudChars, setCloudChars] = useState<any[]>([]);
  const [isLoadingCloud, setIsLoadingCloud] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [searchCloudQuery, setSearchCloudQuery] = useState("");

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

  
  const handleDownloadCloudChar = async (fileId: string, charName: string, fileName: string, appProperties?: any) => {
    if (!token) return;
    setDownloadingId(fileId);
    try {
        const { jsonData, avatarBlob, studioMeta } = await downloadCloudCharacter(token, fileId, fileName, (msg) => console.log(msg));
        const existingChars = await getCachedMeta();
        const extractedName = jsonData.name || jsonData.data?.name || charName;
        const existing = existingChars.find(c => c.name?.trim() === extractedName?.trim());
        
        let targetId: string = crypto.randomUUID();
        let folderId = undefined;
        let createTime = Date.now();
        
        if (existing) {
            targetId = existing.id;
            folderId = existing.folderId;
            createTime = existing.createdAt || Date.now();
        }
        
        const mergedMeta = { ...studioMeta, ...appProperties };
        if (!existing && mergedMeta?.folderPath) {
           const allFolders = await getFolders();
           const parts = mergedMeta.folderPath.split('/');
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

        if (mergedMeta?.createdAt) {
           createTime = parseInt(mergedMeta.createdAt as string) || mergedMeta.createdAt;
        }
        
        jsonData.id = targetId;
        
        const charToSave: any = {
            id: targetId,
            name: extractedName,
            data: jsonData,
            createdAt: createTime,
            folderId,
            avatarHistory: []
        };
        
        if (avatarBlob) {
            charToSave.avatarBlob = avatarBlob;
        }
        
        await saveCharacter(charToSave);
        window.dispatchEvent(new CustomEvent('charactersUpdated'));
        alert(`「${charToSave.name}」已成功下载至本地！`);
    } catch (err: any) {
        alert("下载失败: " + err.message);
    } finally {
        setDownloadingId(null);
    }
  };
const handleDeleteCloudChar = async (fileId: string, name: string) => {
      if (!token) return;
      if (!window.confirm(`确定要从云盘彻底删除「${name}」吗？`)) return;
      try {
          await deleteCloudCharacter(token, fileId);
          setCloudChars(prev => prev.filter(c => c.id !== fileId));
      } catch (err: any) {
          alert("删除失败: " + err.message);
      }
  };

  useEffect(() => {
    const unsubDrive = initAuth(
      (u, t) => {
        setUser(u);
        setToken(t);
        setNeedsAuth(false);
        loadBackups(t);
      },
      () => {
        setNeedsAuth(true);
        setUser(null);
        setToken(null);
        setBackups([]);
      }
    );
    const unsubSync = onSyncStateChange(setSyncInfo);
    return () => {
      unsubDrive();
      unsubSync();
    };
  }, []);

  useEffect(() => {
    // Refresh backups list when manual backup completes successfully
    if (syncInfo.completed && syncInfo.taskName === '手动备份') {
      if (token) loadBackups(token);
    }
  }, [syncInfo.completed, syncInfo.taskName, token]);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setToken(result.accessToken);
        setUser(result.user);
        setNeedsAuth(false);
        loadBackups(result.accessToken);
      }
    } catch (err: any) {
      console.error('Login failed:', err);
      alert('登录失败: ' + err.message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await logout();
  };

  const loadBackups = async (t: string) => {
    setIsLoadingBackups(true);
    try {
      const list = await listBackupsFromDrive(t);
      setBackups(list);
    } catch (err: any) {
      console.error('List backups failed:', err);
    } finally {
      setIsLoadingBackups(false);
    }
  };

  const handleUploadBackup = () => {
    if (!token) return;
    try {
      triggerManualBackup(token);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDownloadBackup = (fileId: string) => {
    if (!token) return;
    const confirm = window.confirm("确定要恢复该备份吗？\n\n注意：云端备份下载后会直接合并到你当前的数据中，重名卡片会被自动覆盖更新。");
    if (!confirm) return;

    setActionFileId(fileId);
    try {
      triggerRestore(token, fileId);
    } catch (err: any) {
      alert("恢复失败: " + err.message);
      setActionFileId(null);
    }
  };

  const handleDeleteBackup = async (fileId: string) => {
    if (!token) return;
    if (!window.confirm("确定要永久删除该备份吗？此操作无法恢复！")) return;

    setActionFileId(fileId);
    try {
      await deleteBackupFromDrive(token, fileId);
      await loadBackups(token);
    } catch (err: any) {
      alert("删除失败: " + err.message);
    } finally {
      setActionFileId(null);
    }
  };

  const formatSize = (bytes: string | number) => {
    const b = Number(bytes);
    if (!b || isNaN(b)) return '0 B';
    const mb = b / (1024 * 1024);
    return mb.toFixed(2) + ' MB';
  };

  if (needsAuth) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center mb-2">
          <Cloud className="w-8 h-8 text-blue-400" />
        </div>
        <h3 className="text-lg font-medium text-white">Google Drive 云端备份</h3>
        <p className="text-sm text-white/50 max-w-xs">
          连接你的 Google 账号，将所有角色卡片、对话记录安全地备份到你的私人网盘中。
        </p>
        <button
          onClick={handleLogin}
          disabled={isLoggingIn}
          className="gsi-material-button mt-4 bg-white text-black px-4 py-2 rounded-xl flex items-center justify-center gap-3 disabled:opacity-50 transition hover:bg-gray-100 font-medium"
        >
          {isLoggingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : (
            <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-5 h-5">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
              <path fill="none" d="M0 0h48v48H0z"></path>
            </svg>
          )}
          Sign in with Google
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Account Info */}
      <div className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl">
        <div className="flex items-center gap-3">
          {user?.photoURL ? (
            <img src={user.photoURL} alt="Avatar" className="w-10 h-10 rounded-full" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
              <Cloud className="w-5 h-5 text-blue-400" />
            </div>
          )}
          <div>
            <div className="text-sm font-medium text-white">{user?.displayName || '已连接账号'}</div>
            <div className="text-xs text-white/50">{user?.email}</div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="text-xs px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 transition"
        >
          退出登录
        </button>
      </div>

      <div className="flex bg-black/20 p-1 rounded-xl mb-6">
        <button
          onClick={() => setActiveTab('backup')}
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition ${activeTab === 'backup' ? 'bg-white/10 text-white shadow-sm' : 'text-white/50 hover:text-white/80 hover:bg-white/5'}`}
        >
          完整备份库
        </button>
        <button
          onClick={() => setActiveTab('cloud_drive')}
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition ${activeTab === 'cloud_drive' ? 'bg-white/10 text-white shadow-sm' : 'text-white/50 hover:text-white/80 hover:bg-white/5'}`}
        >
          云端卡库
        </button>
      </div>

      {activeTab === 'backup' && (
        <div className="space-y-6">
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
        </div>
      )}

      {activeTab === 'cloud_drive' && (
        <div className="space-y-6">
          
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
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
                {cloudChars.filter(char => {
                  if (!searchCloudQuery) return true;
                  const charName = char.appProperties?.charName || char.name?.replace(/\\.(zip|png|json|webp|jpg)$/i, '') || '';
                  return charName.toLowerCase().includes(searchCloudQuery.toLowerCase());
                }).map(char => {
                  const charName = char.appProperties?.charName || char.name?.replace(/\\.(zip|png|json|webp|jpg)$/i, '');
                  return (
                    <div key={char.id} className="relative group rounded-xl overflow-hidden bg-white/5 border border-white/10 flex flex-col h-auto">
                      <div className="relative aspect-[3/4] overflow-hidden bg-black/40">
                        {char.thumbnailLink ? (
                          
                          <>
                            <img 
                              src={char.thumbnailLink} 
                              alt={charName} 
                              className="w-full h-full object-cover group-hover:scale-105 transition duration-500" 
                              referrerPolicy="no-referrer" 
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                const fallback = e.currentTarget.nextElementSibling;
                                if (fallback) fallback.classList.remove('hidden');
                              }}
                            />
                            <div className="w-full h-full items-center justify-center hidden bg-black/40">
                              <Cloud className="w-8 h-8 text-white/20" />
                            </div>
                          </>

                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Cloud className="w-8 h-8 text-white/20" />
                          </div>
                        )}
                        
                        {char.appProperties?.cardType && char.appProperties.cardType !== 'character' && (
                          <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 backdrop-blur-md rounded-md text-[10px] font-medium text-white/90 border border-white/10 uppercase">
                            {char.appProperties.cardType === 'worldbook' ? '世界书' :
                             char.appProperties.cardType === 'qr' ? '快速回复' :
                             char.appProperties.cardType === 'preset' ? '预设' :
                             char.appProperties.cardType === 'theme' ? '主题' :
                             char.appProperties.cardType === 'script' ? '脚本' : char.appProperties.cardType}
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-60 group-hover:opacity-80 transition pointer-events-none" />

                        
                        <div className="absolute inset-0 items-center justify-center gap-3 opacity-0 lg:group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-sm hidden lg:flex">
                           <button 
                             onClick={() => handleDownloadCloudChar(char.id, charName, char.name, char.appProperties)}
                             disabled={downloadingId === char.id}
                             title="下载卡片"
                             className="p-3 rounded-full bg-blue-500 hover:bg-blue-400 text-white transition transform hover:scale-105 active:scale-95 shadow-lg disabled:opacity-50"
                           >
                             {downloadingId === char.id ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                           </button>
                           <button
                             onClick={() => handleDeleteCloudChar(char.id, charName)}
                             disabled={downloadingId === char.id}
                             title="删除卡片"
                             className="p-3 rounded-full bg-red-500 hover:bg-red-400 text-white transition transform hover:scale-105 active:scale-95 shadow-lg disabled:opacity-50"
                           >
                             <Trash2 className="w-5 h-5" />
                           </button>
                        </div>
                      </div>
                      
                      <div className="p-2 sm:p-3 bg-black/40 border-t border-white/10 flex flex-col justify-between flex-1">
                        <div>
                           <h4 className="font-medium text-xs sm:text-sm text-white/90 truncate">{charName}</h4>
                           <p className="text-[10px] sm:text-xs text-white/50 mt-0.5 truncate">
                             {char.size ? (parseInt(char.size) / 1024 / 1024).toFixed(2) + ' MB' : '未知大小'}
                           </p>
                        </div>
                        <div className="flex items-center gap-1.5 sm:gap-2 mt-2 lg:hidden">
                           <button 
                             onClick={() => handleDownloadCloudChar(char.id, charName, char.name, char.appProperties)}
                             disabled={downloadingId === char.id}
                             className="flex-1 py-1 sm:py-1.5 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center gap-1 active:bg-blue-500/40 transition disabled:opacity-50"
                           >
                             {downloadingId === char.id ? <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" /> : <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                             <span className="text-[10px] sm:text-xs font-medium">下载</span>
                           </button>
                           <button
                             onClick={() => handleDeleteCloudChar(char.id, charName)}
                             disabled={downloadingId === char.id}
                             className="p-1 sm:p-1.5 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 flex items-center justify-center active:bg-red-500/40 transition disabled:opacity-50"
                           >
                             <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                           </button>
                        </div>
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
