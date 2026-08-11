const fs = require('fs');
let content = fs.readFileSync('src/components/CharacterMemosSection.tsx', 'utf8');

const regex = /                  \) : \(\n                    <div className="prose prose-invert memo-prose-adapt prose-base sm:prose-lg max-w-none text-white\/80 leading-relaxed markdown-body" onClick=\{e => e\.stopPropagation\(\)\}>\n                       <ReactMarkdown\n                            remarkPlugins=\{\[remarkGfm\]\}\n                           components=\{\{\n                               img: \(\{node, \.\.\.props\}\) => <MarkdownImage src=\{props\.src\} alt=\{props\.alt\} \/>\n                           \}\}\n                       >\n                            \{readingMemo\.content\}\n                       <\/ReactMarkdown>\n                    <\/div>\n                  \)\}/;

const newBlock = `                  ) : readingMemo.type === 'worldbook' ? (
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
                  )}`;

if (regex.test(content)) {
    content = content.replace(regex, newBlock);
    fs.writeFileSync('src/components/CharacterMemosSection.tsx', content);
    console.log('Fixed markdown block');
} else {
    console.log('Failed to match regex');
}
