const fs = require('fs');
let code = fs.readFileSync('src/components/CloudSyncTab.tsx', 'utf8');

// 1. Remove the old handleUploadBackup button from its current place
const oldBtnRegex = /<button\s+onClick=\{handleUploadBackup\}[\s\S]*?创建旧版压缩包备份\s*<\/>\s*\)}\s*<\/button>/;
code = code.replace(oldBtnRegex, '');

// 2. Insert it under <h4 className="text-sm font-medium text-white/80">旧版完整压缩包备份 (易闪退)</h4>
const insertTarget = /<h4 className="text-sm font-medium text-white\/80">旧版完整压缩包备份 \(易闪退\)<\/h4>[\s\S]*?<\/button>\s*<\/div>/;

const newBtnCode = `
            <button
              onClick={handleUploadBackup}
              disabled={syncInfo.isActive}
              className="w-full py-2 mt-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/80 font-medium flex justify-center items-center gap-2 transition disabled:opacity-50 text-sm border border-white/10"
            >
              {syncInfo.isActive && syncInfo.taskName === '手动备份' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>请求已发送...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  创建新的旧版压缩包备份 (易闪退)
                </>
              )}
            </button>
`;

code = code.replace(insertTarget, match => match + '\n' + newBtnCode);

fs.writeFileSync('src/components/CloudSyncTab.tsx', code);
