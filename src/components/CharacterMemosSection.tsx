import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getMemosForCharacter, saveMemo, deleteMemo, CharacterMemo } from '../lib/db';
import { FileText, Image as ImageIcon, File, Trash2, Plus, Download, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function CharacterMemosSection({ characterId }: { characterId: string }) {
  const [memos, setMemos] = useState<CharacterMemo[]>([]);
  const [isAddingMode, setIsAddingMode] = useState(false);
  const [newText, setNewText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadMemos = async () => {
    const list = await getMemosForCharacter(characterId);
    setMemos(list);
  };

  useEffect(() => {
    loadMemos();
  }, [characterId]);

  const handleCreateTextMemo = async () => {
    if (!newText.trim()) return;
    await saveMemo({
      id: crypto.randomUUID(),
      characterId,
      type: 'text',
      content: newText.trim(),
      createdAt: Date.now()
    });
    setNewText('');
    setIsAddingMode(false);
    loadMemos();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const isImage = file.type.startsWith('image/');
        
        let content = file.name;
        let finalBlob: Blob | undefined = file;
        
        if (!isImage && file.type === 'text/plain') {
           content = await file.text();
           finalBlob = undefined;
           await saveMemo({
              id: crypto.randomUUID(),
              characterId,
              type: 'text',
              content: content,
              createdAt: Date.now()
            });
            continue;
        }

        await saveMemo({
          id: crypto.randomUUID(),
          characterId,
          type: isImage ? 'image' : 'file',
          content: content,
          blob: finalBlob,
          createdAt: Date.now()
        });
    }
    
    if (fileInputRef.current) fileInputRef.current.value = '';
    loadMemos();
  };

  const handleDelete = async (id: string) => {
    if (confirm('确定要删除这条记录吗？')) {
      await deleteMemo(id);
      loadMemos();
    }
  };

  const handleDownloadFile = (memo: CharacterMemo) => {
      if (!memo.blob) return;
      const url = URL.createObjectURL(memo.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = memo.content;
      a.click();
      URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold text-white flex items-center gap-2">
           <FileText className="w-5 h-5 text-blue-400" />
           备忘录与剧场
        </h3>
        <div className="flex gap-2">
            <button
                onClick={() => setIsAddingMode(true)}
                className="px-3 py-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20 rounded-lg text-sm transition flex items-center gap-1.5"
            >
                <Plus className="w-4 h-4" />
                写笔记
            </button>
            <button
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded-lg text-sm transition flex items-center gap-1.5"
            >
                <ImageIcon className="w-4 h-4" />
                贴图/传文
            </button>
        </div>
        <input 
            type="file" 
            multiple
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            accept="image/*,.txt"
        />
      </div>

      {isAddingMode && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-black/30 border border-white/10 rounded-xl p-4 space-y-3"
          >
              <textarea 
                className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm text-white resize-none min-h-[120px] focus:outline-none focus:border-purple-500/50"
                placeholder="在这里写下脑洞、小剧场或设定补充（支持 Markdown）"
                value={newText}
                onChange={e => setNewText(e.target.value)}
                autoFocus
              />
              <div className="flex justify-end gap-2">
                  <button 
                    onClick={() => setIsAddingMode(false)}
                    className="px-4 py-2 rounded-lg text-sm bg-white/5 hover:bg-white/10 text-white/70 transition"
                  >
                      取消
                  </button>
                  <button 
                    onClick={handleCreateTextMemo}
                    className="px-4 py-2 rounded-lg text-sm bg-purple-500 hover:bg-purple-600 text-white transition font-medium shadow-lg shadow-purple-500/20 disabled:opacity-50"
                    disabled={!newText.trim()}
                  >
                      保存
                  </button>
              </div>
          </motion.div>
      )}

      {memos.length === 0 && !isAddingMode ? (
         <div className="flex flex-col items-center justify-center p-12 bg-white/5 rounded-2xl border border-white/10 text-center border-dashed border-2">
            <FileText className="w-12 h-12 text-white/20 mb-4" />
            <h4 className="text-white/80 font-medium mb-2">暂无备忘信息</h4>
            <p className="text-white/40 text-sm max-w-sm">
              你可以用它来记录设定补充、剧本大纲、贴图或是存储写好的小剧场。
            </p>
         </div>
      ) : (
          <div className="columns-1 md:columns-2 gap-4 space-y-4">
              {memos.map(memo => (
                  <div key={memo.id} className="bg-white/5 border border-white/10 rounded-xl overflow-hidden group break-inside-avoid shadow-lg relative">
                      <button 
                         onClick={() => handleDelete(memo.id)}
                         className="absolute top-2 right-2 p-1.5 bg-black/40 hover:bg-red-500 text-white/50 hover:text-white rounded-lg opacity-0 group-hover:opacity-100 transition z-10 hidden sm:block"
                      >
                         <Trash2 className="w-4 h-4" />
                      </button>
                      
                      {memo.type === 'text' && (
                          <div className="p-5">
                             <div className="prose prose-sm prose-invert max-w-none text-white/80 leading-relaxed markdown-body">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {memo.content}
                                </ReactMarkdown>
                             </div>
                             <div className="mt-4 text-[11px] text-white/30 flex justify-between items-center sm:hidden">
                                {new Date(memo.createdAt).toLocaleString()}
                                <button onClick={() => handleDelete(memo.id)} className="text-red-400 p-1"><Trash2 className="w-4 h-4"/></button>
                             </div>
                             <div className="mt-4 text-[11px] text-white/30 hidden sm:block">
                                {new Date(memo.createdAt).toLocaleString()}
                             </div>
                          </div>
                      )}

                      {memo.type === 'image' && memo.blob && (
                          <div className="relative">
                             <MemoImage memo={memo} />
                             <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent flex justify-between items-end">
                                <span className="text-xs text-white/60">{new Date(memo.createdAt).toLocaleString()}</span>
                                <div className="flex gap-2 sm:hidden">
                                    <button onClick={() => handleDownloadFile(memo)} className="p-1.5 text-blue-400 bg-black/40 rounded-lg"><Download className="w-4 h-4"/></button>
                                    <button onClick={() => handleDelete(memo.id)} className="p-1.5 text-red-400 bg-black/40 rounded-lg"><Trash2 className="w-4 h-4"/></button>
                                </div>
                             </div>
                             <div className="absolute bottom-3 right-3 hidden gap-2 sm:flex opacity-0 group-hover:opacity-100 transition">
                                 <button onClick={() => handleDownloadFile(memo)} className="p-1.5 bg-black/40 hover:bg-blue-500 text-white/70 hover:text-white rounded-lg transition">
                                    <Download className="w-4 h-4" />
                                 </button>
                             </div>
                          </div>
                      )}

                      {memo.type === 'file' && memo.blob && (
                          <div className="p-4 flex items-center gap-3">
                              <div className="w-10 h-10 bg-blue-500/20 text-blue-400 rounded-lg flex items-center justify-center shrink-0">
                                  <File className="w-5 h-5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium text-white truncate">{memo.content}</div>
                                  <div className="text-xs text-white/40">{new Date(memo.createdAt).toLocaleString()}</div>
                              </div>
                              <div className="flex gap-2">
                                  <button onClick={() => handleDownloadFile(memo)} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-white/70 transition">
                                      <Download className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => handleDelete(memo.id)} className="p-2 bg-white/5 hover:bg-red-500/20 text-red-400 rounded-lg transition sm:hidden">
                                      <Trash2 className="w-4 h-4" />
                                  </button>
                              </div>
                          </div>
                      )}
                  </div>
              ))}
          </div>
      )}
    </div>
  );
}

function MemoImage({ memo }: { memo: CharacterMemo }) {
    const [url, setUrl] = useState('');

    useEffect(() => {
        if (!memo.blob) return;
        const objectUrl = URL.createObjectURL(memo.blob);
        setUrl(objectUrl);
        return () => URL.revokeObjectURL(objectUrl);
    }, [memo]);

    if (!url) return <div className="h-48 bg-white/5 animate-pulse" />;
    
    return (
        <a href={url} target="_blank" rel="noopener noreferrer">
            <img src={url} alt={memo.content} className="w-full h-auto" />
        </a>
    );
}

