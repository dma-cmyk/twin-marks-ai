import React, { useEffect, useState, useRef, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import type { ForceGraphMethods, LinkObject, NodeObject } from 'react-force-graph-2d';
import { getAllVectors } from '../utils/vectorStore';
import { getEmbedding } from '../utils/embedding';
import { similarity } from 'ml-distance';
import { Loader2, Search, X, Settings2, Minimize2 } from 'lucide-react';

interface NetworkGraphProps {
  onNodeClick: (url: string) => void;
  className?: string;
}

interface CustomNode extends NodeObject {
  id: string;
  title: string;
  url: string;
  val: number;
  img?: HTMLImageElement; 
  vector?: number[]; 
  isHighlighted?: boolean;
  description?: string;
}

interface CustomLink extends LinkObject {
  source: string | CustomNode;
  target: string | CustomNode;
  value: number;
}

interface GraphData {
  nodes: CustomNode[];
  links: CustomLink[];
}

export const NetworkGraph: React.FC<NetworkGraphProps> = ({ onNodeClick, className }) => {
  const [data, setData] = useState<GraphData>({ nodes: [], links: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Controls
  const [showControls, setShowControls] = useState(false);
  const [threshold, setThreshold] = useState(0.65);
  const [linkOpacity, setLinkOpacity] = useState(0.2);
  const [cachedVectors, setCachedVectors] = useState<any[]>([]);

  // Hover state for tooltip
  const [hoveredNode, setHoveredNode] = useState<CustomNode | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 }); // Mouse position for tooltip

  const fgRef = useRef<ForceGraphMethods | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const stars = useRef<{x: number, y: number, size: number, alpha: number}[]>([]);

  // Initialize
  useEffect(() => {
      // Resize
      if (containerRef.current) {
          const resizeObserver = new ResizeObserver((entries) => {
              for (let entry of entries) {
                  setDimensions({
                      width: entry.contentRect.width,
                      height: entry.contentRect.height
                  });
              }
          });
          resizeObserver.observe(containerRef.current);
          return () => resizeObserver.disconnect();
      }
  }, []);

  useEffect(() => {
      // Stars
      const starCount = 400;
      stars.current = Array.from({ length: starCount }).map(() => ({
          x: Math.random(),
          y: Math.random(),
          size: Math.random() * 1.5 + 0.5,
          alpha: Math.random() * 0.8 + 0.2
      }));
  }, []);

  // Image Loader
  const loadImages = (nodes: CustomNode[]) => {
      nodes.forEach(node => {
          const img = new Image();
          const domain = new URL(node.url).hostname;
          img.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
          img.onload = () => {
              node.img = img;
          };
      });
  };

  // Main Graph Builder
  const buildGraph = useCallback(async (forceFetch = false) => {
      if (!forceFetch && cachedVectors.length > 0 && !isLoading) {
          // Just re-calculate links with new threshold using cached vectors
          processVectors(cachedVectors);
          return;
      }

      setIsLoading(true);
      try {
        const vectors = await getAllVectors();
        if (vectors) {
            setCachedVectors(vectors);
            processVectors(vectors);
        }
      } catch (e) {
          console.error("Graph build failed", e);
      } finally {
          setIsLoading(false);
      }
  }, [cachedVectors, threshold]); // Re-run if threshold changes (but optimize inside)

  // Link Processor (Separate to avoid re-fetching)
  const processVectors = (vectors: any[]) => {
        if (!vectors || vectors.length === 0) {
            setData({ nodes: [], links: [] });
            return;
        }

        const nodes: CustomNode[] = vectors.map((v: any) => ({
            id: v.url,
            title: v.title || v.url,
            url: v.url,
            val: 1,
            vector: v.vector,
            description: v.description
        }));

        const links: CustomLink[] = [];
        
        // O(N^2) link building
        for (let i = 0; i < vectors.length; i++) {
            for (let j = i + 1; j < vectors.length; j++) {
                const sim = similarity.cosine(vectors[i].vector, vectors[j].vector);
                if (sim > threshold) {
                    links.push({
                        source: vectors[i].url,
                        target: vectors[j].url,
                        value: sim 
                    });
                }
            }
        }
        
        const degrees: Record<string, number> = {};
        links.forEach(l => {
            const s = typeof l.source === 'string' ? l.source : (l.source as CustomNode).id || l.source;
            const t = typeof l.target === 'string' ? l.target : (l.target as CustomNode).id || l.target;
            // Note: Before graph initializes, source/target are strings (ids). After, they are objects.
            // Since we are rebuilding fresh, they are strings here.
            if(typeof s === 'string') degrees[s] = (degrees[s] || 0) + 1;
            if(typeof t === 'string') degrees[t] = (degrees[t] || 0) + 1;
        });

        nodes.forEach(n => {
            const deg = degrees[n.id] || 0;
            n.val = Math.max(1, Math.min(10, Math.sqrt(deg) * 2)); 
        });

        loadImages(nodes);
        setData({ nodes, links });
  };

  // Initial Load & Threshold Update
  useEffect(() => {
      // If we have cached vectors, just re-process. If not, fetch.
      if (cachedVectors.length === 0) {
          buildGraph(true);
      } else {
          processVectors(cachedVectors);
      }
  }, [threshold]); // Only re-run when threshold changes (and initial mount)

  // Real-time updates listener
  useEffect(() => {
    const handleMessage = (message: any) => {
        if (message.type === 'VECTOR_UPDATED') {
            buildGraph(true); // Force fetch new data
        }
    };
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []); // Bind once

  const handleGraphSearch = async () => {
      if (!searchQuery.trim() || data.nodes.length === 0) return;
      setIsSearching(true);
      try {
          const settings = await chrome.storage.local.get(['geminiApiKey', 'embeddingModel']);
          const apiKey = settings.geminiApiKey as string;
          const modelName = (settings.embeddingModel || 'models/embedding-001') as string;
          
          if(!apiKey) {
              alert('Please set API Key first');
              return;
          }

          const queryVector = await getEmbedding(searchQuery, apiKey, modelName);
          
          const scoredNodes = data.nodes.map(n => ({
              node: n,
              score: n.vector ? similarity.cosine(queryVector, n.vector) : 0
          }));
          
          scoredNodes.sort((a, b) => b.score - a.score);
          const topNodes = scoredNodes.slice(0, 5).filter(n => n.score > 0.5); 
          
          data.nodes.forEach(n => n.isHighlighted = false);
          
          if (topNodes.length > 0) {
              topNodes.forEach(item => item.node.isHighlighted = true);
              const best = topNodes[0].node;
              if (best.x !== undefined && best.y !== undefined && fgRef.current) {
                  fgRef.current.centerAt(best.x, best.y, 1000);
                  fgRef.current.zoom(4, 2000);
              }
                    } else {
                        alert('関連する星は見つかりませんでした。');
                    }
                    
                } catch (e) {
                    console.error(e);
                    alert('検索エラー');
                } finally {
          setIsSearching(false);
      }
  };

    return (

      <div 

          ref={containerRef} 

          className={`relative w-full h-full bg-black overflow-hidden rounded-xl border border-slate-800 ${className}`}

          onMouseMove={(e) => setMousePos({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY })}

      >

          {/* Loading Overlay */}
        {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
                <div className="flex flex-col items-center gap-2 text-purple-300">
                    <Loader2 className="animate-spin" size={32} />
                    <span className="text-xs tracking-widest uppercase">銀河をスキャン中...</span>
                </div>
            </div>
        )}
        
        {/* Empty State */}
        {!isLoading && data.nodes.length === 0 && (
             <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-xs">
                 宇宙は空っぽです。星（ページ）を追加してください！
             </div>
        )}

        {/* Search Bar (Top Left) */}
        <div className="absolute top-4 left-4 z-20 flex gap-2">
            <div className="relative">
                <input 
                    type="text" 
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleGraphSearch()}
                    placeholder="星を検索..."
                    className="bg-slate-900/80 backdrop-blur text-xs text-white border border-slate-700 rounded-full px-3 py-1.5 w-48 focus:w-64 transition-all outline-none focus:border-purple-500"
                />
                {searchQuery && (
                    <button 
                        onClick={() => { setSearchQuery(''); data.nodes.forEach(n => n.isHighlighted = false); }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                    >
                        <X size={12} />
                    </button>
                )}
            </div>
            <button 
                onClick={handleGraphSearch}
                disabled={isSearching}
                className="p-1.5 bg-purple-600/80 hover:bg-purple-500 text-white rounded-full backdrop-blur shadow-lg transition-all"
            >
                {isSearching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            </button>
        </div>

        {/* Control Panel Toggle (Bottom Left) */}
        <div className="absolute bottom-4 left-4 z-20">
            <button
                onClick={() => setShowControls(!showControls)}
                className={`p-2 rounded-lg backdrop-blur border shadow-lg transition-all ${
                    showControls ? 'bg-purple-600/80 text-white border-purple-500' : 'bg-slate-900/80 text-slate-400 border-slate-700 hover:text-white'
                }`}
                title="グラフ制御"
            >
                {showControls ? <Minimize2 size={16} /> : <Settings2 size={16} />}
            </button>
        </div>

        {/* Control Panel (Bottom Left, Expanded) */}
        {showControls && (
            <div className="absolute bottom-16 left-4 z-20 bg-slate-900/90 backdrop-blur border border-slate-700 rounded-xl p-4 w-64 shadow-2xl space-y-4 animate-in slide-in-from-bottom-2 fade-in">
                <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs text-slate-300">
                        <span>類似度閾値</span>
                        <span className="font-mono text-purple-400">{threshold.toFixed(2)}</span>
                    </div>
                    <input 
                        type="range" 
                        min="0.5" 
                        max="0.99" 
                        step="0.01" 
                        value={threshold} 
                        onChange={(e) => setThreshold(parseFloat(e.target.value))}
                        className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                    />
                    <div className="flex justify-between text-[10px] text-slate-500">
                        <span>リンクを増やす</span>
                        <span>強力なリンクのみ</span>
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs text-slate-300">
                        <span>リンクの透明度</span>
                        <span className="font-mono text-purple-400">{linkOpacity.toFixed(2)}</span>
                    </div>
                    <input 
                        type="range" 
                        min="0.05" 
                        max="1.0" 
                        step="0.05" 
                        value={linkOpacity} 
                        onChange={(e) => setLinkOpacity(parseFloat(e.target.value))}
                        className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                    />
                </div>
            </div>
        )}

        {data.nodes.length > 0 && (
            <ForceGraph2D
                ref={fgRef}
                width={dimensions.width}
                height={dimensions.height}
                graphData={data}
                
                // === Space Physics ===
                d3VelocityDecay={0.2} 
                d3AlphaDecay={0.01}   
                cooldownTicks={100}

                // === Background Stars ===
                onRenderFramePre={(ctx) => {
                    ctx.save();
                    ctx.resetTransform();
                    stars.current.forEach(star => {
                        ctx.beginPath();
                        ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha})`;
                        const sx = star.x * dimensions.width;
                        const sy = star.y * dimensions.height;
                        ctx.arc(sx, sy, star.size, 0, Math.PI * 2);
                        ctx.fill();
                    });
                    ctx.restore();
                }}
                
                // === Custom Node Rendering ===
                nodeCanvasObject={(node: any, ctx, globalScale) => {
                    const n = node as CustomNode;
                    const x = n.x;
                    const y = n.y;

                    if (x === undefined || y === undefined || !Number.isFinite(x) || !Number.isFinite(y)) return;

                    const size = 6 + n.val * 1.5; 

                    // 1. Glow Effect 
                    const isHigh = n.isHighlighted;
                    const glowRadius = size * (isHigh ? 4 : 2.5);
                    const gradient = ctx.createRadialGradient(x, y, size * 0.5, x, y, glowRadius);
                    
                    if (isHigh) {
                        gradient.addColorStop(0, 'rgba(234, 179, 8, 0.8)'); 
                        gradient.addColorStop(0.5, 'rgba(234, 88, 12, 0.4)'); 
                    } else {
                        gradient.addColorStop(0, 'rgba(139, 92, 246, 0.4)'); 
                        gradient.addColorStop(0.5, 'rgba(59, 130, 246, 0.1)'); 
                    }
                    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)'); 
                    
                    ctx.fillStyle = gradient;
                    ctx.beginPath();
                    ctx.arc(x, y, glowRadius, 0, 2 * Math.PI, false);
                    ctx.fill();

                    // 2. Icon 
                    if (n.img && n.img.complete) {
                        ctx.save();
                        ctx.beginPath();
                        ctx.arc(x, y, size, 0, 2 * Math.PI, false);
                        ctx.closePath();
                        ctx.clip();
                        try {
                            ctx.drawImage(n.img, x - size, y - size, size * 2, size * 2);
                        } catch(e) {
                            ctx.fillStyle = '#475569';
                            ctx.fill();
                        }
                        ctx.restore();
                        
                        ctx.strokeStyle = isHigh ? 'rgba(255, 200, 0, 0.8)' : 'rgba(255, 255, 255, 0.3)';
                        ctx.lineWidth = (isHigh ? 3 : 1) / globalScale;
                        ctx.beginPath();
                        ctx.arc(x, y, size, 0, 2 * Math.PI, false);
                        ctx.stroke();
                    } else {
                        ctx.fillStyle = '#fff';
                        ctx.beginPath();
                        ctx.arc(x, y, size * 0.6, 0, 2 * Math.PI, false);
                        ctx.fill();
                    }

                    // 3. Label
                    const label = n.title;
                    const fontSize = 12 / globalScale;
                    if (globalScale > 1.5 || n.val > 5 || isHigh) { 
                        ctx.font = `${isHigh ? 'bold ' : ''}${fontSize}px Sans-Serif`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillStyle = isHigh ? '#fbbf24' : 'rgba(255, 255, 255, 0.8)';
                        ctx.fillText(label, x, y + size + fontSize + 2);
                    }
                }}
                
                // === Link Styling ===
                linkColor={(link: any) => {
                    const s = link.source as CustomNode;
                    const t = link.target as CustomNode;
                    if (s.isHighlighted || t.isHighlighted) {
                        return 'rgba(234, 179, 8, 0.6)'; 
                    }
                    return `rgba(148, 163, 184, ${linkOpacity})`; 
                }}
                linkWidth={(link: any) => {
                    const s = link.source as CustomNode;
                    const t = link.target as CustomNode;
                    const val = (link as CustomLink).value;
                    if (s.isHighlighted || t.isHighlighted) {
                        return Math.max(1.5, val * 3); 
                    }
                    return Math.max(0.5, val * 1.5);
                }}
                
                // === Interaction ===
                enableNodeDrag={true}
                onNodeClick={(node) => {
                    const customNode = node as CustomNode;
                    if (customNode.url) {
                        window.open(customNode.url, '_blank');
                    }
                    onNodeClick(customNode.id);
                }}
                onNodeRightClick={(node) => {
                    const url = (node as CustomNode).url;
                    if (url) window.open(url, '_blank');
                }}
                onNodeHover={(node) => setHoveredNode(node ? (node as CustomNode) : null)}
                backgroundColor="#000000" 
            />
        )}
        
        <div className="absolute top-4 right-4 pointer-events-none">
            <div className="bg-slate-900/80 backdrop-blur px-3 py-1.5 rounded-lg border border-purple-500/30 text-[10px] text-purple-200 shadow-lg shadow-purple-900/20">
                星: {data.nodes.length} | 星座: {data.links.length}
            </div>
        </div>

        {/* Custom Tooltip */}
        {hoveredNode && (
            <div 
                className="absolute p-3 bg-slate-800/90 backdrop-blur rounded-lg border border-slate-700 shadow-lg z-30 pointer-events-none animate-in fade-in-50"
                style={{
                    left: mousePos.x + 15, // 15px offset from cursor
                    top: mousePos.y + 15,
                    // Adjust transform based on proximity to screen edge
                    transform: `translate(${mousePos.x + 200 > dimensions.width ? '-100%' : '0%'}, ${mousePos.y + 100 > dimensions.height ? '-100%' : '0%'})`
                }}
            >
                <h4 className="text-sm font-bold text-white mb-1 leading-tight">{hoveredNode.title}</h4>
                {hoveredNode.description && (
                    <p className="text-xs text-slate-300 max-w-xs leading-snug">{hoveredNode.description}</p>
                )}
                <p className="text-[10px] text-slate-500 max-w-xs truncate mt-1">{new URL(hoveredNode.url).hostname}</p>
            </div>
        )}
    </div>
  );
};
