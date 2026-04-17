import { useEffect } from 'react';
import { ArrowLeft, Tag, Play, CheckCircle2, Loader2, AlertCircle, Pause, Square, PlayCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { taggerState, useTaggerState } from '../lib/taggerState';

export function AutoTagger({ onClose, onOpenSettings }: { onClose: () => void, onOpenSettings: () => void }) {
  const {
    isTagging,
    isPaused,
    progress,
    logs,
    untaggedCharacters,
    batchSize,
    apiKeyMissing
  } = useTaggerState();

  useEffect(() => {
    taggerState.loadCharacters();
  }, []);

  const togglePause = () => taggerState.togglePause();
  const stopTagging = () => taggerState.stopTagging();
  const startTagging = () => taggerState.startTagging();

  return (
    <div className="flex flex-col h-full bg-slate-900">
      <header className="sticky top-0 p-4 sm:p-6 flex items-center gap-4 bg-slate-900/80 backdrop-blur-xl border-b border-white/10 z-20">
        <button onClick={onClose} className="p-2 -ml-2 rounded-full hover:bg-white/10 transition">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
            批量自动打标
          </h1>
          <p className="text-sm text-white/50 mt-1">使用 AI 自动识别角色设定并生成标签 (支持后台运行)</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          
          {apiKeyMissing && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5 text-red-400 flex items-start gap-4 shadow-lg shadow-red-500/5">
              <AlertCircle className="w-6 h-6 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-lg">未配置 API</h3>
                <p className="text-sm opacity-80 mt-1 mb-3">使用自动打标功能需要配置自定义 API (OpenAI 格式接口)。</p>
                <button 
                  onClick={onOpenSettings}
                  className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg text-sm font-medium transition"
                >
                  去配置 API
                </button>
              </div>
            </div>
          )}

          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Tag className="w-5 h-5 text-purple-400" />
                  待打标角色
                </h2>
                <p className="text-sm text-white/50 mt-1">
                  共发现 {untaggedCharacters.length} 个未打标签的角色卡
                </p>
              </div>
              
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={batchSize}
                  onChange={(e) => taggerState.setBatchSize(Number(e.target.value))}
                  disabled={isTagging}
                  className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500 disabled:opacity-50 flex-1 sm:flex-none min-w-[140px]"
                >
                  <option value={10}>每次处理 10 个</option>
                  <option value={20}>每次处理 20 个</option>
                  <option value={50}>每次处理 50 个</option>
                  <option value={0}>处理全部</option>
                </select>
                
                {!isTagging ? (
                  <button
                    onClick={startTagging}
                    disabled={untaggedCharacters.length === 0}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-400 hover:to-blue-400 text-white rounded-xl font-medium transition-all shadow-lg shadow-purple-500/25 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    <Play className="w-5 h-5" />
                    开始打标
                  </button>
                ) : (
                  <div className="flex flex-1 sm:flex-none gap-2">
                    <button
                      onClick={togglePause}
                      className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium transition-all whitespace-nowrap ${
                        isPaused 
                          ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' 
                          : 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30'
                      }`}
                    >
                      {isPaused ? <PlayCircle className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
                      {isPaused ? '继续' : '暂停'}
                    </button>
                    <button
                      onClick={stopTagging}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-xl font-medium transition-all whitespace-nowrap"
                    >
                      <Square className="w-5 h-5" />
                      停止
                    </button>
                  </div>
                )}
              </div>
            </div>

            {(isTagging || logs.length > 0) && (
              <div className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">
                    进度: {progress.current} / {progress.total}
                  </span>
                  <div className="flex gap-4">
                    <span className="text-green-400">成功: {progress.success}</span>
                    <span className="text-red-400">失败: {progress.failed}</span>
                  </div>
                </div>
                
                <div className="w-full bg-black/40 rounded-full h-2 overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-500 ${isPaused ? 'bg-yellow-500' : 'bg-gradient-to-r from-purple-500 to-blue-500'}`}
                    style={{ width: `${(progress.current / Math.max(1, progress.total)) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {logs.length > 0 && (
            <div className="bg-black/40 border border-white/10 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-white/5">
                <h3 className="font-semibold text-white/90">处理日志</h3>
                {isPaused && <span className="text-xs font-medium text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded">已暂停 (遇到错误或手动暂停)</span>}
              </div>
              <div className="divide-y divide-white/5 max-h-[500px] overflow-y-auto">
                {logs.map((log) => (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    key={log.id} 
                    className="p-4 flex items-start gap-4 hover:bg-white/5 transition"
                  >
                    <div className="mt-1">
                      {log.status === 'pending' && <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />}
                      {log.status === 'success' && <CheckCircle2 className="w-5 h-5 text-green-400" />}
                      {log.status === 'failed' && <AlertCircle className="w-5 h-5 text-red-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-4">
                        <h4 className="font-medium text-white/90 truncate">{log.name}</h4>
                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                          log.status === 'pending' ? 'bg-blue-500/20 text-blue-300' :
                          log.status === 'success' ? 'bg-green-500/20 text-green-300' :
                          'bg-red-500/20 text-red-300'
                        }`}>
                          {log.status === 'pending' ? '处理中' :
                           log.status === 'success' ? '成功' : '失败'}
                        </span>
                      </div>
                      
                      {log.status === 'success' && log.tags && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {log.tags.map((tag, i) => (
                            <span key={i} className="px-2 py-0.5 bg-white/10 text-white/70 rounded text-xs">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      
                      {log.status === 'failed' && log.errorMsg && (
                        <p className="text-sm text-red-400 mt-1">{log.errorMsg}</p>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
