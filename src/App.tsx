import { useState, useEffect } from 'react';
import { BookmarkList } from './components/BookmarkList';
import { RelatedLinksList } from './components/RelatedLinksList';
import { SettingsModal } from './components/SettingsModal';
import { NetworkGraph } from './components/NetworkGraph';
import { NetworkGraph3D } from './components/NetworkGraph3D';
import { SavedPages } from './components/SavedPages';
import { AutoOrganizeModal } from './components/AutoOrganizeModal'; // Import
import { getTree } from './utils/bookmarkService';
import { ExternalLink, Layout, Maximize2, Zap, Settings, BrainCircuit, Loader2, Network, List, FolderOutput, Box, BookmarkCheck } from 'lucide-react'; // Import List and FolderOutput
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';

function App() {
  const [leftFolderId, setLeftFolderId] = useState<string | null>(null);
  const [rightFolderId, setRightFolderId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isOrganizeOpen, setIsOrganizeOpen] = useState(false); // New state
  const [activeTab, setActiveTab] = useState<'explorer' | 'ai' | 'saved_pages'>('explorer');
  const [aiViewMode, setAiViewMode] = useState<'list' | 'graph' | 'graph3d'>('list');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzingTitle, setAnalyzingTitle] = useState('');
  
  useEffect(() => {
    document.documentElement.classList.add('dark');
    
    // Listen for background analysis status
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
        if (changes.analyzing) {
            setIsAnalyzing(changes.analyzing.newValue as boolean);
        }
        if (changes.analyzingTitle) {
            setAnalyzingTitle(changes.analyzingTitle.newValue as string);
        }
    };
    if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.get(['analyzing', 'analyzingTitle'], (res) => {
            setIsAnalyzing(!!res.analyzing);
            setAnalyzingTitle((res.analyzingTitle as string) || '');
        });
        chrome.storage.onChanged.addListener(handleStorageChange);
    }
    
    const initFolders = async () => {
        const tree = await getTree();
        if (tree && tree.length > 0) {
            const root = tree[0];
            const children = root.children || [];
            if (children.length > 0) {
                setLeftFolderId(children[0].id);
                if (children.length > 1) {
                    setRightFolderId(children[1].id);
                } else {
                    setRightFolderId(children[0].id);
                }
            } else {
                setLeftFolderId(root.id);
                setRightFolderId(root.id);
            }
        }
    };
    initFolders();
  }, []);

  if (!leftFolderId || !rightFolderId) {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-slate-950 text-slate-400 gap-4">
             <div className="w-8 h-8 border-4 border-blue-600/30 border-t-blue-500 rounded-full animate-spin"></div>
             <span className="text-sm font-medium tracking-widest uppercase">Twin Marksを初期化中...</span>
        </div>
      );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200 font-sans selection:bg-blue-500/30 selection:text-blue-200 overflow-hidden">
      
      {/* Header */}
      <header className="flex-none flex items-center gap-4 px-6 py-3 bg-slate-900 border-b border-slate-800 shadow-2xl z-20">
        <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-600/10 rounded-xl border border-blue-500/20">
                <Layout className="text-blue-500" size={20} />
            </div>
            <div>
                <h1 className="text-lg font-bold text-slate-100 tracking-tight leading-none">Twin Marks</h1>
                <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-slate-500 font-mono">v1.3.0</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-medium">デュアル検索</span>
                </div>
            </div>
        </div>
        
        {/* Main Tab Navigation */}
                <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 ml-8">
                    <button
                        onClick={() => setActiveTab('explorer')}
                        className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                            activeTab === 'explorer'
                            ? 'bg-slate-800 text-blue-400 shadow-sm'
                            : 'text-slate-500 hover:text-slate-300'
                        }`}
                    >
                        <Layout size={16} />
                        エクスプローラー
                    </button>
                    <button
                        onClick={() => setActiveTab('ai')}
                        className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                            activeTab === 'ai'
                            ? 'bg-slate-800 text-purple-400 shadow-sm'
                            : 'text-slate-500 hover:text-slate-300'
                        }`}
                    >
                        <BrainCircuit size={16} />
                        AI検索
                    </button>
                    <button
                        onClick={() => setActiveTab('saved_pages')}
                        className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                            activeTab === 'saved_pages'
                            ? 'bg-slate-800 text-emerald-400 shadow-sm'
                            : 'text-slate-500 hover:text-slate-300'
                        }`}
                    >
                        <BookmarkCheck size={16} />
                        保存済みページ
                    </button>
                </div>
        <div className="flex-1" />
        
        <div className="hidden sm:flex items-center gap-2 text-slate-500 text-xs font-medium mr-4">
           <Zap size={14} className="text-amber-500" />
           <span>ドラッグ＆ドロップ有効</span>
        </div>

        <button 
          onClick={() => setIsSettingsOpen(true)}
          className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          title="設定"
        >
          <Settings size={20} />
        </button>
      </header>

      {/* Analysis Status Banner */}
      {isAnalyzing && (
          <div className="flex items-center justify-center gap-2 bg-blue-600/20 border-b border-blue-500/30 px-4 py-1 text-xs text-blue-200 animate-in slide-in-from-top-2">
              <Loader2 size={12} className="animate-spin" />
              <span>分析中: <span className="font-bold">{analyzingTitle}</span>...</span>
          </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
          {(() => {
              let content;
              if (activeTab === 'explorer') {
                  content = (
                      // === Explorer View (Dual Pane) ===
                      <PanelGroup orientation="vertical">
                          <Panel defaultSize={60} minSize={20}>
                              <PanelGroup orientation="horizontal">
                                  <Panel defaultSize={50} minSize={20} className="p-2">
                                      <div className="h-full shadow-2xl shadow-black/50 rounded-xl overflow-hidden">
                                          <BookmarkList
                                              title="ソースパネル"
                                              folderId={leftFolderId}
                                              onNavigate={setLeftFolderId}
                                              onSelectUrl={(url) => setPreviewUrl(url)}
                                              className="h-full border-none rounded-none"
                                              selectedUrl={previewUrl}
                                          />
                                      </div>
                                  </Panel>

                                  <PanelResizeHandle className="w-1.5 bg-slate-950 hover:bg-blue-600/50 transition-colors flex flex-col justify-center items-center cursor-col-resize group">
                                      <div className="h-8 w-1 rounded-full bg-slate-700 group-hover:bg-blue-400 transition-colors" />
                                  </PanelResizeHandle>

                                  <Panel defaultSize={50} minSize={20} className="p-2">
                                      <div className="h-full shadow-2xl shadow-black/50 rounded-xl overflow-hidden">
                                          <BookmarkList
                                              title="ターゲットパネル"
                                              folderId={rightFolderId}
                                              onNavigate={setRightFolderId}
                                              onSelectUrl={(url) => setPreviewUrl(url)}
                                              className="h-full border-none rounded-none"
                                              selectedUrl={previewUrl}
                                          />
                                      </div>
                                  </Panel>
                              </PanelGroup>
                          </Panel>

                          <PanelResizeHandle className="h-1.5 bg-slate-950 hover:bg-blue-600/50 transition-colors flex justify-center items-center cursor-row-resize group">
                              <div className="w-8 h-1 rounded-full bg-slate-700 group-hover:bg-blue-400 transition-colors" />
                          </PanelResizeHandle>

                          <Panel defaultSize={40} minSize={10} collapsible={true} collapsedSize={0}>
                              <div className="h-full bg-slate-900 border-t border-slate-800 shadow-[0_-4px_20px_rgba(0,0,0,0.4)] z-10 flex flex-col">
                                  <div className="flex items-center justify-between px-6 py-2 bg-slate-900 border-b border-slate-800 h-10 select-none flex-none">
                                      <div className="flex items-center gap-2 max-w-[70%]">
                                          <div className={`w-2 h-2 rounded-full ${previewUrl ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-slate-700'}`} />
                                          <span className="text-xs font-mono text-slate-400 truncate">
                                              {previewUrl || '選択を待機中...'}
                                          </span>
                                      </div>

                                      {previewUrl && (
                                          <a
                                              href={previewUrl}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="flex items-center gap-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors px-2 py-1 hover:bg-blue-500/10 rounded-md"
                                          >
                                              <span>外部で開く</span>
                                              <ExternalLink size={12} />
                                          </a>
                                      )}
                                  </div>
                                  <div className="flex-1 relative bg-slate-950 flex flex-col min-h-0">
                                      {previewUrl ? (
                                          <div className="flex-1 relative w-full h-full bg-white">
                                              <iframe
                                                  src={previewUrl}
                                                  className="w-full h-full border-none"
                                                  title="プレビュー"
                                                  sandbox="allow-scripts allow-same-origin allow-forms"
                                                  referrerPolicy="no-referrer"
                                              />
                                          </div>
                                      ) : (
                                          <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-3">
                                              <Maximize2 size={40} className="opacity-20" />
                                              <span className="text-sm font-medium opacity-50">コンテンツをプレビューするにはブックマークを選択してください</span>
                                          </div>
                                      )}
                                  </div>
                              </div>
                          </Panel>
                      </PanelGroup>
                  );
              } else if (activeTab === 'ai') {
                  content = (
                      // === AI Search View ===
                      <div className="flex-1 p-4 overflow-hidden flex flex-col items-center justify-start bg-slate-950 relative">
                          {/* View Mode Toggle (Floating or Fixed) */}
                          <div className="absolute top-4 right-6 z-10 flex gap-3">
                              <button
                                  onClick={() => setIsOrganizeOpen(true)}
                                  className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors text-xs font-medium"
                              >
                                  <FolderOutput size={14} className="text-yellow-500" />
                                  自動整理
                              </button>

                              <div className="flex bg-slate-900 border border-slate-700 rounded-lg p-1 shadow-lg">
                                  <button
                                      onClick={() => setAiViewMode('list')}
                                      className={`p-1.5 rounded transition-colors ${aiViewMode === 'list' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                                      title="リスト表示"
                                  >
                                      <List size={16} />
                                  </button>
                                  <button
                                      onClick={() => setAiViewMode('graph')}
                                      className={`p-1.5 rounded transition-colors ${aiViewMode === 'graph' ? 'bg-slate-700 text-purple-400' : 'text-slate-400 hover:text-slate-200'}`}
                                      title="2Dグラフ表示"
                                  >
                                      <Network size={16} />
                                  </button>
                                  <button
                                      onClick={() => setAiViewMode('graph3d')}
                                      className={`p-1.5 rounded transition-colors ${aiViewMode === 'graph3d' ? 'bg-slate-700 text-blue-400' : 'text-slate-400 hover:text-slate-200'}`}
                                      title="3Dマップ表示"
                                  >
                                      <Box size={16} />
                                  </button>
                              </div>
                          </div>

                          <div className="w-full h-full flex flex-col gap-4">
                              {aiViewMode === 'list' ? (
                                  <RelatedLinksList
                                      targetUrl={previewUrl || undefined}
                                      onSelectUrl={(url) => setPreviewUrl(url)}
                                      className="flex-1 border-none shadow-2xl shadow-purple-900/10"
                                  />
                              ) : aiViewMode === 'graph' ? (
                                  <div className="flex-1 w-full h-full relative rounded-xl overflow-hidden border border-slate-800 shadow-2xl">
                                      <NetworkGraph
                                          onNodeClick={(url) => setPreviewUrl(url)}
                                          className="absolute inset-0 w-full h-full"
                                      />
                                  </div>
                              ) : (
                                <div className="flex-1 w-full h-full relative rounded-xl overflow-hidden border border-slate-800 shadow-2xl">
                                    <NetworkGraph3D
                                        onNodeClick={(url) => setPreviewUrl(url)}
                                        className="absolute inset-0 w-full h-full"
                                    />
                                </div>
                              )}
                          </div>
                      </div>
                  );
              } else if (activeTab === 'saved_pages') {
                  content = (
                      // === Saved Pages View ===
                      <SavedPages 
                        onSelectUrl={(url) => setPreviewUrl(url)}
                        className="flex-1"
                      />
                  );
              } else {
                  content = (
                      // Default view or error state
                      <div>Unknown Tab</div>
                  );
              }
              return content;
          })()}
      </div>
      
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <AutoOrganizeModal isOpen={isOrganizeOpen} onClose={() => setIsOrganizeOpen(false)} />
    </div>
  );
}

export default App;