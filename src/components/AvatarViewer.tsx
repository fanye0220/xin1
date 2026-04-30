import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { X, Upload, Check, Trash2, Download } from 'lucide-react';
import { CharacterCard, saveCharacter } from '../lib/db';

interface Props {
  character: CharacterCard;
  onClose: () => void;
  onUpdate: (updatedCharacter: CharacterCard) => void;
}

export function AvatarViewer({ character, onClose, onUpdate }: Props) {
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState<string>('');
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [historyUrls, setHistoryUrls] = useState<{ blob: Blob, url: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (previewBlob) {
      const url = URL.createObjectURL(previewBlob);
      setCurrentAvatarUrl(url);
      return () => URL.revokeObjectURL(url);
    } else if (character.avatarBlob) {
      const url = URL.createObjectURL(character.avatarBlob);
      setCurrentAvatarUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setCurrentAvatarUrl(character.avatarUrlFallback || '');
    }
  }, [character.avatarBlob, character.avatarUrlFallback, previewBlob]);

  useEffect(() => {
    const urls = (character.avatarHistory || []).map(blob => ({
      blob,
      url: URL.createObjectURL(blob)
    }));
    
    // Add current avatar to history if it's not there and is a blob
    if (character.avatarBlob) {
      const isCurrentInHistory = character.avatarHistory?.some(b => b === character.avatarBlob || (b.size === character.avatarBlob?.size && b.type === character.avatarBlob?.type));
      if (!isCurrentInHistory) {
        urls.unshift({
          blob: character.avatarBlob,
          url: URL.createObjectURL(character.avatarBlob)
        });
      }
    }

    setHistoryUrls(urls);

    return () => {
      urls.forEach(item => URL.revokeObjectURL(item.url));
    };
  }, [character.avatarHistory, character.avatarBlob]);

  const convertToPng = async (blob: Blob): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        // Resize if too large (mobile canvas limit prevention)
        const MAX_SIZE = 1024;
        if (width > MAX_SIZE || height > MAX_SIZE) {
          if (width > height) {
            height = Math.round((height * MAX_SIZE) / width);
            width = MAX_SIZE;
          } else {
            width = Math.round((width * MAX_SIZE) / height);
            height = MAX_SIZE;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('No canvas context'));
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((b) => {
          if (b) resolve(b);
          else reject(new Error('Canvas toBlob failed'));
        }, 'image/png');
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(blob);
    });
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const newHistory = character.avatarHistory ? [...character.avatarHistory] : [];
    if (character.avatarBlob) {
      const isCurrentInHistory = newHistory.some(b => b === character.avatarBlob || (b.size === character.avatarBlob?.size && b.type === character.avatarBlob?.type));
      if (!isCurrentInHistory) {
        newHistory.unshift(character.avatarBlob);
      }
    }
    
    // Inject current character data into the new PNG so it becomes a valid Tavern card
    let finalFile: File = file;
    
    try {
      let pngBlob: Blob = file;
      if (file.type !== 'image/png' && !(file.name && file.name.endsWith('.png'))) {
        pngBlob = await convertToPng(file);
      }
      
      const { injectTavernData } = await import('../lib/png');
      const buffer = await pngBlob.arrayBuffer();
      const newBuffer = injectTavernData(buffer, character.data);
      
      finalFile = new File([newBuffer], (file.name || 'avatar').replace(/\.[^/.]+$/, "") + ".png", { type: 'image/png' });
    } catch (err) {
      console.error("Failed to inject data into new avatar", err);
    }
    
    newHistory.unshift(finalFile);

    const updatedCharacter = {
      ...character,
      avatarBlob: finalFile,
      originalFile: finalFile,
      avatarHistory: newHistory
    };

    await saveCharacter(updatedCharacter);
    onUpdate(updatedCharacter);
  };

  const handleSelectHistory = (blob: Blob) => {
    setPreviewBlob(blob);
  };

  const handleSetAsAvatar = async () => {
    if (!previewBlob || previewBlob === character.avatarBlob) return;

    let finalFile: File;
    if (previewBlob instanceof File) {
      finalFile = previewBlob;
    } else {
      finalFile = new File([previewBlob], 'avatar.png', { type: previewBlob.type });
    }
    
    try {
      let pngBlob: Blob = previewBlob;
      if (previewBlob.type !== 'image/png') {
        pngBlob = await convertToPng(previewBlob);
      }
      
      const { injectTavernData } = await import('../lib/png');
      const buffer = await pngBlob.arrayBuffer();
      const newBuffer = injectTavernData(buffer, character.data);
      
      finalFile = new File([newBuffer], 'avatar.png', { type: 'image/png' });
    } catch (err) {
      console.error("Failed to inject data into history avatar", err);
    }

    const updatedCharacter = {
      ...character,
      avatarBlob: finalFile,
      originalFile: finalFile
    };

    await saveCharacter(updatedCharacter);
    onUpdate(updatedCharacter);
    setPreviewBlob(null); // Reset preview so it matches current
  };

  const handleDeleteHistory = async (e: React.MouseEvent, blobToDelete: Blob) => {
    e.stopPropagation();
    
    const newHistory = (character.avatarHistory || []).filter(b => b !== blobToDelete && !(b.size === blobToDelete.size && b.type === blobToDelete.type));
    
    const updatedCharacter = {
      ...character,
      avatarHistory: newHistory
    };

    if (previewBlob === blobToDelete) {
      setPreviewBlob(null);
    }

    await saveCharacter(updatedCharacter);
    onUpdate(updatedCharacter);
  };

  const handleExportAvatar = () => {
    const blobToExport = previewBlob || character.avatarBlob;
    if (!blobToExport) return;

    const url = URL.createObjectURL(blobToExport);
    const a = document.createElement('a');
    a.href = url;
    
    // Determine extension based on blob type
    let ext = 'png';
    if (blobToExport.type === 'image/jpeg') ext = 'jpg';
    else if (blobToExport.type === 'image/webp') ext = 'webp';
    
    a.download = `${character.name || 'avatar'}_image.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] bg-black flex flex-col"
    >
      <div className="absolute top-0 left-0 right-0 p-4 pt-7 sm:pt-7 flex justify-between items-center z-10 bg-gradient-to-b from-black/60 to-transparent">
        <button onClick={onClose} className="p-2 rounded-full bg-black/40 text-white hover:bg-black/60 transition">
          <X className="w-6 h-6" />
        </button>
        <div className="text-white font-medium drop-shadow-md">
          {previewBlob && previewBlob !== character.avatarBlob ? '预览历史头像' : '当前头像'}
        </div>
        <div className="flex gap-2">
          <button 
            onClick={handleExportAvatar}
            className="p-2 rounded-full bg-black/40 text-white hover:bg-white/20 transition"
            title="导出图片"
          >
            <Download className="w-6 h-6" />
          </button>
          {previewBlob && previewBlob !== character.avatarBlob && (
            <button 
              onClick={(e) => handleDeleteHistory(e, previewBlob)}
              className="p-2 rounded-full bg-black/40 text-red-400 hover:bg-red-500/20 transition"
              title="删除此历史头像"
            >
              <Trash2 className="w-6 h-6" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 relative flex flex-col items-center justify-center overflow-hidden">
        <TransformWrapper
          initialScale={1}
          minScale={0.5}
          maxScale={5}
          centerOnInit
        >
          <TransformComponent 
            wrapperClass="w-full h-full" 
            wrapperStyle={{ width: '100%', height: '100%' }}
            contentClass="w-full h-full flex items-center justify-center p-4"
            contentStyle={{ width: '100%', height: '100%' }}
          >
            <motion.img
              key={currentAvatarUrl}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              src={currentAvatarUrl}
              alt="Current Avatar"
              draggable={false}
              className="w-full h-full object-contain cursor-grab active:cursor-grabbing"
            />
          </TransformComponent>
        </TransformWrapper>
        <AnimatePresence>
          {previewBlob && previewBlob !== character.avatarBlob && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute bottom-8 left-1/2 -translate-x-1/2"
            >
              <button
                onClick={handleSetAsAvatar}
                className="bg-purple-500 hover:bg-purple-600 text-white px-6 py-3 rounded-full font-medium shadow-lg shadow-purple-500/20 flex items-center gap-2 transition"
              >
                <Check className="w-5 h-5" />
                设为当前头像
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="bg-slate-900 rounded-t-3xl p-6 pb-8 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-white/80 font-medium">历史头像</h3>
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="text-purple-400 text-sm font-medium flex items-center gap-1 hover:text-purple-300 transition"
          >
            <Upload className="w-4 h-4" />
            上传新头像
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/png, image/jpeg, image/webp" 
            onChange={handleUpload}
          />
        </div>

        <div className="flex gap-3 overflow-x-auto pb-2 snap-x">
          {historyUrls.length === 0 && !character.avatarBlob && (
            <div className="text-white/40 text-sm py-4">暂无历史头像</div>
          )}
          {historyUrls.map((item, index) => {
            const isActualCurrent = item.blob === character.avatarBlob || (character.avatarBlob && item.blob.size === character.avatarBlob.size && item.blob.type === character.avatarBlob.type);
            const isPreviewed = item.blob === previewBlob || (!previewBlob && isActualCurrent);
            
            return (
              <div 
                key={index}
                onClick={() => handleSelectHistory(item.blob)}
                className={`group relative w-20 h-20 flex-shrink-0 rounded-xl overflow-hidden cursor-pointer snap-start transition-all ${isPreviewed ? 'ring-2 ring-purple-500 scale-105' : 'ring-1 ring-white/10 hover:ring-white/30 opacity-70 hover:opacity-100'}`}
              >
                <img src={item.url || undefined} alt={`History ${index}`} className="w-full h-full object-cover" />
                {isActualCurrent && (
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                    <div className="bg-purple-500 rounded-full p-1">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
