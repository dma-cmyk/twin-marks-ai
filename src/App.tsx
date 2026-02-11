import { useState, useEffect } from 'react';
import { BookmarkList } from './components/BookmarkList';
import { getTree } from './utils/bookmarkService';
import { ExternalLink, Layout, Maximize2, Zap } from 'lucide-react';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';

function App() {
  const [leftFolderId, setLeftFolderId] = useState<string | null>(null);
  const [rightFolderId, setRightFolderId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  
  useEffect(() => {
    document.documentElement.classList.add('dark');
    
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
             <span className="text-sm font-medium tracking-widest uppercase">Initializing Twin Marks...</span>
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
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-medium">Dual Search</span>
                </div>
            </div>
        </div>

        <div className="flex-1" />
        
        <div className="hidden sm:flex items-center gap-2 text-slate-500 text-xs font-medium mr-4">
           <Zap size={14} className="text-amber-500" />
           <span>Drag & Drop Enabled</span>
        </div>
      </header>

      {/* Main Content with Resizable Panels */}
      <div className="flex-1 flex overflow-hidden">
          <PanelGroup orientation="vertical">
            <Panel defaultSize={60} minSize={20}>
                <PanelGroup orientation="horizontal">
                    <Panel defaultSize={50} minSize={20} className="p-2">
                         <div className="h-full shadow-2xl shadow-black/50 rounded-xl overflow-hidden">
                            <BookmarkList 
                                title="Source Panel"
                                folderId={leftFolderId} 
                                onNavigate={setLeftFolderId}
                                onSelectUrl={setPreviewUrl}
                                className="h-full border-none rounded-none"
                            />
                        </div>
                    </Panel>
                    
                    <PanelResizeHandle className="w-1.5 bg-slate-950 hover:bg-blue-600/50 transition-colors flex flex-col justify-center items-center cursor-col-resize group">
                        <div className="h-8 w-1 rounded-full bg-slate-700 group-hover:bg-blue-400 transition-colors" />
                    </PanelResizeHandle>

                    <Panel defaultSize={50} minSize={20} className="p-2">
                        <div className="h-full shadow-2xl shadow-black/50 rounded-xl overflow-hidden">
                            <BookmarkList 
                                title="Destination Panel"
                                folderId={rightFolderId} 
                                onNavigate={setRightFolderId} 
                                onSelectUrl={setPreviewUrl}
                                className="h-full border-none rounded-none"
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
                                {previewUrl || 'Waiting for selection...'}
                            </span>
                        </div>
                        
                        {previewUrl && (
                            <a 
                                href={previewUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors px-2 py-1 hover:bg-blue-500/10 rounded-md"
                            >
                                <span>Open External</span>
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
                                    title="Preview"
                                    sandbox="allow-scripts allow-same-origin allow-forms"
                                    referrerPolicy="no-referrer"
                                />
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-3">
                                <Maximize2 size={40} className="opacity-20" />
                                <span className="text-sm font-medium opacity-50">Select a bookmark to preview content</span>
                            </div>
                        )}
                    </div>
                </div>
            </Panel>
          </PanelGroup>
      </div>
    </div>
  );
}

export default App;