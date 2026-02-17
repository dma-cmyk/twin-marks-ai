import React, { useState, useEffect, useMemo } from 'react';
import { findSimilarPages } from '../utils/vectorSearch';
import type { SearchResult } from '../utils/vectorSearch';
import { getEmbedding } from '../utils/embedding';
import { BrainCircuit, ExternalLink, Loader2, Search, LayoutList, LayoutGrid, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { useDialog } from '../context/DialogContext';
import { generateRAGAnswer } from '../utils/ragService';
import type { RAGAnswer } from '../utils/ragService';
import { syncCategories } from '../utils/categoryService';


interface RelatedLinksListProps {
  targetUrl?: string;
  targetTitle?: string; // Optional context
  onSelectUrl: (url: string) => void;
  className?: string;
}

export const RelatedLinksList: React.FC<RelatedLinksListProps> = ({ targetUrl, targetTitle, onSelectUrl, className }) => {
  const { showAlert } = useDialog();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastSearchedQuery, setLastSearchedQuery] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [searchMode, setSearchMode] = useState<'category' | 'semantic'>('semantic');
  const [isRagLoading, setIsRagLoading] = useState(false);
  const [ragAnswer, setRagAnswer] = useState<RAGAnswer | null>(null);
  const [isRagExpanded, setIsRagExpanded] = useState(true);
  const [hasCategories, setHasCategories] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState(false);

  const sortedResults = useMemo(() => {
      if (!ragAnswer) return results;
      return [...results].sort((a, b) => {
          const aIsSource = ragAnswer.sources.some(s => s.url === a.url) ? 1 : 0;
          const bIsSource = ragAnswer.sources.some(s => s.url === b.url) ? 1 : 0;
          if (aIsSource !== bIsSource) {
              return bIsSource - aIsSource;
          }
          return 0; // Maintain existing similarity sort order
      });
  }, [results, ragAnswer]);

  useEffect(() => {
      // Check if categories exist
      chrome.storage?.local.get(['aiCategories'], (res: { [key: string]: any }) => {
          const cats = res.aiCategories as string[] | undefined;
          setHasCategories(!!cats && cats.length > 0);
      });
      // Load search history
      chrome.storage?.local.get(['searchHistory'], (res) => {
          if (res.searchHistory) {
              setSearchHistory(res.searchHistory as string[]);
          }
      });
  }, []);

  useEffect(() => {
      // Clear AI answer if mode switched to semantic searching
      if (searchMode === 'semantic') {
          setRagAnswer(null);
          setIsRagLoading(false);
      }
  }, [searchMode]);

  const saveHistory = (query: string) => {
      if (!query.trim()) return;
      const newHistory = [query, ...searchHistory.filter(h => h !== query)].slice(0, 10);
      setSearchHistory(newHistory);
      chrome.storage?.local.set({ searchHistory: newHistory });
  };

  const handleSearch = async (mode: 'query' | 'related' = 'query', overrideQuery?: string, forcedSearchMode?: 'category' | 'semantic') => {
    const activeSearchMode = forcedSearchMode || searchMode;
    setIsLoading(true);
    setResults([]);
    setRagAnswer(null); // Clear previous answer immediately
    setIsRagLoading(false);
    
    try {
       // 1. Get Settings
       const settings = await chrome.storage?.local.get(['geminiApiKey', 'embeddingModel', 'generationModel']);
       const apiKey = settings?.geminiApiKey as string;
       const embedModel = (settings?.embeddingModel || 'models/embedding-001') as string;
       const genModel = (settings?.generationModel || 'models/gemini-2.5-flash-lite') as string;

       if (!apiKey) {
           await showAlert('先に設定でGemini APIキーを設定してください。');
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
           vector = await getEmbedding(queryText, apiKey, embedModel);
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
                   vector = await getEmbedding(targetTitle, apiKey, embedModel);
               } else {
                                  await showAlert('このブックマークを分析できません。タイトルがありません。');
                                  setIsLoading(false);
                                  return;               }
           }
       }

       if (!vector) {
           throw new Error('Failed to generate vector.');
       }

       // 3. Perform Vector Search (Limit removed for limitless scroll)
       const similar = await findSimilarPages(
           vector, 
           9999, 
           activeSearchMode === 'semantic' ? 'semanticVector' : 'vector'
       );
       setResults(similar);
       setLastSearchedQuery(mode === 'query' ? searchQuery : `Related to: ${targetTitle}`);

        // 4. Perform RAG Answer Generation
        if (similar.length > 0 && apiKey && activeSearchMode === 'category') {
            setIsRagLoading(true);
            setRagAnswer(null);
            try {
                const answer = await generateRAGAnswer(
                    queryText, 
                    similar, 
                    apiKey, 
                    genModel, 
                    embedModel,
                    false
                );
                setRagAnswer(answer);
            } catch (ragError) {
                console.error('RAG Error:', ragError);
                await showAlert('AI回答の生成中にエラーが発生しました。設定やAPIの利用状況を確認してください。');
            } finally {
                setIsRagLoading(false);
            }
        } else {
            setRagAnswer(null);
        }

     } catch (e) {
         console.error(e);
         await showAlert('検索に失敗しました。コンソールを確認してください。');
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



  const handleSyncCategories = async () => {
    const settings = await chrome.storage?.local.get(['geminiApiKey', 'generationModel']);
    if (!settings?.geminiApiKey) {
        await showAlert('先に設定でAPIキーを設定してください。');
        return;
    }
    
    setIsSyncing(true);
    try {
        const apiKeyStr = settings?.geminiApiKey as string;
        await syncCategories(apiKeyStr, (settings?.generationModel as string) || 'gemini-1.5-flash');
        setHasCategories(true);
        await showAlert('全20カテゴリの再編が完了しました。RAG検索の精度が向上します。');
    } catch (e: any) {
        console.error(e);
        const errorMsg = e?.message || '';
        if (errorMsg.includes('429') || errorMsg.includes('quota')) {
            await showAlert('APIのクォータ制限（回数制限）を超えました。しばらく待ってから再度お試しください。');
        } else {
            await showAlert('カテゴリ同期に失敗しました。');
        }
    } finally {
        setIsSyncing(false);
    }
  };

  return (
    <div className={`flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl ${className}`}>
        <div className="flex items-center gap-3 px-4 py-3 bg-slate-900 border-b border-slate-800">
            <h3 className="font-bold text-slate-100 flex items-center gap-2">
                <BrainCircuit className="text-purple-500" size={20} />
                AI意味検索
            </h3>
            
            <div className="flex bg-slate-950/50 border border-slate-700/50 rounded-lg p-0.5 ml-auto gap-1">
                <div className="flex bg-slate-900 rounded-md p-0.5">
                    <button 
                        onClick={() => {
                            setSearchMode('category');
                            if (lastSearchedQuery) handleSearch(lastSearchedQuery.startsWith('Related to:') ? 'related' : 'query', undefined, 'category');
                        }} 
                        className={`text-[9px] px-2 py-1 rounded transition-all font-bold uppercase ${searchMode === 'category' ? 'bg-purple-600 text-white' : 'text-slate-500 hover:text-slate-400'}`}
                        title="AIがカテゴリを推測して検索"
                    >
                        AIカテゴリ検索
                    </button>
                    <button 
                        onClick={() => {
                            setSearchMode('semantic');
                            if (lastSearchedQuery) handleSearch(lastSearchedQuery.startsWith('Related to:') ? 'related' : 'query', undefined, 'semantic');
                        }} 
                        className={`text-[9px] px-2 py-1 rounded transition-all font-bold uppercase ${searchMode === 'semantic' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-400'}`}
                        title="要約とタグから検索"
                    >
                        要約・タグ検索
                    </button>
                </div>
                <div className="w-[1px] bg-slate-800 mx-0.5" />
                <div className="flex">
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
                    <span className="text-[10px] text-slate-500 py-1">履歴:</span>
                    {searchHistory.map((hist, i) => (
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

        {/* Global Warning: Missing Categories */}
        {!hasCategories && !isLoading && !isSyncing && (
            <div className="mx-4 my-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl flex items-center justify-between group">
                <div className="flex flex-col">
                    <span className="text-xs font-bold text-blue-300">RAGの準備が未完了です</span>
                    <span className="text-[10px] text-blue-400/80 leading-tight">最適な回答を得るには、20個の大カテゴリへの分類が必要です。</span>
                </div>
                <button 
                    onClick={handleSyncCategories}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold rounded-lg shadow-lg shadow-blue-900/40 transition-all active:scale-95"
                >
                    カテゴリを生成
                </button>
            </div>
        )}

        {/* RAG Answer Section */}
        {(isRagLoading || ragAnswer) && (
            <div className="bg-purple-500/5 border-b border-purple-500/20 transition-all duration-300">
                <div 
                    className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-purple-500/10 transition-colors"
                    onClick={() => setIsRagExpanded(!isRagExpanded)}
                >
                    <div className="flex items-center gap-2">
                        <div className="p-1 bg-purple-500/20 rounded-md text-purple-400">
                            <Sparkles size={14} />
                        </div>
                        <span className="text-xs font-bold text-purple-300 uppercase tracking-wider">AI Insights (RAG)</span>
                        {isRagLoading && (
                            <div className="flex items-center gap-2">
                                <Loader2 size={12} className="animate-spin text-purple-500" />
                            </div>
                        )}
                    </div>
                    <button className="text-purple-400 hover:text-purple-200 transition-colors p-1">
                        {isRagExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                </div>

                {isRagExpanded && (
                    <div className="px-4 pb-4 animate-in slide-in-from-top-2 duration-200">
                        {isRagLoading ? (
                            <div className="space-y-2 animate-pulse py-2">
                                <div className="h-2 bg-slate-800 rounded w-3/4" />
                                <div className="h-2 bg-slate-800 rounded w-full" />
                                <div className="h-2 bg-slate-800 rounded w-1/2" />
                            </div>
                        ) : ragAnswer ? (
                            <div className="relative group">
                                <div className="absolute -left-2 top-0 bottom-0 w-0.5 bg-purple-500/30 group-hover:bg-purple-500/50 transition-colors" />
                                <div className="pl-4 text-[13px] text-slate-300 leading-relaxed font-sans max-h-[200px] overflow-y-auto custom-scrollbar">
                                    {ragAnswer.answer.split(/(\[\d+\])/g).map((part, i) => {
                                        const match = part.match(/\[(\d+)\]/);
                                        if (match) {
                                            return (
                                                <span 
                                                    key={i} 
                                                    className="inline-flex items-center justify-center w-3.5 h-3.5 bg-purple-600 text-white rounded-full text-[8px] font-bold mx-0.5 align-top mt-0.5 shadow-sm"
                                                >
                                                    {match[1]}
                                                </span>
                                            );
                                        }
                                        return part;
                                    })}
                                </div>
                                
                                    <div className="mt-3 pt-2 border-t border-slate-800/50">
                                        <div className="text-[10px] text-slate-500 font-bold mb-1.5 flex items-center gap-1.5 uppercase tracking-wider">
                                            <ExternalLink size={10} className="text-purple-500/50" />
                                            本文の引用元サイト:
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {ragAnswer.sources.slice(0, 5).map((src, idx) => (
                                                <button
                                                    key={idx}
                                                    onClick={() => handleOpenInNewTab(src.url)}
                                                    className="text-[9px] px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-purple-400 hover:bg-purple-500/20 transition-all max-w-[200px] truncate flex items-center gap-1.5"
                                                    title={src.title}
                                                >
                                                    <span className="w-3.5 h-3.5 flex items-center justify-center bg-purple-600 text-white rounded-full text-[8px] font-bold shrink-0">
                                                        {idx + 1}
                                                    </span>
                                                    <span className="truncate">{src.title}</span>
                                                </button>
                                            ))}
                                            {ragAnswer.sources.length > 5 && (
                                                <span className="text-[9px] text-slate-600 self-center">ほか {ragAnswer.sources.length - 5} 件</span>
                                            )}
                                        </div>
                                    </div>
                            </div>
                        ) : null}
                    </div>
                )}
            </div>
        )}

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
                       <div className="px-2 pb-1 text-xs text-slate-500 flex flex-col gap-1 border-b border-slate-800/50 mb-2">
                           <div>検索結果: <span className="font-medium text-slate-300">{lastSearchedQuery}</span></div>
                           <div className="flex items-center gap-1.5 text-[10px] text-slate-500/80">
                               <Sparkles size={10} className="text-purple-500/70" />
                               <span>AIが回答に利用した資料を優先し、関連度の高い順に並べています。</span>
                           </div>
                       </div>
                   )}
                   <div className={viewMode === 'list' ? "space-y-2" : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"}>
                   {sortedResults.map((item, idx) => (
                       <div 
                           key={idx}
                           onClick={() => {
                               onSelectUrl(item.url);
                               handleOpenInNewTab(item.url);
                           }}
                            className={(() => {
                               const sourceIdx = ragAnswer?.sources.findIndex(s => s.url === item.url);
                               const isSource = sourceIdx !== undefined && sourceIdx !== -1;
                               
                               if (viewMode === 'list') {
                                   return `group flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800 cursor-pointer border transition-all ${
                                       isSource ? 'bg-purple-500/10 border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.15)]' : 'border-transparent hover:border-slate-700'
                                   }`;
                               } else {
                                   return `group relative flex flex-col p-3 rounded-xl bg-slate-800/40 border cursor-pointer transition-all shadow-lg hover:shadow-purple-500/10 ${
                                       isSource ? 'bg-purple-900/20 border-purple-500/50 ring-1 ring-purple-500/30' : 'border-slate-700/50 hover:bg-slate-800 hover:border-purple-500/50'
                                   }`;
                               }
                           })()}
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
                                               {ragAnswer?.sources.some(s => s.url === item.url) ? 'AIソース' : '類似度順'}: {(item.score * 100).toFixed(1)}%
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
                                           {ragAnswer?.sources.some(s => s.url === item.url) ? 'AI回答根拠' : '類似度'}: {(item.score * 100).toFixed(0)}%
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
