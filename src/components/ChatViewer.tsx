import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { motion, AnimatePresence } from 'framer-motion';
import { UploadCloud, MessageSquare, User, FileJson, X, Settings2, Link, ChevronUp, ChevronDown, Trash2, ArrowLeft, ChevronLeft, ChevronRight, Edit2, Plus, Book } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import Cropper from 'react-easy-crop';
import { getCharacters, CharacterCard, saveChat, deleteChat, getAllChats, ChatLog } from '../lib/db';

interface ChatMessage {
  name: string;
  is_user: boolean;
  is_name: boolean;
  send_date: number;
  mes: string;
  extra?: any;
}

export function ChatViewer({ onClose }: { onClose: () => void }) {
  const [savedChats, setSavedChats] = useState<ChatLog[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [characters, setCharacters] = useState<CharacterCard[]>([]);

  const [isHeaderExpanded, setIsHeaderExpanded] = useState(false);
  const [isMainHeaderExpanded, setIsMainHeaderExpanded] = useState(true);
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});

  const [editingNoteFor, setEditingNoteFor] = useState<string | null>(null);
  const [editNoteContent, setEditNoteContent] = useState('');

  const [customTags, setCustomTags] = useState<string[]>([]);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  const userAvatarInputRef = useRef<HTMLInputElement>(null);

  // Cropping states
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);

  useEffect(() => {
    const savedTags = localStorage.getItem('chatViewer_customTags');
    if (savedTags) {
      try {
        setCustomTags(JSON.parse(savedTags));
      } catch (e) {}
    }
    const savedAvatar = localStorage.getItem('chatViewer_userAvatar');
    if (savedAvatar) {
      setUserAvatar(savedAvatar);
    }
  }, []);

  const handleAddCustomTag = () => {
    if (newTagInput.trim()) {
      const tag = newTagInput.trim().replace(/^<*\/?|\/?>*$/g, '').trim();
      if (!tag) return;
      
      const updated = [...customTags, tag];
      setCustomTags(updated);
      localStorage.setItem('chatViewer_customTags', JSON.stringify(updated));
      setNewTagInput('');
    }
  };

  const handleRemoveCustomTag = (tagToRemove: string) => {
    const updated = customTags.filter(t => t !== tagToRemove);
    setCustomTags(updated);
    localStorage.setItem('chatViewer_customTags', JSON.stringify(updated));
  };

  const handleUserAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        setImageToCrop(dataUrl);
        if (userAvatarInputRef.current) {
          userAvatarInputRef.current.value = '';
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const onCropComplete = useCallback((croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const getCroppedImg = async (imageSrc: string, pixelCrop: any): Promise<string> => {
    const image = new Image();
    image.src = imageSrc;
    await new Promise(resolve => image.onload = resolve);
    
    const canvas = document.createElement('canvas');
    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return '';
    
    ctx.drawImage(
      image,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      pixelCrop.width,
      pixelCrop.height
    );
    
    return canvas.toDataURL('image/png');
  };

  const handleSaveCrop = async () => {
    if (imageToCrop && croppedAreaPixels) {
      const croppedImage = await getCroppedImg(imageToCrop, croppedAreaPixels);
      setUserAvatar(croppedImage);
      localStorage.setItem('chatViewer_userAvatar', croppedImage);
      setImageToCrop(null);
    }
  };

  const handleClearUserAvatar = () => {
    setUserAvatar(null);
    localStorage.removeItem('chatViewer_userAvatar');
  };

  const handleSaveNote = async (chat: ChatLog) => {
    await saveChat({ ...chat, note: editNoteContent });
    setEditingNoteFor(null);
    loadData();
  };

  const loadData = async () => {
    const chars = await getCharacters(1, 9999);
    setCharacters(chars.characters);
    const chats = await getAllChats();
    setSavedChats(chats.sort((a,b) => b.createdAt - a.createdAt));
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const urls: Record<string, string> = {};
    characters.forEach(char => {
      urls[char.id] = char.avatarBlob ? URL.createObjectURL(char.avatarBlob) : (char.avatarUrlFallback || '');
    });
    setAvatarUrls(urls);
    return () => {
      Object.values(urls).forEach(url => {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url);
      });
    };
  }, [characters]);

  const handleFileUpload = async (files: FileList | File[]) => {
    let imported = 0;
    
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
      try {
        const text = await file.text();
        let parsedMessages: ChatMessage[] = [];

        // Check if JSONL
        if (file.name.endsWith('.jsonl') || text.trim().split('\n').length > 1) {
          const lines = text.trim().split('\n');
          parsedMessages = lines.map(line => {
            try { return JSON.parse(line); } catch (e) { return null; }
          }).filter(Boolean);
        } else {
          // Try JSON array
          const data = JSON.parse(text);
          if (Array.isArray(data)) parsedMessages = data;
          else if (data.chat && Array.isArray(data.chat)) parsedMessages = data.chat;
          else parsedMessages = [data];
        }

        // Auto-detect character
        const aiMessage = parsedMessages.find(m => !m.is_user && m.name);
        let charId = '';
        if (aiMessage && aiMessage.name) {
          const match = characters.find(c => c.name.toLowerCase() === aiMessage.name.toLowerCase());
          if (match) charId = match.id;
        }

        await saveChat({
          id: crypto.randomUUID(),
          characterId: charId,
          name: file.name,
          messages: parsedMessages,
          createdAt: Date.now()
        });
        imported++;
      } catch (e) {
        console.error(e);
        alert(`解析文件 ${file.name} 失败，请确保格式为酒馆导出的 jsonl 或 json 格式。`);
      }
    }

    if (imported > 0) {
      loadData();
    }
  };

  const activeChat = savedChats.find(c => c.id === activeChatId);
  // Auto-detect active character if bound or match by AI name
  let activeCharacter = activeChat && activeChat.characterId ? characters.find(c => c.id === activeChat.characterId) : null;
  if (activeChat && !activeCharacter) {
    const aiMsg = activeChat.messages.find(m => !m.is_user && m.name);
    if (aiMsg?.name) {
      activeCharacter = characters.find(c => c.name.toLowerCase() === aiMsg.name?.toLowerCase()) || null;
    }
  }

  const formatCustomTags = (text: string) => {
    if (!text) return '';
    let result = text;
    // Format <Think>
    result = result.replace(/(?:<|&lt;)Think(?:>|&gt;)([\s\S]*?)(?:<|&lt;)\/Think(?:>|&gt;)/gi, '<details class="text-sm bg-white/5 border border-white/10 rounded-lg p-2 my-2"><summary class="cursor-pointer font-bold text-gray-400 select-none">🤔 思维链</summary><div class="mt-2 text-gray-300">$1</div></details>');
    
    // Format doggy_status_panel
    result = result.replace(/(?:<|&lt;)doggy_status_panel(?:>|&gt;)([\s\S]*?)(?:<|&lt;)\/doggy_status_panel(?:>|&gt;)/gi, '<details class="text-sm bg-blue-500/10 border border-blue-500/20 rounded-lg p-2 my-2"><summary class="cursor-pointer font-bold text-blue-400 select-none">📊 状态栏</summary><pre class="mt-2 text-blue-300/80 whitespace-pre-wrap font-mono text-xs overflow-x-auto">$1</pre></details>');

    // Also deal with standalone {状态栏 | ...} without xml tags
    result = result.replace(/\{状态栏\s*\|([\s\S]*?)\}/gi, '<details class="text-sm bg-blue-500/10 border border-blue-500/20 rounded-lg p-2 my-2"><summary class="cursor-pointer font-bold text-blue-400 select-none">📊 状态栏</summary><pre class="mt-2 text-blue-300/80 whitespace-pre-wrap font-mono text-xs overflow-x-auto">$1</pre></details>');

    // Apply user defined custom tags
    const processedTags = new Set(customTags.map(t => t.replace(/^<*\/?|\/?>*$/g, '').trim()).filter(Boolean));
    
    processedTags.forEach(tag => {
      // Escape tag for regex just in case
      const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // Match paired tags with optional attributes. Handle both < and &lt;
      const pairedRe = new RegExp(`(?:<|&lt;)\\s*${escapedTag}(?:\\s+(?:[^>&]|&[^g])+)?(?:>|&gt;)([\\s\\S]*?)(?:<|&lt;)\\/\\s*${escapedTag}\\s*(?:>|&gt;)`, 'gi');
      result = result.replace(pairedRe, `<details class="text-sm bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-2 my-2"><summary class="cursor-pointer font-bold text-indigo-400 select-none">${tag}</summary><div class="mt-2 text-indigo-300/80 whitespace-pre-wrap">$1</div></details>`);
      
      // Match stray/single tags so they don't disappear in markdown rendering
      const singleRe = new RegExp(`(?:<|&lt;)\\s*${escapedTag}(?:\\s+(?:[^>&]|&[^g])+)?\\/?\\s*(?:>|&gt;)`, 'gi');
      result = result.replace(singleRe, `<div class="text-sm border-l-2 border-indigo-500/50 pl-3 py-1 my-2 text-indigo-400/80 italic text-xs"><span class="font-bold">&lt;${tag}&gt;</span></div>`);
      
      // Clean up stray closing tags
      const singleCloseRe = new RegExp(`(?:<|&lt;)\\/\\s*${escapedTag}\\s*(?:>|&gt;)`, 'gi');
      result = result.replace(singleCloseRe, `<div class="text-sm border-l-2 border-indigo-500/50 pl-3 py-1 my-2 text-indigo-400/80 italic text-xs"><span class="font-bold">&lt;/${tag}&gt;</span></div>`);
    });

    return result;
  };

  const extractStyles = (obj: any): string => {
    let styles = "";
    const seen = new Set<string>();
    const extract = (o: any) => {
      if (typeof o === 'string') {
        const matches = o.match(/<style[^>]*>([\s\S]*?)<\/style>/gi);
        if (matches) {
          for (const match of matches) {
             const innerMatch = match.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
             if (innerMatch && innerMatch[1]) {
                const rules = innerMatch[1].trim();
                // We add the bare CSS rules, but we could wrap them to scope if we want.
                if (rules && !seen.has(rules)) {
                  seen.add(rules);
                  styles += rules + '\n';
                }
             }
          }
        }
      } else if (Array.isArray(o)) {
        o.forEach(extract);
      } else if (typeof o === 'object' && o !== null) {
        Object.values(o).forEach(extract);
      }
    };
    extract(obj);
    return styles;
  };

  const cssStyleString = activeCharacter ? extractStyles(activeCharacter.data) : '';

  const applyRegexes = (text: string, char: CharacterCard | null | undefined) => {
    let result = text;
    if (!char) return result;
    
    const exts = char.data?.data?.extensions || char.data?.extensions || {};
    const regexScripts = exts.regex_scripts || [];
    
    if (!Array.isArray(regexScripts)) return result;

    const validScripts = regexScripts.filter(s => !s.disabled && s.regex && (s.replacementString !== undefined || s.replaceString !== undefined));

    for (const script of validScripts) {
      try {
        let pattern = script.regex;
        let flags = 'g';
        if (pattern.startsWith('/') && pattern.lastIndexOf('/') > 0) {
          const lastSlash = pattern.lastIndexOf('/');
          flags = pattern.substring(lastSlash + 1);
          if (!flags.includes('g')) flags += 'g';
          pattern = pattern.substring(1, lastSlash);
        }
        
        pattern = pattern.replace(/{{char}}/gi, char.name);
        pattern = pattern.replace(/{{user}}/gi, 'User');
        let replaceStr = script.replacementString !== undefined ? script.replacementString : script.replaceString;
        
        // Handle unescaping \n and \t from JSON parsed string representing literal slashes
        replaceStr = replaceStr.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
        replaceStr = replaceStr.replace(/{{char}}/gi, char.name).replace(/{{user}}/gi, 'User');

        const re = new RegExp(pattern, flags);
        result = result.replace(re, replaceStr);
      } catch (e) {
        // invalid regex, skip
      }
    }
    return result;
  };

  const handleUpdateBinding = async (charId: string) => {
    if (!activeChat) return;
    const updated = { ...activeChat, characterId: charId };
    await saveChat(updated);
    loadData();
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files);
    }
  };

  const handleRemoveChat = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteChat(id);
    if (activeChatId === id) setActiveChatId(null);
    loadData();
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-900 relative overflow-hidden">
      
      {/* Dynamic CSS Styles from the active character's configuration */}
      {cssStyleString && (
        <style dangerouslySetInnerHTML={{ __html: cssStyleString }} />
      )}

      {!activeChatId && (
        <div className="flex-none p-4 pt-7 sm:p-6 sm:pt-7 border-b border-white/10 bg-black/20 flex items-start sm:items-center justify-between sticky top-0 z-20 backdrop-blur-md transition-all gap-2 sm:gap-4">
          <div className="flex items-start sm:items-center gap-3 sm:gap-4 flex-1 min-w-0">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-blue-500/20 flex items-center justify-center border border-blue-500/30 shrink-0">
              <MessageSquare className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent flex items-center gap-2 flex-wrap">
                聊天记录查看器
              </h2>
              <p className="text-white/60 text-xs sm:text-sm mt-1 leading-relaxed">
                查看酒馆(Tavern)导出的 JSONL 聊天记录（已支持读取角色卡内的世界书和CSS正则进行渲染）
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowSettings(true)}
              className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition shrink-0 mt-1 sm:mt-0"
              title="设置"
            >
              <Settings2 className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
            <button 
              onClick={onClose}
              className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition shrink-0 mt-1 sm:mt-0"
            >
              <X className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </div>
        </div>
      )}

      {/* 悬浮窗球 (Floating Pill Header) when chat is active */}
      <AnimatePresence>
        {activeChatId && activeChat && (
          <motion.div 
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            className="absolute top-4 z-30 pointer-events-none transition-all duration-500 ease-out flex left-1/2 -translate-x-1/2 w-full max-w-sm sm:max-w-md px-4"
          >
            <div className="pointer-events-auto bg-black/60 backdrop-blur-xl border border-white/10 flex items-center shadow-[0_10px_40px_rgba(0,0,0,0.5)] transition-all duration-500 overflow-visible rounded-full w-full justify-between p-1.5">
              <button 
                onClick={() => setActiveChatId(null)} 
                className="w-10 h-10 shrink-0 flex items-center justify-center rounded-full hover:bg-white/10 text-white/70 hover:text-white transition"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              
              <div className="flex flex-col items-center justify-center px-2 sm:px-4 overflow-hidden flex-1 cursor-pointer" onClick={() => setIsHeaderExpanded(!isHeaderExpanded)}>
                 <span className="text-sm font-bold text-white truncate w-full text-center leading-tight">
                   {activeChat.name}
                 </span>
                 <span className="text-[11px] text-white/50 block text-center mt-0.5 w-full truncate">
                   {activeChat.messages.length} 条消息
                 </span>
              </div>
              
              <div className="relative flex items-center gap-1 shrink-0">
                <button 
                  onClick={() => setIsHeaderExpanded(!isHeaderExpanded)} 
                  className={`w-10 h-10 flex items-center justify-center rounded-full transition ${isHeaderExpanded ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-white/10 text-white/70 hover:text-white'}`}
                >
                  <Settings2 className="w-5 h-5" />
                </button>

                <AnimatePresence>
                  {isHeaderExpanded && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.9, y: 10, transformOrigin: "top right" }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: 10 }}
                      className="absolute top-full right-0 mt-3 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-64 p-4 z-40 overflow-hidden"
                    >
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-2">
                          <label className="text-xs text-white/50 font-medium">绑定角色获得正则效果</label>
                          <select 
                            value={activeChat.characterId || ""} 
                            onChange={e => handleUpdateBinding(e.target.value)}
                            className="bg-black/30 border border-white/10 text-sm text-white focus:outline-none rounded-lg p-2 w-full appearance-none"
                          >
                            <option value="">暂不绑定</option>
                            {characters.map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </div>
                        {activeCharacter && activeChat.characterId && (
                          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                             <span className="text-xs text-green-400 flex items-center gap-1.5 font-medium">
                               <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                               已应用角色正则规则
                             </span>
                          </div>
                        )}
                        <div className="pt-2 mt-2 border-t border-white/10">
                          <button
                            onClick={() => {
                              setIsHeaderExpanded(false);
                              setShowSettings(true);
                            }}
                            className="w-full flex items-center justify-between px-2 py-1.5 hover:bg-white/5 rounded-lg text-sm text-blue-300 transition"
                          >
                            <span>界面设置 (头像/折叠)</span>
                            <Settings2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={`flex-1 ${!activeChatId ? 'overflow-y-auto' : 'overflow-hidden'} p-6 max-w-5xl mx-auto w-full relative`}
           onDragEnter={handleDrag}
           onDragLeave={handleDrag}
           onDragOver={handleDrag}
           onDrop={handleDrop}
      >
        {isDragActive && (
          <div className="absolute inset-0 z-50 bg-blue-500/10 backdrop-blur-sm border-2 border-dashed border-blue-400 rounded-3xl m-6 flex items-center justify-center">
            <div className="text-center">
              <UploadCloud className="w-16 h-16 text-blue-400 mx-auto mb-4" />
              <h3 className="text-2xl font-bold text-white">松开鼠标导入文件</h3>
            </div>
          </div>
        )}

        {!activeChatId ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-lg font-medium text-white">所有记录 ({savedChats.length})</h3>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-lg text-sm transition flex items-center gap-2"
              >
                <UploadCloud className="w-4 h-4" />
                导入更多
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".json,.jsonl"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) handleFileUpload(e.target.files);
                }}
              />
            </div>

            {savedChats.length === 0 ? (
              <div className="py-20 flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-3xl">
                <FileJson className="w-16 h-16 text-white/20 mb-4 mx-auto" />
                <h3 className="text-xl font-medium text-white/60 mb-2">拖拽或点击上方按钮导入聊天记录</h3>
                <p className="text-white/40 mb-8">支持批量导入 .jsonl 格式文件</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                <AnimatePresence>
                  {savedChats.map((chat) => {
                    let matchedChar = chat.characterId ? characters.find(c => c.id === chat.characterId) : null;
                    if (!matchedChar) {
                      const aiMsg = chat.messages.find(m => !m.is_user && m.name);
                      if (aiMsg?.name) {
                        matchedChar = characters.find(c => c.name.toLowerCase() === aiMsg.name?.toLowerCase()) || null;
                      }
                    }
                    return (
                    <motion.div
                      key={chat.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      onClick={() => setActiveChatId(chat.id)}
                      className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-5 cursor-pointer transition flex flex-col gap-3 relative overflow-hidden"
                    >
                      <div className="flex justify-between items-start mb-2 gap-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-10 h-10 rounded-full border border-white/20 bg-black/30 flex items-center justify-center shrink-0 shadow-inner overflow-hidden">
                            {matchedChar && avatarUrls[matchedChar.id] ? (
                              <img src={avatarUrls[matchedChar.id]} alt="avatar" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-lg font-bold text-white/80">
                                {chat.name.charAt(0)}
                              </span>
                            )}
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            {editingNoteFor === chat.id ? (
                              <div className="w-full mb-1" onClick={e => e.stopPropagation()}>
                                <input 
                                  autoFocus
                                  className="w-full bg-black/40 border border-blue-500/50 rounded flex px-2 py-1 text-sm text-blue-300 focus:outline-none placeholder-blue-300/30"
                                  value={editNoteContent}
                                  onChange={e => setEditNoteContent(e.target.value)}
                                  onKeyDown={e => { if(e.key === 'Enter') handleSaveNote(chat); }}
                                  onBlur={() => handleSaveNote(chat)}
                                  placeholder="添加内容备注..."
                                />
                              </div>
                            ) : (
                              <div 
                                className="text-sm font-medium text-blue-300 cursor-pointer hover:text-blue-200 transition flex items-center gap-2 mb-1"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingNoteFor(chat.id);
                                  setEditNoteContent(chat.note || '');
                                }}
                                title="点击编辑备注"
                              >
                                {chat.note ? (
                                  <>
                                    <span className="truncate">{chat.note}</span>
                                    <span className="text-xs text-blue-300/50 shrink-0 flex items-center gap-1 leading-none pt-0.5"><Edit2 className="w-3 h-3" /></span>
                                  </>
                                ) : (
                                  <span className="text-blue-300/50 flex items-center gap-1 font-normal"><Plus className="w-3.5 h-3.5" /> 添加内容备注...</span>
                                )}
                              </div>
                            )}
                            <h4 className="font-medium text-white/90 truncate w-full text-sm" title={chat.name}>{chat.name}</h4>
                          </div>
                        </div>

                        <button 
                          onClick={(e) => handleRemoveChat(e, chat.id)}
                          className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition z-10 shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex justify-between items-center text-xs text-white/40 pb-2">
                        <span className="flex items-center gap-1">
                          <Book className="w-4 h-4 text-blue-400" />
                          {chat.messages.length} 条消息
                        </span>
                        <span className="flex items-center gap-1">
                           {new Date(chat.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="bg-black/30 rounded-lg p-4 border border-white/5 text-white/70 text-sm leading-relaxed ml-2 md:ml-16 prose prose-sm prose-invert max-w-none line-clamp-3 overflow-hidden">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                          {formatCustomTags(applyRegexes(chat.messages.length > 0 ? chat.messages[chat.messages.length - 1].mes : '空记录', matchedChar))}
                        </ReactMarkdown>
                      </div>
                    </motion.div>
                  )})}
                </AnimatePresence>
              </div>
            )}
          </div>
        ) : (
          <div className="relative z-0 h-full w-full">
             <div className="absolute inset-0">
                <Virtuoso
                  style={{ height: '100%' }}
                  data={activeChat?.messages || []}
                  components={{
                    Header: () => <div className="h-24" />,
                    Footer: () => <div className="h-32" />
                  }}
                  itemContent={(i, msg) => {
                    const dateString = msg.send_date ? new Date(msg.send_date).toLocaleString() : '';
                    return (
                      <div className={`flex gap-4 mb-4 px-2 ${msg.is_user ? 'flex-row-reverse' : ''}`}>
                        <div className="shrink-0 pt-1">
                          {msg.is_user ? (
                            userAvatar ? (
                              <div className="w-10 h-10 rounded-full border border-white/20 bg-black/30 flex items-center justify-center shrink-0 shadow-lg overflow-hidden">
                                <img src={userAvatar} alt="user avatar" className="w-full h-full object-cover" />
                              </div>
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20 text-white font-bold">
                                {msg.name?.charAt(0) || 'U'}
                              </div>
                            )
                          ) : (
                            activeCharacter && avatarUrls[activeCharacter.id] ? (
                              <img src={avatarUrls[activeCharacter.id]} alt="avatar" className="w-10 h-10 rounded-full object-cover shadow-lg border border-white/10" />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-indigo-900 flex items-center justify-center shadow-lg border border-indigo-500/30 text-indigo-200 font-bold">
                                {msg.name?.charAt(0) || 'AI'}
                              </div>
                            )
                          )}
                        </div>
                        
                        <div className={`max-w-[80%] ${msg.is_user ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                          <div className={`flex items-center gap-2 text-xs ${msg.is_user ? 'flex-row-reverse text-blue-200/70' : 'text-slate-400'}`}>
                            <span className="font-semibold">{msg.name || (msg.is_user ? 'User' : 'Character')}</span>
                            {dateString && <span>· {dateString}</span>}
                          </div>
                          
                          <div className={`px-5 py-3 rounded-2xl ${
                            msg.is_user 
                              ? 'bg-blue-600/90 text-white rounded-tr-sm backdrop-blur-md border border-blue-500/30' 
                              : 'bg-indigo-950/80 text-indigo-100 rounded-tl-sm border border-indigo-500/20 backdrop-blur-md'
                          }`}>
                             <div className="prose prose-invert prose-sm max-w-none 
                                prose-headings:text-white/90 prose-p:leading-relaxed 
                                prose-a:text-blue-400 hover:prose-a:text-blue-300
                                prose-strong:text-white prose-code:text-pink-300
                                [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 break-words"
                              >
                              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                                  {formatCustomTags(applyRegexes(msg.mes || '', activeCharacter))}
                                </ReactMarkdown>
                             </div>
                          </div>
                        </div>
                      </div>
                    );
                  }}
                />
             </div>
          </div>
        )}
      </div>

      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowSettings(false)}>
          <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md flex flex-col shadow-2xl ring-1 ring-white/10 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-blue-400" />
                界面设置
              </h3>
              <button 
                onClick={() => setShowSettings(false)}
                className="p-2 -mr-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-5 flex flex-col gap-6 max-h-[70vh] overflow-y-auto">
              {/* User Avatar Settings */}
              <div className="flex flex-col gap-3">
                <label className="text-sm font-medium text-white/80">你的头像</label>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center shadow-lg border border-white/20 shrink-0 overflow-hidden relative group">
                    {userAvatar ? (
                      <img src={userAvatar} alt="avatar" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xl font-bold text-white">U</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <button 
                      onClick={() => userAvatarInputRef.current?.click()}
                      className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm transition"
                    >
                      上传头像
                    </button>
                    {userAvatar && (
                      <button 
                        onClick={handleClearUserAvatar}
                        className="px-3 py-1.5 border border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-lg text-sm transition"
                      >
                        移除头像
                      </button>
                    )}
                    <input 
                      type="file" 
                      ref={userAvatarInputRef}
                      onChange={handleUserAvatarUpload}
                      accept="image/*"
                      className="hidden"
                    />
                  </div>
                </div>
              </div>
              
              {/* Custom Fold Tags Settings */}
              <div className="flex flex-col gap-3">
                <label className="text-sm font-medium text-white/80 shrink-0 mt-1">自定义折叠标签</label>
                <p className="text-xs text-white/50 leading-relaxed -mt-2">
                  添加你想要自动折叠的标签。比如你输入 <strong>Real_Task</strong>，聊天记录中的 <i>&lt;Real_Task&gt;...&lt;/Real_Task&gt;</i> 就会被自动折叠。
                </p>
                
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="text"
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAddCustomTag();
                    }}
                    placeholder="输入标签名 (如 Real_Task)"
                    className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
                  />
                  <button 
                    onClick={handleAddCustomTag}
                    disabled={!newTagInput.trim()}
                    className="p-2 bg-blue-600 hover:bg-blue-500 disabled:bg-white/10 disabled:text-white/30 text-white rounded-xl transition"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
                
                {customTags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {customTags.map((tag, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 rounded-lg text-sm">
                        {tag}
                        <button 
                          onClick={() => handleRemoveCustomTag(tag)}
                          className="hover:text-red-400 p-0.5 rounded-full transition"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {imageToCrop && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md flex flex-col shadow-2xl overflow-hidden h-[500px]">
             <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
                <h3 className="text-lg font-bold text-white">调整头像</h3>
                <button 
                  onClick={() => setImageToCrop(null)}
                  className="p-1 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition"
                >
                  <X className="w-5 h-5" />
                </button>
             </div>
             <div className="flex-1 relative w-full h-full bg-black/50">
               <Cropper
                  image={imageToCrop}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  cropShape="round"
                  showGrid={false}
                  onCropChange={setCrop}
                  onCropComplete={onCropComplete}
                  onZoomChange={setZoom}
               />
             </div>
             <div className="p-4 border-t border-white/10 bg-white/[0.02] flex items-center justify-between gap-4">
                <input
                  type="range"
                  value={zoom}
                  min={1}
                  max={3}
                  step={0.1}
                  aria-labelledby="Zoom"
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="flex-1 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer"
                />
                <button 
                  onClick={handleSaveCrop}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition"
                >
                  保存头像
                </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
