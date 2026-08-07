const fs = require('fs');
let content = fs.readFileSync('src/components/CharacterList.tsx', 'utf8');

const overlayUI = `
      {isExporting && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-800 p-8 rounded-3xl max-w-sm w-full text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-blue-500/20 mx-auto flex items-center justify-center animate-pulse">
              <Cloud className="w-8 h-8 text-blue-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white mb-2">正在同步云端</h3>
              <p className="text-sm text-white/60">{exportMessage}</p>
            </div>
            <div className="w-full bg-black/50 rounded-full h-2 overflow-hidden">
              <div 
                className="bg-blue-500 h-full rounded-full transition-all duration-300"
                style={{ width: \`\${Math.max(5, exportProgress)}%\` }}
              />
            </div>
            <p className="text-xs text-white/40">请勿关闭当前页面，大文件上传可能需要几分钟</p>
          </div>
        </div>
      )}
`;

if (!content.includes('正在同步云端')) {
  content = content.replace("    <div className=\"flex h-full w-full bg-slate-950 text-slate-200 overflow-hidden relative\">\n", "    <div className=\"flex h-full w-full bg-slate-950 text-slate-200 overflow-hidden relative\">\n" + overlayUI);
}

fs.writeFileSync('src/components/CharacterList.tsx', content);
