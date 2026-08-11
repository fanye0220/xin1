const fs = require('fs');
let content = fs.readFileSync('src/components/CharacterMemosSection.tsx', 'utf8');

if (!content.includes("import { WorldbookViewer } from './CharacterDetail';")) {
    content = content.replace(
        "import ReactMarkdown from 'react-markdown';",
        "import ReactMarkdown from 'react-markdown';\nimport { WorldbookViewer } from './CharacterDetail';"
    );
}

// 1. Add the worldbook block in the Reorder.Item
const fileBlockStr = `                      {memo.type === 'file' && memo.blob && (`;
const wbBlockStr = `                      {memo.type === 'worldbook' && memo.blob && (
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
                      )}
                      {memo.type === 'file' && memo.blob && (`;

content = content.replace(fileBlockStr, wbBlockStr);

// 2. Add the worldbook renderer in the reading modal
const markdownBlock = `                  ) : (
                    <div className="prose prose-invert memo-prose-adapt prose-base sm:prose-lg max-w-none text-white/80 leading-relaxed markdown-body" onClick={e => e.stopPropagation()}>
                       <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                           components={{
                               img: ({node, ...props}) => <MarkdownImage src={props.src} alt={props.alt} />
                           }}
                       >
                            {readingMemo.content}
                       </ReactMarkdown>
                    </div>
                  )}
               </div>`;

const newMarkdownBlock = `                  ) : readingMemo.type === 'worldbook' ? (
                    <div className="h-full overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <WorldbookViewer 
                            book={JSON.parse((readingMemo as any)._wbContent || '{}')} 
                            onUpdate={async (newBook) => {
                                const newMemo = { 
                                    ...readingMemo, 
                                    content: newBook.name || '世界书', 
                                    blob: new Blob([JSON.stringify(newBook)], { type: 'application/json' }) 
                                };
                                (newMemo as any)._wbContent = JSON.stringify(newBook);
                                await saveMemo(newMemo);
                                setReadingMemo(newMemo);
                                loadMemos();
                            }} 
                            onDelete={() => { handleDelete(readingMemo.id); setReadingMemo(null); }} 
                        />
                    </div>
                  ) : (
                    <div className="prose prose-invert memo-prose-adapt prose-base sm:prose-lg max-w-none text-white/80 leading-relaxed markdown-body" onClick={e => e.stopPropagation()}>
                       <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                           components={{
                               img: ({node, ...props}) => <MarkdownImage src={props.src} alt={props.alt} />
                           }}
                       >
                            {readingMemo.content}
                       </ReactMarkdown>
                    </div>
                  )}
               </div>`;

content = content.replace(markdownBlock, newMarkdownBlock);

fs.writeFileSync('src/components/CharacterMemosSection.tsx', content);
console.log('Fixed worldbook renderers');
