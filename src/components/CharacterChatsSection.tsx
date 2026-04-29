import React, { useState, useEffect, useRef } from 'react';
import { getChatsForCharacter, deleteChat, saveChat, ChatLog } from '../lib/db';
import { MessageSquare, Trash2, Calendar, FileJson, UploadCloud, Edit2, Plus, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Virtuoso } from 'react-virtuoso';

interface Props {
  characterId: string;
  characterName: string;
  regexScripts: any[];
  avatar?: string;
}

export function CharacterChatsSection({ characterId, characterName, regexScripts, avatar }: Props) {
  const [chats, setChats] = useState<ChatLog[]>([]);
  const [selectedChat, setSelectedChat] = useState<ChatLog | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingNoteFor, setEditingNoteFor] = useState<string | null>(null);
  const [editNoteContent, setEditNoteContent] = useState('');
  const [customTags, setCustomTags] = useState<string[]>([]);

  const loadChats = async () => {
    const list = await getChatsForCharacter(characterId);
    setChats(list.sort((a,b) => b.createdAt - a.createdAt));
  };

  useEffect(() => {
    loadChats();
    const savedTags = localStorage.getItem('chatViewer_customTags');
    if (savedTags) {
      try {
        setCustomTags(JSON.parse(savedTags));
      } catch (e) {}
    }
  }, [characterId]);

  const handleSaveNote = async (chat: ChatLog) => {
    await saveChat({ ...chat, note: editNoteContent });
    setEditingNoteFor(null);
    loadChats();
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if(confirm('确定要删除这条聊天记录吗？')) {
      await deleteChat(id);
      if (selectedChat?.id === id) setSelectedChat(null);
      loadChats();
    }
  };

  const handleFileUpload = async (files: FileList | File[]) => {
    let imported = 0;
    
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
      try {
        const text = await file.text();
        let parsedMessages: any[] = [];

        if (file.name.endsWith('.jsonl') || text.trim().split('\n').length > 1) {
          const lines = text.trim().split('\n');
          parsedMessages = lines.map(line => {
            try { return JSON.parse(line); } catch (e) { return null; }
          }).filter(Boolean);
        } else {
          const data = JSON.parse(text);
          if (Array.isArray(data)) parsedMessages = data;
          else if (data.chat && Array.isArray(data.chat)) parsedMessages = data.chat;
          else parsedMessages = [data];
        }

        await saveChat({
          id: crypto.randomUUID(),
          characterId: characterId,
          name: file.name,
          messages: parsedMessages,
          createdAt: Date.now()
        });
        imported++;
      } catch (e) {
        console.error(e);
        alert(`解析文件 ${file.name} 失败，请确保格式为记录导出的 jsonl 或 json 格式。`);
      }
    }

    if (imported > 0) {
      loadChats();
    }
  };

  const applyRegexes = (text: string) => {
    let result = text;
    if (regexScripts && Array.isArray(regexScripts)) {
      // Filter placement 3 or disabled=false
      const validScripts = regexScripts.filter(s => !s.disabled && s.regex && s.replacementString !== undefined && s.placement && s.placement.includes(3)); 

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
          
          pattern = pattern.replace(/{{char}}/gi, characterName);
          pattern = pattern.replace(/{{user}}/gi, 'User');
          let replaceStr = script.replacementString.replace(/{{char}}/gi, characterName).replace(/{{user}}/gi, 'User');

          const re = new RegExp(pattern, flags);
          result = result.replace(re, replaceStr);
        } catch (e) {
          // invalid regex, skip
        }
      }
    }

    // Format tags
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

  if (selectedChat) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        className="space-y-4"
      >
        <div className="flex items-center justify-between pb-4 border-b border-white/10 shrink-0 gap-4">
           <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
             <button onClick={() => setSelectedChat(null)} className="flex items-center gap-1.5 text-white/50 hover:text-white transition whitespace-nowrap shrink-0">
               <ArrowLeft className="w-4 h-4" /> 
               <span className="hidden sm:inline">返回列表</span>
             </button>
             <h3 className="text-base sm:text-lg font-medium text-white truncate" title={selectedChat.name}>{selectedChat.name}</h3>
           </div>
           <button 
             onClick={(e) => handleDelete(selectedChat.id, e)}
             className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition shrink-0"
             title="删除这条聊天记录"
           >
             <Trash2 className="w-4 h-4" />
           </button>
        </div>

        <div className="flex-[1_1_100%] mt-6 pr-2 min-h-[500px]">
          <Virtuoso
            style={{ height: '100%' }}
            data={selectedChat.messages}
            itemContent={(i, msg) => {
             const dateString = msg.send_date ? new Date(msg.send_date).toLocaleString() : '';
             return (
                  <div className={`flex gap-4 mb-6 ${msg.is_user ? 'flex-row-reverse' : ''}`}>
                    <div className="shrink-0 pt-1">
                      {msg.is_user ? (
                        <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20 text-white font-bold">
                          {msg.name?.charAt(0) || 'U'}
                        </div>
                      ) : (
                        avatar ? (
                          <img src={avatar} alt="avatar" className="w-10 h-10 rounded-full object-cover shadow-lg border border-white/10" />
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
                              {applyRegexes(msg.mes || '')}
                            </ReactMarkdown>
                         </div>
                      </div>
                    </div>
                  </div>
             );
            }}
          />
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-lg sm:text-xl font-bold text-white flex items-center gap-1.5 sm:gap-2 truncate">
            <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400 shrink-0" />
            <span className="truncate"><span className="hidden sm:inline">绑定的</span>聊天记录 <span className="text-white/50 text-base font-normal">({chats.length})</span></span>
          </h3>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-2.5 sm:px-4 py-1.5 sm:py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded-lg text-xs sm:text-sm transition flex items-center gap-1.5 shrink-0"
        >
          <UploadCloud className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
          <span>导入<span className="hidden sm:inline">记录</span></span>
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

      {chats.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 bg-white/5 rounded-2xl border border-white/10 text-center border-dashed border-2">
           <FileJson className="w-12 h-12 text-white/20 mb-4" />
           <h4 className="text-white/80 font-medium mb-2">暂无绑定的聊天记录</h4>
           <div className="flex flex-col items-center gap-4 mt-2">
             <p className="text-white/40 text-sm max-w-sm">
               点击右上角导入按钮，或直接拖拽 JSONL 文件到窗口中绑定至此角色。
             </p>
           </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {chats.map(chat => (
            <div 
              key={chat.id}
              onClick={() => setSelectedChat(chat)}
              className="group cursor-pointer bg-white/5 hover:bg-white/10 border border-white/10 hover:border-blue-500/50 rounded-2xl p-4 transition-all hover:shadow-[0_0_20px_rgba(59,130,246,0.1)] relative"
            >
              <div className="flex justify-between items-start mb-2 gap-3">
                <div className="p-2 bg-blue-500/20 rounded-lg flex-shrink-0">
                  <MessageSquare className="w-5 h-5 text-blue-400" />
                </div>
                
                <div className="flex-1 min-w-0 pt-0.5">
                  {editingNoteFor === chat.id ? (
                    <div className="w-full" onClick={e => e.stopPropagation()}>
                      <input 
                        autoFocus
                        className="w-full bg-black/40 border border-blue-500/50 rounded flex px-2 py-1 text-sm text-blue-300 focus:outline-none placeholder-blue-300/30"
                        value={editNoteContent}
                        onChange={e => setEditNoteContent(e.target.value)}
                        onKeyDown={e => { if(e.key === 'Enter') handleSaveNote(chat); }}
                        onBlur={() => handleSaveNote(chat)}
                        placeholder="添加故事备注..."
                      />
                    </div>
                  ) : (
                    <div 
                      className="text-sm font-medium text-blue-300 cursor-pointer hover:text-blue-200 transition flex items-center gap-2"
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
                </div>

                <button 
                  onClick={(e) => handleDelete(chat.id, e)}
                  className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              
              <h4 className="font-medium text-white mb-2 truncate text-sm" title={chat.name}>{chat.name}</h4>
              
              <div className="flex justify-between items-center text-xs text-white/40">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {new Date(chat.createdAt).toLocaleDateString()}
                </span>
                <span>{chat.messages.length} 条消息</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
