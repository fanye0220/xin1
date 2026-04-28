import React, { useState, useEffect, useRef } from 'react';
import { getChatsForCharacter, deleteChat, ChatLog } from '../lib/db';
import { MessageSquare, Trash2, Calendar, FileJson, Upload } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

interface Props {
  characterId: string;
  characterName: string;
  regexScripts: any[];
  avatar?: string;
}

export function CharacterChatsSection({ characterId, characterName, regexScripts, avatar }: Props) {
  const [chats, setChats] = useState<ChatLog[]>([]);
  const [selectedChat, setSelectedChat] = useState<ChatLog | null>(null);

  const loadChats = async () => {
    const list = await getChatsForCharacter(characterId);
    setChats(list.sort((a,b) => b.createdAt - a.createdAt));
  };

  useEffect(() => {
    loadChats();
  }, [characterId]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if(confirm('确定要删除这条聊天记录吗？')) {
      await deleteChat(id);
      if (selectedChat?.id === id) setSelectedChat(null);
      loadChats();
    }
  };

  const applyRegexes = (text: string) => {
    let result = text;
    if (!regexScripts || !Array.isArray(regexScripts)) return result;

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
        <div className="flex items-center justify-between pb-4 border-b border-white/10 shrink-0">
           <div className="flex items-center gap-3">
             <button onClick={() => setSelectedChat(null)} className="text-white/50 hover:text-white transition">&larr; 返回列表</button>
             <h3 className="text-lg font-medium text-white">{selectedChat.name}</h3>
           </div>
           <button 
             onClick={(e) => handleDelete(selectedChat.id, e)}
             className="p-2 bg-red-500/20 hover:bg-red-500/40 text-red-400 rounded-lg transition"
           >
             <Trash2 className="w-4 h-4" />
           </button>
        </div>

        <div className="space-y-6 mt-6 pr-2">
          {selectedChat.messages.map((msg, i) => {
             const dateString = msg.send_date ? new Date(msg.send_date).toLocaleString() : '';
             return (
                  <div key={i} className={`flex gap-4 ${msg.is_user ? 'flex-row-reverse' : ''}`}>
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
          })}
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
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold text-white flex items-center gap-2">
           <MessageSquare className="w-5 h-5 text-blue-400" />
           绑定的聊天记录 ({chats.length})
        </h3>
        <p className="text-sm text-white/50">在左侧「查看聊天记录」工具中导入并绑定</p>
      </div>

      {chats.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 bg-white/5 rounded-2xl border border-white/10 text-center">
           <FileJson className="w-12 h-12 text-white/20 mb-4" />
           <h4 className="text-white/80 font-medium mb-2">暂无绑定的聊天记录</h4>
           <p className="text-white/40 text-sm max-w-sm">
             点击左侧边栏的「查看聊天记录」，将酒馆导出的 JSONL 文件拖入，并选择绑定至此角色。
           </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {chats.map(chat => (
            <div 
              key={chat.id}
              onClick={() => setSelectedChat(chat)}
              className="group cursor-pointer bg-white/5 hover:bg-white/10 border border-white/10 hover:border-blue-500/50 rounded-2xl p-4 transition-all hover:shadow-[0_0_20px_rgba(59,130,246,0.1)] relative"
            >
              <div className="flex justify-between items-start mb-3">
                <div className="p-2 bg-blue-500/20 rounded-lg shrink-0">
                  <MessageSquare className="w-5 h-5 text-blue-400" />
                </div>
                <button 
                  onClick={(e) => handleDelete(chat.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 bg-red-500/20 hover:bg-red-500/40 text-red-400 rounded-lg transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              
              <h4 className="font-medium text-white mb-1 truncate">{chat.name}</h4>
              
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
