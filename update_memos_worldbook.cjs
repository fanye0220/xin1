const fs = require('fs');
let content = fs.readFileSync('src/components/CharacterMemosSection.tsx', 'utf8');

// Add import
content = content.replace(
  "import { getMemosForCharacter, saveMemo, deleteMemo, CharacterMemo } from '../lib/db';",
  "import { getMemosForCharacter, saveMemo, deleteMemo, CharacterMemo } from '../lib/db';\nimport { WorldbookViewer } from './CharacterDetail';"
);

// Update rendering
content = content.replace(
  `                  ) : (
                    <div className="prose prose-invert memo-prose-adapt prose-base sm:prose-lg max-w-none text-white/80 leading-relaxed markdown-body" onClick={e => e.stopPropagation()}>
                       <ReactMarkdown`,
  `                  ) : readingMemo.type === 'worldbook' ? (
                    <div className="h-full overflow-y-auto" onClick={e => e.stopPropagation()}>
                      <WorldbookViewer 
                        book={JSON.parse(readingMemo.content || '{}')} 
                        onUpdate={async (newBook) => {
                           const newMemo = { ...readingMemo, content: JSON.stringify(newBook), blob: new Blob([JSON.stringify(newBook)], { type: 'application/json' }) };
                           await saveMemo(newMemo);
                           setReadingMemo(newMemo);
                           loadMemos();
                        }} 
                        onDelete={() => { handleDelete(readingMemo.id); setReadingMemo(null); }} 
                      />
                    </div>
                  ) : (
                    <div className="prose prose-invert memo-prose-adapt prose-base sm:prose-lg max-w-none text-white/80 leading-relaxed markdown-body" onClick={e => e.stopPropagation()}>
                       <ReactMarkdown`
);

// Also render 'worldbook' type in the list view (like 'file' but with book icon)
content = content.replace(
  `                      {memo.type === 'file' && memo.blob && (`,
  `                      {memo.type === 'worldbook' && memo.blob && (
                          <div className="p-4 flex items-center gap-3 cursor-pointer group/wb" onClick={() => setReadingMemo({ ...memo, content: (memo as any)._wbContent || memo.content })}> 
                              <div className="w-10 h-10 bg-purple-500/20 text-purple-400 rounded-lg flex items-center justify-center shrink-0 group-hover/wb:bg-purple-500/30 transition">
                                  <Book className="w-5 h-5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium text-white truncate">{JSON.parse(memo.content || '{}').name || '世界书'}</div>
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
                      {memo.type === 'file' && memo.blob && (`
);

// Wait, the content in readingMemo might just be the worldbook Name instead of JSON!
// Ah, in fix_memo_upload.cjs I did: `content: json.name || file.name, blob: new Blob([text], { type: 'application/json' })`
// So memo.content is JUST THE NAME! I need to read the blob to get the JSON content!
// Let's rewrite the logic inside update_memos_worldbook.cjs to read the blob text.
