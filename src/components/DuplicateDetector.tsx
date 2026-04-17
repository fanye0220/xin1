import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Trash2, X, AlertTriangle, CheckCircle2, Merge, MessageSquarePlus, Link, FileText, CheckCircle } from 'lucide-react';
import { CharacterCard, DuplicateGroup, findDuplicates, deleteCharacter, saveCharacter } from '../lib/db';

interface Props {
  onClose: () => void;
  onSelectChar: (id: string) => void;
}

export function DuplicateDetector({ onClose, onSelectChar }: Props) {
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const pageSize = 10;
  
  const longPressRef = useRef<{ timer: NodeJS.Timeout | null, triggered: boolean, startY?: number }>({ timer: null, triggered: false });

  const loadDuplicates = async () => {
    setLoading(true);
    const groups = await findDuplicates();
    
    // 过滤掉预设、美化卡和独立世界书
    const filteredGroups = groups.filter(group => {
      if (group.characters.length === 0) return false;
      const c = group.characters[0].char;
      const rawData = c.data;
      const isPreset = !!(rawData.prompts || rawData.temperature !== undefined || rawData.top_p !== undefined);
      const isStandaloneWorldbook = rawData.entries !== undefined;
      const isTheme = rawData.blur_strength !== undefined || rawData.main_text_color !== undefined || rawData.chat_display !== undefined;
      const tags = c.data?.tags || c.data?.data?.tags || [];
      const isBeautify = tags.some((t: string) => t.includes('美化') || t.includes('预设') || t.includes('UI') || t.includes('主题'));
      return !isPreset && !isBeautify && !isStandaloneWorldbook && !isTheme;
    });

    setDuplicateGroups(filteredGroups);
    setLoading(false);
  };

  useEffect(() => {
    loadDuplicates();
  }, []);

  const handleDelete = async (id: string) => {
    if (confirm('确定要删除此重复角色吗？')) {
      await deleteCharacter(id);
      loadDuplicates();
    }
  };

  const mergeAndSave = async (keptChar: CharacterCard, otherChars: CharacterCard[]) => {
    let updatedData = { ...keptChar.data };
    let targetData = updatedData.data ? updatedData.data : updatedData;

    // Initialize extensions if not present
    if (!targetData.extensions) targetData.extensions = {};

    let mergedQRs = [...(targetData.extensions.quick_replies || [])];
    let mergedSource = targetData.extensions.source || targetData.source || '';
    let mergedTags = [...(targetData.tags || [])];
    let mergedQrFilename = targetData.extensions.qr_filename || '';
    
    // Avatar History Merging
    let mergedHistory = [...(keptChar.avatarHistory || [])];
    const seenBlobSizes = new Set(mergedHistory.map(b => b.size));
    if (keptChar.avatarBlob) seenBlobSizes.add(keptChar.avatarBlob.size);

    for (const other of otherChars) {
      const otherTarget = other.data.data ? other.data.data : other.data;
      
      // Merge QRs
      const otherQRs = otherTarget.extensions?.quick_replies || [];
      for (const qr of otherQRs) {
        if (!mergedQRs.some(q => q.message === qr.message)) {
          mergedQRs.push(qr);
        }
      }

      // Merge QR Filename
      const otherQrFilename = otherTarget.extensions?.qr_filename;
      if (!mergedQrFilename && otherQrFilename) {
        mergedQrFilename = otherQrFilename;
      }

      // Merge Source
      const otherSource = otherTarget.extensions?.source || otherTarget.source;
      if (!mergedSource && otherSource) {
        mergedSource = otherSource;
      }

      // Merge Tags
      const otherTags = otherTarget.tags || [];
      for (const tag of otherTags) {
        if (!mergedTags.includes(tag)) {
          mergedTags.push(tag);
        }
      }

      // Merge Avatar History
      const otherHistory = other.avatarHistory || [];
      for (const blob of otherHistory) {
        if (!seenBlobSizes.has(blob.size)) {
          mergedHistory.push(blob);
          seenBlobSizes.add(blob.size);
        }
      }

      // If other has a different avatar, add it to history
      if (other.avatarBlob && !seenBlobSizes.has(other.avatarBlob.size)) {
        mergedHistory.push(other.avatarBlob);
        seenBlobSizes.add(other.avatarBlob.size);
      }
    }

    targetData.extensions.quick_replies = mergedQRs;
    targetData.extensions.source = mergedSource;
    targetData.tags = mergedTags;
    if (mergedQrFilename) {
      targetData.extensions.qr_filename = mergedQrFilename;
    }
    
    if (!updatedData.data) {
      updatedData.source = mergedSource;
      updatedData.tags = mergedTags;
    }

    const finalChar = { 
      ...keptChar, 
      data: updatedData,
      avatarHistory: mergedHistory.length > 0 ? mergedHistory : undefined
    };
    await saveCharacter(finalChar);
  };

  const handleMergeAndKeep = async (keptChar: CharacterCard, group: DuplicateGroup) => {
    if (!confirm('确定要保留此卡，合并其他卡片的快捷回复(QR)、替换头像、来源链接和标签，并删除其他卡片吗？')) return;

    const otherChars = group.characters.map(c => c.char).filter(c => c.id !== keptChar.id);
    await mergeAndSave(keptChar, otherChars);

    for (const other of otherChars) {
      await deleteCharacter(other.id);
    }

    loadDuplicates();
  };

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const handleSelectDuplicates = (keep: 'earliest' | 'newest' = 'newest') => {
    const newSet = new Set<string>();
    duplicateGroups.forEach(group => {
      // Find the one to keep
      const chars = group.characters.map(c => c.char);
      const sorted = [...chars].sort((a, b) => a.createdAt - b.createdAt);
      
      const charToKeep = keep === 'earliest' ? sorted[0] : sorted[sorted.length - 1];
      
      chars.forEach(c => {
        if (c.id !== charToKeep.id) {
          newSet.add(c.id);
        }
      });
    });
    setSelectedIds(newSet);
    setSelectionMode(true);
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (confirm(`确定要删除选中的 ${selectedIds.size} 张重复卡片吗？\n（删除过程中会自动合并快捷回复(QR)、替换头像、来源和标签到保留的卡片中）`)) {
      setLoading(true);
      
      // Group processing
      for (const group of duplicateGroups) {
        const charsToDelete = group.characters.map(c => c.char).filter(c => selectedIds.has(c.id));
        const charsToKeep = group.characters.map(c => c.char).filter(c => !selectedIds.has(c.id));
        
        if (charsToDelete.length > 0) {
          if (charsToKeep.length > 0) {
            // Pick a winner to receive merged data
            const winner = charsToKeep[0];
            await mergeAndSave(winner, charsToDelete);
          }
          
          // Delete all selected from this group
          for (const c of charsToDelete) {
            await deleteCharacter(c.id);
          }
        }
      }
      
      setSelectedIds(new Set());
      setSelectionMode(false);
      await loadDuplicates();
    }
  };

  const totalPages = Math.ceil(duplicateGroups.length / pageSize);
  const paginatedGroups = duplicateGroups.slice((page - 1) * pageSize, page * pageSize);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm"
    >
      <div className="bg-slate-900 border border-white/10 rounded-3xl w-full max-w-4xl max-h-[92vh] sm:max-h-[85vh] flex flex-col shadow-2xl overflow-hidden ring-1 ring-white/10">
        <div className="p-5 sm:p-6 border-b border-white/10 flex items-center justify-between bg-white/[0.02] backdrop-blur-md">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                {selectionMode ? (
                  <button onClick={() => { setSelectionMode(false); setSelectedIds(new Set()); }} className="p-2 -ml-2 rounded-full hover:bg-white/10 transition shrink-0 active:scale-90">
                    <X className="w-6 h-6" />
                  </button>
                ) : (
                  <div className="p-2 sm:p-2.5 bg-purple-500/20 rounded-xl text-purple-400 shrink-0">
                    <Copy className="w-6 h-6 sm:w-7 sm:h-7" />
                  </div>
                )}
                <div className="min-w-0">
                  <h2 className="text-xl sm:text-2xl font-bold text-white truncate leading-tight">
                    {selectionMode ? `已选择 ${selectedIds.size} 项` : '重复卡检测'}
                  </h2>
                  <p className="text-xs sm:text-sm text-white/50 truncate">
                    {selectionMode ? '请确认要删除的重复卡片' : '基于开场白、设定和世界书对比'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                {!loading && duplicateGroups.length > 0 && !selectionMode && (
                  <button 
                    onClick={() => setSelectionMode(true)}
                    className="px-4 py-2 bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 rounded-xl text-sm font-bold transition active:scale-95 shadow-lg shadow-purple-500/10"
                  >
                    批量操作
                  </button>
                )}
                {selectionMode && (
                  <button 
                    onClick={handleBatchDelete}
                    disabled={selectedIds.size === 0}
                    className="px-4 py-2 bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 rounded-xl text-sm font-bold transition flex items-center gap-2 active:scale-95 shadow-lg shadow-red-500/30"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="hidden xs:inline text-sm">删除选中副本</span>
                    <span className="xs:hidden text-sm">删除</span>
                  </button>
                )}
                {!selectionMode && (
                  <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition text-white/60 hover:text-white active:scale-90">
                    <X className="w-6 h-6" />
                  </button>
                )}
              </div>
            </div>
        
        {selectionMode && (
          <div className="sm:hidden grid grid-cols-2 border-b border-white/5 bg-slate-900 shadow-inner">
            <button 
              onClick={() => handleSelectDuplicates('newest')}
              className="py-4 text-blue-400 active:bg-blue-400/10 text-xs font-bold transition border-r border-white/5"
            >
              保留最新导入
            </button>
            <button 
              onClick={() => handleSelectDuplicates('earliest')}
              className="py-4 text-purple-400 active:bg-purple-400/10 text-xs font-bold transition"
            >
              保留最旧导入
            </button>
          </div>
        )}
        
        {selectionMode && (
          <div className="hidden sm:flex items-center gap-4 px-6 py-3 border-b border-white/5 bg-black/20">
            <span className="text-xs text-white/40 font-medium">智能选择助手:</span>
            <button 
              onClick={() => handleSelectDuplicates('newest')}
              className="px-3 py-1.5 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 rounded-lg text-xs font-bold transition"
            >
              保留最新导入
            </button>
            <button 
              onClick={() => handleSelectDuplicates('earliest')}
              className="px-3 py-1.5 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 rounded-lg text-xs font-bold transition"
            >
              保留最旧导入
            </button>
            <button 
              onClick={() => setSelectedIds(new Set())}
              className="ml-auto px-3 py-1.5 text-white/40 hover:text-white/60 text-xs transition"
            >
              清空选择
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 sm:space-y-8">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full text-white/40">
              <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-4" />
              <p>正在扫描重复卡片...</p>
            </div>
          ) : duplicateGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-white/40">
               <CheckCircle2 className="w-16 h-16 mb-4 opacity-50 text-green-400" />
              <p>太棒了！没有发现重复卡片</p>
            </div>
          ) : (
            <div className="space-y-8">
              {paginatedGroups.map((group) => (
                <div key={group.id} className="bg-white/5 border border-white/10 rounded-2xl p-4 overflow-hidden shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 text-orange-400">
                      <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                      <h3 className="font-semibold text-sm sm:text-base">疑似重复卡片 ({group.characters.length})</h3>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                    {group.characters.map(dupChar => {
                      const char = dupChar.char;
                      const reason = dupChar.reason;
                      const targetData = char.data.data ? char.data.data : char.data;
                      const hasQR = targetData.extensions?.quick_replies?.length > 0;
                      const hasSource = !!(targetData.extensions?.source || targetData.source);
                      const hasNotes = !!targetData.creator_notes;
                      const modifiedDate = char.originalFile?.lastModified 
                        ? new Date(char.originalFile.lastModified) 
                        : new Date(char.updatedAt || char.createdAt);

                      const isSelected = selectedIds.has(char.id);

                      return (
                      <div 
                        key={char.id} 
                        className={`flex flex-col p-3 sm:p-4 bg-black/20 rounded-xl border transition-all duration-200 ${isSelected ? 'border-purple-500 bg-purple-500/10 ring-1 ring-purple-500/30' : 'border-white/5 opacity-90 hover:opacity-100 hover:border-white/20'}`}
                        onTouchStart={(e) => {
                          longPressRef.current.triggered = false;
                          longPressRef.current.startY = e.touches[0].clientY;
                          longPressRef.current.timer = setTimeout(() => {
                            longPressRef.current.triggered = true;
                            if (!selectionMode) {
                              setSelectionMode(true);
                              setSelectedIds(new Set([char.id]));
                            }
                          }, 500);
                        }}
                        onTouchMove={(e) => {
                          if (longPressRef.current.timer) {
                            const dy = Math.abs(e.touches[0].clientY - (longPressRef.current.startY || 0));
                            if (dy > 15) {
                              clearTimeout(longPressRef.current.timer);
                              longPressRef.current.timer = null;
                            }
                          }
                        }}
                        onTouchEnd={() => {
                          if (longPressRef.current.timer) {
                            clearTimeout(longPressRef.current.timer);
                            longPressRef.current.timer = null;
                          }
                        }}
                        onMouseDown={() => {
                          longPressRef.current.triggered = false;
                          longPressRef.current.timer = setTimeout(() => {
                            longPressRef.current.triggered = true;
                            if (!selectionMode) {
                              setSelectionMode(true);
                              setSelectedIds(new Set([char.id]));
                            }
                          }, 500);
                        }}
                        onMouseUp={() => {
                          if (longPressRef.current.timer) {
                            clearTimeout(longPressRef.current.timer);
                            longPressRef.current.timer = null;
                          }
                        }}
                        onMouseLeave={() => {
                          if (longPressRef.current.timer) {
                            clearTimeout(longPressRef.current.timer);
                            longPressRef.current.timer = null;
                          }
                        }}
                        onClick={() => {
                          if (longPressRef.current.triggered) return;
                          if (selectionMode) {
                            toggleSelection(char.id);
                          }
                        }}
                      >
                        <div 
                          className="flex items-start gap-3 mb-3 cursor-pointer hover:bg-white/5 p-2 -m-2 rounded-lg transition relative min-w-0"
                          onClick={(e) => {
                            if (selectionMode) {
                              e.stopPropagation();
                              toggleSelection(char.id);
                            } else {
                              onSelectChar(char.id);
                            }
                          }}
                        >
                          {selectionMode && (
                            <div className={`absolute top-2 right-2 z-10 p-0.5 rounded-full shadow-md transition-all ${isSelected ? 'bg-purple-500 text-white scale-110' : 'bg-white/10 text-white/20'}`}>
                              <CheckCircle className="w-5 h-5" />
                            </div>
                          )}
                          <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-black/50 mt-1 shadow-inner ring-1 ring-white/5">
                            <img 
                              src={char.avatarBlob ? URL.createObjectURL(char.avatarBlob) : char.avatarUrlFallback} 
                              alt={char.name} 
                              className="w-full h-full object-cover" 
                              referrerPolicy="no-referrer"
                            />
                          </div>
                          <div className="flex-1 min-w-0 pr-6 sm:pr-0">
                            <h4 className="font-bold text-white truncate text-base">{char.name}</h4>
                            <p className="text-[11px] text-white/50 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                              <span>修改: {modifiedDate.toLocaleDateString()}</span>
                              <span title="设定字数">描: {(targetData.description || '').length}字</span>
                              {targetData.alternate_greetings?.length > 0 && <span>备用开场白: {targetData.alternate_greetings.length}</span>}
                              {(targetData.character_book?.entries?.length > 0) && <span>世界书: {targetData.character_book.entries.length}项</span>}
                            </p>
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              <span className="text-[10px] px-2 py-0.5 bg-orange-500/20 text-orange-300 rounded-md font-bold shrink-0">
                                {reason}
                              </span>
                              {hasQR && <span className="text-[10px] px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded-md flex items-center gap-1 shrink-0 font-medium"><MessageSquarePlus className="w-3 h-3"/> QR</span>}
                              {hasSource && <span className="text-[10px] px-2 py-0.5 bg-green-500/20 text-green-300 rounded-md flex items-center gap-1 shrink-0 font-medium"><Link className="w-3 h-3"/> 来源</span>}
                              {hasNotes && <span className="text-[10px] px-2 py-0.5 bg-yellow-500/20 text-yellow-300 rounded-md flex items-center gap-1 shrink-0 font-medium"><FileText className="w-3 h-3"/> 备注</span>}
                            </div>
                          </div>
                        </div>
                        
                        <div className="mt-auto flex flex-col gap-3">
                          <button
                            disabled={selectionMode}
                            onClick={() => handleMergeAndKeep(char, group)}
                            className="w-full py-3 flex items-center justify-center gap-2 bg-purple-500/20 text-purple-200 hover:bg-purple-500/30 disabled:opacity-30 rounded-xl transition text-sm font-bold ring-1 ring-purple-500/30 shadow-lg shadow-purple-500/10 active:scale-95"
                          >
                            <Merge className="w-4 h-4" />
                            保留并合并
                          </button>
                          <button
                            disabled={selectionMode}
                            onClick={() => handleDelete(char.id)}
                            className="w-full py-3 flex items-center justify-center gap-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-30 rounded-xl transition text-sm font-bold ring-1 ring-red-500/20 active:scale-95"
                          >
                            <Trash2 className="w-4 h-4" />
                            删除此卡
                          </button>
                        </div>
                      </div>
                    )})}
                  </div>
                </div>
              ))}

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 pt-4 border-t border-white/10">
                  <button 
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-4 py-2 bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:hover:bg-white/5 rounded-xl text-xs font-medium transition active:scale-95"
                  >
                    上一页
                  </button>
                  <span className="text-xs text-white/60 font-medium">
                    {page} / {totalPages}
                  </span>
                  <button 
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-4 py-2 bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:hover:bg-white/5 rounded-xl text-xs font-medium transition active:scale-95"
                  >
                    下一页
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
