import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UploadCloud, MessageSquare, User, FileJson, X, Settings2, Link, ChevronUp, ChevronDown, Trash2, ArrowLeft, ChevronLeft, ChevronRight, Edit2, Plus, Book } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { getCharacters, CharacterCard, saveChat, deleteChat, getAllChats, ChatLog } from '../lib/db';

interface ChatMessage {
  name: string;
  is_user: boolean;
  is_name: boolean;
  send_date: number;
  mes: string;
  extra?: any;
}

// Move applyRegexes outside and enhance it
const applyRegexes = (text: string, char: CharacterCard | null | undefined) => {
  let result = text;
  if (!char) return result;
  
  // Look for regex_scripts in extensions
  const exts = char.data?.data?.extensions || char.data?.extensions || {};
  const regexScripts = exts.regex_scripts;
  
  if (!regexScripts || !Array.isArray(regexScripts)) return result;

  // Include placement 2 (Output) and 3 (Markdown)
  const validScripts = regexScripts.filter(s => !s.disabled && s.regex && s.replacementString !== undefined && s.placement && (s.placement.includes(3) || s.placement.includes(2)));

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
      
      const charName = char.name || 'Character';
      pattern = pattern.replace(/{{char}}/gi, charName);
      pattern = pattern.replace(/{{user}}/gi, 'User');
      let replaceStr = script.replacementString.replace(/{{char}}/gi, charName).replace(/{{user}}/gi, 'User');

      const re = new RegExp(pattern, flags);
      result = result.replace(re, replaceStr);
    } catch (e) {
      // invalid regex, skip
    }
  }
  return result;
};

const FormattedMessage = ({ text, char, isUser }: { text: string; char: CharacterCard | null | undefined; isUser: boolean }) => {
  const [showThoughts, setShowThoughts] = useState(false);
  
  // Apply regexes
  let processedText = applyRegexes(text, char);
  
  // Extract Thought blocks
  let mainContent = processedText;
  let thoughts = "";
  
  // Support both <think> and <Think>
  const thinkMatch = mainContent.match(/<(think|Think)>([\s\S]*?)<\/(think|Think)>/i);
  if (thinkMatch) {
    thoughts = thinkMatch[2].trim();
    mainContent = mainContent.replace(/<(think|Think)>([\s\S]*?)<\/(think|Think)>/i, "").trim();
  }

  // Handle special status bar {状态栏 | ...} if not converted by regex
  let statusBar: string[] = [];
  const statusBarMatch = mainContent.match(/{状态栏\s*\|([\s\S]*?)}/);
  if (statusBarMatch) {
    statusBar = statusBarMatch[1].split('|').map(s => s.trim()).filter(Boolean);
    mainContent = mainContent.replace(/{状态栏\s*\|[\s\S]*?}/, "").trim();
  }

  // Handle Scene tags <scene>...</scene>
  let scene = "";
  const sceneMatch = mainContent.match(/<scene>([\s\S]*?)<\/scene>/i);
  if (sceneMatch) {
    scene = sceneMatch[1].trim();
    mainContent = mainContent.replace(/<scene>([\s\S]*?)<\/scene>/i, "").trim();
  }

  return (
    <div className="flex flex-col gap-3">
      {statusBar.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {statusBar.map((item, idx) => (
            <span key={idx} className="px-2 py-1 bg-white/10 rounded-full border border-white/5 text-blue-200">
              {item}
            </span>
          ))}
        </div>
      )}

      {scene && (
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-white/30 font-bold border-l-2 border-white/10 pl-2">
           {scene}
        </div>
      )}

      {thoughts && (
        <div className="bg-black/30 rounded-xl p-3 border border-white/5 shadow-inner overflow-hidden">
          <button 
            onClick={() => setShowThoughts(!showThoughts)}
            className="w-full flex items-center justify-between text-xs font-medium text-white/40 hover:text-white/60 transition"
          >
            <span className="flex items-center gap-2">
              <Book className="w-3.5 h-3.5" />
              思考过程 (Thinking Process)
            </span>
            {showThoughts ? <Plus className="w-3.5 h-3.5 rotate-45 transition-transform" /> : <Plus className="w-3.5 h-3.5 transition-transform" />}
          </button>
          
          <AnimatePresence>
            {showThoughts && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="pt-3 mt-3 border-t border-white/5 text-slate-400 italic text-[13px] leading-relaxed prose prose-invert prose-xs max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                    {thoughts}
                  </ReactMarkdown>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
      
      <div className="prose prose-invert prose-sm max-w-none 
         prose-headings:text-white/90 prose-p:leading-relaxed 
         prose-a:text-blue-400 hover:prose-a:text-blue-300
         prose-strong:text-white prose-code:text-pink-300
         [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 break-words"
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
          {mainContent || '_空记录_'}
        </ReactMarkdown>
      </div>
    </div>
  );
};

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
      {!activeChatId && (
        <div className="flex-none pt-7 pb-4 px-4 sm:pt-7 sm:pb-6 sm:px-6 border-b border-white/10 bg-black/20 flex items-start sm:items-center justify-between sticky top-0 z-20 backdrop-blur-md transition-all gap-2 sm:gap-4">
          <div className="flex items-start sm:items-center gap-3 sm:gap-4 flex-1 min-w-0">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-blue-500/20 flex items-center justify-center border border-blue-500/30 shrink-0">
              <MessageSquare className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent flex items-center gap-2 flex-wrap">
                聊天记录查看器
              </h2>
              <p className="text-white/60 text-xs sm:text-sm mt-1 leading-relaxed">
                查看酒馆(Tavern)导出的 JSONL 聊天记录（将显示原始文本，不带正则效果）
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition shrink-0 mt-1 sm:mt-0"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
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
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full relative"
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
                          {applyRegexes(chat.messages.length > 0 ? chat.messages[chat.messages.length - 1].mes : '空记录', matchedChar)
                            .replace(/<(think|Think)>[\s\S]*?<\/(think|Think)>/gi, '[思考...]')
                            .replace(/{状态栏\s*\|[\s\S]*?}/g, '')
                            .replace(/<scene>[\s\S]*?<\/scene>/gi, '')
                          }
                        </ReactMarkdown>
                      </div>
                    </motion.div>
                  )})}
                </AnimatePresence>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4 pt-24 pb-32 relative z-0">
              {activeChat?.messages.map((msg, i) => {
                const dateString = msg.send_date ? new Date(msg.send_date).toLocaleString() : '';
                return (
                  <div key={i} className={`flex gap-4 ${msg.is_user ? 'flex-row-reverse' : ''}`}>
                    <div className="shrink-0 pt-1">
                      {msg.is_user ? (
                        <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20 text-white font-bold">
                          {msg.name?.charAt(0) || 'U'}
                        </div>
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
                         <FormattedMessage text={msg.mes || ''} char={activeCharacter} isUser={msg.is_user} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
        )}
      </div>
    </div>
  );
}
