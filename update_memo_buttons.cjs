const fs = require('fs');
let content = fs.readFileSync('src/components/CharacterMemosSection.tsx', 'utf8');

// 1. Replace the absolute top-2 right-2 buttons
const oldButtons = `                      <div className="absolute top-2 right-2 flex gap-1 z-10">
                          <button
                              onClick={() => handleTogglePin(memo)} 
                             className={\`p-1.5 bg-black/40 \${memo.isPinned ? 'text-purple-400' : 'text-white/50 hover:text-white'} hover:bg-white/10 rounded-lg transition\`}
                             title={memo.isPinned ? "取消置顶" : "置顶记录"}
                          >
                             <Pin className={\`w-4 h-4 \${memo.isPinned ? 'fill-current' : ''}\`} />
                          </button>
                          <button 
                             onClick={() => handleDelete(memo.id)}
                             className="p-1.5 bg-black/40 hover:bg-red-500 text-white/50 hover:text-white rounded-lg transition"
                          >
                             <Trash2 className="w-4 h-4" />
                          </button>
                      </div>`;

const newButtons = `                      <div className="absolute top-2 right-2 flex gap-1 z-20">
                          {memo.type !== 'text' && memo.blob && (
                              <button onClick={(e) => { e.stopPropagation(); handleDownloadFile(memo); }} className="p-1.5 bg-black/40 hover:bg-white/20 text-white/70 hover:text-white rounded-lg transition backdrop-blur-sm" title="下载">
                                  <Download className="w-4 h-4" />
                              </button>
                          )}
                          <button
                              onClick={(e) => { e.stopPropagation(); handleTogglePin(memo); }} 
                             className={\`p-1.5 bg-black/40 \${memo.isPinned ? 'text-purple-400' : 'text-white/50 hover:text-white'} hover:bg-white/20 rounded-lg transition backdrop-blur-sm\`}
                             title={memo.isPinned ? "取消置顶" : "置顶记录"}
                          >
                             <Pin className={\`w-4 h-4 \${memo.isPinned ? 'fill-current' : ''}\`} />
                          </button>
                          <button 
                             onClick={(e) => { e.stopPropagation(); handleDelete(memo.id); }}
                             className="p-1.5 bg-black/40 hover:bg-red-500 text-white/50 hover:text-white rounded-lg transition backdrop-blur-sm"
                             title="删除"
                          >
                             <Trash2 className="w-4 h-4" />
                          </button>
                      </div>`;

content = content.replace(oldButtons, newButtons);

// 2. Add top padding to text item
content = content.replace(
    `<div className="prose prose-sm prose-invert memo-prose-adapt max-w-none text-white/80 leading-relaxed markdown-body line-clamp-[8]">`,
    `<div className="mt-6 prose prose-sm prose-invert memo-prose-adapt max-w-none text-white/80 leading-relaxed markdown-body line-clamp-[8]">`
);

// 3. Remove absolute download button from image
const imageButtons = `                             <div className="absolute bottom-3 right-3 flex gap-2 transition">
                                 <button onClick={() => handleDownloadFile(memo)} className="p-1.5 bg-black/40 hover:bg-blue-500 text-white/70 hover:text-white rounded-lg transition">
                                    <Download className="w-4 h-4" />
                                 </button>
                             </div>`;
content = content.replace(imageButtons, "");

// 4. Update worldbook container
const oldWb = `                      {memo.type === 'worldbook' && memo.blob && (
                          <div className="p-4 flex items-center gap-3 cursor-pointer group/wb" onClick={async () => {
                              try {
                                  const text = await memo.blob.text();
                                  setReadingMemo({ ...memo, _wbContent: text } as any);
                              } catch(e) {
                                  console.error("Failed to read wb", e);
                              }
                          }}>
                              <div className="w-10 h-10 bg-purple-500/20 text-purple-400 rounded-lg flex items-center justify-center shrink-0 group-hover/wb:bg-purple-500/30 transition">
                                  <Book className="w-5 h-5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium text-white truncate">{memo.content || '世界书'}</div>
                                  <div className="text-xs text-white/40">{new Date(memo.createdAt).toLocaleString()}</div>
                              </div>
                              <div className="flex gap-2">
                                  <button onClick={(e) => { e.stopPropagation(); handleDownloadFile(memo); }} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-white/70 transition">
                                      <Download className="w-4 h-4" />
                                  </button>
                                  <button onClick={(e) => { e.stopPropagation(); handleDelete(memo.id); }} className="p-2 bg-white/5 hover:bg-red-500/20 text-red-400 rounded-lg transition sm:hidden">
                                      <Trash2 className="w-4 h-4" />
                                  </button>
                              </div>
                          </div>
                      )}`;

const newWb = `                      {memo.type === 'worldbook' && memo.blob && (
                          <div className="p-4 pr-24 flex items-center gap-3 cursor-pointer group/wb min-h-[5rem]" onClick={async () => {
                              try {
                                  const text = await memo.blob.text();
                                  setReadingMemo({ ...memo, _wbContent: text } as any);
                              } catch(e) {
                                  console.error("Failed to read wb", e);
                              }
                          }}>
                              <div className="w-10 h-10 bg-purple-500/20 text-purple-400 rounded-lg flex items-center justify-center shrink-0 group-hover/wb:bg-purple-500/30 transition">
                                  <Book className="w-5 h-5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium text-white truncate">{memo.content || '世界书'}</div>
                                  <div className="text-xs text-white/40">{new Date(memo.createdAt).toLocaleString()}</div>
                              </div>
                          </div>
                      )}`;

content = content.replace(oldWb, newWb);

// 5. Update file container
const oldFile = `                      {memo.type === 'file' && memo.blob && (
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
                      )}`;

const newFile = `                      {memo.type === 'file' && memo.blob && (
                          <div className="p-4 pr-24 flex items-center gap-3 min-h-[5rem]">
                              <div className="w-10 h-10 bg-blue-500/20 text-blue-400 rounded-lg flex items-center justify-center shrink-0">
                                  <File className="w-5 h-5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium text-white truncate">{memo.content}</div>
                                  <div className="text-xs text-white/40">{new Date(memo.createdAt).toLocaleString()}</div>
                              </div>
                          </div>
                      )}`;

content = content.replace(oldFile, newFile);

fs.writeFileSync('src/components/CharacterMemosSection.tsx', content);
console.log('Fixed memo buttons layout');
