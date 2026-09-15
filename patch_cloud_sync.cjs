const fs = require('fs');
let code = fs.readFileSync('src/components/CloudSyncTab.tsx', 'utf8');

const newFunc = `
  const [oneClickProgress, setOneClickProgress] = useState<{current: number, total: number, message: string} | null>(null);

  const handleOneClickCloudSync = async () => {
    if (!token) return;
    const confirm = window.confirm("确定要将所有本地卡片逐一同步至云端文件夹吗？\\n\\n这可能需要一些时间，请保持应用在前台运行。");
    if (!confirm) return;

    try {
      setOneClickProgress({ current: 0, total: 0, message: '正在准备...' });
      const { getCachedMeta } = await import('../lib/db');
      const { uploadCharacterToCloud } = await import('../lib/cloudDrive');
      const chars = await getCachedMeta();
      
      setOneClickProgress({ current: 0, total: chars.length, message: '正在同步...' });
      let success = 0;
      let skipped = 0;
      
      const isAndroid = !!(window as any).Capacitor;
      const CONCURRENCY = isAndroid ? 1 : 2;
      let currentIndex = 0;
      
      const uploadWorker = async () => {
        while (currentIndex < chars.length) {
          const i = currentIndex++;
          try {
             const res = await uploadCharacterToCloud(token, chars[i].id);
             if (res === 'uploaded') success++;
             else skipped++;
          } catch(e) {
             console.error("Failed", e);
          } finally {
             setOneClickProgress(prev => prev ? { ...prev, current: prev.current + 1 } : null);
             await new Promise(r => setTimeout(r, isAndroid ? 800 : 100));
          }
        }
      };

      const workers = [];
      for (let w = 0; w < CONCURRENCY; w++) {
        workers.push(uploadWorker());
      }
      await Promise.all(workers);
      
      setOneClickProgress(null);
      alert(\`一键同步完成！\\n成功上传: \${success}\\n跳过已存在: \${skipped}\`);
      if (activeTab === 'cloud_drive') {
        loadCloudChars(token);
      }
    } catch(err: any) {
       console.error(err);
       setOneClickProgress(null);
       alert("同步发生错误: " + err.message);
    }
  };
`;

// Insert the new function before handleUploadBackup
code = code.replace('  const handleUploadBackup = () => {', newFunc + '\n  const handleUploadBackup = () => {');

const newButton = `
          <div className="p-4 bg-white/5 border border-white/10 rounded-xl space-y-4">
            <button
              onClick={handleOneClickCloudSync}
              disabled={oneClickProgress !== null}
              className="w-full py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-medium flex justify-center items-center gap-2 transition disabled:opacity-50"
            >
              {oneClickProgress ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>正在同步... {oneClickProgress.current} / {oneClickProgress.total}</span>
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5" />
                  一键同步所有本地卡片到云库
                </>
              )}
            </button>
            <p className="text-xs text-white/50 text-center">逐一将所有本地卡片同步到云端，避免内存不足闪退。</p>
          </div>

          <div className="p-4 bg-white/5 border border-white/10 rounded-xl space-y-4 mt-6">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-white/80">旧版完整压缩包备份 (易闪退)</h4>
`;

// Replace the old monolithic button area
code = code.replace(/<div className="p-4 bg-white\/5 border border-white\/10 rounded-xl space-y-4">[\s\S]*?<h4 className="text-sm font-medium text-white\/80">遗留 Zip 备份档案<\/h4>/m, newButton);

fs.writeFileSync('src/components/CloudSyncTab.tsx', code);
