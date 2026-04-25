import React, { useRef, useState } from 'react';
import { Upload, FileJson, QrCode, Trash2, Download, Library } from 'lucide-react';
import { CharacterCard, saveCharacter } from '../lib/db';
import { SelectQRModal } from './SelectQRModal';

interface Props {
  character: CharacterCard;
  onUpdate: (updatedCharacter: CharacterCard) => void;
}

export function QuickRepliesSection({ character, onUpdate }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isSelectModalOpen, setIsSelectModalOpen] = useState(false);

  const hasQuickReplies = (() => {
    const targetData = character.data.data ? character.data.data : character.data;
    return targetData.extensions?.quick_replies && targetData.extensions.quick_replies.length > 0;
  })();

  const handleLibrarySelection = async (qrChar: CharacterCard) => {
    try {
      const qrData = qrChar.data || {};
      let newQRs = [];
      if (Array.isArray(qrData)) {
        newQRs = qrData;
      } else if (qrData.qrList && Array.isArray(qrData.qrList)) {
        newQRs = qrData.qrList;
      } else if (qrData.quick_replies && Array.isArray(qrData.quick_replies)) {
        newQRs = qrData.quick_replies;
      }

      const updatedChar = { ...character };
      let targetData = updatedChar.data.data ? updatedChar.data.data : updatedChar.data;
      
      targetData.extensions = { 
        ...(targetData.extensions || {}), 
        quick_replies: newQRs,
        qr_filename: `${qrChar.name}.json`
      };

      await saveCharacter(updatedChar);
      onUpdate(updatedChar);
      setIsSelectModalOpen(false);
    } catch (e) {
      console.error(e);
      try { alert('绑定失败: ' + e); } catch (err) {}
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        
        let newQRs = [];
        if (Array.isArray(json)) {
          newQRs = json;
        } else if (json.qrList && Array.isArray(json.qrList)) {
          newQRs = json.qrList;
        } else if (json.quick_replies && Array.isArray(json.quick_replies)) {
          newQRs = json.quick_replies;
        } else {
          throw new Error('Invalid format');
        }

        const updatedChar = { ...character };
        let targetData = updatedChar.data.data ? updatedChar.data.data : updatedChar.data;
        
        targetData.extensions = { 
          ...(targetData.extensions || {}), 
          quick_replies: newQRs, // Overwrite instead of append based on the UI
          qr_filename: file.name
        };

        await saveCharacter(updatedChar);
        onUpdate(updatedChar);
      } catch (error) {
        console.error("Failed to parse Quick Replies JSON", error);
        alert("无效的 JSON 文件");
        setFileName(null);
      }
    };
    reader.readAsText(file);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDownload = () => {
    const targetData = character.data.data ? character.data.data : character.data;
    const qrData = targetData.extensions?.quick_replies;
    if (!qrData) return;

    const blob = new Blob([JSON.stringify(qrData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = targetData.extensions?.qr_filename || `${character.name}_qr.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const displayFileName = (() => {
    const targetData = character.data.data ? character.data.data : character.data;
    return fileName || targetData.extensions?.qr_filename || `${character.name}_qr.json`;
  })();

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 mb-4 text-white/80">
        <QrCode className="w-5 h-5" />
        <h3 className="text-sm font-semibold uppercase tracking-wider">快速回复按钮 (QUICK REPLIES)</h3>
      </div>

      <div className="border border-dashed border-white/20 rounded-2xl p-6 bg-white/5 relative overflow-hidden">
        {hasQuickReplies ? (
          <div className="flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 text-green-400">
                <div className="w-2 h-2 rounded-full bg-green-400"></div>
                <span className="font-medium text-sm text-white/90">已导入快速回复配置</span>
              </div>
              <button 
                onClick={async () => {
                  const updatedChar = { ...character };
                  let targetData = updatedChar.data.data ? updatedChar.data.data : updatedChar.data;
                  if (targetData.extensions?.quick_replies) {
                    delete targetData.extensions.quick_replies;
                  }
                  await saveCharacter(updatedChar);
                  onUpdate(updatedChar);
                  setFileName(null);
                }}
                className="text-white/40 hover:text-red-400 transition"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-white/10 rounded-xl p-4 flex items-center text-sm text-white/80">
              <span className="truncate">{displayFileName}</span>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 mt-2">
              <button 
                onClick={handleDownload}
                className="flex-1 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" /> 下载 
              </button>
              <button 
                onClick={() => setIsSelectModalOpen(true)}
                className="flex-1 py-3 bg-purple-500/20 hover:bg-purple-500/40 text-purple-300 rounded-xl font-medium transition flex items-center justify-center gap-2"
              >
                <Library className="w-4 h-4" /> 替换 (库)
              </button>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition flex items-center justify-center gap-2"
              >
                <Upload className="w-4 h-4" /> 替换 (本地)
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-4">
            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 text-white/40">
              <Upload className="w-8 h-8" />
            </div>
            <p className="text-white/60 mb-6 font-medium text-sm">未导入快速回复配置</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="px-6 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition flex items-center gap-2"
              >
                <Upload className="w-4 h-4" /> 本地导入
              </button>
              <button 
                onClick={() => setIsSelectModalOpen(true)}
                className="px-6 py-2.5 bg-purple-500/20 hover:bg-purple-500/40 text-purple-300 rounded-xl font-medium transition flex items-center gap-2"
              >
                <Library className="w-4 h-4" /> 从库中选择
              </button>
            </div>
          </div>
        )}

        <SelectQRModal 
          isOpen={isSelectModalOpen}
          onClose={() => setIsSelectModalOpen(false)}
          onSelect={handleLibrarySelection}
        />

        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept=".json" 
          onChange={handleFileUpload}
        />
      </div>
    </div>
  );
}
