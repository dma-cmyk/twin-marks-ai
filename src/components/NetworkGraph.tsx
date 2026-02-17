import React, { useEffect, useState, useRef, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import type { ForceGraphMethods, LinkObject, NodeObject } from 'react-force-graph-2d';
import { getAllVectors } from '../utils/vectorStore';
import { getEmbedding } from '../utils/embedding';
import { similarity } from 'ml-distance';
import { kmeans } from 'ml-kmeans';
import { Loader2, Search, X, Settings2, Minimize2, ChevronLeft, ChevronRight, RotateCcw, Sparkles } from 'lucide-react';
import { useDialog } from '../context/DialogContext';

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
  clusterId?: number;
  clusterColor?: string;
  tags?: string[];
  semanticVector?: number[];
}

interface CustomLink extends LinkObject {
  source: string | CustomNode;
  target: string | CustomNode;
  value: number;
}

interface GraphData {
  nodes: CustomNode[];
  links: CustomLink[];
  clusters?: ClusterInfo[];
}

interface ClusterInfo {
  id: number;
  label: string;
  color: string;
  key?: string;
}

export const NetworkGraph: React.FC<NetworkGraphProps> = ({ onNodeClick, className }) => {
  const { showAlert } = useDialog();
  const [data, setData] = useState<GraphData>({ nodes: [], links: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CustomNode[]>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const [searchMode, setSearchMode] = useState<'category' | 'semantic'>('semantic');
  
  // Controls
  const [showControls, setShowControls] = useState(false);
  const [showClusters, setShowClusters] = useState(true);
  const [showStars, setShowStars] = useState(true);
  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(null);
  const [threshold, setThreshold] = useState(0.75);
  const [cachedVectors, setCachedVectors] = useState<any[]>([]);

  // AI Naming states
  const [namingCache, setNamingCache] = useState<Record<string, string>>({});
  const [isNamingAI, setIsNamingAI] = useState(false);
  const [clustersToNameState, setClustersToNameState] = useState<{ id: number, items: { url: string, title: string }[], centroid?: number[] }[]>([]);

  // Hover state for tooltip
  const [hoveredNode, setHoveredNode] = useState<CustomNode | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 }); 

  const fgRef = useRef<ForceGraphMethods | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const labelRects = useRef<Map<number, { rx: number, ry: number, rw: number, rh: number }>>(new Map());
  const stars = useRef<{x: number, y: number, size: number, alpha: number}[]>([]);

  // Resize listener
  useEffect(() => {
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

  // Stars background
  useEffect(() => {
      const starCount = 400;
      stars.current = Array.from({ length: starCount }).map(() => ({
          x: Math.random(),
          y: Math.random(),
          size: Math.random() * 1.5 + 0.5,
          alpha: Math.random() * 0.8 + 0.2
      }));
  }, []);

  // Image Loader
  const loadImages = useCallback((nodes: CustomNode[]) => {
      nodes.forEach(node => {
          if (node.img) return;
          const img = new Image();
          const domain = new URL(node.url).hostname;
          img.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
          img.onload = () => {
              node.img = img;
          };
      });
  }, []);

  const handleAINaming = async () => {
    if (clustersToNameState.length === 0 || isNamingAI) return;
    
    setIsNamingAI(true);
    try {
        const settings = await chrome.storage.local.get(['geminiApiKey', 'generationModel']) as { geminiApiKey?: string, generationModel?: string };
        const apiKey = settings.geminiApiKey;
        const modelName = settings.generationModel || 'gemini-1.5-flash';
        if (!apiKey) {
            await showAlert('先に設定でGemini APIキーを設定してください。');
            setIsNamingAI(false);
            return;
        }

        const clustersToProcess: any[] = clustersToNameState.map(c => ({
            id: c.id,
            items: c.items,
            centroid: c.centroid,
            name: ""
        }));

        const existingNames = Object.values(namingCache);
        const { nameClusters } = await import('../utils/clustering');
        await nameClusters(clustersToProcess, apiKey, modelName, undefined, true, existingNames);

        const newCache = { ...namingCache };
        clustersToProcess.forEach((c) => {
            // Use the key stored in clustersToNameState instead of searching in stale state
            const clusterState = clustersToNameState.find(cts => cts.id === c.id);
            if (clusterState && (clusterState as any).key && c.name) {
              newCache[(clusterState as any).key] = c.name;
            }
        });
        setNamingCache(newCache);
        setClustersToNameState([]); 
    } catch (e) {
        console.error("Manual AI naming failed", e);
    } finally {
        setIsNamingAI(false);
    }
  };

  const processVectors = useCallback((vectors: any[]) => {
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
        semanticVector: v.semanticVector,
        description: v.description,
        tags: v.tags
    }));

    // === Clustering ===
    let clusters: ClusterInfo[] = [];
    const clustersToNameBatch: { id: number, items: { url: string, title: string, tags?: string[] }[], centroid?: number[], key?: string }[] = [];

    if (nodes.length > 5 && showClusters) {
        const k = Math.max(2, Math.floor(Math.sqrt(nodes.length / 2)));
        const dataToCluster = nodes.map(n => n.vector || []);
        try {
            const result = kmeans(dataToCluster, k, {});
            const clustersMap = new Map<number, { nodes: CustomNode[], tags: Map<string, number>, centroid?: number[] }>();
            
            nodes.forEach((node, i) => {
                const clusterId = result.clusters[i];
                node.clusterId = clusterId;
                if (!clustersMap.has(clusterId)) {
                    clustersMap.set(clusterId, { 
                        nodes: [], 
                        tags: new Map(), 
                        centroid: result.centroids ? result.centroids[clusterId] : undefined 
                    });
                }
                const cData = clustersMap.get(clusterId)!;
                cData.nodes.push(node);
                if (node.tags) {
                    node.tags.forEach(tag => cData.tags.set(tag, (cData.tags.get(tag) || 0) + 1));
                }
            });

            const clusterColors = [
                '#8b5cf6', '#ec4899', '#3b82f6', '#10b981', '#f59e0b', 
                '#ef4444', '#06b6d4', '#84cc16', '#a855f7', '#64748b'
            ];

            const usedLabels = new Set<string>();
            clusters = Array.from(clustersMap.entries()).map(([id, data]) => {
                const clusterKey = data.nodes.map(n => n.id).sort().slice(0, 5).join('|');
                const cachedName = namingCache[clusterKey];
                
                let label = cachedName || "";
                if (!label) {
                    const sortedTags = Array.from(data.tags.entries()).sort((a, b) => {
                        if (b[1] !== a[1]) return b[1] - a[1];
                        return b[0].length - a[0].length;
                    });
                    
                    const primaryTag = sortedTags.length > 0 ? sortedTags[0][0] : null;
                    label = primaryTag || data.nodes[0].title.substring(0, 15);
                    
                    clustersToNameBatch.push({ 
                        id, 
                        items: data.nodes.map(n => ({ 
                            url: n.id, 
                            title: n.title,
                            tags: n.tags 
                        })),
                        centroid: data.centroid
                    });
                }

                let finalLabel = label;
                if (usedLabels.has(finalLabel)) {
                    // Descriptive differentiation instead of (2)
                    const titleSnippet = data.nodes[0].title.split(/[\s・|/-]/)[0].substring(0, 6);
                    const tagSnippet = Array.from(data.tags.keys())[0] || "";
                    const altLabel = tagSnippet ? `${label}・${tagSnippet}` : `${label}・${titleSnippet}`;
                    
                    if (!usedLabels.has(altLabel)) {
                        finalLabel = altLabel;
                    } else {
                        // Absolute last resort
                        finalLabel = `${label} #${id + 1}`;
                    }
                }
                usedLabels.add(finalLabel);

                const color = clusterColors[id % clusterColors.length];
                data.nodes.forEach(n => n.clusterColor = color);
                
                // Add key to clustersToNameBatch too for better tracking
                const currentBatchItem = clustersToNameBatch.find(b => b.id === id);
                if (currentBatchItem) currentBatchItem.key = clusterKey;

                return { id, label: finalLabel, color, key: clusterKey };
            });
        } catch (e) {
            console.error("Clustering failed", e);
        }
    }

    setClustersToNameState(clustersToNameBatch);

    // === Links ===
    const links: CustomLink[] = [];
    for (let i = 0; i < vectors.length; i++) {
        for (let j = i + 1; j < vectors.length; j++) {
            const sim = similarity.cosine(vectors[i].vector, vectors[j].vector);
            if (sim > threshold) {
                links.push({ source: vectors[i].url, target: vectors[j].url, value: sim });
            }
        }
    }
    
    const degrees: Record<string, number> = {};
    links.forEach(l => {
        const s = typeof l.source === 'string' ? l.source : (l.source as CustomNode).id;
        const t = typeof l.target === 'string' ? l.target : (l.target as CustomNode).id;
        if(s) degrees[s] = (degrees[s] || 0) + 1;
        if(t) degrees[t] = (degrees[t] || 0) + 1;
    });

    nodes.forEach(n => {
        const deg = degrees[n.id] || 0;
        n.val = Math.max(1, Math.min(10, Math.sqrt(deg) * 2)); 
    });

    loadImages(nodes);
    setData({ nodes, links, clusters });
  }, [threshold, showClusters, namingCache, loadImages]);

  const buildGraph = useCallback(async (forceFetch = false) => {
      if (!forceFetch && cachedVectors.length > 0 && !isLoading) {
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
  }, [cachedVectors, isLoading, processVectors]);

  useEffect(() => {
      buildGraph();
  }, [buildGraph]);

  const handleGraphSearch = async () => {
    if (!searchQuery.trim() || data.nodes.length === 0) return;
    setIsSearching(true);
    setSearchResults([]);
    setCurrentSearchIndex(0);

    try {
        const settings = await chrome.storage.local.get(['geminiApiKey', 'embeddingModel']);
        const apiKey = settings.geminiApiKey as string;
        const modelName = (settings.embeddingModel || 'models/embedding-001') as string;
        if(!apiKey) {
            await showAlert('APIキーを設定してください');
            return;
        }

        const queryVector = await getEmbedding(searchQuery, apiKey, modelName);
        const scoredNodes = data.nodes.map(n => {
            const nodeVector = searchMode === 'semantic' ? (n.semanticVector || n.vector) : n.vector;
            return {
                node: n,
                score: nodeVector ? similarity.cosine(queryVector, nodeVector) : 0
            };
        });
        scoredNodes.sort((a, b) => b.score - a.score);
        const topNodes = scoredNodes.filter(n => n.score > 0.3).slice(0, 10).map(n => n.node);
        
        data.nodes.forEach(n => n.isHighlighted = false);
        if (topNodes.length > 0) {
            setSearchResults(topNodes);
            topNodes.forEach(node => node.isHighlighted = true);
            if (fgRef.current) fgRef.current.centerAt(topNodes[0].x, topNodes[0].y, 1000);
        } else {
            await showAlert('関連するページは見つかりませんでした');
        }
    } catch (e) {
        console.error(e);
        await showAlert('検索エラー');
    } finally {
        setIsSearching(false);
    }
  };

  return (
    <div 
        ref={containerRef}
        className={`relative w-full h-full bg-slate-950 overflow-hidden ${className}`}
        onMouseMove={(e) => {
            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
            }
        }}
    >
        {/* Stars Background */}
        <canvas 
            className="absolute inset-0 pointer-events-none"
            width={dimensions.width}
            height={dimensions.height}
            ref={canvas => {
                if (!canvas) return;
                const ctx = canvas.getContext('2d');
                if (!ctx) return;
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                if (!showStars) return;
                stars.current.forEach(star => {
                    ctx.globalAlpha = star.alpha;
                    ctx.fillStyle = '#ffffff';
                    ctx.beginPath();
                    ctx.arc(star.x * canvas.width, star.y * canvas.height, star.size, 0, Math.PI * 2);
                    ctx.fill();
                });
            }}
        />

        <ForceGraph2D
            ref={fgRef as any}
            graphData={data}
            nodeLabel={() => ''}
            nodeRelSize={6}
            linkColor={() => '#334155'}
            linkDirectionalParticles={2}
            linkDirectionalParticleSpeed={d => (d as any).value * 0.01}
            nodeCanvasObject={(node, ctx, globalScale) => {
                const n = node as CustomNode;
                const isDimmed = selectedClusterId !== null && n.clusterId !== selectedClusterId;
                const alpha = isDimmed ? 0.2 : 1;
                
                // 1. Highlight ring for current search result
                const isCurrentResult = searchResults.length > 0 && searchResults[currentSearchIndex]?.id === n.id;
                if (isCurrentResult) {
                    ctx.beginPath();
                    ctx.arc(n.x!, n.y!, 10 / globalScale, 0, 2 * Math.PI);
                    ctx.strokeStyle = '#f59e0b';
                    ctx.lineWidth = 3 / globalScale;
                    ctx.stroke();
                    // Outer glow
                    ctx.shadowBlur = 15;
                    ctx.shadowColor = '#f59e0b';
                }

                // 2. Search match highlight (all top results)
                if (n.isHighlighted) {
                    ctx.beginPath();
                    ctx.arc(n.x!, n.y!, 8 / globalScale, 0, 2 * Math.PI);
                    ctx.fillStyle = isCurrentResult ? 'rgba(245, 158, 11, 0.4)' : 'rgba(59, 130, 246, 0.4)';
                    ctx.fill();
                }

                // 3. Draw favicon or colored circle
                if (n.img) {
                    const size = (n.val || 2) * 2 / globalScale + 4;
                    ctx.save();
                    ctx.globalAlpha = alpha;
                    ctx.beginPath();
                    ctx.arc(n.x!, n.y!, size / 2, 0, Math.PI * 2);
                    ctx.clip();
                    ctx.drawImage(n.img, n.x! - size / 2, n.y! - size / 2, size, size);
                    ctx.restore();
                    
                    // Simple outline
                    ctx.beginPath();
                    ctx.arc(n.x!, n.y!, size / 2, 0, Math.PI * 2);
                    ctx.strokeStyle = n.clusterColor || '#3b82f6';
                    ctx.lineWidth = 1 / globalScale;
                    ctx.stroke();
                } else {
                    const radius = (n.val || 2) / globalScale + 2;
                    ctx.beginPath();
                    ctx.arc(n.x!, n.y!, radius, 0, 2 * Math.PI);
                    ctx.fillStyle = n.clusterColor || '#3b82f6';
                    ctx.globalAlpha = alpha;
                    ctx.fill();
                }
                
                ctx.shadowBlur = 0; // Reset shadow

                // 4. Draw label if zoomed in or hover
                if (globalScale > 3 || n.isHighlighted) {
                  const label = n.title;
                  const fontSize = 12 / globalScale;
                  ctx.font = `${fontSize}px Inter, sans-serif`;
                  const textWidth = ctx.measureText(label).width;
                  const bckgDimensions = [textWidth, fontSize].map(v => v + fontSize * 0.2);

                  ctx.fillStyle = `rgba(15, 23, 42, ${alpha * 0.8})`;
                  ctx.fillRect(n.x! - bckgDimensions[0] / 2, n.y! + 4 / globalScale, bckgDimensions[0], bckgDimensions[1]);

                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'top';
                  ctx.fillStyle = n.isHighlighted ? '#60a5fa' : `rgba(255, 255, 255, ${alpha})`;
                  ctx.fillText(label, n.x!, n.y! + 4 / globalScale);
                }
            }}
            onNodeClick={node => {
                const n = node as CustomNode;
                if (n.url) window.open(n.url, '_blank');
                onNodeClick(n.url);
            }}
            onNodeHover={node => setHoveredNode(node as CustomNode)}
            // Draw cluster boundaries and labels
            onRenderFramePost={(ctx: CanvasRenderingContext2D, globalScale: number) => {
              if (!showClusters || !data.clusters) return;
              
              labelRects.current.clear();
              data.clusters.forEach(cluster => {
                  const clusterNodes = data.nodes.filter(n => n.clusterId === cluster.id);
                  if (clusterNodes.length === 0) return;

                  // Find centroid and radius
                  let cx = 0, cy = 0;
                  clusterNodes.forEach(n => { cx += n.x!; cy += n.y!; });
                  cx /= clusterNodes.length;
                  cy /= clusterNodes.length;

                  let maxDistSq = 0;
                  clusterNodes.forEach(n => {
                      const dx = n.x! - cx;
                      const dy = n.y! - cy;
                      maxDistSq = Math.max(maxDistSq, dx*dx + dy*dy);
                  });
                  const r = Math.sqrt(maxDistSq) + 10;

                  const isDimmed = selectedClusterId !== null && selectedClusterId !== cluster.id;
                  const alpha = isDimmed ? 0.05 : 0.15;

                  // 1. Cluster area
                  ctx.beginPath();
                  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
                  ctx.fillStyle = cluster.color;
                  ctx.globalAlpha = alpha;
                  ctx.fill();
                  ctx.strokeStyle = cluster.color;
                  ctx.lineWidth = 2 / globalScale;
                  ctx.globalAlpha = alpha * 2;
                  ctx.stroke();

                  // 2. Cluster Label
                  const fontSize = 16 / globalScale;
                  ctx.font = `bold ${fontSize}px Inter, sans-serif`;
                  const textWidth = ctx.measureText(cluster.label).width;
                  const padding = 8 / globalScale;
                  
                  const lx = cx;
                  const ly = cy - r - fontSize - padding;
                  
                  // Background for label
                  const rw = textWidth + padding * 2;
                  const rh = fontSize + padding;
                  const rx = lx - rw / 2;
                  const ry = ly - rh / 2;

                  // Store for interaction
                  labelRects.current.set(cluster.id, { rx, ry, rw, rh });

                  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
                  ctx.globalAlpha = isDimmed ? 0.3 : 1;
                  ctx.beginPath();
                  ctx.roundRect(rx, ry, rw, rh, 4 / globalScale);
                  ctx.fill();
                  ctx.strokeStyle = cluster.color;
                  ctx.lineWidth = 1 / globalScale;
                  ctx.stroke();

                  ctx.fillStyle = cluster.color;
                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'middle';
                  ctx.fillText(cluster.label, lx, ly);
                  ctx.globalAlpha = 1;
              });
            }}
            onBackgroundClick={(e) => {
              // Check if label was clicked
              if (containerRef.current && fgRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                
                // Convert screen coordinates to graph coordinates
                const { x: graphX, y: graphY } = fgRef.current.screen2GraphCoords(x, y);

                let clickedId: number | null = null;
                labelRects.current.forEach((bounds, id) => {
                    if (graphX >= bounds.rx && graphX <= bounds.rx + bounds.rw &&
                        graphY >= bounds.ry && graphY <= bounds.ry + bounds.rh) {
                        clickedId = id;
                    }
                });

                if (clickedId !== null) {
                    setSelectedClusterId(prev => prev === clickedId ? null : (clickedId as number));
                    return;
                }
              }
              setSelectedClusterId(null);
            }}
        />

        {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm z-50">
                <div className="flex flex-col items-center gap-2">
                    <Loader2 className="animate-spin text-blue-500" size={32} />
                    <span className="text-xs text-slate-300 font-medium">銀河を生成中...</span>
                </div>
            </div>
        )}

        {/* Top Search Bar */}
        <div className="absolute top-4 left-4 z-20 flex gap-2">
            <div className="relative">
                <input 
                    type="text" 
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleGraphSearch()}
                    placeholder="宇宙を探索する..."
                    className="bg-slate-900/80 backdrop-blur text-xs text-white border border-slate-700 rounded-full px-3 py-1.5 w-48 focus:w-64 transition-all outline-none focus:border-blue-500"
                />
                {searchQuery && (
                    <button 
                        onClick={() => { 
                            setSearchQuery(''); 
                            setSearchResults([]);
                            data.nodes.forEach(n => n.isHighlighted = false); 
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                    >
                        <X size={12} />
                    </button>
                )}
            </div>

            {/* Search Mode Toggle */}
            <div className="flex bg-slate-900/80 backdrop-blur border border-slate-700 rounded-full p-0.5 ml-2">
                <button 
                    onClick={() => setSearchMode('semantic')}
                    className={`px-2 py-1 rounded-full text-[9px] font-bold transition-all ${searchMode === 'semantic' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                    title="要約・タグから検索"
                >
                    要約・タグ
                </button>
                <button 
                    onClick={() => setSearchMode('category')}
                    className={`px-2 py-1 rounded-full text-[9px] font-bold transition-all ${searchMode === 'category' ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                    title="AIカテゴリ（タイトル）から検索"
                >
                    カテゴリ
                </button>
            </div>

            <button 
                onClick={handleGraphSearch}
                disabled={isSearching}
                className="p-1.5 bg-blue-600/80 hover:bg-blue-500 text-white rounded-full backdrop-blur shadow-lg transition-all"
            >
                {isSearching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            </button>
            
            {/* Search Navigation */}
            {searchResults.length > 0 && (
                <div className="flex items-center gap-1 bg-slate-900/80 backdrop-blur border border-slate-700 rounded-full px-2 py-1 ml-2 animate-in fade-in slide-in-from-left-4">
                    <button 
                        onClick={() => {
                            const newIndex = (currentSearchIndex - 1 + searchResults.length) % searchResults.length;
                            setCurrentSearchIndex(newIndex);
                            if (fgRef.current) fgRef.current.centerAt(searchResults[newIndex].x, searchResults[newIndex].y, 1000);
                        }}
                        className="p-1 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-full transition-colors"
                    >
                        <ChevronLeft size={14} />
                    </button>
                    <span className="text-[10px] font-mono text-blue-300 min-w-[30px] text-center">
                        {currentSearchIndex + 1} / {searchResults.length}
                    </span>
                    <button 
                        onClick={() => {
                            const newIndex = (currentSearchIndex + 1) % searchResults.length;
                            setCurrentSearchIndex(newIndex);
                            if (fgRef.current) fgRef.current.centerAt(searchResults[newIndex].x, searchResults[newIndex].y, 1000);
                        }}
                        className="p-1 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-full transition-colors"
                    >
                        <ChevronRight size={14} />
                    </button>
                </div>
            )}
        </div>

        {/* Bottom Left controls */}
        <div className="absolute bottom-4 left-4 z-20 flex items-center gap-2">
            <button
                onClick={() => setShowControls(!showControls)}
                className={`p-2 rounded-lg backdrop-blur border shadow-lg transition-all ${
                    showControls ? 'bg-blue-600/80 text-white border-blue-500/50' : 'bg-slate-900/80 text-slate-400 border-slate-700 hover:text-white'
                }`}
            >
                {showControls ? <Minimize2 size={16} /> : <Settings2 size={16} />}
            </button>
            <button
                onClick={() => fgRef.current?.zoomToFit(1000)}
                title="全体を表示"
                className="p-2 bg-slate-900/80 text-slate-400 border border-slate-700 rounded-lg backdrop-blur shadow-lg hover:text-white hover:border-blue-500/50 transition-all"
            >
                <RotateCcw size={16} />
            </button>
        </div>

        {/* Expanded Controls */}
        {showControls && (
            <div className="absolute bottom-16 left-4 z-20 bg-slate-900/90 backdrop-blur border border-slate-700 rounded-xl p-4 w-64 shadow-2xl space-y-4 animate-in slide-in-from-bottom-2 fade-in">
                <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs text-slate-300">
                        <span>類似度閾値</span>
                        <span className="font-mono text-blue-400">{threshold.toFixed(2)}</span>
                    </div>
                    <input 
                        type="range" min="0.5" max="0.99" step="0.01" value={threshold} 
                        onChange={(e) => setThreshold(parseFloat(e.target.value))}
                        className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                    <span className="text-xs text-slate-300">クラスターを表示</span>
                    <button onClick={() => setShowClusters(!showClusters)} className={`w-10 h-5 rounded-full transition-colors relative ${showClusters ? 'bg-purple-600' : 'bg-slate-700'}`}>
                        <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${showClusters ? 'left-6' : 'left-1'}`} />
                    </button>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                    <span className="text-xs text-slate-300">背景の星空を表示</span>
                    <button onClick={() => setShowStars(!showStars)} className={`w-10 h-5 rounded-full transition-colors relative ${showStars ? 'bg-blue-600' : 'bg-slate-700'}`}>
                        <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${showStars ? 'left-6' : 'left-1'}`} />
                    </button>
                </div>

                <div className="pt-2">
                    <button
                        onClick={handleAINaming}
                        disabled={clustersToNameState.length === 0 || isNamingAI}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-lg shadow-lg disabled:opacity-50 transition-all"
                    >
                        {isNamingAI ? (
                            <Loader2 size={14} className="animate-spin" />
                        ) : (
                            <Sparkles size={14} className="text-yellow-300" />
                        )}
                        {isNamingAI ? '命名中...' : 'AIでラベルを生成'}
                    </button>
                    {clustersToNameState.length === 0 && !isNamingAI && (
                        <p className="text-[10px] text-slate-500 mt-1 text-center font-medium">
                            全クラスタ命名済みです
                        </p>
                    )}
                </div>
            </div>
        )}

        {/* Custom Tooltip */}
        {hoveredNode && (
            <div 
                className="absolute p-3 bg-slate-900/90 backdrop-blur rounded-lg border border-slate-700 shadow-xl z-30 pointer-events-none animate-in fade-in zoom-in-95"
                style={{
                    left: mousePos.x + 15,
                    top: mousePos.y + 15,
                    transform: `translate(${mousePos.x + 200 > dimensions.width ? '-100%' : '0%'}, ${mousePos.y + 100 > dimensions.height ? '-100%' : '0%'})`
                }}
            >
                <div className="flex items-start gap-3">
                    {hoveredNode.img && <img src={hoveredNode.img.src} alt="" className="w-5 h-5 rounded-sm flex-shrink-0" />}
                    <div>
                        <h4 className="text-xs font-bold text-white mb-1 leading-tight line-clamp-2">{hoveredNode.title}</h4>
                        {hoveredNode.description && (
                            <p className="text-[10px] text-slate-400 max-w-[200px] leading-snug line-clamp-3 mb-1.5">{hoveredNode.description}</p>
                        )}
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-blue-400 font-medium truncate">{new URL(hoveredNode.url).hostname}</span>
                          {hoveredNode.tags && hoveredNode.tags.length > 0 && (
                            <div className="flex gap-1">
                              {hoveredNode.tags.slice(0, 2).map(tag => (
                                <span key={tag} className="px-1 py-0.5 bg-slate-800 text-slate-500 text-[8px] rounded uppercase">{tag}</span>
                              ))}
                            </div>
                          )}
                        </div>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};
