/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CharacterList } from './components/CharacterList';
import { CharacterDetail } from './components/CharacterDetail';
import { ImportModal } from './components/ImportModal';
import { FolderSidebar } from './components/FolderSidebar';
import { TrashBin } from './components/TrashBin';
import { DuplicateDetector } from './components/DuplicateDetector';
import { AutoTagger } from './components/AutoTagger';
import { AIRecommender } from './components/AIRecommender';
import { SettingsModal } from './components/SettingsModal';
import { ChatViewer } from './components/ChatViewer';
import { migrateDatabase } from './lib/db';
import { useTaggerState } from './lib/taggerState';
import { Tag, Loader2, AlertCircle, Pause, X } from 'lucide-react';

function TaggerWidget({ onClick }: { onClick: () => void }) {
  const { isTagging, isPaused, progress, logs } = useTaggerState();
  const [errorToast, setErrorToast] = useState<string | null>(null);

  useEffect(() => {
    import('./lib/taggerState').then(({ taggerState }) => {
      taggerState.setErrorCallback((msg) => {
        setErrorToast(msg);
        setTimeout(() => setErrorToast(null), 5000);
      });
    });
  }, []);
  
  // Only show if tagging is active, paused, or there's a recent error
  const hasError = logs.some(l => l.status === 'failed');
  const shouldShow = isTagging || isPaused || (hasError && progress.current > 0 && progress.current < progress.total);

  return (
    <>
      <AnimatePresence>
        {errorToast && (
          <motion.div
            initial={{ opacity: 0, y: -50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -50, x: '-50%' }}
            className="fixed top-6 left-1/2 z-[100] bg-red-500 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3"
          >
            <AlertCircle className="w-5 h-5" />
            <span className="font-medium">{errorToast}</span>
            <button onClick={() => setErrorToast(null)} className="p-1 hover:bg-white/20 rounded-full transition">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {shouldShow && (
          <motion.div
            initial={{ opacity: 0, y: -50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -50, x: '-50%' }}
            onClick={onClick}
            className="fixed top-12 sm:top-20 left-1/2 z-50 bg-slate-800/90 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl p-3 sm:p-4 cursor-pointer hover:bg-slate-700/90 transition-colors w-[90%] max-w-[16rem] sm:w-72"
          >
            <div className="flex items-center gap-3 mb-2">
              {isPaused ? (
                <Pause className="w-5 h-5 text-yellow-400" />
              ) : hasError ? (
                <AlertCircle className="w-5 h-5 text-red-400" />
              ) : (
                <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
              )}
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-white">
                  {isPaused ? '自动打标已暂停' : hasError ? '自动打标遇到错误' : '正在后台打标...'}
                </h4>
                <p className="text-xs text-white/50">
                  进度: {progress.current} / {progress.total} (成功: {progress.success})
                </p>
              </div>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  import('./lib/taggerState').then(({ taggerState }) => taggerState.dismiss());
                }}
                className="p-1 hover:bg-white/20 rounded-full transition text-white/60 hover:text-white shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="w-full bg-black/40 rounded-full h-1.5 overflow-hidden">
              <div 
                className={`h-full transition-all duration-500 ${isPaused ? 'bg-yellow-500' : hasError ? 'bg-red-500' : 'bg-gradient-to-r from-purple-500 to-blue-500'}`}
                style={{ width: `${(progress.current / Math.max(1, progress.total)) * 100}%` }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

import { useExportState } from './lib/exportState';

function ExportWidget() {
  const { isExporting, progress, errorToast } = useExportState();
  const [isMinimized, setIsMinimized] = useState(false);

  useEffect(() => {
    if (isExporting && progress.current === 0 && progress.total === 0) {
      setIsMinimized(false);
    }
  }, [isExporting, progress.current, progress.total]);

  if (!isExporting && errorToast === null) return null;

  return (
    <>
      <AnimatePresence>
        {errorToast && (
          <motion.div
            initial={{ opacity: 0, y: -50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -50, x: '-50%' }}
            className="fixed top-6 left-1/2 z-[100] bg-red-500 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3"
          >
            <AlertCircle className="w-5 h-5" />
            <span className="font-medium">{errorToast}</span>
            <button onClick={() => import('./lib/exportState').then(({ exportState }) => exportState.setError(null))} className="p-1 hover:bg-white/20 rounded-full transition">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isExporting && (
          isMinimized ? (
            <motion.div
              initial={{ opacity: 0, y: 50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 50, scale: 0.9 }}
              onClick={() => setIsMinimized(false)}
              className="fixed bottom-6 right-6 z-[100] bg-slate-800/90 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl p-4 cursor-pointer hover:bg-slate-700/90 transition-colors flex items-center gap-4 w-72"
            >
              <Loader2 className="w-6 h-6 text-purple-400 animate-spin shrink-0" />
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-white truncate">批量导出中</h4>
                <p className="text-xs text-white/60 truncate">
                  {progress.phase} 
                  {progress.total > 0 && progress.phase.includes('生成') ? 
                    ` ${progress.current}%` : 
                    progress.total > 0 ? ` ${progress.current} / ${progress.total}` : ''
                  }
                </p>
                <div className="w-full bg-black/40 rounded-full h-1.5 mt-2 overflow-hidden border border-white/5">
                  <div 
                    className="h-full transition-all duration-300 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"
                    style={{ 
                      width: progress.total > 0 ? 
                        `${progress.phase.includes('生成') ? progress.current : (progress.current / progress.total) * 100}%` : 
                        '0%' 
                    }}
                  />
                </div>
              </div>
            </motion.div>
          ) : (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-slate-800/90 backdrop-blur-2xl rounded-3xl p-8 w-full max-w-sm border border-white/10 shadow-2xl flex flex-col items-center text-center"
              >
                <div className="w-16 h-16 rounded-2xl bg-purple-500/20 flex items-center justify-center mb-6 border border-purple-500/30 relative">
                  <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">批量导出中</h3>
                <p className="text-white/60 mb-6 font-medium bg-black/20 px-4 py-2 rounded-xl">
                  {progress.phase}
                  <br/>
                  {progress.total > 0 && progress.phase.includes('生成') ? 
                    `${progress.current}%` : 
                    progress.total > 0 ? `${progress.current} / ${progress.total}` : ''
                  }
                </p>
                <div className="w-full bg-black/40 rounded-full h-3 mb-2 overflow-hidden border border-white/10">
                  <motion.div 
                    className="bg-gradient-to-r from-purple-500 justify-center h-full to-pink-500 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ 
                      width: progress.total > 0 ? 
                        `${progress.phase.includes('生成') ? progress.current : (progress.current / progress.total) * 100}%` : 
                        '0%' 
                    }}
                  />
                </div>
                <p className="text-sm text-yellow-400/80 mt-4 bg-yellow-400/10 px-4 py-2 rounded-lg border border-yellow-400/20">
                  请勿关闭当前页面，这可能需要一些时间...
                </p>
                <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsMinimized(true);
                    }}
                    className="mt-4 px-4 py-2 hover:bg-white/10 rounded-full transition text-white/60 hover:text-white"
                  >
                    <span className="text-sm">缩小至后台运行</span>
                </button>
              </motion.div>
            </div>
          )
        )}
      </AnimatePresence>
    </>
  );
}

export default function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [globalChatViewerId, setGlobalChatViewerId] = useState<string | null>(null);
  
  const [isMigrating, setIsMigrating] = useState(true);
  const [migrationProgress, setMigrationProgress] = useState({ current: 0, total: 0 });

  useEffect(() => {
    migrateDatabase((current, total) => {
      setMigrationProgress({ current, total });
    }).then(() => {
      setIsMigrating(false);
    });
  }, []);

  if (isMigrating && migrationProgress.total > 0) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white p-6">
        <div className="w-16 h-16 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mb-6" />
        <h2 className="text-2xl font-bold mb-2">正在优化数据库...</h2>
        <p className="text-slate-400 mb-6 text-center max-w-md">
          检测到您有大量角色卡，系统正在进行底层存储优化以提升加载速度。这可能需要几分钟时间，请勿关闭页面。
        </p>
        <p className="font-mono text-purple-400 font-bold text-lg mb-2">
          {migrationProgress.current} / {migrationProgress.total}
        </p>
        <div className="w-full max-w-md bg-white/10 rounded-full h-3 overflow-hidden">
          <div 
            className="bg-gradient-to-r from-purple-500 to-pink-500 h-full transition-all duration-300"
            style={{ width: `${(migrationProgress.current / migrationProgress.total) * 100}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="font-sans antialiased text-white bg-slate-900 fixed inset-0 flex overflow-hidden">
      
      {/* Sidebar Drawer */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            />
            
            <FolderSidebar 
              selectedFolderId={selectedFolderId}
              onSelectFolder={(id) => {
                setSelectedFolderId(id);
                setSelectedCharId(null);
              }}
              onClose={() => setIsSidebarOpen(false)}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onFolderChanged={() => setRefreshKey(prev => prev + 1)}
            />
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div id="main-scroll-container" className="flex-1 relative overflow-y-auto flex flex-col w-full h-full">
        {selectedFolderId === 'trash' ? (
          <TrashBin onClose={() => { setSelectedFolderId(null); setRefreshKey(prev => prev + 1); }} />
        ) : selectedFolderId === 'duplicates' ? (
          <DuplicateDetector 
            onClose={() => { setSelectedFolderId(null); setRefreshKey(prev => prev + 1); }} 
            onSelectChar={setSelectedCharId}
          />
        ) : selectedFolderId === 'autotagger' ? (
          <AutoTagger onClose={() => { setSelectedFolderId(null); setRefreshKey(prev => prev + 1); }} onOpenSettings={() => setIsSettingsOpen(true)} />
        ) : selectedFolderId === 'recommender' ? (
          <AIRecommender 
            onClose={() => { setSelectedFolderId(null); setRefreshKey(prev => prev + 1); }} 
            onSelectChar={setSelectedCharId}
            onOpenSettings={() => setIsSettingsOpen(true)} 
          />
        ) : selectedFolderId === 'chatviewer' ? (
          <ChatViewer onClose={() => { setSelectedFolderId(null); setRefreshKey(prev => prev + 1); }} />
        ) : (
          <CharacterList
            key={selectedFolderId}
            folderId={selectedFolderId}
            onSelect={setSelectedCharId}
            onImport={() => setIsImportModalOpen(true)}
            onSelectFolder={(id) => {
              setSelectedFolderId(id);
              setSelectedCharId(null);
            }}
            onOpenSidebar={() => setIsSidebarOpen(true)}
            refreshTrigger={refreshKey}
          />
        )}

        <AnimatePresence>
          {selectedCharId && (
            <div className="absolute inset-0 z-50 bg-slate-900">
              <CharacterDetail
                id={selectedCharId}
                onBack={() => {
                  setSelectedCharId(null);
                  setRefreshKey(prev => prev + 1);
                }}
                onOpenChat={setGlobalChatViewerId}
              />
            </div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {globalChatViewerId && (
          <motion.div 
             className="fixed inset-0 z-[60] bg-slate-900 flex flex-col"
             initial={{ opacity: 0, scale: 0.95 }}
             animate={{ opacity: 1, scale: 1 }}
             exit={{ opacity: 0, scale: 0.95 }}
             transition={{ duration: 0.2 }}
          >
            <ChatViewer 
              initialChatId={globalChatViewerId} 
              singleMode={true}
              onClose={() => setGlobalChatViewerId(null)} 
            />
          </motion.div>
        )}
      </AnimatePresence>

      <ImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImported={() => setRefreshKey(prev => prev + 1)}
        folderId={selectedFolderId}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
      <ExportWidget />

      <AnimatePresence>
        {selectedFolderId !== 'autotagger' && (
          <TaggerWidget onClick={() => {
            setSelectedCharId(null);
            setIsSidebarOpen(false);
            setIsImportModalOpen(false);
            setIsSettingsOpen(false);
            setSelectedFolderId('autotagger');
          }} />
        )}
      </AnimatePresence>
    </div>
  );
}
