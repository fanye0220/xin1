import { useState, useEffect } from 'react';
import JSZip from 'jszip';
import { getFolders, getCharacters, getCharacter } from './db';

export interface ExportProgress {
  current: number;
  total: number;
  phase: string;
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

    if (baseBlob) {
      try {
        const { injectTavernData } = await import('./png');
        const buffer = await baseBlob.arrayBuffer();
        const newBuffer = injectTavernData(buffer, char.data);
        zipFolder.file(exportFileName, newBuffer);
      } catch (e) {
        console.error("Failed to inject PNG for export", e);
        zipFolder.file(exportFileName, baseBlob);
        zipFolder.file(`${safeName}.json`, JSON.stringify(char.data, null, 2));
      }
    } else {
      zipFolder.file(`${safeName}.json`, JSON.stringify(char.data, null, 2));
    }
  }

  async startBatchExport(selectedIds: Set<string>) {
    if (this.isExporting || selectedIds.size === 0) return;
    
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

      for (const id of selectedIds) {
        if (allFolders.some(f => f.id === id)) {
           await countRecursive(id);
        } else {
           totalToExport++;
        }
      }

      this.progress = { current: 0, total: totalToExport, phase: '正在打包角色...' };
      this.notify();
      
      let currentProcessed = 0;
      
      for (const id of selectedIds) {
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
            await this.addCharacterToZip(char, zip);
            currentProcessed++;
            this.progress = { current: currentProcessed, total: totalToExport, phase: '正在打包角色...' };
            this.notify();
            await new Promise(resolve => setTimeout(resolve, 5));
          }
        }
      }
      
      this.progress = { current: currentProcessed, total: totalToExport, phase: '正在生成压缩包...' };
      this.notify();
      
      const zipBlob = await zip.generateAsync({ 
        type: 'blob',
        compression: 'STORE'
      }, (metadata) => {
        this.progress = { current: Math.floor(metadata.percent), total: 100, phase: '正在写入...' };
        this.notify();
      });

      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Tavern_Export_${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      
    } catch (e: any) {
      console.error("Batch export failed", e);
      this.setError("导出失败: " + e.message);
    } finally {
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
