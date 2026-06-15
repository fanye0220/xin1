import { useState, useEffect } from 'react';
import { Cloud, Download, Upload, Trash2, Github, Loader2 } from 'lucide-react';
import { initAuth, googleSignIn, logout, getAccessToken, listBackupsFromDrive, uploadBackupToDrive, downloadBackupFromDrive, deleteBackupFromDrive } from '../lib/drive';

export function CloudSyncTab() {
  const [needsAuth, setNeedsAuth] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  
  const [backups, setBackups] = useState<any[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  
  const [actionFileId, setActionFileId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = initAuth(
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
    return () => unsubscribe();
  }, []);

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

  const handleUploadBackup = async () => {
    if (!token) return;
    setIsUploading(true);
    setUploadProgress('准备备份...');
    try {
      await uploadBackupToDrive(token, (msg) => setUploadProgress(msg));
      await loadBackups(token);
      alert('备份成功！');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsUploading(false);
      setUploadProgress('');
    }
  };

  const handleDownloadBackup = async (fileId: string) => {
    if (!token) return;
    const confirm = window.confirm("确定要下载该备份吗？\n\n请注意：本工具目前为整体压缩包下载，下载后你需要手动在主页使用左侧的【导入】按钮引入压缩包中的数据。");
    if (!confirm) return;

    setActionFileId(fileId);
    try {
      const blob = await downloadBackupFromDrive(token, fileId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `GoogleDrive_Backup_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert("下载失败: " + err.message);
    } finally {
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

      {/* Action Area */}
      <div className="flex flex-col gap-3">
        <button
          onClick={handleUploadBackup}
          disabled={isUploading}
          className="w-full py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-medium flex justify-center items-center gap-2 transition disabled:opacity-50"
        >
          {isUploading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>{uploadProgress || '处理中...'}</span>
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
      <div className="space-y-3 pt-4 border-t border-white/10">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-white/80">历史备份档案</h4>
          <button onClick={() => {if(token) loadBackups(token)}} className="text-xs text-blue-400 hover:text-blue-300">
            刷新
          </button>
        </div>
        
        {isLoadingBackups ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-6 h-6 animate-spin text-white/30" />
          </div>
        ) : backups.length === 0 ? (
          <div className="text-center py-6 text-sm text-white/40">
            暂无备份记录
          </div>
        ) : (
          <div className="space-y-2">
            {backups.map(b => (
              <div key={b.id} className="flex items-center justify-between p-3 bg-black/40 border border-white/5 rounded-xl group hover:border-white/10 transition">
                <div>
                  <div className="text-sm text-white font-medium truncate max-w-[180px]" title={b.name}>{b.name}</div>
                  <div className="text-xs text-white/40 flex gap-2">
                    <span>{new Date(b.createdTime).toLocaleString()}</span>
                    <span>{formatSize(b.size)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition">
                  <button 
                    title="下载到本地"
                    disabled={actionFileId === b.id}
                    onClick={() => handleDownloadBackup(b.id)}
                    className="p-2 rounded-lg bg-white/5 hover:bg-blue-500/20 hover:text-blue-400 text-white/60 transition disabled:opacity-50"
                  >
                    {actionFileId === b.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  </button>
                  <button 
                    title="删除"
                    disabled={actionFileId === b.id}
                    onClick={() => handleDeleteBackup(b.id)}
                    className="p-2 rounded-lg bg-white/5 hover:bg-red-500/20 hover:text-red-400 text-white/60 transition disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
