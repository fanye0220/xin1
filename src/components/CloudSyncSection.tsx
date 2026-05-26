import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Cloud, UploadCloud, DownloadCloud, AlertCircle, X, CheckCircle2, Loader2, Key } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, User } from 'firebase/auth';
import { syncToGoogleDrive, syncFromGoogleDrive, SyncProgress } from '../lib/driveSync';
import firebaseConfig from '../../firebase-applet-config.json'; // The stub

export function CloudSyncSection({ onClose }: { onClose: () => void }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [progress, setProgress] = useState<SyncProgress>({ status: 'idle', currentCount: 0, totalCount: 0, message: '' });
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [customApiKey, setCustomApiKey] = useState('');

  // We only initialize Firebase when they attempt login to allow entering custom details
  
  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      // Setup dynamic firebase config using stub or the custom API key if provided
      const configObj = {
        ...firebaseConfig,
        apiKey: customApiKey || firebaseConfig.apiKey
      };
      
      const app = initializeApp(configObj);
      const auth = getAuth(app);
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/drive.file');

      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setAccessToken(credential.accessToken);
        setUser(result.user);
      } else {
        throw new Error('Failed to obtain Google access token');
      }
    } catch (e: any) {
      console.error(e);
      if (e.code === 'auth/invalid-api-key') {
        setProgress({ status: 'error', currentCount: 0, totalCount: 0, message: '请在上方输入有效的 Firebase API Key 才能完成云端同步的授权。' });
      } else {
        setProgress({ status: 'error', currentCount: 0, totalCount: 0, message: e.message });
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const doSyncUp = async () => {
    if (!accessToken) return;
    await syncToGoogleDrive(accessToken, setProgress);
  };

  const doSyncDown = async () => {
    if (!accessToken) return;
    await syncFromGoogleDrive(accessToken, setProgress);
  };

  return (
    <div className="flex-1 overflow-y-auto hide-scrollbar bg-slate-900 border-l border-white/10 p-6 sm:p-8 flex flex-col">
      <div className="flex items-center justify-between mb-8 max-w-4xl mx-auto w-full">
        <h2 className="text-2xl font-bold text-white flex items-center gap-3">
          <Cloud className="w-6 h-6 text-blue-400" />
          Google Drive 云同步
        </h2>
        <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition">
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="flex-1 max-w-4xl mx-auto w-full flex flex-col gap-6">
        <div className="bg-slate-800/50 rounded-2xl p-6 border border-white/10">
          {!user ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Cloud className="w-16 h-16 text-slate-600 mb-4" />
              <h3 className="text-xl font-bold mb-2">连接至 Google Drive</h3>
              <p className="text-slate-400 max-w-md mb-8">
                由于部分基础架构限制，需要提供 Firebase API Key 以完成 OAuth 授权，登入后可管理您的所有角色卡并防止丢失。(若已有后台配置可直接点击登录)
              </p>
              
              <div className="flex flex-col w-full max-w-sm gap-4 mb-4">
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={customApiKey}
                    onChange={(e) => setCustomApiKey(e.target.value)}
                    placeholder="可选：输入 Firebase API Key..."
                    className="w-full bg-slate-900 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>

                <button
                  onClick={handleLogin}
                  disabled={isLoggingIn}
                  className="flex items-center justify-center gap-3 bg-white text-slate-900 py-3 px-6 rounded-xl font-bold hover:bg-slate-200 transition shadow-lg shadow-white/5 disabled:opacity-50"
                >
                  {isLoggingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />}
                  使用 Google 账号登录
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col h-full">
              <div className="flex items-center gap-4 mb-8 pb-6 border-b border-white/10">
                <img src={user.photoURL || ''} alt="avatar" className="w-12 h-12 rounded-full border-2 border-blue-500/30" />
                <div>
                  <h3 className="font-bold text-lg">{user.displayName}</h3>
                  <p className="text-slate-400 text-sm">{user.email}</p>
                </div>
                <div className="ml-auto bg-green-500/20 text-green-400 px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  已连接
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                <button 
                  onClick={doSyncUp}
                  disabled={progress.status === 'syncing'}
                  className="flex flex-col items-center gap-3 p-6 bg-blue-500/10 border border-blue-500/20 rounded-2xl hover:bg-blue-500/20 transition group disabled:opacity-50"
                  title="上传所有角色卡至 Google Drive"
                >
                  <UploadCloud className="w-10 h-10 text-blue-400 group-hover:-translate-y-1 transition" />
                  <div className="text-center">
                    <div className="font-bold mb-1">同步到云端</div>
                    <div className="text-xs text-slate-400">将本地卡片备份至 Drive</div>
                  </div>
                </button>

                <button 
                  onClick={doSyncDown}
                  disabled={progress.status === 'syncing'}
                  className="flex flex-col items-center gap-3 p-6 bg-purple-500/10 border border-purple-500/20 rounded-2xl hover:bg-purple-500/20 transition group disabled:opacity-50"
                  title="从 Google Drive 下载所有卡片至本地"
                >
                  <DownloadCloud className="w-10 h-10 text-purple-400 group-hover:translate-y-1 transition" />
                  <div className="text-center">
                    <div className="font-bold mb-1">下载到本地</div>
                    <div className="text-xs text-slate-400">恢复 Drive 中的卡片数据</div>
                  </div>
                </button>
              </div>

              {progress.status !== 'idle' && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className={`p-4 rounded-xl border ${
                    progress.status === 'syncing' ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' :
                    progress.status === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-500' :
                    'bg-green-500/10 border-green-500/20 text-green-400'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-2 opacity-90">
                    {progress.status === 'syncing' && <Loader2 className="w-4 h-4 animate-spin" />}
                    {progress.status === 'error' && <AlertCircle className="w-4 h-4" />}
                    {progress.status === 'success' && <CheckCircle2 className="w-4 h-4" />}
                    <span className="text-sm font-medium">{progress.message}</span>
                  </div>
                  
                  {progress.status === 'syncing' && progress.totalCount > 0 && (
                    <div className="w-full bg-black/20 rounded-full h-1.5 mt-2">
                       <div 
                        className="bg-current h-full rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.round((progress.currentCount / progress.totalCount) * 100))}%` }}
                       />
                    </div>
                  )}
                </motion.div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
