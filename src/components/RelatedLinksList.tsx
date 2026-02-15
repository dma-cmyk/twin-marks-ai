import React, { useState, useEffect } from 'react';
import { findSimilarPages } from '../utils/vectorSearch';
import type { SearchResult } from '../utils/vectorSearch';
import { getEmbedding } from '../utils/embedding';
import { BrainCircuit, ExternalLink, Loader2, Search, LayoutList, LayoutGrid } from 'lucide-react';


interface RelatedLinksListProps {
  targetUrl?: string;
  targetTitle?: string; // Optional context
  onSelectUrl: (url: string) => void;
  className?: string;
}

export const RelatedLinksList: React.FC<RelatedLinksListProps> = ({ targetUrl, targetTitle, onSelectUrl, className }) => {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastSearchedQuery, setLastSearchedQuery] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  useEffect(() => {
      // Load search history
      chrome.storage?.local.get(['searchHistory'], (res) => {
          if (res.searchHistory) {
              setSearchHistory(res.searchHistory as string[]);
          }
      });
  }, []);

  const saveHistory = (query: string) => {
      if (!query.trim()) return;
      const newHistory = [query, ...searchHistory.filter(h => h !== query)].slice(0, 10);
      setSearchHistory(newHistory);
      chrome.storage?.local.set({ searchHistory: newHistory });
  };

  const handleSearch = async (mode: 'query' | 'related' = 'query', overrideQuery?: string) => {
    setIsLoading(true);
    setResults([]);
    
    try {
       // 1. Get Settings
       const settings = await chrome.storage?.local.get(['geminiApiKey', 'embeddingModel']);
       const apiKey = settings?.geminiApiKey as string;
       const modelName = (settings?.embeddingModel || 'models/embedding-001') as string;

       if (!apiKey) {
           alert('先に設定でGemini APIキーを設定してください。');
           setIsLoading(false);
           return;
       }

       let vector: number[] | undefined;
       let queryText = overrideQuery || '';

       if (mode === 'query') {
           if (!queryText && !searchQuery.trim()) {
               setIsLoading(false);
               return;
           }
           if (!queryText) queryText = searchQuery;
           
           // Save to history
           saveHistory(queryText);
           setSearchQuery(queryText); // Update input if clicked from history

           console.log('Generating embedding for query:', queryText);
           vector = await getEmbedding(queryText, apiKey, modelName);
       } else {
           // Related Search Mode
           if (!targetUrl) return;
           queryText = targetTitle || targetUrl;

           // Try to get vector from DB first
           const { getVector } = await import('../utils/vectorStore');
           const vectorData = await getVector(targetUrl);
           
           if (vectorData?.vector) {
               vector = vectorData.vector;
               console.log('Using stored vector for related search.');
           } else {
               // Fallback: Generate from title
               if (targetTitle) {
                   console.log('Vector not found in DB, generating from title:', targetTitle);
                   vector = await getEmbedding(targetTitle, apiKey, modelName);
               } else {
                                  alert('このブックマークを分析できません。タイトルがありません。');
                                  setIsLoading(false);
                                  return;               }
           }
       }

       if (!vector) {
           throw new Error('Failed to generate vector.');
       }

       // 3. Perform Vector Search (Limit removed for limitless scroll)
       const similar = await findSimilarPages(vector, 9999);
       setResults(similar);
       setLastSearchedQuery(mode === 'query' ? searchQuery : `Related to: ${targetTitle}`);

    } catch (e) {
        console.error(e);
        alert('検索に失敗しました。コンソールを確認してください。');
    } finally {
        setIsLoading(false);
    }
  };

  const handleOpenInNewTab = (url: string) => {
      if (typeof chrome !== 'undefined' && chrome.tabs) {
          chrome.tabs.create({ url: url });
      } else {
          window.open(url, '_blank');
      }
  };



  return (
    <div className={`flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl ${className}`}>
        <div className="flex items-center gap-3 px-4 py-3 bg-slate-900 border-b border-slate-800">
            <h3 className="font-bold text-slate-100 flex items-center gap-2">
                <BrainCircuit className="text-purple-500" size={20} />
                AI意味検索
            </h3>
            
            <div className="flex bg-slate-950/50 border border-slate-700/50 rounded-lg p-0.5">
                <button 
                  onClick={() => setViewMode('list')} 
                  className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                  title="リスト表示"
                >
                    <LayoutList size={14} />
                </button>
                <button 
                  onClick={() => setViewMode('grid')} 
                  className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                  title="グリッド表示"
                >
                    <LayoutGrid size={14} />
                </button>
            </div>
        </div>

        <div className="p-4 bg-slate-900/50 space-y-4 border-b border-slate-800">
            {/* Keyword Search Input */}
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                    <input 
                        type="text" 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch('query')}
                        placeholder="探しているものを記述してください..."
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 focus:ring-2 focus:ring-purple-500 outline-none placeholder-slate-600"
                    />
                </div>
                                    <button 
                                        onClick={() => handleSearch('query')}
                                        disabled={isLoading || !searchQuery.trim()}
                                        className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-lg transition-colors shadow-lg shadow-purple-900/20"
                                    >
                                        {isLoading ? <Loader2 size={16} className="animate-spin" /> : '検索'}
                                    </button>
                                </div>
                            
                            {/* Search History Chips */}
                            {searchHistory.length > 0 && (
                                <div className="flex flex-wrap gap-2 pt-1">
                                    <span className="text-[10px] text-slate-500 py-1">履歴:</span>                    {searchHistory.map((hist, i) => (
                        <button
                            key={i}
                            onClick={() => handleSearch('query', hist)}
                            className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 hover:bg-slate-700 transition-all max-w-[150px] truncate"
                            title={hist}
                        >
                            {hist}
                        </button>
                    ))}
                </div>
            )}

            {/* Context Search Option */}
            {targetUrl && (
                <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg border border-slate-700/50">
                    <div className="flex items-center gap-2 text-xs text-slate-400 min-w-0">
                        <span className="font-medium text-slate-300">選択中:</span>
                        <span className="truncate">{targetTitle || targetUrl}</span>
                    </div>
                    <button 
                        onClick={() => handleSearch('related')}
                        disabled={isLoading}
                        className="text-xs text-purple-400 hover:text-purple-300 hover:underline disabled:opacity-50 whitespace-nowrap ml-2"
                    >
                        類似を検索
                    </button>
                </div>
            )}
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-slate-900/50">
            {results.length === 0 && !isLoading ? (
                <div className="flex flex-col items-center justify-center h-40 text-slate-600 gap-2">
                    {lastSearchedQuery ? (
                        <span className="text-xs">"{lastSearchedQuery}" の検索結果はありませんでした。</span>
                    ) : (
                        <>
                            <BrainCircuit size={32} className="opacity-20" />
                            <span className="text-xs">キーワードを入力するか、ブックマークを選択して開始してください。</span>
                        </>
                    )}
                </div>
            ) : (
                <>
                   {lastSearchedQuery && (
                       <div className="px-2 pb-2 text-xs text-slate-500 border-b border-slate-800/50 mb-2">
                           検索結果: <span className="font-medium text-slate-300">{lastSearchedQuery}</span>
                       </div>
                   )}
                   <div className={viewMode === 'list' ? "space-y-2" : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"}>
                   {results.map((item, idx) => (
                       <div 
                           key={idx}
                           onClick={() => {
                               onSelectUrl(item.url);
                               handleOpenInNewTab(item.url);
                           }}
                           className={viewMode === 'list' 
                               ? "group flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800 cursor-pointer border border-transparent hover:border-slate-700 transition-all"
                               : "group relative flex flex-col p-3 rounded-xl bg-slate-800/40 border border-slate-700/50 hover:bg-slate-800 hover:border-purple-500/50 cursor-pointer transition-all shadow-lg hover:shadow-purple-500/10"
                           }
                       >
                           {viewMode === 'list' ? (
                               <>
                                   <div className="flex-shrink-0">
                                        <img 
                                            src={`https://www.google.com/s2/favicons?domain=${new URL(item.url).hostname}&sz=32`}
                                            alt=""
                                            className="w-8 h-8 p-1 rounded-lg bg-slate-800 object-contain"
                                            onError={(e) => {
                                                e.currentTarget.style.display = 'none';
                                                e.currentTarget.nextElementSibling?.classList.remove('hidden');
                                            }}
                                        />
                                        <div className="hidden p-2 rounded-lg bg-slate-800 text-purple-400">
                                            <ExternalLink size={16} />
                                        </div>
                                   </div>
                                   <div className="flex-1 min-w-0">
                                       <div className="text-sm font-medium text-slate-200 truncate group-hover:text-purple-200">
                                           {item.title || 'Untitled'}
                                       </div>
                                       {item.description ? (
                                           <div className="text-[10px] text-slate-400 italic line-clamp-2 my-1 leading-tight" title={item.description}>
                                               {item.description}
                                           </div>
                                       ) : null}
                                       <div className="flex items-center gap-2">
                                           <div className="text-[10px] text-slate-500 truncate flex-1">
                                               {item.url}
                                           </div>
                                           <div className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                                               類似度: {(item.score * 100).toFixed(1)}%
                                           </div>
                                       </div>
                                   </div>
                               </>
                           ) : (
                               <>
                                   <div className="flex items-start justify-between mb-2">
                                       <img 
                                            src={`https://www.google.com/s2/favicons?domain=${new URL(item.url).hostname}&sz=32`}
                                            alt=""
                                            className="w-6 h-6 p-1 rounded bg-slate-900 object-contain"
                                       />
                                       <div className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono border border-purple-500/30">
                                           {(item.score * 100).toFixed(0)}%
                                       </div>
                                   </div>
                                   <div className="text-xs font-bold text-slate-100 line-clamp-2 mb-1 group-hover:text-purple-300 transition-colors">
                                       {item.title || 'Untitled'}
                                   </div>
                                   {item.description && (
                                       <div className="text-[10px] text-slate-400 line-clamp-2 mb-2 italic flex-1">
                                           {item.description}
                                       </div>
                                   )}
                                   <div className="text-[9px] text-slate-500 truncate mt-auto">
                                       {new URL(item.url).hostname}
                                   </div>
                               </>
                           )}
                       </div>
                   ))}
                   </div>
                </>
            )}
        </div>
    </div>
  );
};
