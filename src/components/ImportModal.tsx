import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, UploadCloud, FileJson, Image as ImageIcon, Folder, AlertCircle, FileArchive } from 'lucide-react';
import { extractTavernData } from '../lib/png';
import { saveCharacter, saveCharacters, CharacterCard, getFolders, saveFolder, Folder as DBFolder } from '../lib/db';
import { normalizeWorldbookEntries } from '../lib/worldbook';
import { parseTavernCard } from '../types/tavern';
import JSZip from 'jszip';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onImported: () => void;
  folderId?: string | null;
}

interface ParsedItem {
  file: File;
  path: string;
  folder: string;
  isMain: boolean;
  data?: any;
  isImage: boolean;
  errorMsg?: string;
}

export function ImportModal({ isOpen, onClose, onImported, folderId }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<{file: string, error: string}[]>([]);
  const [progress, setProgress] = useState<{ current: number; total: number; message?: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const getOrCreateNestedFolder = async (pathParts: string[]): Promise<string | undefined> => {
    if (pathParts.length === 0) return undefined;
    let currentParentId: string | null = null;
    
    const folders = await getFolders();
    
    for (const part of pathParts) {
      const existing = folders.find(f => f.name === part && (f.parentId || null) === currentParentId);
      if (existing) {
        currentParentId = existing.id;
      } else {
        const newFolder: DBFolder = {
          id: crypto.randomUUID(),
          name: part,
          createdAt: Date.now(),
          parentId: currentParentId
        };
        await saveFolder(newFolder);
        folders.push(newFolder);
        currentParentId = newFolder.id;
      }
    }
    return currentParentId || undefined;
  };

  const parseChunk = async (files: File[], startIndex: number, chunkSize: number, parsedItems: ParsedItem[], errors: {file: string, error: string}[]) => {
    const endIndex = Math.min(startIndex + chunkSize, files.length);
    
    for (let i = startIndex; i < endIndex; i++) {
      const file = files[i];
      const path = file.webkitRelativePath || file.name;
      const folder = path.substring(0, path.lastIndexOf('/')) || '';
      const isImage = file.type.startsWith('image/') || file.name.match(/\.(png|jpe?g|webp|gif)$/i) !== null;
      
      let isMain = false;
      let data: any = null;
      let errorMsg = '';
      
      try {
        if (file.type === 'image/png' || file.name.endsWith('.png')) {
          const buffer = await file.arrayBuffer();
          data = await extractTavernData(buffer);
          if (data) {
            isMain = true;
          } else {
            errorMsg = "非酒馆卡或预设格式：未找到Tavern角色数据。";
          }
        } else if (file.type === 'application/json' || file.name.endsWith('.json')) {
          const text = await file.text();
          data = JSON.parse(text);
          const isTheme = data.blur_strength !== undefined || data.main_text_color !== undefined || data.chat_display !== undefined;
          const isAIPreset = data.temperature !== undefined || data.prompts !== undefined || data.top_p !== undefined;
          const isWorldbook = data.entries !== undefined || (data.data && data.data.entries !== undefined);
          const isQR = Array.isArray(data) ? data.length > 0 && data[0].label !== undefined : data.quick_replies !== undefined;
          const isCharacter = !isTheme && !isAIPreset && !isWorldbook && !isQR && !!(data.name || data.data?.name);
          
          if (isTheme || isAIPreset || isWorldbook || isQR || isCharacter) {
            isMain = true;
          } else {
            errorMsg = "非酒馆卡或预设格式：无法识别的数据结构。";
          }
        } else {
          errorMsg = "不支持的文件格式。";
        }
      } catch (err: any) {
        errorMsg = err.message || '未知错误';
      }
      
      parsedItems.push({
        file,
        path,
        folder,
        isMain,
        data,
        isImage,
        errorMsg: isMain ? undefined : errorMsg
      });
      
      setProgress({ current: i + 1, total: files.length, message: '正在解析文件...' });
    }
    
    if (endIndex < files.length) {
      setTimeout(() => parseChunk(files, endIndex, chunkSize, parsedItems, errors), 0);
    } else {
      assembleAndSave(parsedItems, errors);
    }
  };

  const assembleAndSave = async (parsedItems: ParsedItem[], errors: {file: string, error: string}[]) => {
    let mainItems = parsedItems.filter(item => item.isMain);
    let altImages = parsedItems.filter(item => !item.isMain && item.isImage);
    const otherItems = parsedItems.filter(item => !item.isMain && !item.isImage);
    
    // Demote mainItems that are likely alternate avatars
    const itemsToDemote = new Set<ParsedItem>();
    const ALT_FOLDERS = ['替换卡面', '替换头像', 'avatars', 'alt', 'alternate'];
    
    for (const item of mainItems) {
      // 1. ONLY demote if it is explicitly inside a replacement avatar folder
      const folderParts = item.folder.split('/');
      const lastFolder = folderParts[folderParts.length - 1];
      if (ALT_FOLDERS.includes(lastFolder.toLowerCase())) {
        itemsToDemote.add(item);
      }
    }
    
    mainItems = mainItems.filter(item => !itemsToDemote.has(item));
    for (const item of itemsToDemote) {
      if (item.isImage) {
        altImages.push(item);
      } else {
        otherItems.push(item);
      }
    }
    
    for (const item of otherItems) {
      errors.push({ file: item.file.name, error: item.errorMsg || '无效文件' });
    }
    
    const altImagesByMain = new Map<ParsedItem, File[]>();
    const unassignedAltImages: ParsedItem[] = [];
    
    for (const alt of altImages) {
      const possibleMains = mainItems.filter(main => {
        // ONLY match if the alt image is inside the '替换头像' folder of the main card
        const mainPrefix = main.folder ? main.folder + '/' : '';
        if (alt.folder.startsWith(mainPrefix)) {
          const relative = alt.folder.substring(mainPrefix.length);
          const firstFolder = relative.split('/')[0];
          if (ALT_FOLDERS.includes(firstFolder.toLowerCase())) {
            return true;
          }
        }
        return false;
      });
      
      possibleMains.sort((a, b) => b.folder.length - a.folder.length);
      
      if (possibleMains.length > 0) {
        const closestMain = possibleMains[0];
        if (!altImagesByMain.has(closestMain)) {
          altImagesByMain.set(closestMain, []);
        }
        altImagesByMain.get(closestMain)!.push(alt.file);
      } else {
        unassignedAltImages.push(alt);
      }
    }
    
    for (const alt of unassignedAltImages) {
      errors.push({ file: alt.file.name, error: alt.errorMsg || '作为替换卡面导入失败：未找到所属角色卡' });
    }
    
    const charsToSave: CharacterCard[] = [];
    let successCount = 0;
    
    for (let i = 0; i < mainItems.length; i++) {
      const item = mainItems[i];
      try {
        let targetFolderId = folderId || undefined;
        let charName = 'Unknown';
        
        let folderParts: string[] = [];
        if (item.folder) {
          folderParts = item.folder.split('/').filter(Boolean);
        }
        
        const data = item.data;
        const file = item.file;
        
        // Normalize worldbook entries
        if (data.entries) {
          data.entries = normalizeWorldbookEntries(data.entries);
        } else if (data.data && data.data.entries) {
          data.data.entries = normalizeWorldbookEntries(data.data.entries);
        }
        
        if (data.character_book && data.character_book.entries) {
          data.character_book.entries = normalizeWorldbookEntries(data.character_book.entries);
        }
        if (data.data?.character_book?.entries) {
          data.data.character_book.entries = normalizeWorldbookEntries(data.data.character_book.entries);
        }
        if (data.extensions?.character_book?.entries) {
          data.extensions.character_book.entries = normalizeWorldbookEntries(data.extensions.character_book.entries);
        }
        if (data.data?.extensions?.character_book?.entries) {
          data.data.extensions.character_book.entries = normalizeWorldbookEntries(data.data.extensions.character_book.entries);
        }
        
        const isTheme = data.blur_strength !== undefined || data.main_text_color !== undefined || data.chat_display !== undefined;
        const isAIPreset = data.temperature !== undefined || data.prompts !== undefined || data.top_p !== undefined;
        const isWorldbook = data.entries !== undefined || (data.data && data.data.entries !== undefined);
        const isQR = Array.isArray(data) ? data.length > 0 && data[0].label !== undefined : data.quick_replies !== undefined;
        const isCharacter = !isTheme && !isAIPreset && !isWorldbook && !isQR && !!(data.name || data.data?.name);
        
        let pathPrefix: string[] = [];

        if (isTheme) {
          pathPrefix = ['美化'];
          charName = data.name || file.name.replace(/\.[^/.]+$/, "");
        } else if (isAIPreset) {
          pathPrefix = ['预设'];
          charName = data.name || file.name.replace(/\.[^/.]+$/, "");
        } else if (isWorldbook) {
          pathPrefix = ['世界书'];
          charName = data.name || data.data?.name || file.name.replace(/\.[^/.]+$/, "");
        } else if (isQR) {
          pathPrefix = ['快速回复'];
          charName = file.name.replace(/\.[^/.]+$/, "");
        } else if (isCharacter) {
          charName = data.name || data.data?.name || 'Unknown Character';
        }
        
        if (pathPrefix.length > 0) {
          targetFolderId = await getOrCreateNestedFolder([...pathPrefix, ...folderParts]);
        } else if (folderParts.length > 0) {
          targetFolderId = await getOrCreateNestedFolder(folderParts);
        } else {
          targetFolderId = folderId || undefined;
        }
        
        const avatarUrlFallback = (file.type === 'image/png' || file.name.endsWith('.png')) 
          ? '' 
          : `https://api.dicebear.com/7.x/bottts/svg?seed=${charName}`;
          
        const newChar: CharacterCard = {
          id: crypto.randomUUID(),
          name: charName,
          avatarBlob: (file.type === 'image/png' || file.name.endsWith('.png')) ? file : undefined,
          avatarUrlFallback,
          data: data,
          originalFile: (file.type === 'image/png' || file.name.endsWith('.png')) ? file : undefined,
          createdAt: Date.now(),
          folderId: targetFolderId,
          avatarHistory: altImagesByMain.get(item) || []
        };
        
        charsToSave.push(newChar);
        successCount++;
      } catch (err: any) {
        errors.push({ file: item.file.name, error: err.message || '未知错误' });
      }
      
      setProgress({ current: i + 1, total: mainItems.length, message: '正在保存角色...' });
    }
    
    if (charsToSave.length > 0) {
      await saveCharacters(charsToSave);
    }
    
    setProgress(null);
    if (errors.length > 0) {
      setImportErrors(errors);
      if (successCount > 0) {
        onImported();
      }
    } else if (successCount === 0) {
      setError("未能成功导入任何文件。");
    } else {
      onImported();
      onClose();
    }
  };

  const handleFiles = async (files: FileList | File[]) => {
    setError(null);
    setImportErrors([]);
    
    let fileArray: File[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f.name.endsWith('.zip')) {
        try {
          const zip = await JSZip.loadAsync(f);
          for (const relativePath in zip.files) {
            const zipEntry = zip.files[relativePath];
            if (!zipEntry.dir && (relativePath.match(/\.(png|jpe?g|webp|gif|json)$/i))) {
              const blob = await zipEntry.async('blob');
              
              let type = 'application/octet-stream';
              if (relativePath.endsWith('.png')) type = 'image/png';
              else if (relativePath.match(/\.jpe?g$/i)) type = 'image/jpeg';
              else if (relativePath.endsWith('.webp')) type = 'image/webp';
              else if (relativePath.endsWith('.gif')) type = 'image/gif';
              else if (relativePath.endsWith('.json')) type = 'application/json';
              
              const extractedFile = new File([blob], zipEntry.name.split('/').pop() || 'file', { type });
              // Mock webkitRelativePath to preserve folder structure from ZIP
              Object.defineProperty(extractedFile, 'webkitRelativePath', {
                value: relativePath,
                writable: false
              });
              fileArray.push(extractedFile);
            }
          }
        } catch (e) {
          console.error("Failed to read zip", e);
          setError(`ZIP 文件读取失败: ${f.name}`);
          return;
        }
      } else if (f.type.startsWith('image/') || f.name.match(/\.(png|jpe?g|webp|gif)$/i) || f.type === 'application/json' || f.name.endsWith('.json')) {
        fileArray.push(f);
      }
    }

    if (fileArray.length === 0) {
      setError("未找到有效的图片、JSON 或 ZIP 文件。");
      return;
    }

    setProgress({ current: 0, total: fileArray.length, message: '准备导入...' });
    
    // Process in chunks of 50 to avoid blocking UI
    parseChunk(fileArray, 0, 50, [], []);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (!e.dataTransfer.items) {
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
      return;
    }

    const allFiles: File[] = [];
    
    const readEntry = async (entry: any, path = '') => {
      if (entry.isFile) {
        const file = await new Promise<File>((resolve, reject) => entry.file(resolve, reject));
        // Mock webkitRelativePath so processChunk can create folders
        Object.defineProperty(file, 'webkitRelativePath', {
          value: path + file.name,
          writable: false
        });
        allFiles.push(file);
      } else if (entry.isDirectory) {
        const dirReader = entry.createReader();
        const readAllEntries = async () => {
          let entries: any[] = [];
          let keepReading = true;
          while (keepReading) {
            const batch = await new Promise<any[]>((resolve, reject) => {
              dirReader.readEntries(resolve, reject);
            });
            if (batch.length > 0) {
              entries = entries.concat(batch);
            } else {
              keepReading = false;
            }
          }
          return entries;
        };
        const entries = await readAllEntries();
        for (const child of entries) {
          await readEntry(child, path + entry.name + '/');
        }
      }
    };

    const promises = [];
    for (let i = 0; i < e.dataTransfer.items.length; i++) {
      const item = e.dataTransfer.items[i];
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry();
        if (entry) {
          promises.push(readEntry(entry, ''));
        }
      }
    }

    await Promise.all(promises);

    if (allFiles.length > 0) {
      handleFiles(allFiles);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={progress ? undefined : onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-md bg-slate-900/80 backdrop-blur-2xl border border-white/10 rounded-3xl p-6 shadow-2xl z-50 text-white"
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
                导入角色卡
              </h2>
              {!progress && (
                <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition">
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {importErrors.length > 0 ? (
              <div className="py-4 flex flex-col max-h-[60vh]">
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex-1 overflow-y-auto">
                  <div className="flex items-center gap-2 text-red-400 mb-3 sticky top-0 bg-slate-900/90 backdrop-blur-sm py-1">
                    <AlertCircle className="w-5 h-5" />
                    <h3 className="font-bold">部分文件导入失败 ({importErrors.length})</h3>
                  </div>
                  <ul className="space-y-2 text-sm text-red-300/80">
                    {importErrors.map((err, i) => (
                      <li key={i} className="flex flex-col bg-black/20 p-2 rounded">
                        <span className="font-medium text-red-300 truncate">{err.file}</span>
                        <span className="text-xs opacity-80 mt-0.5">{err.error}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <button 
                  onClick={() => {
                    setImportErrors([]);
                    onClose();
                  }}
                  className="w-full mt-4 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition"
                >
                  关闭
                </button>
              </div>
            ) : progress ? (
              <div className="py-8 flex flex-col items-center">
                <div className="w-16 h-16 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mb-4" />
                <p className="text-lg font-medium">{progress.message || '导入中...'}</p>
                <p className="text-slate-400">{progress.current} / {progress.total}</p>
                <div className="w-full bg-white/10 rounded-full h-2 mt-4 overflow-hidden">
                  <div 
                    className="bg-gradient-to-r from-purple-500 to-pink-500 h-full transition-all duration-300"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
              </div>
            ) : (
              <>
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-colors ${
                    isDragging ? 'border-purple-500 bg-purple-500/10' : 'border-white/20 hover:border-white/40 hover:bg-white/5'
                  }`}
                >
                  <UploadCloud className={`w-12 h-12 mb-4 ${isDragging ? 'text-purple-400' : 'text-slate-400'}`} />
                  <p className="text-center font-medium mb-1">点击上传或拖拽文件到此处</p>
                  <p className="text-center text-sm text-slate-400">支持多个 PNG/JSON 格式，或包含文件夹结构的 ZIP 压缩包</p>
                  
                  <div className="flex gap-4 mt-6 text-slate-500">
                    <div className="flex items-center gap-1 text-xs"><ImageIcon className="w-4 h-4" /> PNG</div>
                    <div className="flex items-center gap-1 text-xs"><FileJson className="w-4 h-4" /> JSON</div>
                    <div className="flex items-center gap-1 text-xs"><FileArchive className="w-4 h-4" /> ZIP</div>
                  </div>
                </div>

                <div className="mt-4 flex flex-col items-center gap-2">
                  <button 
                    onClick={() => folderInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl transition text-sm text-slate-300"
                  >
                    <Folder className="w-4 h-4" />
                    选择单个文件夹 (仅限电脑端)
                  </button>
                  <p className="text-xs text-slate-500 text-center">
                    提示：手机端受系统限制无法直接选择文件夹，请将文件夹打包成 ZIP 压缩包后上传，或直接多选文件。
                  </p>
                </div>

                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-200 text-sm"
                  >
                    {error}
                  </motion.div>
                )}
              </>
            )}

            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
              accept=".png,.jpg,.jpeg,.webp,.gif,.json,.zip,image/*,application/json,application/zip,application/x-zip-compressed"
              className="hidden"
              multiple
            />
            <input
              type="file"
              ref={folderInputRef}
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
              className="hidden"
              multiple
              {...({ webkitdirectory: "", directory: "" } as any)}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
