import React, { useEffect, useState, useRef } from 'react';
import { getAllVectors, removeVector, exportData, importData } from '../utils/vectorStore';
import { Trash2, Database, RefreshCw, Download, Upload } from 'lucide-react';

interface StoredVector {
  url: string;
  title: string;
  timestamp: number;
  description?: string;
}

export const VectorManager: React.FC = () => {
  const [items, setItems] = useState<StoredVector[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadItems = async () => {
    setIsLoading(true);
    try {
      const vectors = await getAllVectors();
      // Only keep necessary metadata for list
      const mapped = vectors.map(v => ({
        url: v.url,
        title: v.title,
        timestamp: v.timestamp,
        description: v.description
      })).sort((a, b) => b.timestamp - a.timestamp);
      setItems(mapped);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadItems();

    const handleMessage = (message: any) => {
        if (message.type === 'VECTOR_UPDATED') {
            loadItems();
        }
    };
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []);

  const handleDelete = async (url: string) => {
    if (confirm('このページをAIメモリから削除してもよろしいですか？')) {
      await removeVector(url);
      await loadItems();
    }
  };

  const handleExport = async () => {
      try {
          const json = await exportData();
          const blob = new Blob([json], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `twin-marks-data-${new Date().toISOString().slice(0, 10)}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
      } catch (e) {
          console.error(e);
          alert('エクスポートに失敗しました。');
      }
  };

  const handleImportClick = () => {
      fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!confirm('既存のデータにマージ（上書き）しますか？')) {
          e.target.value = '';
          return;
      }

      setIsLoading(true);
      const reader = new FileReader();
      reader.onload = async (ev) => {
          try {
              const json = ev.target?.result as string;
              const count = await importData(json);
              alert(`${count}件のデータをインポートしました。`);
              await loadItems();
              // Notify others
              chrome.runtime.sendMessage({ type: 'VECTOR_UPDATED' });
          } catch (err) {
              console.error(err);
              alert('インポートに失敗しました。ファイル形式を確認してください。');
          } finally {
              setIsLoading(false);
              if (fileInputRef.current) fileInputRef.current.value = '';
          }
      };
      reader.readAsText(file);
  };

  return (
    <div className="mt-4 w-full bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden flex flex-col max-h-[300px]">
      <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          accept=".json" 
          className="hidden" 
      />
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800/50 border-b border-slate-700">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <Database size={12} />
                                保存済みページ ({items.length})
                              </h4>
                              <div className="flex items-center gap-1">
                                <button 
                                    onClick={handleImportClick}
                                    className="p-1 text-slate-500 hover:text-blue-400 transition-colors"
                                    title="インポート"
                                >
                                    <Upload size={14} />
                                </button>
                                <button 
                                    onClick={handleExport}
                                    className="p-1 text-slate-500 hover:text-green-400 transition-colors"
                                    title="エクスポート"
                                >
                                    <Download size={14} />
                                </button>
                                <button 
                                    onClick={loadItems} 
                                    className="p-1 text-slate-500 hover:text-white transition-colors"
                                    title="リストを更新"
                                >
                                    <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
                                </button>
                              </div>
                          </div>
      
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {items.length === 0 ? (
          <div className="text-center py-4 text-slate-600 text-xs">
            まだ分析されたページはありません。
          </div>
        ) : (
          items.map((item) => (
            <div 
                key={item.url} 
                onClick={() => window.open(item.url, '_blank')}
                className="flex items-center justify-between p-2 rounded hover:bg-slate-800/50 group transition-colors cursor-pointer"
            >
              <div className="flex items-center min-w-0 flex-1 mr-3">
                <img 
                    src={`https://www.google.com/s2/favicons?domain=${new URL(item.url).hostname}&sz=32`} 
                    alt="" 
                    className="w-4 h-4 mr-3 rounded-sm opacity-80"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-300 truncate" title={item.title}>
                    {item.title || 'Untitled'}
                    </div>
                    {item.description ? (
                        <div className="text-[10px] text-slate-400 italic line-clamp-2 my-1 leading-tight" title={item.description}>
                            {item.description}
                        </div>
                    ) : (
                        <div className="text-[10px] text-slate-600 italic mt-0.5">No description</div>
                    )}
                    <div className="text-[10px] text-slate-600 truncate font-mono mt-0.5">
                    {item.url}
                    </div>
                </div>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); handleDelete(item.url); }}
                className="p-1.5 text-slate-600 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all"
                title="削除"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
