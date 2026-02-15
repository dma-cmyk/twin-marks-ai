import React, { useEffect, useState, useRef, useCallback } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import type { ForceGraphMethods, LinkObject, NodeObject } from 'react-force-graph-3d';
import { getAllVectors } from '../utils/vectorStore';
import { getEmbedding } from '../utils/embedding';
import { similarity } from 'ml-distance';
import { Loader2, Search, X, Settings2, Minimize2, RotateCw, ChevronLeft, ChevronRight } from 'lucide-react';
import * as THREE from 'three';

interface NetworkGraph3DProps {
  onNodeClick: (url: string) => void;
  className?: string;
}

interface CustomNode extends NodeObject {
  id: string;
  title: string;
  url: string;
  val: number;
  vector?: number[]; 
  isHighlighted?: boolean;
  score?: number;
  description?: string;
  color?: string;
  x?: number;
  y?: number;
  z?: number;
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

// === Optimization: Shared Assets & Texture Cache ===
const textureCache = new Map<string, THREE.Texture>();

export const NetworkGraph3D: React.FC<NetworkGraph3DProps> = ({ onNodeClick, className }) => {
  const [data, setData] = useState<GraphData>({ nodes: [], links: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CustomNode[]>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  
  // Controls
  const [showControls, setShowControls] = useState(false);
  const [threshold, setThreshold] = useState(0.75);
  const [cachedVectors, setCachedVectors] = useState<any[]>([]);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  const fgRef = useRef<ForceGraphMethods | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Main Graph Builder
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
          console.error("3D Graph build failed", e);
      } finally {
          setIsLoading(false);
      }
  }, [cachedVectors, threshold]);

  // Initialize Resize Observer & Message Listener
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

      // Listen for real-time updates
      const messageListener = (message: any) => {
        if (message.type === 'VECTOR_UPDATED') {
          console.log('Real-time update: refreshing 3D graph...');
          buildGraph(true);
        }
      };
      chrome.runtime?.onMessage.addListener(messageListener);

      return () => {
        resizeObserver.disconnect();
        chrome.runtime?.onMessage.removeListener(messageListener);
      };
    }
  }, [buildGraph]);

  const processVectors = (vectors: any[]) => {
        if (!vectors || vectors.length === 0) {
            setData({ nodes: [], links: [] });
            return;
        }

        const nodes: CustomNode[] = vectors.map((v: any) => ({
            id: v.url,
            title: v.title || v.url,
            url: v.url,
            val: 2,
            vector: v.vector,
            description: v.description,
            color: v.isSaved ? '#10b981' : '#8b5cf6' // Emerald for saved, Purple for others
        }));

        const links: CustomLink[] = [];
        
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
            const s = typeof l.source === 'string' ? l.source : (l.source as CustomNode).id;
            const t = typeof l.target === 'string' ? l.target : (l.target as CustomNode).id;
            if(s) degrees[s] = (degrees[s] || 0) + 1;
            if(t) degrees[t] = (degrees[t] || 0) + 1;
        });

        nodes.forEach(n => {
            const deg = degrees[n.id] || 0;
            n.val = Math.max(2, Math.min(15, Math.sqrt(deg) * 3)); 
        });

        setData({ nodes, links });
  };

  useEffect(() => {
      if (cachedVectors.length === 0) {
          buildGraph(true);
      } else {
          processVectors(cachedVectors);
      }
  }, [threshold]);

  const navigateToNode = (node: CustomNode) => {
      if (fgRef.current && node.x !== undefined && node.y !== undefined && node.z !== undefined) {
             const distance = 400;
             const distRatio = 1 + distance/Math.hypot(node.x, node.y, node.z);
             fgRef.current.cameraPosition(
                 { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio },
                 { x: node.x, y: node.y, z: node.z }, // LookAt target
                 2000
             );
      }
  };

  const handlePrevResult = () => {
      if (searchResults.length === 0) return;
      const newIndex = (currentSearchIndex - 1 + searchResults.length) % searchResults.length;
      setCurrentSearchIndex(newIndex);
      navigateToNode(searchResults[newIndex]);
  };

  const handleNextResult = () => {
      if (searchResults.length === 0) return;
      const newIndex = (currentSearchIndex + 1) % searchResults.length;
      setCurrentSearchIndex(newIndex);
      navigateToNode(searchResults[newIndex]);
  };

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
              alert('先に設定でAPIキーを設定してください');
              return;
          }

          const queryVector = await getEmbedding(searchQuery, apiKey, modelName);
          
          const scoredNodes = data.nodes.map((n: CustomNode) => ({
              node: n,
              score: n.vector ? similarity.cosine(queryVector, n.vector) : 0
          }));
          
          scoredNodes.sort((a: any, b: any) => b.score - a.score);
          const topNodes = scoredNodes.filter((n: any) => n.score > 0.4).slice(0, 10).map((n: any) => n.node);
          
          data.nodes.forEach((n: CustomNode) => {
              n.isHighlighted = false;
              n.score = 0; // Reset scores
          });

          // Store scores for all nodes to modulate glow
          scoredNodes.forEach((item: any) => {
              item.node.score = item.score;
          });
          
          if (topNodes.length > 0) {
              setSearchResults(topNodes);
              topNodes.forEach((node: CustomNode) => {
                  node.isHighlighted = true;
              });

              navigateToNode(topNodes[0]);
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

  const handleResetCamera = () => {
      if (fgRef.current) {
          fgRef.current.cameraPosition({ x: 0, y: 0, z: 1000 }, { x: 0, y: 0, z: 0 }, 1000);
      }
  };

  return (
    <div 
        ref={containerRef} 
        className={`relative w-full h-full bg-black overflow-hidden rounded-xl border border-slate-800 ${className}`}
    >
        {/* Loading Overlay */}
        {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
                <div className="flex flex-col items-center gap-2 text-purple-300">
                    <Loader2 className="animate-spin" size={32} />
                    <span className="text-xs tracking-widest uppercase">3D銀河を生成中...</span>
                </div>
            </div>
        )}

        {/* Search Bar (Top Left) */}
        <div className="absolute top-4 left-4 z-10 flex gap-2">
            <div className="relative">
                <input 
                    type="text" 
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleGraphSearch()}
                    placeholder="星を検索..."
                    className="bg-slate-900/80 backdrop-blur text-xs text-white border border-slate-700 rounded-full px-4 py-2 w-48 focus:w-72 transition-all outline-none focus:border-purple-500 shadow-xl"
                />
                {searchQuery && (
                    <button 
                        onClick={() => { 
                            setSearchQuery(''); 
                            setSearchResults([]);
                            data.nodes.forEach((n: CustomNode) => n.isHighlighted = false); 
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                    >
                        <X size={14} />
                    </button>
                )}
            </div>
            <button 
                onClick={handleGraphSearch}
                disabled={isSearching}
                className="p-2 bg-purple-600/80 hover:bg-purple-500 text-white rounded-full backdrop-blur shadow-lg transition-all"
            >
                {isSearching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            </button>
            
            {/* Search Navigation */}
            {searchResults.length > 0 && (
                <div className="flex items-center gap-1 bg-slate-900/80 backdrop-blur border border-slate-700 rounded-full px-3 py-1 ml-2 animate-in fade-in slide-in-from-left-4 shadow-lg">
                    <button 
                        onClick={handlePrevResult}
                        className="p-1 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-full transition-colors"
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <span className="text-[10px] font-mono text-purple-300 min-w-[30px] text-center">
                        {currentSearchIndex + 1} / {searchResults.length}
                    </span>
                    <button 
                        onClick={handleNextResult}
                        className="p-1 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-full transition-colors"
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            )}
        </div>

        {/* View Controls & Stats (Moved to Bottom Right to avoid overlap) */}
        <div className="absolute bottom-16 right-4 z-10 flex flex-col gap-2 items-end">
            <div className="bg-slate-900/80 backdrop-blur border border-slate-700 rounded-lg p-1 flex flex-col gap-1 shadow-xl">
                <button 
                    onClick={handleResetCamera}
                    className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
                    title="カメラリセット"
                >
                    <RotateCw size={16} />
                </button>
            </div>
            <div className="bg-slate-900/80 backdrop-blur px-3 py-1.5 rounded-lg border border-purple-500/30 text-[10px] text-purple-200 shadow-lg text-center">
                Nodes: {data.nodes.length}
            </div>
        </div>

        {/* Control Panel Toggle (Bottom Left) */}
        <div className="absolute bottom-4 left-4 z-10">
            <button
                onClick={() => setShowControls(!showControls)}
                className={`p-2.5 rounded-xl backdrop-blur border shadow-lg transition-all ${
                    showControls ? 'bg-purple-600 text-white border-purple-400' : 'bg-slate-900/80 text-slate-400 border-slate-700 hover:text-white'
                }`}
                title="グラフ制御"
            >
                {showControls ? <Minimize2 size={20} /> : <Settings2 size={20} />}
            </button>
        </div>

        {/* Control Panel (Expanded) */}
        {showControls && (
            <div className="absolute bottom-16 left-4 z-10 bg-slate-900/90 backdrop-blur border border-slate-700 rounded-2xl p-5 w-72 shadow-2xl space-y-5 animate-in slide-in-from-bottom-2 fade-in">
                <div className="space-y-3">
                    <div className="flex justify-between items-center text-xs text-slate-300">
                        <span className="font-medium">類似度閾値 (3D)</span>
                        <span className="font-mono text-purple-400 font-bold bg-purple-500/10 px-2 py-0.5 rounded">{threshold.toFixed(2)}</span>
                    </div>
                    <input 
                        type="range" 
                        min="0.6" 
                        max="0.99" 
                        step="0.01" 
                        value={threshold} 
                        onChange={(e) => setThreshold(parseFloat(e.target.value))}
                        className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                    />
                    <p className="text-[10px] text-slate-500 leading-tight">
                        閾値を下げると星同士の繋がり（星座）が増えます。
                    </p>
                </div>
            </div>
        )}

        {data.nodes.length > 0 && (
            <ForceGraph3D
                ref={fgRef}
                width={dimensions.width}
                height={dimensions.height}
                graphData={data}
                backgroundColor="#000000"
                
                // === Aesthetics ===
                nodeRelSize={1}
                nodeVal={(node: any) => (node as CustomNode).val || 2}
                nodeColor={(node: any) => (node as CustomNode).isHighlighted ? '#fbbf24' : ((node as CustomNode).color || '#8b5cf6')}
                nodeOpacity={0.9}
                
                // === Unified Star/Icon Sprite (Enhanced Visuals) ===
                nodeThreeObject={(node: any) => {
                  const n = node as CustomNode;
                  const size = n.val || 2;
                  const isHigh = n.isHighlighted;
                  
                  // Check if this is the currently navigated result
                  const isCurrent = searchResults.length > 0 && searchResults[currentSearchIndex]?.id === n.id;
                  const isHovered = n.id === hoveredNodeId;
                  
                  const score = n.score || 0;
                  const domain = new URL(n.url).hostname;
                  
                  // Determine base color: Current=Cyan, High=Gold, Default=Original
                  const nodeColor = isCurrent ? '#00ffff' : (isHigh ? '#fbbf24' : (n.color || '#8b5cf6'));
                  
                  // Cache key includes high/current/hovered state AND a rounded score bracket for performance
                  const scoreBracket = Math.floor(score * 10);
                  const cacheKey = `${domain}_${isCurrent}_${isHigh}_${isHovered}_${scoreBracket}`;
                  let iconTex = textureCache.get(cacheKey);
                  
                  if (!iconTex) {
                    const canvas = document.createElement('canvas');
                    canvas.width = 128; canvas.height = 128; // Higher res for better glow
                    const ctx = canvas.getContext('2d')!;
                    
                    const drawMainGlow = () => {
                        const centerX = 64;
                        const centerY = 64;
                        const maxRadius = 64;

                        // 1. Massive Aura Glow (Vibrant background)
                        const auraAlpha = isCurrent ? 1.0 : (isHigh ? 0.9 : (0.2 + score * 0.5));
                        const gradOuter = ctx.createRadialGradient(centerX, centerY, 20, centerX, centerY, maxRadius);
                        gradOuter.addColorStop(0, nodeColor);
                        gradOuter.addColorStop(0.5, nodeColor);
                        gradOuter.addColorStop(1, 'rgba(0,0,0,0)');
                        ctx.globalAlpha = auraAlpha;
                        ctx.fillStyle = gradOuter;
                        ctx.fillRect(0, 0, 128, 128);

                        // 2. Bright Core Flare (For high scores/highlights)
                        if (isCurrent || isHigh || isHovered || score > 0.6) {
                            const flareAlpha = isCurrent ? 1.0 : (isHigh ? 0.8 : (isHovered ? 0.6 : (score - 0.5)));
                            const gradInner = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 50);
                            gradInner.addColorStop(0, '#ffffff');
                            gradInner.addColorStop(0.2, '#ffffff');
                            gradInner.addColorStop(0.5, nodeColor);
                            gradInner.addColorStop(1, 'rgba(0,0,0,0)');
                            ctx.globalAlpha = flareAlpha;
                            ctx.fillStyle = gradInner;
                            ctx.fillRect(0, 0, 128, 128);

                            // 3. Sparkly Star Spikes (Double Cross flare)
                            ctx.globalAlpha = (isCurrent || isHigh || isHovered) ? 1.0 : 0.7;
                            ctx.strokeStyle = '#ffffff';
                            const spikeSize = (isCurrent || isHigh || isHovered) ? 64 : (32 + score * 32);
                            
                            const drawSpike = (angle: number, width: number, size: number) => {
                                ctx.save();
                                ctx.translate(centerX, centerY);
                                ctx.rotate(angle);
                                const grad = ctx.createLinearGradient(-size, 0, size, 0);
                                grad.addColorStop(0, 'rgba(255,255,255,0)');
                                grad.addColorStop(0.5, 'rgba(255,255,255,1)');
                                grad.addColorStop(1, 'rgba(255,255,255,0)');
                                ctx.strokeStyle = grad;
                                ctx.lineWidth = width;
                                ctx.beginPath();
                                ctx.moveTo(-size, 0);
                                ctx.lineTo(size, 0);
                                ctx.stroke();
                                ctx.restore();
                            };

                            // Main Cross
                            drawSpike(0, 3, spikeSize);
                            drawSpike(Math.PI / 2, 3, spikeSize);
                            
                            // Diagonal Spikes (Subtle)
                            if (isCurrent || isHigh || isHovered || score > 0.8) {
                                drawSpike(Math.PI / 4, 1.5, spikeSize * 0.7);
                                drawSpike(-Math.PI / 4, 1.5, spikeSize * 0.7);
                            }
                        }
                        ctx.globalAlpha = 1.0;
                    };

                    const renderPlaceholder = () => {
                        ctx.clearRect(0, 0, 128, 128);
                        drawMainGlow();
                        // White Disc
                        const discSize = (isCurrent || isHigh || isHovered) ? 45 : (32 + score * 10);
                        ctx.fillStyle = 'white';
                        ctx.beginPath(); ctx.arc(64, 64, discSize, 0, Math.PI*2); ctx.fill();
                        // Category Color Center
                        ctx.fillStyle = nodeColor;
                        ctx.beginPath(); ctx.arc(64, 64, discSize - 4, 0, Math.PI*2); ctx.fill();
                    };

                    renderPlaceholder();
                    iconTex = new THREE.CanvasTexture(canvas);
                    textureCache.set(cacheKey, iconTex);

                    chrome.runtime.sendMessage({ 
                        type: 'GET_FAVICON_DATA_URL', 
                        url: n.url 
                    }, (dataUrl) => {
                        if (dataUrl) {
                            const img = new Image();
                            img.src = dataUrl;
                            img.onload = () => {
                                ctx.clearRect(0, 0, 128, 128);
                                drawMainGlow();
                                
                                // Glowing White BG
                                const bgSize = (isCurrent || isHigh || isHovered) ? 50 : (36 + score * 12);
                                ctx.shadowBlur = (isCurrent || isHigh || isHovered) ? 20 : (5 + score * 10);
                                ctx.shadowColor = nodeColor;
                                ctx.fillStyle = 'white';
                                ctx.beginPath(); ctx.arc(64, 64, bgSize, 0, Math.PI*2); ctx.fill();
                                ctx.shadowBlur = 0;

                                // Clip and draw icon
                                ctx.save();
                                const iconSize = bgSize - 4;
                                ctx.beginPath(); ctx.arc(64, 64, iconSize, 0, Math.PI*2); ctx.clip();
                                ctx.drawImage(img, 64 - iconSize, 64 - iconSize, iconSize * 2, iconSize * 2);
                                ctx.restore();
                                
                                if (iconTex) iconTex.needsUpdate = true;
                            };
                        }
                    });
                  }

                  const material = new THREE.SpriteMaterial({ 
                    map: iconTex, 
                    transparent: true,
                    depthWrite: false, 
                    blending: THREE.AdditiveBlending // Makes it more "glowy"
                  });
                  const sprite = new THREE.Sprite(material);
                  // Scale up if current, high, or hovered
                  let baseScale = 4 + score * 6; // Default scale based on score
                  if (isHigh) baseScale = 10;
                  if (isCurrent) baseScale = 14;
                  if (isHovered) baseScale *= 1.3; // Slight magnification on hover

                  sprite.scale.set(size * baseScale, size * baseScale, 1);
                  return sprite;
                }}
                
                // === Tooltip (Sci-Fi Monitor Style) ===
                nodeLabel={(node: any) => {
                    const n = node as CustomNode;
                    return `
                        <div style="
                            background: rgba(10, 10, 16, 0.85); 
                            border: 1px solid rgba(0, 255, 255, 0.3);
                            border-radius: 4px;
                            padding: 16px; 
                            max-width: 340px; 
                            backdrop-filter: blur(4px); 
                            pointer-events: none;
                            font-family: 'Courier New', Courier, monospace;
                            box-shadow: 0 0 20px rgba(0, 255, 255, 0.1), inset 0 0 20px rgba(0, 0, 0, 0.8);
                            position: relative;
                            overflow: hidden;
                        ">
                            <!-- Scanline Effect -->
                            <div style="
                                position: absolute; top: 0; left: 0; right: 0; bottom: 0;
                                background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06));
                                background-size: 100% 2px, 3px 100%;
                                pointer-events: none;
                                z-index: 0;
                            "></div>

                            <!-- Corner Accents -->
                            <div style="position: absolute; top: 0; left: 0; width: 10px; height: 10px; border-top: 2px solid cyan; border-left: 2px solid cyan;"></div>
                            <div style="position: absolute; top: 0; right: 0; width: 10px; height: 10px; border-top: 2px solid cyan; border-right: 2px solid cyan;"></div>
                            <div style="position: absolute; bottom: 0; left: 0; width: 10px; height: 10px; border-bottom: 2px solid cyan; border-left: 2px solid cyan;"></div>
                            <div style="position: absolute; bottom: 0; right: 0; width: 10px; height: 10px; border-bottom: 2px solid cyan; border-right: 2px solid cyan;"></div>

                            <div style="position: relative; z-index: 1;">
                                <div style="
                                    font-weight: 900; 
                                    font-size: 14px; 
                                    color: #00ffff; 
                                    margin-bottom: 8px; 
                                    line-height: 1.4; 
                                    text-transform: uppercase; 
                                    letter-spacing: 1px;
                                    text-shadow: 0 0 5px rgba(0, 255, 255, 0.5);
                                    border-bottom: 1px dashed rgba(0, 255, 255, 0.3);
                                    padding-bottom: 8px;
                                ">
                                    ${n.title || n.url}
                                </div>
                                
                                ${n.description ? `
                                <div style="
                                    font-size: 11px; 
                                    color: #a5f3fc; 
                                    line-height: 1.5; 
                                    margin-bottom: 12px; 
                                    text-align: justify;
                                ">
                                    ${n.description}
                                </div>` : ''}
                                
                                <div style="
                                    display: flex; 
                                    align-items: center; 
                                    justify-content: space-between;
                                    font-size: 9px; 
                                    color: rgba(0, 255, 255, 0.6); 
                                    background: rgba(0, 255, 255, 0.05);
                                    padding: 4px 8px;
                                    border-radius: 2px;
                                ">
                                    <span style="display: flex; align-items: center; gap: 4px;">
                                        <span style="width: 6px; height: 6px; background: ${n.val > 5 ? '#f59e0b' : '#00ffff'}; border-radius: 50%; box-shadow: 0 0 5px ${n.val > 5 ? '#f59e0b' : '#00ffff'};"></span>
                                        DATA_SOURCE
                                    </span>
                                    <span style="letter-spacing: 0.1em;">${new URL(n.url).hostname.toUpperCase()}</span>
                                </div>
                            </div>
                        </div>
                    `;
                }}

                // === Links as Faint Lines ===
                linkWidth={(link: any) => (link as CustomLink).value * 1.5}
                linkColor={(link: any) => {
                    const s = link.source as CustomNode;
                    const t = link.target as CustomNode;
                    return s.isHighlighted || t.isHighlighted ? '#f59e0b' : '#334155';
                }}
                linkOpacity={0.3}
                linkDirectionalParticles={2}
                linkDirectionalParticleSpeed={0.005}
                linkDirectionalParticleWidth={1.5}
                
                // === Interaction ===
                onNodeClick={(node: any) => {
                   const n = node as CustomNode;
                   // Left click: Open directly
                   window.open(n.url, '_blank');
                }}
                onNodeRightClick={(node: any) => {
                   const n = node as CustomNode;
                   // Right click: Preview (side panel)
                   onNodeClick(n.url);
                }}
                onNodeHover={(node: any) => {
                    setHoveredNodeId(node ? (node as CustomNode).id : null);
                }}
            />
        )}
        
        {/* Help Tip */}
        <div className="absolute bottom-4 right-4 pointer-events-none text-right">
            <p className="text-[10px] text-slate-500">ドラッグ: 回転 | 右ドラッグ: 平行移動 | スクロール: ズーム</p>
            <p className="text-[10px] text-slate-500 font-bold text-blue-400">クリック: ページを開く | 右クリック: プレビュー</p>
        </div>
    </div>
  );
};
