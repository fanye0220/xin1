const fs = require('fs');
let code = fs.readFileSync('src/components/CloudSyncTab.tsx', 'utf8');

// Replace the old monolithic button block
const oldBtnRegex = /<button\s+onClick=\{handleUploadBackup\}[\s\S]*?一键同步所有本地卡片到云库\s*<\/>\s*\)}\s*<\/button>/;
code = code.replace(oldBtnRegex, `
            <button
              onClick={handleUploadBackup}
              disabled={syncInfo.isActive}
              className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium flex justify-center items-center gap-2 transition disabled:opacity-50 mt-4"
            >
              {syncInfo.isActive && syncInfo.taskName === '手动备份' ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>请求已发送...</span>
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5" />
                  创建旧版压缩包备份
                </>
              )}
            </button>
`);

fs.writeFileSync('src/components/CloudSyncTab.tsx', code);
