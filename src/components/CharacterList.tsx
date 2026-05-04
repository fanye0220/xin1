import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, BookOpen, ChevronLeft, ChevronRight, Trash2, CheckCircle2, X, FolderInput, Search, LayoutGrid, List, Filter, Folder as FolderIcon, Menu, Edit2, MoreVertical, Download, ArrowUpDown, LayoutDashboard, Link, Image as ImageIcon } from 'lucide-react';
import { getCharacters, deleteCharacter, CharacterCard, saveCharacter, getCharacter, Folder, getFolders, getAllTags, saveFolder, deleteFolder, SortOption } from '../lib/db';
import { MoveToFolderModal } from './MoveToFolderModal';
import { BindQRModal } from './BindQRModal';
import JSZip from 'jszip';
import { injectTavernData } from '../lib/png';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function FolderCover({ folder, previews }: { folder: Folder, previews: string[] }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (folder.avatarBlob) {
      const objectUrl = URL.createObjectURL(folder.avatarBlob);
      setUrl(objectUrl);
      return () => URL.revokeObjectURL(objectUrl);
    } else {
      setUrl(null);
    }
  }, [folder.avatarBlob]);

  if (url) {
    return (
      <div className="w-full h-full bg-black/20 flex items-center justify-center relative overflow-hidden rounded-[8px] md:rounded-[12px]">
        <div className="absolute inset-0 bg-cover bg-center blur-xl opacity-50" style={{ backgroundImage: `url(${url})` }} />
        <img src={url} alt="" className="w-full h-full object-cover relative z-10" />
      </div>
    );
  }

  if (previews.length > 0) {
    return (
      <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-1 pointer-events-none">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="w-full h-full bg-black/20 rounded-md overflow-hidden">
            {previews[i] && (
              <img src={previews[i]} alt="" className="w-full h-full object-cover" />
            )}
          </div>
        ))}
      </div>
    );
  }

  return <FolderIcon className="w-1/2 h-1/2 text-white/50 pointer-events-none" />;
}

function SortableItemWrapper({ id, children, disabled }: { id: string, children: React.ReactNode, disabled?: boolean }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    position: 'relative' as const,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

interface Props {
  key?: React.Key;
  folderId?: string | null;
  onSelect: (id: string) => void;
  onImport: () => void;
  onSelectFolder?: (id: string | null) => void;
  onOpenSidebar?: () => void;
  refreshTrigger?: number;
}

export function CharacterList({ folderId, onSelect, onImport, onSelectFolder, onOpenSidebar, refreshTrigger }: Props) {
  const [characters, setCharacters] = useState<CharacterCard[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderPreviews, setFolderPreviews] = useState<Record<string, string[]>>({});
  const [totalCharacters, setTotalCharacters] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => Number(localStorage.getItem('tavern_pageSize')) || 50);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'masonry'>('grid');
  const [sortBy, setSortBy] = useState<SortOption>(() => (localStorage.getItem('tavern_sortBy') as SortOption) || 'newest_import');
  const [isSortOpen, setIsSortOpen] = useState(false);
  
  const [allTags, setAllTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isEditingTags, setIsEditingTags] = useState(false);
  const [editingTagValue, setEditingTagValue] = useState<{old: string, new: string} | null>(null);
  const [tagSearchQuery, setTagSearchQuery] = useState('');
  const [isTagSearchOpen, setIsTagSearchOpen] = useState(false);
  
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const allFolders = await getFolders();
      
      for (const id of selectedIds) {
        const folder = allFolders.find(f => f.id === id);
        if (folder) {
          folder.avatarBlob = file;
          await saveFolder(folder);
        } else {
          const char = characters.find(c => c.id === id);
          if (char) {
             char.avatarBlob = file;
             await saveCharacter(char);
          }
        }
      }
      
      // reload
      loadData();
      getFolders().then(data => {
        let currentFolders: Folder[] = [];
        if (folderId === null) {
          currentFolders = data.filter(f => !f.parentId);
        } else {
          currentFolders = data.filter(f => f.parentId === folderId);
        }
        currentFolders.sort((a, b) => {
          if (sortBy === 'custom') {
            if (a.sortOrder !== undefined && b.sortOrder !== undefined) return a.sortOrder - b.sortOrder;
            if (a.sortOrder !== undefined) return -1;
            if (b.sortOrder !== undefined) return 1;
          }
          return b.createdAt - a.createdAt;
        });
        setFolders(currentFolders);
      });
      setSelectionMode(false);
      setSelectedIds(new Set());
    } catch (error) {
      console.error('Failed to change cover:', error);
      alert('封面更换失败');
    }
  };
  const [currentFolderName, setCurrentFolderName] = useState<string | null>(null);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [isBindModalOpen, setIsBindModalOpen] = useState(false);
  const longPressRef = useRef<{ timer: NodeJS.Timeout | null, triggered: boolean, startY?: number }>({ timer: null, triggered: false });

  const [showScrollTop, setShowScrollTop] = useState(false);
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [isFoldersExpanded, setIsFoldersExpanded] = useState(() => localStorage.getItem('tavern_foldersExpanded') !== 'false');
  const lastScrollY = useRef(0);
  const filterRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('tavern_foldersExpanded', isFoldersExpanded.toString());
  }, [isFoldersExpanded]);

  useEffect(() => {
    localStorage.setItem('tavern_pageSize', pageSize.toString());
  }, [pageSize]);

  useEffect(() => {
    localStorage.setItem('tavern_sortBy', sortBy);
  }, [sortBy]);

  useEffect(() => {
    const scrollContainer = document.getElementById('main-scroll-container');
    if (!scrollContainer) return;

    const handleScroll = () => {
      const currentScrollY = scrollContainer.scrollTop;
      setShowScrollTop(currentScrollY > 500);
      
      if (currentScrollY > lastScrollY.current + 10 && currentScrollY > 100) {
        setIsHeaderVisible(false);
      } else if (currentScrollY < lastScrollY.current - 10 || currentScrollY < 100) {
        setIsHeaderVisible(true);
      }
      lastScrollY.current = currentScrollY;
    };

    scrollContainer.addEventListener('scroll', handleScroll);
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    const scrollContainer = document.getElementById('main-scroll-container');
    if (scrollContainer) {
      scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleBack = async () => {
    if (!folderId) return;
    const allFolders = await getFolders();
    const current = allFolders.find(f => f.id === folderId);
    onSelectFolder?.(current?.parentId || null);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      setIsCreatingFolder(false);
      return;
    }
    const newFolder: Folder = {
      id: crypto.randomUUID(),
      name: newFolderName.trim(),
      createdAt: Date.now(),
      parentId: folderId || null
    };
    await saveFolder(newFolder);
    setNewFolderName('');
    setIsCreatingFolder(false);
    loadData();
  };

  const handleUpdateFolder = async () => {
    if (!editingFolder || !newFolderName.trim()) {
      setEditingFolder(null);
      return;
    }
    await saveFolder({ ...editingFolder, name: newFolderName.trim() });
    setEditingFolder(null);
    setNewFolderName('');
    loadData();
  };

  const handleDeleteFolder = async (id: string, name: string) => {
    if (confirm(`确定要删除文件夹 "${name}" 吗？\n文件夹内的角色不会被删除，它们将回到主页。`)) {
      await deleteFolder(id);
      loadData();
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
        delay: 200,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    if (sortBy !== 'custom') {
      setSortBy('custom');
    }

    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);

    const isFolder = activeIdStr.startsWith('folder-');
    
    if (isFolder) {
      const activeId = activeIdStr.replace('folder-', '');
      const overId = overIdStr.replace('folder-', '');
      
      const oldIndex = folders.findIndex(f => f.id === activeId);
      const newIndex = folders.findIndex(f => f.id === overId);
      
      if (oldIndex !== -1 && newIndex !== -1) {
        const newFolders = arrayMove(folders, oldIndex, newIndex);
        setFolders(newFolders);
        // Save new order to db
        newFolders.forEach((f, i) => {
          f.sortOrder = i;
          saveFolder(f);
        });
      }
    } else {
      const activeId = activeIdStr.replace('char-', '');
      const overId = overIdStr.replace('char-', '');
      
      const oldIndex = characters.findIndex(c => c.id === activeId);
      const newIndex = characters.findIndex(c => c.id === overId);
      
      if (oldIndex !== -1 && newIndex !== -1) {
        const newChars = arrayMove(characters, oldIndex, newIndex);
        setCharacters(newChars);
        // Save new order to db
        newChars.forEach((c, i) => {
          c.sortOrder = i;
          saveCharacter(c);
        });
      }
    }
  };

  const loadData = () => {
    getCharacters(page, pageSize, folderId, searchQuery, selectedTags, sortBy).then(({ characters, total }) => {
      setCharacters(characters);
      setTotalCharacters(total);
    });
    
    getFolders().then(async data => {
      let currentFolders: Folder[] = [];
      if (folderId === null) {
        currentFolders = data.filter(f => !f.parentId);
        setCurrentFolderName(null);
      } else {
        currentFolders = data.filter(f => f.parentId === folderId);
        const currentFolder = data.find(f => f.id === folderId);
        if (currentFolder) setCurrentFolderName(currentFolder.name);
      }
      
      currentFolders.sort((a, b) => {
        if (sortBy === 'custom') {
          if (a.sortOrder !== undefined && b.sortOrder !== undefined) return a.sortOrder - b.sortOrder;
          if (a.sortOrder !== undefined) return -1;
          if (b.sortOrder !== undefined) return 1;
        }
        return b.createdAt - a.createdAt;
      });
      
      setFolders(currentFolders);
      
      // Fetch previews for folders concurrently
      try {
        const { getFolderPreviews } = await import('../lib/db');
        const folderIds = currentFolders.map(f => f.id);
        const previews = await getFolderPreviews(folderIds);
        setFolderPreviews(previews);
      } catch (err) {
        console.error("Failed to load folder previews", err);
      }
    });
  };

  useEffect(() => {
    loadData();
  }, [page, pageSize, folderId, searchQuery, selectedTags, sortBy, refreshTrigger]);

  useEffect(() => {
    getAllTags().then(setAllTags);
  }, [refreshTrigger, folderId]); // We can just fetch it when folder triggers, though realistically it only needs refreshTrigger. I will keep it as refreshTrigger.

  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent | TouchEvent) => {
      if (filterRef.current && filterRef.current.contains(e.target as Node)) return;
      if (sortRef.current && sortRef.current.contains(e.target as Node)) return;
      
      setIsFilterOpen(false);
      setIsSortOpen(false);
      setIsEditingTags(false);
      setEditingTagValue(null);
    };

    if (isFilterOpen || isSortOpen) {
      document.addEventListener('mousedown', handleGlobalClick);
      document.addEventListener('touchstart', handleGlobalClick, { passive: true });
    }

    return () => {
      document.removeEventListener('mousedown', handleGlobalClick);
      document.removeEventListener('touchstart', handleGlobalClick);
    };
  }, [isFilterOpen, isSortOpen]);

  const totalPages = Math.ceil(totalCharacters / pageSize);

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const handleSelectPage = () => {
    const pageItems = characters.length + (!searchQuery && selectedTags.length === 0 ? folders.length : 0);
    
    let allPageSelected = true;
    for (const c of characters) {
      if (!selectedIds.has(c.id)) allPageSelected = false;
    }
    if (!searchQuery && selectedTags.length === 0) {
      for (const f of folders) {
        if (!selectedIds.has(f.id)) allPageSelected = false;
      }
    }

    if (allPageSelected) {
      const newSet = new Set(selectedIds);
      characters.forEach(c => newSet.delete(c.id));
      if (!searchQuery && selectedTags.length === 0) {
        folders.forEach(f => newSet.delete(f.id));
      }
      setSelectedIds(newSet);
    } else {
      const newSet = new Set(selectedIds);
      characters.forEach(c => newSet.add(c.id));
      if (!searchQuery && selectedTags.length === 0) {
        folders.forEach(f => newSet.add(f.id));
      }
      setSelectedIds(newSet);
    }
  };

  const handleSelectAll = async () => {
    const { characters: allChars } = await getCharacters(1, 100000, folderId, searchQuery, selectedTags, sortBy, false);
    const totalItems = allChars.length + (!searchQuery && selectedTags.length === 0 ? folders.length : 0);
    
    if (selectedIds.size === totalItems) {
      setSelectedIds(new Set());
    } else {
      const newSet = new Set<string>();
      allChars.forEach(c => newSet.add(c.id));
      if (!searchQuery && selectedTags.length === 0) {
        folders.forEach(f => newSet.add(f.id));
      }
      setSelectedIds(newSet);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (confirm(`确定要删除选中的 ${selectedIds.size} 项吗？\n（选中的角色将被移至回收站，文件夹将被直接删除且其内子项将移动到上一级）`)) {
      for (const id of selectedIds) {
        if (folders.some(f => f.id === id)) {
          await deleteFolder(id);
        } else {
          await deleteCharacter(id);
        }
      }
      setSelectionMode(false);
      setSelectedIds(new Set());
      loadData();
    }
  };

  const getSafeFilename = (name: string) => {
    return name.replace(/[\\/:*?"<>|]/g, '_') || 'character';
  };

  const getFolderPath = (folderId: string | undefined, folders: Folder[]): string => {
    if (!folderId) return '';
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return '';
    const parentPath = getFolderPath(folder.parentId || undefined, folders);
    return parentPath ? `${parentPath}/${getSafeFilename(folder.name)}` : getSafeFilename(folder.name);
  };

  const checkIsQR = (char: CharacterCard) => {
    const data = char.data || {};
    return Array.isArray(data) ? data.length > 0 && data[0].label !== undefined : (data.quick_replies !== undefined || data.qrList !== undefined);
  };

  const handleBindQR = async (targetCharId: string) => {
    const qrCharId = Array.from(selectedIds)[0];
    const qrChar = characters.find(c => c.id === qrCharId);
    if (!qrChar) return;

    try {
      const targetChar = await getCharacter(targetCharId);
      if (!targetChar) return;

      const qrData = qrChar.data || {};
      let newQRs = [];
      let metadata = null;
      if (Array.isArray(qrData)) {
        newQRs = qrData;
      } else if (qrData.qrList && Array.isArray(qrData.qrList)) {
        newQRs = qrData.qrList;
        metadata = qrData;
      } else if (qrData.quick_replies && Array.isArray(qrData.quick_replies)) {
        newQRs = qrData.quick_replies;
        metadata = qrData;
      }

      const updatedChar = { ...targetChar };
      // Deep clone data to ensure it is fully writable and clonable by IDB
      updatedChar.data = JSON.parse(JSON.stringify(updatedChar.data || {}));
      
      let updatedData = updatedChar.data.data ? updatedChar.data.data : updatedChar.data;
      
      const newSets = updatedData.extensions?.tavern_qr_sets ? [...updatedData.extensions.tavern_qr_sets] : [];
      newSets.push({
        id: Date.now().toString() + Math.random().toString(),
        sourceName: qrChar.name,
        replies: JSON.parse(JSON.stringify(newQRs)),
        metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined
      });

      updatedData.extensions = {
        ...(updatedData.extensions || {}),
        tavern_qr_sets: newSets,
        quick_replies: newSets.flatMap((s: any) => s.replies),
        qr_filename: `${qrChar.name}.json`
      };

      await saveCharacter(updatedChar);
      
      setIsBindModalOpen(false);
      setSelectionMode(false);
      setSelectedIds(new Set());
      loadData(); // Refresh the list
    } catch (e) {
      console.error(e);
      try { alert('绑定失败，请查看控制台: ' + (e instanceof Error ? e.message : String(e))); } catch (err) {}
    }
  };

  const addCharacterToZip = async (char: CharacterCard, zipFolder: JSZip) => {
    const safeName = getSafeFilename(char.name);
    const exportFileName = `${safeName}.png`;
    
    const rawData = char.data;
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
        const { injectTavernData } = await import('../lib/png');
        const buffer = await baseBlob.arrayBuffer();
        const newBuffer = injectTavernData(buffer, char.data);
        const finalBlob = new Blob([newBuffer], { type: 'image/png' });
        
        const targetData = char.data.data ? char.data.data : char.data;
        const hasQR = targetData.extensions?.quick_replies && targetData.extensions.quick_replies.length > 0;
        const hasAvatars = char.avatarHistory && char.avatarHistory.length > 0;
        
        if (hasQR || hasAvatars) {
          const charFolder = zipFolder.folder(safeName);
          if (charFolder) {
            charFolder.file(exportFileName, finalBlob);
            if (hasQR) {
              const qrFileName = targetData.extensions?.qr_filename || `${safeName}_qr.json`;
              let qrContentToExport: any = targetData.extensions.quick_replies;
              
              if (targetData.extensions.tavern_qr_sets && targetData.extensions.tavern_qr_sets.length > 0) {
                // Find the first metadata we can use
                const metadata = targetData.extensions.tavern_qr_sets.find((s: any) => s.metadata)?.metadata;
                if (metadata) {
                  qrContentToExport = { ...metadata };
                  if (qrContentToExport.qrList) qrContentToExport.qrList = targetData.extensions.quick_replies;
                  else if (qrContentToExport.quick_replies) qrContentToExport.quick_replies = targetData.extensions.quick_replies;
                } else {
                  // Fallback wrapper
                  qrContentToExport = {
                    version: 2,
                    name: char.name,
                    qrList: targetData.extensions.quick_replies
                  };
                }
              } else {
                qrContentToExport = {
                  version: 2,
                  name: char.name,
                  qrList: targetData.extensions.quick_replies
                };
              }
              charFolder.file(qrFileName, JSON.stringify(qrContentToExport, null, 2));
            }
            if (hasAvatars) {
              const avatarsFolder = charFolder.folder('替换卡面');
              if (avatarsFolder) {
                char.avatarHistory!.forEach((avatarBlob, index) => {
                  let ext = 'png';
                  let fileName = `替换卡面_${index + 1}.${ext}`;
                  if (avatarBlob instanceof File) {
                    fileName = avatarBlob.name;
                  } else {
                    if (avatarBlob.type === 'image/jpeg') ext = 'jpg';
                    else if (avatarBlob.type === 'image/webp') ext = 'webp';
                    fileName = `替换卡面_${index + 1}.${ext}`;
                  }
                  avatarsFolder.file(fileName, avatarBlob);
                });
              }
            }
          }
        } else {
          zipFolder.file(exportFileName, finalBlob);
        }
      } catch (err) {
        console.error("Failed to export injected PNG", err);
        zipFolder.file(`${safeName}.json`, JSON.stringify(char.data, null, 2));
      }
    } else {
      zipFolder.file(`${safeName}.json`, JSON.stringify(char.data, null, 2));
    }
  };

  const handleBatchExport = async () => {
    if (selectedIds.size === 0) return;
    
    try {
      const zip = new JSZip();
      
      // Get all folders to resolve paths
      const allFolders = await getFolders();
      
      for (const id of selectedIds) {
        const folder = allFolders.find(f => f.id === id);
        if (folder) {
          // Export all characters in this folder and its subfolders
          const exportFolderRecursive = async (currentFolderId: string, currentZip: JSZip) => {
            const { characters: folderChars } = await getCharacters(1, 10000, currentFolderId);
            for (const char of folderChars) {
              await addCharacterToZip(char, currentZip);
            }
            
            const subFolders = allFolders.filter(f => f.parentId === currentFolderId);
            for (const subFolder of subFolders) {
              const subZip = currentZip.folder(getSafeFilename(subFolder.name));
              if (subZip) {
                await exportFolderRecursive(subFolder.id, subZip);
              }
            }
          };
          
          const folderZip = zip.folder(getSafeFilename(folder.name));
          if (folderZip) {
            await exportFolderRecursive(folder.id, folderZip);
          }
        } else {
          const char = await getCharacter(id);
          if (char) {
            await addCharacterToZip(char, zip);
          }
        }
      }
      
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Tavern_Export_${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      
      setSelectionMode(false);
      setSelectedIds(new Set());
    } catch (e) {
      console.error("Batch export failed", e);
      alert("导出失败，请重试");
    }
  };

  const handleMoveToFolder = async (targetFolderId: string | null) => {
    // Prevent moving a folder into itself or its descendants
    const isDescendant = async (folderIdToCheck: string, targetId: string | null): Promise<boolean> => {
      if (!targetId) return false;
      if (folderIdToCheck === targetId) return true;
      const allFolders = await getFolders();
      let current = allFolders.find(f => f.id === targetId);
      while (current && current.parentId) {
        if (current.parentId === folderIdToCheck) return true;
        current = allFolders.find(f => f.id === current.parentId);
      }
      return false;
    };

    const allFolders = await getFolders();

    for (const id of selectedIds) {
      const folder = allFolders.find(f => f.id === id);
      if (folder) {
        if (await isDescendant(id, targetFolderId)) {
          alert(`无法移动：您选中的文件夹中包含了目标文件夹 "${folder.name}"，不能将其移入自身。`);
          continue;
        }
        folder.parentId = targetFolderId;
        await saveFolder(folder);
      } else {
        const char = await getCharacter(id);
        if (char) {
          if (targetFolderId === null) {
            delete char.folderId;
          } else {
            char.folderId = targetFolderId;
          }
          await saveCharacter(char);
        }
      }
    }
    setIsMoveModalOpen(false);
    setSelectionMode(false);
    setSelectedIds(new Set());
    loadData();
  };

  return (
    <div className="pb-32 min-h-full bg-gradient-to-br from-slate-900 to-slate-800 text-white">
      <input type="file" ref={coverInputRef} className="hidden" accept="image/*" onChange={handleCoverUpload} />
      <motion.header 
        initial={{ y: 0 }}
        animate={{ y: isHeaderVisible ? 0 : '-100%' }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-xl border-b border-white/10 px-4 pt-8 pb-4 mb-6 cursor-pointer"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            scrollToTop();
          }
        }}
      >
        {selectionMode ? (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full flex items-center justify-between bg-slate-800/90 backdrop-blur-md p-4 rounded-2xl border border-white/10 shadow-xl"
          >
            <button onClick={() => { setSelectionMode(false); setSelectedIds(new Set()); }} className="p-2 -ml-2 rounded-full hover:bg-white/10 transition">
              <X className="w-6 h-6" />
            </button>
            <span className="font-bold text-lg flex-1 text-center">已选择 {selectedIds.size} 项</span>
            <div className="flex items-center gap-2">
              <button onClick={handleSelectPage} className="text-purple-400 font-medium px-3 py-1.5 hover:bg-purple-400/10 rounded-lg transition text-sm whitespace-nowrap">
                全选本页
              </button>
              <button onClick={handleSelectAll} className="text-pink-400 font-medium px-3 py-1.5 hover:bg-pink-400/10 rounded-lg transition text-sm whitespace-nowrap">
                全选所有
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="flex-1 min-w-0 px-1">
              {folderId ? (
                <div className="flex items-center gap-2 mb-1">
                  <button 
                    onClick={handleBack}
                    className="p-1 -ml-1 rounded-lg hover:bg-white/10 transition text-white/60 hover:text-white"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <h1 className="text-2xl font-bold text-white truncate">
                    {folderId === 'all' ? '全部角色' : currentFolderName}
                  </h1>
                </div>
              ) : (
                <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600 truncate">
                  SillyTavern管理器
                </h1>
              )}
              <p className="text-slate-400 text-xs mt-0.5 truncate">管理你的角色卡片 ({totalCharacters})</p>
            </div>
            
            <div className="flex items-center gap-2">
              <button 
                onClick={onOpenSidebar}
                className="p-2 rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition shrink-0"
              >
                <Menu className="w-5 h-5" />
              </button>
              
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input 
                  type="text" 
                  placeholder="搜索..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-purple-500/50 transition"
                />
              </div>
              
              <button 
                onClick={() => setViewMode(v => v === 'grid' ? 'masonry' : v === 'masonry' ? 'list' : 'grid')}
                className="p-2 bg-white/5 border border-white/10 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition shrink-0"
              >
                {viewMode === 'grid' ? <LayoutGrid className="w-5 h-5" /> : viewMode === 'masonry' ? <LayoutDashboard className="w-5 h-5" /> : <List className="w-5 h-5" />}
              </button>
              
              <div ref={sortRef} className="relative shrink-0">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsSortOpen(!isSortOpen);
                    setIsFilterOpen(false);
                  }}
                  className={`p-2 border rounded-xl transition ${isSortOpen ? 'bg-purple-500/20 text-purple-400 border-purple-500/50' : 'bg-white/5 text-white/60 border-white/10 hover:text-white hover:bg-white/10'}`}
                >
                  <ArrowUpDown className="w-5 h-5" />
                </button>
                
                <AnimatePresence>
                  {isSortOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute right-0 top-full mt-2 w-48 bg-slate-800 border border-white/10 rounded-2xl shadow-xl z-50 p-2 overflow-hidden"
                    >
                        {[
                          { value: 'custom', label: '自定义排序 (拖拽)' },
                          { value: 'newest_import', label: '最新导入' },
                          { value: 'oldest_import', label: '最旧导入' },
                          { value: 'recently_modified', label: '最近修改' },
                          { value: 'a_z', label: 'A - Z' },
                          { value: 'z_a', label: 'Z - A' },
                        ].map(option => (
                          <button
                            key={option.value}
                            onClick={() => {
                              setSortBy(option.value as SortOption);
                              setIsSortOpen(false);
                            }}
                            className={`w-full text-left px-4 py-2.5 rounded-xl text-sm transition ${
                              sortBy === option.value 
                                ? 'bg-purple-500/20 text-purple-400 font-medium' 
                                : 'text-white/70 hover:bg-white/5 hover:text-white'
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div ref={filterRef} className="relative shrink-0">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isFilterOpen) {
                      getAllTags().then(setAllTags);
                    }
                    setIsFilterOpen(!isFilterOpen);
                    setIsSortOpen(false);
                  }}
                  className={`p-2 border rounded-xl transition ${selectedTags.length > 0 ? 'bg-purple-500/20 text-purple-400 border-purple-500/50' : 'bg-white/5 text-white/60 border-white/10 hover:text-white hover:bg-white/10'}`}
                >
                  <Filter className="w-5 h-5" />
                </button>
                
                <AnimatePresence>
                  {isFilterOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute right-0 top-full mt-2 w-72 bg-slate-800 border border-white/10 rounded-2xl shadow-xl z-50 p-4 max-h-[60vh] overflow-y-auto overscroll-contain touch-pan-y"
                    >
                        <div className="flex items-center justify-between mb-3 relative h-6">
                            {!isTagSearchOpen ? (
                              <div className="absolute inset-0 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <h3 className="font-semibold text-white">按标签筛选</h3>
                                  <button onClick={() => setIsTagSearchOpen(true)} className="text-white/40 hover:text-white transition">
                                    <Search className="w-4 h-4" />
                                  </button>
                                </div>
                                <div className="flex items-center gap-2">
                                  {selectedTags.length > 0 && (
                                    <button 
                                      onClick={() => setSelectedTags([])}
                                      className="text-xs text-red-400 hover:text-red-300 transition"
                                    >
                                      清除选中
                                    </button>
                                  )}
                                  {allTags.length > 0 && (
                                    <button 
                                      onClick={() => {
                                        setIsEditingTags(!isEditingTags);
                                        setEditingTagValue(null);
                                      }}
                                      className="text-xs text-purple-400 hover:text-purple-300 transition"
                                    >
                                      {isEditingTags ? '完成' : '编辑'}
                                    </button>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <motion.div 
                                initial={{ width: 0, opacity: 0 }}
                                animate={{ width: '100%', opacity: 1 }}
                                className="absolute right-0 flex items-center bg-white/10 rounded-lg overflow-hidden h-full"
                              >
                                <Search className="w-3.5 h-3.5 text-white/40 ml-2 shrink-0" />
                                <input 
                                  autoFocus
                                  type="text"
                                  placeholder="搜索标签..."
                                  value={tagSearchQuery}
                                  onChange={(e) => setTagSearchQuery(e.target.value)}
                                  className="w-full bg-transparent text-sm text-white px-2 py-1 outline-none min-w-0"
                                />
                                <button onClick={() => { setIsTagSearchOpen(false); setTagSearchQuery(''); }} className="p-1 hover:bg-white/10 rounded-md mr-0.5 text-white/60 hover:text-white transition shrink-0">
                                  <X className="w-3 h-3" />
                                </button>
                              </motion.div>
                            )}
                        </div>
                        {allTags.length === 0 ? (
                          <p className="text-sm text-white/40">无可用标签</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {allTags.filter(tag => tag.toLowerCase().includes(tagSearchQuery.toLowerCase())).map(tag => {
                              const isSelected = selectedTags.includes(tag);
                              
                              if (isEditingTags) {
                                if (editingTagValue?.old === tag) {
                                  return (
                                    <div key={tag} className="flex items-center gap-1 w-full bg-black/20 p-1 rounded-lg border border-purple-500/50">
                                      <input 
                                        autoFocus
                                        type="text"
                                        value={editingTagValue.new}
                                        onChange={(e) => setEditingTagValue({ ...editingTagValue, new: e.target.value })}
                                        className="flex-1 bg-transparent text-sm text-white px-2 py-1 outline-none"
                                        onKeyDown={async (e) => {
                                          if (e.key === 'Enter' && editingTagValue.new.trim() && editingTagValue.new.trim() !== tag) {
                                            await import('../lib/db').then(m => m.renameTag(tag, editingTagValue.new.trim()));
                                            setEditingTagValue(null);
                                            loadData();
                                            import('../lib/db').then(m => m.getAllTags().then(setAllTags));
                                          } else if (e.key === 'Escape') {
                                            setEditingTagValue(null);
                                          }
                                        }}
                                      />
                                      <button 
                                        onClick={async () => {
                                          if (editingTagValue.new.trim() && editingTagValue.new.trim() !== tag) {
                                            await import('../lib/db').then(m => m.renameTag(tag, editingTagValue.new.trim()));
                                            setEditingTagValue(null);
                                            loadData();
                                            import('../lib/db').then(m => m.getAllTags().then(setAllTags));
                                          } else {
                                            setEditingTagValue(null);
                                          }
                                        }}
                                        className="p-1.5 text-green-400 hover:bg-green-400/20 rounded-md transition"
                                      >
                                        <CheckCircle2 className="w-4 h-4" />
                                      </button>
                                      <button 
                                        onClick={() => setEditingTagValue(null)}
                                        className="p-1.5 text-white/40 hover:bg-white/10 rounded-md transition"
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                    </div>
                                  );
                                }
                                
                                return (
                                  <div key={tag} className="flex items-center gap-1 bg-white/5 rounded-lg pl-3 pr-1 py-1 border border-white/10">
                                    <span className="text-sm text-white/80">{tag}</span>
                                    <button 
                                      onClick={() => setEditingTagValue({ old: tag, new: tag })}
                                      className="p-1 text-white/40 hover:text-blue-400 hover:bg-blue-400/10 rounded transition"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button 
                                      onClick={async () => {
                                        if (confirm(`确定要删除标签 "${tag}" 吗？这会从所有角色中移除该标签。`)) {
                                          await import('../lib/db').then(m => m.deleteTag(tag));
                                          setSelectedTags(selectedTags.filter(t => t !== tag));
                                          loadData();
                                          import('../lib/db').then(m => m.getAllTags().then(setAllTags));
                                        }
                                      }}
                                      className="p-1 text-white/40 hover:text-red-400 hover:bg-red-400/10 rounded transition"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                );
                              }
                              
                              return (
                                <button
                                  key={tag}
                                  onClick={() => {
                                    if (isSelected) {
                                      setSelectedTags(selectedTags.filter(t => t !== tag));
                                    } else {
                                      setSelectedTags([...selectedTags, tag]);
                                    }
                                  }}
                                  className={`px-3 py-1.5 rounded-lg text-sm transition ${isSelected ? 'bg-purple-500 text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
                                >
                                  {tag}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </motion.header>

      {totalCharacters === 0 && folders.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-slate-400 px-4">
          <BookOpen className="w-16 h-16 mb-4 opacity-50" />
          <p>No characters found.</p>
          <p className="text-sm">Tap the + button to import.</p>
        </div>
      ) : (
        <div className="px-4">
          <DndContext 
            sensors={sensors} 
            collisionDetection={closestCenter} 
            onDragStart={(event) => {
              if (!selectionMode) {
                setSelectionMode(true);
                const idStr = String(event.active.id);
                if (idStr.startsWith('char-')) {
                  const id = idStr.replace('char-', '');
                  setSelectedIds(new Set([id]));
                } else if (idStr.startsWith('folder-')) {
                  const id = idStr.replace('folder-', '');
                  setSelectedIds(new Set([id]));
                }
              }
            }}
            onDragEnd={handleDragEnd}
          >
            <SortableContext 
              items={[
                ...((!searchQuery && selectedTags.length === 0) ? folders.map(f => `folder-${f.id}`) : []), 
                ...characters.map(c => `char-${c.id}`)
              ]} 
              strategy={rectSortingStrategy}
            >
              <div className={
                viewMode === 'grid' ? "grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4" : 
                viewMode === 'masonry' ? "columns-2 sm:columns-3 md:columns-4 lg:columns-5 gap-4 space-y-4" : 
                "flex flex-col gap-2"
              }>
            
            {!searchQuery && selectedTags.length === 0 && (
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsCreatingFolder(true)}
                className={viewMode === 'list' 
                  ? "flex items-center gap-4 p-3 bg-white/5 hover:bg-white/10 rounded-2xl cursor-pointer transition border border-dashed border-white/20"
                  : "flex flex-col items-center gap-2 cursor-pointer group break-inside-avoid"
                }
              >
                <div className={viewMode === 'list'
                  ? "w-12 h-12 bg-white/5 border-2 border-dashed border-white/20 rounded-xl flex items-center justify-center shrink-0"
                  : "w-full aspect-square bg-white/5 border-2 border-dashed border-white/20 rounded-3xl flex items-center justify-center group-hover:bg-white/10 group-hover:border-white/40 transition"
                }>
                  <Plus className="w-8 h-8 text-white/40 group-hover:text-white/60 transition" />
                </div>
                <span className={viewMode === 'list'
                  ? "font-medium text-white/60"
                  : "text-xs font-medium text-center truncate w-full text-white/60 group-hover:text-white/80"
                }>
                  新建文件夹
                </span>
              </motion.div>
            )}

            {(!searchQuery && selectedTags.length === 0) && folders.map((folder) => {
              const previews = folderPreviews[folder.id] || [];
              return (
                <SortableItemWrapper key={`folder-${folder.id}`} id={`folder-${folder.id}`} disabled={!!searchQuery || selectedTags.length > 0}>
                  <motion.div
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onTouchStart={(e) => {
                    longPressRef.current.triggered = false;
                    longPressRef.current.startY = e.touches[0].clientY;
                    longPressRef.current.timer = setTimeout(() => {
                      longPressRef.current.triggered = true;
                      if (!selectionMode) {
                        setSelectionMode(true);
                        setSelectedIds(new Set([folder.id]));
                      }
                    }, 500);
                  }}
                  onTouchMove={(e) => {
                    if (longPressRef.current.timer) {
                      const dy = Math.abs(e.touches[0].clientY - (longPressRef.current.startY || 0));
                      if (dy > 10) {
                        clearTimeout(longPressRef.current.timer);
                        longPressRef.current.timer = null;
                      }
                    }
                  }}
                  onTouchEnd={() => {
                    if (longPressRef.current.timer) {
                      clearTimeout(longPressRef.current.timer);
                      longPressRef.current.timer = null;
                    }
                  }}
                  onMouseDown={() => {
                    longPressRef.current.triggered = false;
                    longPressRef.current.timer = setTimeout(() => {
                      longPressRef.current.triggered = true;
                      if (!selectionMode) {
                        setSelectionMode(true);
                        setSelectedIds(new Set([folder.id]));
                      }
                    }, 500);
                  }}
                  onMouseUp={() => {
                    if (longPressRef.current.timer) {
                      clearTimeout(longPressRef.current.timer);
                      longPressRef.current.timer = null;
                    }
                  }}
                  onMouseLeave={() => {
                    if (longPressRef.current.timer) {
                      clearTimeout(longPressRef.current.timer);
                      longPressRef.current.timer = null;
                    }
                  }}
                  onClick={(e) => {
                    if (longPressRef.current.triggered) {
                      e.preventDefault();
                      return;
                    }
                    if (selectionMode) {
                      toggleSelection(folder.id);
                    } else {
                      onSelectFolder?.(folder.id);
                    }
                  }}
                  className={viewMode === 'list' 
                    ? "flex items-center gap-4 p-3 bg-white/5 hover:bg-white/10 rounded-2xl cursor-pointer transition relative group select-none"
                    : "flex flex-col items-center gap-2 cursor-pointer group relative select-none break-inside-avoid"
                  }
                >
                  {selectionMode && (
                    <div className="absolute top-2 right-2 z-10">
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                        selectedIds.has(folder.id) 
                          ? 'bg-purple-500 border-purple-500' 
                          : 'border-white/40 bg-black/20 backdrop-blur-md'
                      }`}>
                        {selectedIds.has(folder.id) && <CheckCircle2 className="w-4 h-4 text-white" />}
                      </div>
                    </div>
                  )}
                  <div className={viewMode === 'list'
                    ? "w-12 h-12 bg-white/10 backdrop-blur-md rounded-xl flex items-center justify-center border border-white/20 shrink-0 overflow-hidden p-1.5 object-cover"
                    : "w-full aspect-square bg-white/10 backdrop-blur-md rounded-3xl flex items-center justify-center border border-white/20 group-hover:bg-white/20 transition shadow-sm overflow-hidden p-3 relative"
                  }>
                    <FolderCover folder={folder} previews={previews} />
                  </div>
                  <span className={viewMode === 'list'
                    ? "font-medium text-white/90 flex-1"
                    : "text-xs font-medium text-center truncate w-full text-white/80 group-hover:text-white"
                  }>
                    {folder.name}
                  </span>
                </motion.div>
                </SortableItemWrapper>
              );
            })}

            {characters.map((char) => {
              const folderName = (searchQuery || selectedTags.length > 0) && char.folderId 
                ? folders.find(f => f.id === char.folderId)?.name 
                : undefined;
                
              return (
                <SortableItemWrapper key={`char-${char.id}`} id={`char-${char.id}`} disabled={!!searchQuery || selectedTags.length > 0}>
                  <CharacterCardItem
                    char={char}
                    selectionMode={selectionMode}
                    isSelected={selectedIds.has(char.id)}
                    viewMode={viewMode}
                    folderName={folderName}
                    onClick={() => {
                      if (selectionMode) toggleSelection(char.id);
                      else onSelect(char.id);
                    }}
                    onLongPress={() => {
                      if (!selectionMode) {
                        setSelectionMode(true);
                        setSelectedIds(new Set([char.id]));
                      }
                    }}
                  />
                </SortableItemWrapper>
              );
            })}
          </div>
          </SortableContext>
        </DndContext>

          {(!selectionMode && (totalPages > 1 || characters.length > 0)) && (
            <div className="flex justify-center items-center mt-12 mb-8 text-sm">
              <div className="flex items-center bg-white/5 rounded-xl p-1 border border-white/10">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 rounded-lg hover:bg-white/10 disabled:opacity-30 transition text-white"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                
                <div className="flex items-center gap-2 text-slate-400 px-2">
                  <span>第</span>
                  <input
                    type="number"
                    min={1}
                    max={totalPages}
                    value={page}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (!isNaN(val) && val >= 1 && val <= totalPages) {
                        setPage(val);
                      }
                    }}
                    className="w-10 bg-black/20 border border-white/10 rounded-lg px-1 py-1 text-center text-white font-medium focus:outline-none focus:border-purple-500 transition [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span>/ {totalPages} 页</span>
                  <div className="w-px h-4 bg-white/10 mx-1" />
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="bg-transparent border-none text-white font-medium focus:outline-none cursor-pointer py-1"
                  >
                    <option value={50} className="bg-slate-800">50/页</option>
                    <option value={100} className="bg-slate-800">100/页</option>
                    <option value={250} className="bg-slate-800">250/页</option>
                    <option value={500} className="bg-slate-800">500/页</option>
                  </select>
                </div>

                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-2 rounded-lg hover:bg-white/10 disabled:opacity-30 transition text-white"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <MoveToFolderModal
        isOpen={isMoveModalOpen}
        onClose={() => setIsMoveModalOpen(false)}
        onMove={handleMoveToFolder}
      />

      <BindQRModal 
        isOpen={isBindModalOpen}
        onClose={() => setIsBindModalOpen(false)}
        onBind={handleBindQR}
        characters={characters}
        qrChar={characters.find(c => c.id === Array.from(selectedIds)[0]) || null}
      />

      <AnimatePresence>
        {showScrollTop && !selectionMode && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={scrollToTop}
            className="fixed bottom-36 right-8 w-12 h-12 bg-slate-800/80 backdrop-blur-md border border-white/10 rounded-full flex items-center justify-center shadow-xl text-white/80 hover:text-white hover:bg-slate-700/80 transition z-40"
          >
            <ChevronLeft className="w-6 h-6 rotate-90" />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!selectionMode ? (
          <motion.button
            key="fab"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={onImport}
            className="fixed bottom-20 right-8 w-14 h-14 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center shadow-xl shadow-purple-500/30 text-white z-40"
          >
            <Plus className="w-6 h-6" />
          </motion.button>
        ) : (
          <motion.div
            key="bottom-bar"
            initial={{ y: 100, opacity: 0, x: '-50%' }}
            animate={{ y: 0, opacity: 1, x: '-50%' }}
            exit={{ y: 100, opacity: 0, x: '-50%' }}
            className="fixed bottom-8 left-1/2 z-50 max-w-[95vw] sm:max-w-[80vw] bg-slate-800/80 backdrop-blur-2xl border border-white/10 rounded-full shadow-2xl overflow-hidden"
          >
            <div className="flex items-center p-1 overflow-x-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              <style>{`
                .no-scrollbar::-webkit-scrollbar {
                  display: none;
                }
              `}</style>
              <div className="flex items-center gap-2 no-scrollbar px-1">
                <button
                  onClick={() => setIsMoveModalOpen(true)}
                  disabled={selectedIds.size === 0}
                  className="flex flex-col items-center gap-1 px-4 py-2 rounded-full hover:bg-white/10 text-white/70 hover:text-blue-400 transition disabled:opacity-50 group shrink-0"
                >
                  <div className="p-2 rounded-full bg-white/5 group-hover:bg-blue-400/20 transition">
                    <FolderInput className="w-5 h-5" />
                  </div>
                  <span className="font-medium text-[10px]">移动</span>
                </button>
                {selectedIds.size === 1 && folders.some(f => f.id === Array.from(selectedIds)[0]) && (
                  <>
                    <div className="w-px h-8 bg-white/10 shrink-0" />
                    <button
                      onClick={() => {
                        const folderId = Array.from(selectedIds)[0];
                        const folder = folders.find(f => f.id === folderId);
                        if (folder) {
                          setEditingFolder(folder);
                          setNewFolderName(folder.name);
                          setSelectionMode(false);
                          setSelectedIds(new Set());
                        }
                      }}
                      className="flex flex-col items-center gap-1 px-4 py-2 rounded-full hover:bg-white/10 text-white/70 hover:text-yellow-400 transition group shrink-0"
                    >
                      <div className="p-2 rounded-full bg-white/5 group-hover:bg-yellow-400/20 transition">
                        <Edit2 className="w-5 h-5" />
                      </div>
                      <span className="font-medium text-[10px]">重命名</span>
                    </button>
                  </>
                )}
                {selectedIds.size === 1 && (() => {
                  const charId = Array.from(selectedIds)[0];
                  const char = characters.find(c => c.id === charId);
                  return char && checkIsQR(char);
                })() && (
                  <>
                    <div className="w-px h-8 bg-white/10 shrink-0" />
                    <button
                      onClick={() => setIsBindModalOpen(true)}
                      className="flex flex-col items-center gap-1 px-4 py-2 rounded-full hover:bg-white/10 text-white/70 hover:text-purple-400 transition group shrink-0"
                    >
                      <div className="p-2 rounded-full bg-white/5 group-hover:bg-purple-400/20 transition">
                        <Link className="w-5 h-5" />
                      </div>
                      <span className="font-medium text-[10px]">绑定</span>
                    </button>
                  </>
                )}
                
                {selectedIds.size > 0 && Array.from(selectedIds).every(id => folders.some(f => f.id === id)) && (
                  <>
                    <div className="w-px h-8 bg-white/10 shrink-0" />
                    <button
                      onClick={() => coverInputRef.current?.click()}
                      disabled={selectedIds.size === 0}
                      className="flex flex-col items-center gap-1 px-4 py-2 rounded-full hover:bg-white/10 text-white/70 hover:text-orange-400 transition disabled:opacity-50 group shrink-0"
                    >
                      <div className="p-2 rounded-full bg-white/5 group-hover:bg-orange-400/20 transition">
                        <ImageIcon className="w-5 h-5" />
                      </div>
                      <span className="font-medium text-[10px]">换封面</span>
                    </button>
                  </>
                )}

                <div className="w-px h-8 bg-white/10 shrink-0" />
                <button
                  onClick={handleBatchExport}
                  disabled={selectedIds.size === 0}
                  className="flex flex-col items-center gap-1 px-4 py-2 rounded-full hover:bg-white/10 text-white/70 hover:text-green-400 transition disabled:opacity-50 group shrink-0"
                >
                  <div className="p-2 rounded-full bg-white/5 group-hover:bg-green-400/20 transition">
                    <Download className="w-5 h-5" />
                  </div>
                  <span className="font-medium text-[10px]">导出</span>
                </button>
                <div className="w-px h-8 bg-white/10 shrink-0" />
                <button
                  onClick={handleBatchDelete}
                  disabled={selectedIds.size === 0}
                  className="flex flex-col items-center gap-1 px-4 py-2 rounded-full hover:bg-red-500/10 text-white/70 hover:text-red-400 transition disabled:opacity-50 group shrink-0"
                >
                  <div className="p-2 rounded-full bg-white/5 group-hover:bg-red-400/20 transition">
                    <Trash2 className="w-5 h-5" />
                  </div>
                  <span className="font-medium text-[10px]">删除</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {(isCreatingFolder || editingFolder) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-slate-800/90 backdrop-blur-2xl rounded-3xl p-6 w-full max-w-sm border border-white/10 shadow-2xl"
            >
              <h3 className="text-lg font-semibold text-white mb-6 text-center">
                {editingFolder ? '编辑文件夹' : '新建文件夹'}
              </h3>
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="文件夹名称"
                className="w-full bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:border-purple-500/50 transition mb-6 text-center text-lg"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    editingFolder ? handleUpdateFolder() : handleCreateFolder();
                  }
                  if (e.key === 'Escape') {
                    setIsCreatingFolder(false);
                    setEditingFolder(null);
                  }
                }}
              />
              <div className="flex flex-col gap-2">
                <button
                  onClick={editingFolder ? handleUpdateFolder : handleCreateFolder}
                  className="w-full py-3 rounded-2xl bg-purple-500/80 hover:bg-purple-500 text-white font-medium transition"
                >
                  {editingFolder ? '保存修改' : '创建'}
                </button>
                {editingFolder && (
                  <button
                    onClick={() => {
                      handleDeleteFolder(editingFolder.id, editingFolder.name);
                      setIsCreatingFolder(false);
                      setEditingFolder(null);
                    }}
                    className="w-full py-3 rounded-2xl bg-red-500/10 hover:bg-red-500/20 text-red-400 font-medium transition"
                  >
                    删除文件夹
                  </button>
                )}
                <button
                  onClick={() => {
                    setIsCreatingFolder(false);
                    setEditingFolder(null);
                  }}
                  className="w-full py-3 rounded-2xl bg-white/5 hover:bg-white/10 text-white/70 font-medium transition mt-2"
                >
                  取消
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CharacterCardItem({ 
  char, 
  onClick, 
  onLongPress,
  selectionMode,
  isSelected,
  viewMode,
  folderName
}: { 
  key?: React.Key, 
  char: CharacterCard, 
  onClick: () => void, 
  onLongPress: () => void,
  selectionMode: boolean,
  isSelected: boolean,
  viewMode: 'grid' | 'list' | 'masonry',
  folderName?: string
}) {
  const [url, setUrl] = useState<string>(char.avatarUrlFallback || '');
  const timerRef = useRef<any>(null);
  const isLongPress = useRef(false);

  useEffect(() => {
    if (char.avatarBlob) {
      const objectUrl = URL.createObjectURL(char.avatarBlob);
      setUrl(objectUrl);
      return () => URL.revokeObjectURL(objectUrl);
    }
  }, [char.avatarBlob]);

  const handleTouchStart = () => {
    isLongPress.current = false;
    timerRef.current = setTimeout(() => {
      isLongPress.current = true;
      onLongPress();
    }, 500); // 500ms for long press
  };

  const handleTouchEnd = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (isLongPress.current) {
      e.preventDefault();
      return;
    }
    onClick();
  };

  const charTags = char.data?.data?.tags || char.data?.tags;
  const hasTags = charTags && Array.isArray(charTags) && charTags.length > 0;

  if (viewMode === 'list') {
    return (
      <motion.div
        whileHover={{ scale: selectionMode ? 1 : 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchEnd}
        onMouseDown={handleTouchStart}
        onMouseUp={handleTouchEnd}
        onMouseLeave={handleTouchEnd}
        className={`relative flex items-center gap-4 p-3 rounded-2xl cursor-pointer transition-all select-none ${isSelected ? 'bg-purple-500/20 border-purple-500/50' : 'bg-white/5 hover:bg-white/10 border-transparent'} border`}
      >
        <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0">
          <img src={url || undefined} alt={char.name} className="w-full h-full object-cover pointer-events-none" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-white/90 truncate">{char.name}</h3>
            {hasTags && (
              <div className="flex gap-1 overflow-hidden shrink-0">
                {charTags.slice(0, 3).map((t: string) => (
                  <span key={t} className="text-[9px] bg-white/10 text-white/60 px-1.5 py-0.5 rounded-sm flex-shrink-0 whitespace-nowrap">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {char.data?.creator && <p className="text-xs text-white/40 truncate">by {char.data.creator}</p>}
            {folderName && (
              <span className="text-[10px] bg-white/10 text-white/60 px-1.5 py-0.5 rounded-md border border-white/10 flex-shrink-0 whitespace-nowrap">
                📁 {folderName}
              </span>
            )}
          </div>
        </div>
        
        <AnimatePresence>
          {selectionMode && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="shrink-0"
            >
              {isSelected ? (
                <div className="bg-purple-500 rounded-full text-white shadow-lg">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
              ) : (
                <div className="bg-black/40 rounded-full border-2 border-white/60 w-6 h-6 shadow-sm" />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }

  return (
    <motion.div
      whileHover={{ scale: selectionMode ? 1 : 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchEnd}
      onMouseDown={handleTouchStart}
      onMouseUp={handleTouchEnd}
      onMouseLeave={handleTouchEnd}
      className={`relative ${viewMode === 'masonry' ? 'break-inside-avoid w-full h-auto mb-4' : 'aspect-[2/3]'} rounded-2xl overflow-hidden cursor-pointer shadow-lg border transition-all duration-300 group select-none ${isSelected ? 'border-purple-500 ring-2 ring-purple-500' : 'border-white/10'}`}
    >
      <motion.img
        animate={{ scale: isSelected ? 0.9 : 1 }}
        transition={{ duration: 0.2 }}
        src={url || undefined}
        alt={char.name}
        className={`w-full ${viewMode === 'masonry' ? 'h-auto block' : 'h-full'} object-cover pointer-events-none`}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent flex flex-col justify-end p-3 pointer-events-none">
        <h3 className="font-semibold text-white text-sm sm:text-base leading-tight drop-shadow-md break-words truncate">
          {char.name}
        </h3>
        {hasTags && (
          <div className="flex flex-wrap gap-1 mt-1.5 h-[1.125rem] overflow-hidden -mr-1">
            {charTags.map((t: string) => (
              <span key={t} className="text-[9px] bg-white/20 backdrop-blur-md text-white px-1 py-0.5 rounded-sm truncate max-w-[60px]">
                {t}
              </span>
            ))}
          </div>
        )}
        {folderName && (
          <span className="text-[10px] bg-black/40 backdrop-blur-md text-white/80 px-1.5 py-0.5 rounded-md border border-white/20 truncate w-fit mt-1.5">
            📁 {folderName}
          </span>
        )}
      </div>
      
      <AnimatePresence>
        {selectionMode && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute top-2 right-2 z-10"
          >
            {isSelected ? (
              <div className="bg-purple-500 rounded-full text-white shadow-lg">
                <CheckCircle2 className="w-6 h-6" />
              </div>
            ) : (
              <div className="bg-black/40 rounded-full border-2 border-white/60 w-6 h-6 shadow-sm" />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
