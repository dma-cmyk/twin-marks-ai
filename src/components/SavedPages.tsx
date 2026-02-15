import React, { useState, useEffect, useRef } from 'react';
import { removeVector, getAllVectors, exportData, importData, clearAllVectors } from '../utils/vectorStore';
import { ExternalLink, Grid, List as ListIcon, Search, BrainCircuit, Upload, Download, RefreshCw, Library, Trash2, Clock, SortAsc, Sparkles } from 'lucide-react';
import { getEmbedding } from '../utils/embedding';
import { similarity } from 'ml-distance';
const { cosine } = similarity;

interface VectorItem {
  url: string;
  title: string;
  timestamp: number;
  vector?: number[];
  description?: string;
  isSaved?: boolean;
}

interface SavedPagesProps {
  onSelectUrl: (url: string) => void;
  className?: string;
}

export const SavedPages: React.FC<SavedPagesProps> = ({ onSelectUrl, className }) => {
  const [items, setItems] = useState<VectorItem[]>([]);
  const [displayItems, setDisplayItems] = useState<VectorItem[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'title' | 'similarity'>('date');
  const [isLoading, setIsLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadItems();

    // リアルタイム更新（別タブでの分析完了などを検知）
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
    } catch (e) {
      console.error('Failed to load items', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const processItems = async () => {
        let filtered = items.filter(item => 
            item.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
            item.url.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()))
        );

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
  }, [items, searchQuery, sortBy]);

  const handleDelete = async (e: React.MouseEvent, url: string) => {
    e.stopPropagation();
    if (confirm('この履歴をライブラリから完全に削除しますか？')) {
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
              alert(`${count}件の履歴をライブラリに取り込みました。`);
              loadItems();
              chrome.runtime.sendMessage({ type: 'VECTOR_UPDATED' });
          } catch (err) {
              console.error(err);
              alert('インポートに失敗しました。');
          } finally {
              setIsLoading(false);
              if (fileInputRef.current) fileInputRef.current.value = '';
          }
      };
      reader.readAsText(file);
  };

  const handleClearAll = async () => {
    if (items.length === 0) return;
    if (confirm('ライブラリ内のすべての分析データを完全に削除しますか？\nこの操作は取り消せません。')) {
        if (confirm('本当によろしいですか？バックアップが必要な場合は、先にエクスポートを実行してください。')) {
            await clearAllVectors();
            loadItems();
            chrome.runtime.sendMessage({ type: 'VECTOR_UPDATED' });
        }
    }
  };

  const handleExport = async () => {
      try {
          const json = await exportData();
          const blob = new Blob([json], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = `twin-marks-library.json`;
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          URL.revokeObjectURL(url);
      } catch (e) { alert('エクスポートに失敗しました'); }
  };

  return (
    <div className={`flex flex-col h-full bg-slate-950 ${className}`}>
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".json" className="hidden" />
      
      <div className="flex flex-col space-y-4 px-6 py-4 border-b border-slate-800 bg-slate-900/50">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg border bg-blue-500/10 border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.1)]`}>
                    <Library className="text-blue-400" size={20} />
                </div>
                <div>
                    <h2 className="text-lg font-bold text-slate-100 italic tracking-tight flex items-center gap-2">
                    AI LIBRARY <span className="text-[10px] bg-blue-600/20 text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/30 font-normal not-italic">HISTORY</span>
                    </h2>
                    <p className="text-xs text-slate-500">
                    {items.length} 分析済みのページ
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-2">
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
      </div>

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
            {displayItems.map((item: VectorItem) => (
              <div key={item.url} onClick={() => onSelectUrl(item.url)} className="group flex items-center gap-4 p-3 bg-slate-900/20 hover:bg-slate-900/60 border border-slate-800/50 rounded-xl transition-all hover:border-blue-500/20 cursor-pointer shadow-sm">
                <img src={`https://www.google.com/s2/favicons?domain=${new URL(item.url).hostname}&sz=64`} alt="" className="w-10 h-10 p-2 rounded-lg bg-slate-950 object-contain border border-slate-800 group-hover:border-blue-500/30 transition-colors" onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>'; }} />
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-bold truncate group-hover:text-blue-400 transition-colors text-slate-300`}>{item.title}</div>
                  <div className="text-[10px] text-slate-500 truncate font-mono mt-0.5 opacity-60">{item.url}</div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={(e) => handleOpenInNewTab(e, item.url)} className="p-2 text-slate-600 hover:text-blue-400 hover:bg-slate-800 rounded-lg transition-colors"><ExternalLink size={16} /></button>
                  <button onClick={(e) => handleDelete(e, item.url)} className="p-2 text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors" title="削除"><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {displayItems.map((item: VectorItem) => (
              <div key={item.url} onClick={() => onSelectUrl(item.url)} className="group flex flex-col p-4 bg-slate-900/30 hover:bg-slate-900 border border-slate-800/80 rounded-2xl transition-all hover:border-blue-500/30 cursor-pointer shadow-lg relative overflow-hidden">
                <div className={`absolute top-0 left-0 w-full h-1 bg-blue-500/10 group-hover:bg-blue-500/40 transition-colors`} />
                <div className="flex items-start justify-between mb-3">
                   <img src={`https://www.google.com/s2/favicons?domain=${new URL(item.url).hostname}&sz=64`} alt="" className="w-12 h-12 p-2.5 rounded-xl bg-slate-950 object-contain border border-slate-800 shadow-inner group-hover:border-blue-500/30 transition-colors" onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>'; }} />
                   <div className="flex gap-1">
                    <button onClick={(e) => handleOpenInNewTab(e, item.url)} className="p-1.5 text-slate-700 hover:text-blue-400 transition-colors"><ExternalLink size={14} /></button>
                    <button onClick={(e) => handleDelete(e, item.url)} className="p-1.5 text-slate-700 hover:text-rose-400 transition-colors"><Trash2 size={14} /></button>
                   </div>
                </div>
                <div className="flex-1 flex flex-col">
                  <h3 className={`text-sm font-bold line-clamp-2 leading-tight group-hover:text-blue-400 transition-colors mb-2 text-slate-300`}>{item.title}</h3>
                  {item.description && <p className="text-[11px] text-slate-500 line-clamp-3 mb-2 flex-1 leading-relaxed">{item.description}</p>}
                  <div className="pt-3 border-t border-slate-800/50 flex items-center justify-between">
                    <span className="text-[10px] text-slate-600 font-mono truncate max-w-[120px]">{new URL(item.url).hostname}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
