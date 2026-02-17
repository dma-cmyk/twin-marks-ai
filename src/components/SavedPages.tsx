import React, { useState, useEffect, useRef } from 'react';
import { removeVector, getAllVectors, exportData, importData, clearAllVectors, updateItemTags, getCategoryStats } from '../utils/vectorStore';
import { Grid, List as ListIcon, Search, BrainCircuit, Upload, Download, RefreshCw, Library, Trash2, Clock, SortAsc, Sparkles, Tag as TagIcon, Plus, CheckSquare, Minus, Wand2, FolderOpen, FolderOutput } from 'lucide-react';
import { getEmbedding } from '../utils/embedding';
import { similarity } from 'ml-distance';
import type { VectorItem } from './SavedPages/Items';
import { ListViewItem, GridViewItem } from './SavedPages/Items';
import { useDialog } from '../context/DialogContext'; // Import
import { optimizeTags } from '../utils/tagOptimizer'; // Import
import { TagOptimizationModal } from './TagOptimizationModal'; // Import
import { AutoOrganizeModal } from './AutoOrganizeModal';
import { syncCategories } from '../utils/categoryService';

const { cosine } = similarity;

interface SavedPagesProps {
  onSelectUrl: (url: string) => void;
  className?: string;
}

export const SavedPages: React.FC<SavedPagesProps> = ({ onSelectUrl, className }) => {
  const { showAlert, showConfirm, showPrompt } = useDialog(); // Hook
  const [items, setItems] = useState<VectorItem[]>([]);
  const [displayItems, setDisplayItems] = useState<VectorItem[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [allTags, setAllTags] = useState<{name: string, count: number}[]>([]);
  const [allCategories, setAllCategories] = useState<{name: string, count: number}[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'date' | 'title' | 'similarity'>('date');
  const [showCategories, setShowCategories] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modal & Sync States
  const [isTagModalOpen, setIsTagModalOpen] = useState(false);
  const [isOrganizeOpen, setIsOrganizeOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [tagMapping, setTagMapping] = useState<Record<string, string>>({});

  useEffect(() => {
    loadItems();
    setSelectedItems(new Set());
    
    const messageListener = (message: any) => {
        if (message.type === 'VECTOR_UPDATED') {
            console.log('Real-time update: refreshing library...');
            loadItems();
        }
    };
    chrome.runtime?.onMessage.addListener(messageListener);
    return () => chrome.runtime?.onMessage.removeListener(messageListener);
  }, []);

  const loadItems = async () => {
    setIsLoading(true);
    try {
      const allItems = await getAllVectors();
      setItems(allItems);
      
      const tagMap = new Map<string, number>();
      allItems.forEach(item => {
          if (item.tags && Array.isArray(item.tags)) {
              item.tags.forEach(tag => {
                  const normalizedTag = tag.trim();
                  if (normalizedTag) {
                    tagMap.set(normalizedTag, (tagMap.get(normalizedTag) || 0) + 1);
                  }
              });
          }
      });
      
      const sortedTags = Array.from(tagMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
        
      setAllTags(sortedTags);

      const catStats = await getCategoryStats();
      setAllCategories(catStats);
      
    } catch (e) {
      console.error('Failed to load items', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const processItems = async () => {
        let filtered = items.filter(item => {
            const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
            item.url.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()));
            
            const matchesTag = selectedTag ? (item.tags && item.tags.includes(selectedTag)) : true;
            const matchesCategory = selectedCategory ? (item.category === selectedCategory || (!item.category && selectedCategory === '未分類')) : true;
            
            return matchesSearch && matchesTag && matchesCategory;
        });

        if (sortBy === 'title') {
            filtered.sort((a, b) => a.title.localeCompare(b.title));
        } else if (sortBy === 'date') {
            filtered.sort((a, b) => b.timestamp - a.timestamp);
        } else if (sortBy === 'similarity' && searchQuery) {
            try {
                const settings = await chrome.storage.local.get(['geminiApiKey', 'embeddingModel']);
                if (settings.geminiApiKey) {
                    const apiKey = settings.geminiApiKey as string;
                    const modelName = (settings.embeddingModel as string) || 'models/embedding-001';
                    const queryVector = await getEmbedding(searchQuery, apiKey, modelName);
                    
                    const scored = filtered.map(item => {
                        const sim = item.vector ? (cosine(queryVector, item.vector) as number) : 0;
                        return { item, score: sim };
                    });
                    
                    scored.sort((a, b) => b.score - a.score);
                    filtered = scored.map(s => s.item);
                }
            } catch (e) {
                console.warn('Similarity sort failed', e);
            }
        } else if (sortBy === 'similarity' && !searchQuery) {
            filtered.sort((a, b) => b.timestamp - a.timestamp);
        }

        setDisplayItems(filtered);
    };

    processItems();
  }, [items, searchQuery, sortBy, selectedTag, selectedCategory]);

  // Actions
  const handleDelete = async (e: React.MouseEvent, url: string) => {
    e.stopPropagation();
    if (await showConfirm('この履歴をライブラリから完全に削除しますか？')) {
      await removeVector(url);
      loadItems();
      chrome.runtime.sendMessage({ type: 'VECTOR_UPDATED' });
    }
  };

  const handleOpenInNewTab = (e: React.MouseEvent, url: string) => {
    e.stopPropagation();
    window.open(url, '_blank');
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setIsLoading(true);
      const reader = new FileReader();
      reader.onload = async (ev) => {
          try {
              const json = ev.target?.result as string;
              const count = await importData(json);
              await showAlert(`${count}件の履歴をライブラリに取り込みました。`);
              loadItems();
              chrome.runtime.sendMessage({ type: 'VECTOR_UPDATED' });
          } catch (err) {
              console.error(err);
              await showAlert('インポートに失敗しました。');
          } finally {
              setIsLoading(false);
              if (fileInputRef.current) fileInputRef.current.value = '';
          }
      };
      reader.readAsText(file);
  };

  const toggleSelection = (e: React.MouseEvent, url: string) => {
      e.stopPropagation();
      const newSelected = new Set(selectedItems);
      if (newSelected.has(url)) {
          newSelected.delete(url);
      } else {
          newSelected.add(url);
      }
      setSelectedItems(newSelected);
  };

  const toggleSelectAll = () => {
      if (selectedItems.size === displayItems.length) {
          setSelectedItems(new Set());
      } else {
          setSelectedItems(new Set(displayItems.map(i => i.url)));
      }
  };

  const handleBulkAddTag = async () => {
      const newTag = await showPrompt('選択したアイテムに追加するタグを入力してください:');
      if (!newTag || !newTag.trim()) return;
      
      setIsLoading(true);
      for (const url of selectedItems) {
          const item = items.find(i => i.url === url);
          if (item) {
              const currentTags = item.tags || [];
              if (!currentTags.includes(newTag.trim())) {
                  await updateItemTags(url, [...currentTags, newTag.trim()]);
              }
          }
      }
      loadItems();
      chrome.runtime.sendMessage({ type: 'VECTOR_UPDATED' });
  };

  const handleBulkRemoveTag = async () => {
      const tagToRemove = await showPrompt('選択したアイテムから削除するタグを入力してください:');
      if (!tagToRemove || !tagToRemove.trim()) return;

      if (!await showConfirm(`選択した ${selectedItems.size} 件のアイテムからタグ "${tagToRemove}" を削除しますか？`)) return;

      setIsLoading(true);
      for (const url of selectedItems) {
          const item = items.find(i => i.url === url);
          if (item && item.tags) {
              const updatedTags = item.tags.filter(t => t !== tagToRemove.trim());
              if (updatedTags.length !== item.tags.length) {
                  await updateItemTags(url, updatedTags);
              }
          }
      }
      loadItems();
      chrome.runtime.sendMessage({ type: 'VECTOR_UPDATED' });
  };

  const handleBulkDelete = async () => {
      if (!await showConfirm(`選択した ${selectedItems.size} 件のページを削除しますか？この操作は取り消せません。`)) return;
      
      setIsLoading(true);
      for (const url of selectedItems) {
          await removeVector(url);
      }
      setSelectedItems(new Set());
      loadItems();
      chrome.runtime.sendMessage({ type: 'VECTOR_UPDATED' });
  };

  const handleAddTag = async (e: React.MouseEvent, item: VectorItem) => {
      e.stopPropagation();
      const newTag = await showPrompt('新しいタグを入力してください:');
      if (newTag && newTag.trim()) {
          const currentTags = item.tags || [];
          if (!currentTags.includes(newTag.trim())) {
              const updatedTags = [...currentTags, newTag.trim()];
              await updateItemTags(item.url, updatedTags);
              loadItems(); 
              chrome.runtime.sendMessage({ type: 'VECTOR_UPDATED' });
          }
      }
  };

  const handleEditTag = async (e: React.MouseEvent, item: VectorItem, oldTag: string) => {
      e.stopPropagation();
      const newTag = await showPrompt('タグ名を変更してください:', oldTag);
      if (newTag && newTag.trim() && newTag.trim() !== oldTag) {
          const currentTags = item.tags || [];
          const updatedTags = currentTags.map(t => t === oldTag ? newTag.trim() : t);
          await updateItemTags(item.url, updatedTags);
          loadItems();
          chrome.runtime.sendMessage({ type: 'VECTOR_UPDATED' });
      }
  };

  const handleTagClick = (e: React.MouseEvent, tag: string) => {
      e.stopPropagation();
      setSelectedTag(tag);
  };

  const handleRemoveTag = async (item: VectorItem, tagToRemove: string) => {
      if (!await showConfirm(`タグ "${tagToRemove}" を削除しますか？`)) return;
      const updatedTags = (item.tags || []).filter(t => t !== tagToRemove);
      await updateItemTags(item.url, updatedTags);
      loadItems();
      chrome.runtime.sendMessage({ type: 'VECTOR_UPDATED' });
  };

  const handleClearAll = async () => {
    if (items.length === 0) return;
    if (await showConfirm('ライブラリ内のすべての分析データを完全に削除しますか？\nこの操作は取り消せません。')) {
        if (await showConfirm('本当によろしいですか？バックアップが必要な場合は、先にエクスポートを実行してください。')) {
            await clearAllVectors();
            loadItems();
            chrome.runtime.sendMessage({ type: 'VECTOR_UPDATED' });
        }
    }
  };

  const handleExport = async () => {
      try {
          const fileName = await showPrompt('保存するファイル名を入力してください', 'twin-marks-library.json', 'バックアップのエクスポート');
          if (!fileName) return; // Cancelled

          const json = await exportData();
          const blob = new Blob([json], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          // Ensure .json extension
          a.download = fileName.endsWith('.json') ? fileName : `${fileName}.json`;
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          URL.revokeObjectURL(url);
      } catch (e) { await showAlert('エクスポートに失敗しました'); }
  };

  const handleOrganizeTags = async () => {
    if (allTags.length === 0) return;
    
    const settings = await chrome.storage.local.get(['geminiApiKey', 'generationModel']);
    const apiKey = settings.geminiApiKey as string;
    const modelName = (settings.generationModel || 'gemini-1.5-flash') as string;

    if (!apiKey) {
        await showAlert('先に設定でGemini APIキーを設定してください。');
        return;
    }

    const countStr = await showPrompt(
        '統合後の目標タグ数を入力してください。\n\n空白（または0）の場合は、表記揺れの統一のみ行います。\n数を指定すると（例: 5）、関連するタグを統合してその数に近づけます。',
        undefined,
        'タグ整理の設定'
    );
    
    if (countStr === null) return;
    
    const targetCount = countStr.trim() ? parseInt(countStr.trim(), 10) : undefined;
    if (countStr.trim() && (isNaN(targetCount!) || targetCount! < 0)) {
        await showAlert('有効な数字を入力してください。');
        return;
    }

    setIsLoading(true);
    try {
        const tagList = allTags.map(t => t.name);
        const mapping = await optimizeTags(tagList, apiKey, modelName, targetCount && targetCount > 0 ? targetCount : undefined);
        
        if (Object.keys(mapping).length === 0) {
            await showAlert('整理が必要なタグは見つかりませんでした。');
            setIsLoading(false); // Make sure to stop loading
            return;
        }

        setTagMapping(mapping);
        setIsTagModalOpen(true);
        setIsLoading(false); // Stop loading when modal opens
    } catch (e) {
        console.error(e);
        await showAlert('タグの整理中にエラーが発生しました。');
        setIsLoading(false);
    } 
  };

  const handleApplyTags = async (finalMapping: Record<string, string>) => {
      setIsTagModalOpen(false);
      setIsLoading(true);
      
      try {
            let updateCount = 0;
            for (const item of items) {
                if (!item.tags || item.tags.length === 0) continue;
                
                let changed = false;
                const newTags = item.tags.map(tag => {
                    if (finalMapping[tag]) {
                        changed = true;
                        return finalMapping[tag];
                    }
                    return tag;
                });
                
                const uniqueNewTags = [...new Set(newTags)];
                
                if (changed || uniqueNewTags.length !== item.tags.length) {
                    await updateItemTags(item.url, uniqueNewTags);
                    updateCount++;
                }
            }
            
            await showAlert(`${updateCount} 件のアイテムのタグを更新しました。`);
            loadItems();
            chrome.runtime.sendMessage({ type: 'VECTOR_UPDATED' });
      } catch(e) {
          console.error(e);
          await showAlert('タグの更新に失敗しました。');
      } finally {
          setIsLoading(false);
      }
  };

  const handleSyncCategories = async () => {
    const settings = await chrome.storage.local.get(['geminiApiKey', 'generationModel']);
    const apiKeyStr = (settings.geminiApiKey as string) || '';
    if (!apiKeyStr) {
        await showAlert('先に設定でAPIキーを設定してください。');
        return;
    }
    
    setIsSyncing(true);
    try {
        await syncCategories(apiKeyStr, (settings.generationModel as string) || 'gemini-1.5-flash');
        await showAlert('全20カテゴリの再編が完了しました。RAG検索の精度が向上します。');
        loadItems(); // Refresh category stats
    } catch (e: any) {
        console.error(e);
        const errorMsg = e?.message || '';
        if (errorMsg.includes('429') || errorMsg.includes('quota')) {
            await showAlert('APIのクォータ制限（回数制限）を超えました。しばらく待ってから再度お試しください。');
        } else {
            await showAlert('カテゴリ同期に失敗しました。詳細はコンソールを確認してください。');
        }
    } finally {
        setIsSyncing(false);
    }
  };

  const tagCountMap = React.useMemo(() => {
    const map: Record<string, number> = {};
    allTags.forEach(tag => {
        map[tag.name] = tag.count;
    });
    return map;
  }, [allTags]);

  return (
    <div className={`flex flex-col h-full bg-slate-950 ${className}`}> 
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".json" className="hidden" />
      
      {/* Header */}
      <div className="flex flex-col space-y-4 px-6 py-4 border-b border-slate-800 bg-slate-900/50 flex-none">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg border bg-blue-500/10 border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.1)]`}>
                    <Library className="text-blue-400" size={20} />
                </div>
                <div>
                    <h2 className="text-lg font-bold text-slate-100 italic tracking-tight flex items-center gap-2">
                    AI LIBRARY <span className="text-[10px] bg-blue-600/20 text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/30 font-normal not-italic">HISTORY</span>
                    </h2>
                    <div className="flex items-center gap-3">
                        <p className="text-xs text-slate-500">
                        {items.length} 分析済みのページ
                        </p>
                        <button 
                            onClick={() => setShowCategories(!showCategories)}
                            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold transition-all border ${showCategories ? 'bg-purple-600/20 text-purple-400 border-purple-500/30 shadow-[0_0_10px_rgba(168,85,247,0.2)]' : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-purple-500/40'}`}
                        >
                            <FolderOpen size={10} />
                            AIカテゴリ {showCategories ? 'を閉じる' : 'を表示'}
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <button 
                    onClick={() => setIsOrganizeOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg transition-all text-[10px] font-bold"
                >
                    <FolderOutput size={14} className="text-yellow-500" />
                    自動整理
                </button>
                <button 
                    onClick={handleSyncCategories}
                    disabled={isSyncing}
                    className={`flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg transition-all text-[10px] font-bold ${isSyncing ? 'animate-pulse' : ''}`}
                >
                    <RefreshCw size={14} className={`text-blue-400 ${isSyncing ? 'animate-spin' : ''}`} />
                    同期
                </button>
                <div className="w-px h-6 bg-slate-800 mx-1" />
                <button onClick={handleImportClick} className="group flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-all shadow-lg shadow-blue-900/20">
                    <Upload size={14} className="group-hover:-translate-y-0.5 transition-transform" /> 履歴を取り込む
                </button>
                <button onClick={handleExport} className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 border border-slate-800 rounded-lg transition-all" title="バックアップを保存">
                    <Download size={14} />
                </button>
                <button 
                    onClick={handleClearAll} 
                    className="px-3 py-1.5 bg-rose-950/30 hover:bg-rose-600 text-rose-500 hover:text-white border border-rose-500/30 rounded-lg transition-all" 
                    title="ライブラリをすべて消去"
                >
                    <Trash2 size={14} />
                </button>
            </div>
        </div>

        {/* Collapsible AI Categories Panel */}
        {showCategories && (
          <div className="bg-slate-900/80 border border-purple-500/20 rounded-xl p-4 animate-in fade-in slide-in-from-top-2 duration-200 shadow-xl backdrop-blur-sm">
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <Sparkles size={12} className="text-purple-400" />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Select AI Category for Filtering</span>
              </div>
              {selectedCategory && (
                <button 
                  onClick={() => setSelectedCategory(null)}
                  className="text-[10px] text-purple-400 hover:text-purple-300 font-bold"
                >
                  フィルター解除
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              <button 
                onClick={() => setSelectedCategory(null)}
                className={`flex items-center justify-between px-3 py-2 rounded-lg text-[11px] transition-all border ${!selectedCategory ? 'bg-purple-600 text-white border-purple-500 shadow-lg shadow-purple-900/40 font-bold' : 'bg-slate-950/50 text-slate-400 border-slate-800 hover:border-slate-700'}`}
              >
                <span>すべて</span>
                <span className="opacity-50">({items.length})</span>
              </button>
              {allCategories.map(cat => (
                <button 
                  key={cat.name}
                  onClick={() => setSelectedCategory(selectedCategory === cat.name ? null : cat.name)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-[11px] transition-all border ${selectedCategory === cat.name 
                    ? 'bg-purple-600 text-white border-purple-500 shadow-lg shadow-purple-900/40 font-bold' 
                    : 'bg-slate-950/50 text-slate-400 border-slate-800 hover:border-slate-700'}`}
                >
                  <span className="truncate pr-2">{cat.name}</span>
                  <span className={`opacity-60 text-[9px] ${selectedCategory === cat.name ? 'text-white' : 'text-slate-500'}`}>({cat.count})</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Bulk Actions & Search Bar Area */}
        <div className="space-y-3">
            {selectedItems.size > 0 && (
                <div className="flex items-center justify-between bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-2 animate-in slide-in-from-top-2">
                    <div className="flex items-center gap-3">
                        <button onClick={toggleSelectAll} className="flex items-center gap-2 text-xs font-bold text-blue-400 hover:text-white transition-colors">
                            {selectedItems.size === displayItems.length ? <CheckSquare size={16} /> : <Minus size={16} />}
                            {selectedItems.size} 件選択中
                        </button>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={handleBulkAddTag} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-all">
                            <Plus size={14} /> タグ追加
                        </button>
                        <button onClick={handleBulkRemoveTag} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg transition-all">
                            <Minus size={14} /> タグ削除
                        </button>
                        <div className="w-px h-4 bg-blue-500/30 mx-1" />
                        <button onClick={handleBulkDelete} className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500 text-rose-400 hover:text-white text-xs font-bold rounded-lg transition-all">
                            <Trash2 size={14} /> 削除
                        </button>
                    </div>
                </div>
            )}

            <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={12} />
              <input 
                type="text" 
                placeholder="ライブラリ内を検索..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-full pl-9 pr-4 py-1.5 text-xs text-slate-300 focus:ring-1 focus:ring-blue-500/50 outline-none transition-all"
              />
          </div>

          <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-0.5">
              <button 
                onClick={() => setSortBy('date')} 
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${sortBy === 'date' ? 'bg-slate-800 text-blue-400 shadow-sm' : 'text-slate-500 hover:text-slate-400'}`}
                title="新しい順"
              >
                  <Clock size={12} />
              </button>
              <button 
                onClick={() => setSortBy('title')} 
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${sortBy === 'title' ? 'bg-slate-800 text-blue-400 shadow-sm' : 'text-slate-500 hover:text-slate-400'}`}
                title="名前順"
              >
                  <SortAsc size={12} />
              </button>
              <button 
                onClick={() => setSortBy('similarity')} 
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${sortBy === 'similarity' ? 'bg-slate-800 text-blue-400 shadow-sm' : 'text-slate-500 hover:text-slate-400'}`}
                title="関連度順 (AI類似度)"
              >
                  <Sparkles size={12} />
              </button>
          </div>

          <div className="w-px h-6 bg-slate-800 mx-1" />

          <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-0.5">
              <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md ${viewMode === 'list' ? 'bg-slate-800 text-blue-400 shadow-sm' : 'text-slate-600 hover:text-slate-400'}`}><ListIcon size={14} /></button>
              <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md ${viewMode === 'grid' ? 'bg-slate-800 text-blue-400 shadow-sm' : 'text-slate-600 hover:text-slate-400'}`}><Grid size={14} /></button>
          </div>
        </div>

        {/* Tag Cloud / Filter */}
        {allTags.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-800/50">
                <div className="flex items-center justify-between w-full mb-1">
                    <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1">
                        <TagIcon size={10} />
                        Tags:
                    </div>
                    <button 
                        onClick={handleOrganizeTags}
                        className="flex items-center gap-1 text-[10px] text-purple-400 hover:text-purple-300 transition-colors"
                        title="タグをAIで整理"
                    >
                        <Wand2 size={10} />
                        タグ整理
                    </button>
                </div>
                {selectedTag && (
                    <button 
                        onClick={() => setSelectedTag(null)}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-blue-600 text-white hover:bg-blue-500 transition-colors"
                    >
                        <Plus size={10} className="rotate-45" />
                        Tag Filter: {selectedTag}
                    </button>
                )}
                {selectedCategory && (
                    <button 
                        onClick={() => setSelectedCategory(null)}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-purple-600 text-white hover:bg-purple-500 transition-colors"
                    >
                        <Plus size={10} className="rotate-45" />
                        AI Category: {selectedCategory}
                    </button>
                )}
                {allTags.map(tag => (
                    <button
                        key={tag.name}
                        onClick={() => setSelectedTag(selectedTag === tag.name ? null : tag.name)}
                        className={`px-2 py-0.5 rounded-full text-[10px] border transition-all ${selectedTag === tag.name 
                            ? 'bg-blue-500/20 border-blue-500/50 text-blue-300' 
                            : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-300'
                        }`}
                    >
                        {tag.name} <span className="opacity-50 ml-0.5">({tag.count})</span>
                    </button>
                ))}
            </div>
        )}
      </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-800">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-500">
            <RefreshCw className="animate-spin text-blue-500/50" size={32} />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] animate-pulse">Synchronizing</span>
          </div>
        ) : displayItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-4">
            <div className="p-8 rounded-full bg-slate-900/50 border border-slate-800/50">
                <BrainCircuit size={48} className="opacity-10" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-slate-500">まだ分析されたページがありません</p>
            </div>
          </div>
        ) : viewMode === 'list' ? (
          <div className="space-y-2 max-w-5xl mx-auto">
            {displayItems.map((item) => (
                <ListViewItem 
                    key={item.url} 
                    item={item} 
                    selected={selectedItems.has(item.url)}
                    onToggle={toggleSelection}
                    onSelect={onSelectUrl}
                    onOpen={handleOpenInNewTab}
                    onDelete={handleDelete}
                    onAddTag={handleAddTag}
                    onRemoveTag={handleRemoveTag}
                    onEditTag={handleEditTag}
                    onTagClick={handleTagClick}
                    tagCounts={tagCountMap}
                />
            ))}
          </div>
        ) : ( /* viewMode === 'grid' */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {displayItems.map((item) => (
                <GridViewItem 
                    key={item.url} 
                    item={item} 
                    selected={selectedItems.has(item.url)}
                    onToggle={toggleSelection}
                    onSelect={onSelectUrl}
                    onOpen={handleOpenInNewTab}
                    onDelete={handleDelete}
                    onAddTag={handleAddTag}
                    onRemoveTag={handleRemoveTag}
                    onEditTag={handleEditTag}
                    onTagClick={handleTagClick}
                    tagCounts={tagCountMap}
                />
            ))}
          </div>
        )}
      </div>

      <TagOptimizationModal 
        isOpen={isTagModalOpen}
        initialMapping={tagMapping}
        onClose={() => setIsTagModalOpen(false)}
        onApply={handleApplyTags}
      />

      <AutoOrganizeModal 
        isOpen={isOrganizeOpen}
        onClose={() => setIsOrganizeOpen(false)}
      />
    </div>
  );
};
        