import { useState, useEffect } from 'react';
import JSZip from 'jszip';
import { getFolders, getCharacters, getCharacter } from './db';

export interface ExportProgress {
  current: number;
  total: number;
  phase: string;
  downloadUrl?: string;
  filename?: string;
}

class ExportState {
  isExporting = false;
  progress: ExportProgress = { current: 0, total: 0, phase: '' };
  errorToast: string | null = null;
  listeners: Set<() => void> = new Set();
  
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  notify() {
    this.listeners.forEach(l => l());
  }
  
  setError(msg: string | null) {
    this.errorToast = msg;
    this.notify();
    if (msg) {
      setTimeout(() => {
        if (this.errorToast === msg) {
          this.errorToast = null;
          this.notify();
        }
      }, 5000);
    }
  }

  dismiss() {
    if (this.progress.current >= this.progress.total) { // Only allow dismiss when finished or before start? Actually if finished it dismisses itself.
       this.isExporting = false;
       this.notify();
    }
  }

  public async getSafeFilename(name: string) {
    return name.replace(/[/\\?%*:|"<>]/g, '-').trim() || 'unnamed';
  }

  public async addCharacterToZip(char: any, zipFolder: JSZip) {
    const rawName = char.data?.data?.name || char.name || 'unnamed';
    const safeName = await this.getSafeFilename(rawName);
    const exportFileName = `${safeName}.png`;
    
    const rawData = char.data || {};
    const isPreset = !!(rawData.prompts || rawData.temperature !== undefined || rawData.top_p !== undefined);
    const isStandaloneWorldbook = rawData.entries !== undefined;
    const isTheme = rawData.blur_strength !== undefined || rawData.main_text_color !== undefined || rawData.chat_display !== undefined;

    if (isPreset || isStandaloneWorldbook || isTheme) {
      zipFolder.file(`${safeName}.json`, JSON.stringify(char.data, null, 2));
      return;
    }
    
    let baseBlob = char.avatarBlob || char.originalFile;
    
    if (!baseBlob && char.avatar && typeof char.avatar === 'string' && char.avatar.startsWith('data:image')) {
      try {
        baseBlob = await (await fetch(char.avatar)).blob();
      } catch (e) {
        console.warn("Failed to fetch blob from char.avatar data URI", e);
      }
    }

    if (baseBlob) {
      try {
        const { injectTavernData } = await import('./png');
        const buffer = await baseBlob.arrayBuffer();
        const newBuffer = injectTavernData(buffer, char.data);
        const finalBlob = new Blob([newBuffer], { type: baseBlob.type || 'image/png' });
        zipFolder.file(exportFileName, finalBlob);
      } catch (e) {
        console.error("Failed to inject PNG for export", e);
        zipFolder.file(exportFileName, baseBlob);
        zipFolder.file(`${safeName}.json`, JSON.stringify(char.data, null, 2));
      }
    } else {
      zipFolder.file(`${safeName}.json`, JSON.stringify(char.data, null, 2));
    }
  }

  async startBatchExport(selectedIds: Set<string> | string[]) {
    // Convert to array to ensure we capture the values right now
    const idsToExport = Array.from(selectedIds);
    if (this.isExporting || idsToExport.length === 0) return;
    
    this.isExporting = true;
    this.progress = { current: 0, total: 0, phase: '准备中...' };
    this.notify();

    try {
      const zip = new JSZip();
      const allFolders = await getFolders();
      
      let totalToExport = 0;
      const countRecursive = async (fid: string) => {
        const { total } = await getCharacters(1, 100000, fid, '', [], 'newest_import', false);
        totalToExport += total;
        const sub = allFolders.filter(f => f.parentId === fid);
        for (const s of sub) {
          await countRecursive(s.id);
        }
      };

      for (const id of idsToExport) {
        if (allFolders.some(f => f.id === id)) {
           await countRecursive(id);
        } else {
           totalToExport++;
        }
      }

      console.log(`[BatchExport] Target total to export: ${totalToExport}`);

      this.progress = { current: 0, total: totalToExport, phase: '正在打包角色...' };
      this.notify();
      
      let currentProcessed = 0;
      
      for (const id of idsToExport) {
        const folder = allFolders.find(f => f.id === id);
        if (folder) {
          const exportFolderRecursive = async (currentFolderId: string, currentZip: JSZip) => {
            const { characters: folderChars } = await getCharacters(1, 100000, currentFolderId, '', [], 'newest_import', false);
            for (const charMeta of folderChars) {
              const char = await getCharacter(charMeta.id);
              if (char) {
                await this.addCharacterToZip(char, currentZip);
                currentProcessed++;
                this.progress = { current: currentProcessed, total: totalToExport, phase: '正在打包角色...' };
                this.notify();
                await new Promise(resolve => setTimeout(resolve, 5)); 
              }
            }
            
            const subFolders = allFolders.filter(f => f.parentId === currentFolderId);
            for (const subFolder of subFolders) {
              const subZip = currentZip.folder(await this.getSafeFilename(subFolder.name));
              if (subZip) {
                await exportFolderRecursive(subFolder.id, subZip);
              }
            }
          };
          
          const folderZip = zip.folder(await this.getSafeFilename(folder.name));
          if (folderZip) {
             await exportFolderRecursive(folder.id, folderZip);
          }
        } else {
          const char = await getCharacter(id);
          if (char) {
            console.log(`[BatchExport] Adding character ${char.name} (ID: ${char.id})`);
            await this.addCharacterToZip(char, zip);
            currentProcessed++;
            this.progress = { current: currentProcessed, total: totalToExport, phase: '正在打包角色...' };
            this.notify();
            await new Promise(resolve => setTimeout(resolve, 5));
          } else {
            console.warn(`[BatchExport] Character not found for ID: ${id}`);
          }
        }
      }
      
      if (currentProcessed === 0) {
        throw new Error("没有任何角色需要导出。");
      }

      console.log(`[BatchExport] Generating zip for ${currentProcessed} characters...`);
      this.progress = { current: currentProcessed, total: totalToExport, phase: '正在生成压缩包...' };
      this.notify();
      
      const zipBlob = await zip.generateAsync({ 
        type: 'blob',
        compression: 'STORE'
      }, (metadata) => {
        this.progress = { current: Math.floor(metadata.percent), total: 100, phase: '正在写入...' };
        this.notify();
      });

      console.log(`[BatchExport] Zip generated, size: ${zipBlob.size} bytes`);
      if (zipBlob.size < 100) {
        console.warn("[BatchExport] Zip might be suspiciously small (empty).");
      }

      const url = URL.createObjectURL(zipBlob);
      const filename = `Tavern_Export_${new Date().toISOString().slice(0, 10)}.zip`;

      this.progress = { 
        current: 100, 
        total: 100, 
        phase: '打包完成！请点击下载', 
        downloadUrl: url,
        filename 
      };
      this.notify();
      
    } catch (e: any) {
      console.error("Batch export failed", e);
      this.setError("导出失败: " + e.message);
      this.isExporting = false;
      this.notify();
    }
  }
}

export const exportState = new ExportState();

export function useExportState() {
  const [state, setState] = useState({
    isExporting: exportState.isExporting,
    progress: exportState.progress,
    errorToast: exportState.errorToast,
  });

  useEffect(() => {
    const update = () => {
      setState({
        isExporting: exportState.isExporting,
        progress: { ...exportState.progress },
        errorToast: exportState.errorToast,
      });
    };
    const unsubscribe = exportState.subscribe(update);
    return unsubscribe;
  }, []);

  return state;
}
