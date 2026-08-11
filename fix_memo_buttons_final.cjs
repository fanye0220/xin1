const fs = require('fs');
let content = fs.readFileSync('src/components/CharacterMemosSection.tsx', 'utf8');

const regex = /<div className="absolute top-2 right-2 flex gap-1 z-10">\s*<button\s*onClick=\{\(\) => handleTogglePin\(memo\)\}\s*className=\{`p-1\.5 bg-black\/40 \$\{memo\.isPinned \? 'text-purple-400' : 'text-white\/50 hover:text-white'\} hover:bg-white\/10 rounded-lg transition`\}\s*title=\{memo\.isPinned \? "取消置顶" : "置顶记录"\}\s*>\s*<Pin className=\{`w-4 h-4 \$\{memo\.isPinned \? 'fill-current' : ''\}`\} \/>\s*<\/button>\s*<button\s*onClick=\{\(\) => handleDelete\(memo\.id\)\}\s*className="p-1\.5 bg-black\/40 hover:bg-red-500 text-white\/50 hover:text-white rounded-lg transition"\s*>\s*<Trash2 className="w-4 h-4" \/>\s*<\/button>\s*<\/div>/g;

const newButtons = `<div className="absolute top-2 right-2 flex gap-1 z-20">
                          {memo.type !== 'text' && memo.blob && (
                              <button onClick={(e) => { e.stopPropagation(); handleDownloadFile(memo); }} className="p-1.5 bg-black/40 hover:bg-blue-500 text-white/70 hover:text-white rounded-lg transition backdrop-blur-sm" title="下载">
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

if (regex.test(content)) {
    content = content.replace(regex, newButtons);
    fs.writeFileSync('src/components/CharacterMemosSection.tsx', content);
    console.log('Fixed memo buttons!');
} else {
    console.log('Regex failed to match');
}
