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
  const [iconSize, setIconSize] = useState(1.0);
  const [graphTheme, setGraphTheme] = useState<'universe' | 'cyberpunk' | 'deep-sea'>('universe');
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
  const stars = useRef<{x: number, y: number, size: number, alpha: number, speed?: number, type?: 'bubble' | 'snow'}[]>([]);

  // Load settings
  useEffect(() => {
    chrome.storage?.local.get(['iconSize', 'graphTheme', 'threshold'], (result) => {
        if (result.iconSize !== undefined) setIconSize(result.iconSize as number);
        if (result.graphTheme) setGraphTheme(result.graphTheme as 'universe' | 'cyberpunk' | 'deep-sea');
        if (result.threshold !== undefined) setThreshold(result.threshold as number);
    });
  }, []);

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
          alpha: Math.random() * 0.8 + 0.2,
          speed: Math.random() * 0.5 + 0.2,
          type: Math.random() > 0.7 ? 'bubble' : 'snow' 
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

                if (graphTheme === 'universe') {
                    stars.current.forEach(star => {
                        ctx.globalAlpha = star.alpha;
                        ctx.fillStyle = '#ffffff';
                        ctx.beginPath();
                        ctx.arc(star.x * canvas.width, star.y * canvas.height, star.size, 0, Math.PI * 2);
                        ctx.fill();
                    });
                } else if (graphTheme === 'cyberpunk') {
                    // Cyberpunk Grid
                    ctx.strokeStyle = 'rgba(59, 130, 246, 0.15)';
                    ctx.lineWidth = 1;
                    const gridSize = 40;
                    const shift = (Date.now() / 50) % gridSize;

                    ctx.beginPath();
                    for (let x = shift; x < canvas.width; x += gridSize) {
                        ctx.moveTo(x, 0);
                        ctx.lineTo(x, canvas.height);
                    }
                    for (let y = shift; y < canvas.height; y += gridSize) {
                        ctx.moveTo(0, y);
                        ctx.lineTo(canvas.width, y);
                    }
                    ctx.stroke();

                    // Subtle scanning line
                    const scanY = (Date.now() / 20) % canvas.height;
                    const scanGrad = ctx.createLinearGradient(0, scanY - 50, 0, scanY);
                    scanGrad.addColorStop(0, 'transparent');
                    scanGrad.addColorStop(1, 'rgba(59, 130, 246, 0.05)');
                    ctx.fillStyle = scanGrad;
                    ctx.fillRect(0, scanY - 50, canvas.width, 50);
                } else if (graphTheme === 'deep-sea') {
                    // Deep Sea Gradient Background
                    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
                    grad.addColorStop(0, '#020617'); // Deep Navy
                    grad.addColorStop(1, '#064e3b'); // Deep Green
                    ctx.fillStyle = grad;
                    ctx.fillRect(0, 0, canvas.width, canvas.height);

                    // Bubbles and Marine Snow
                    const time = Date.now() / 1000;
                    stars.current.forEach(item => {
                        if (item.type === 'bubble') {
                            // Rising bubbles
                            const bx = (item.x * canvas.width + Math.sin(time + item.y * 10) * 20) % canvas.width;
                            const by = (item.y * canvas.height - time * 50 * (item.speed || 1)) % canvas.height;
                            const bpos = by < 0 ? by + canvas.height : by;
                            
                            ctx.globalAlpha = item.alpha * 0.4;
                            ctx.strokeStyle = '#99f6e4';
                            ctx.lineWidth = 1;
                            ctx.beginPath();
                            ctx.arc(bx, bpos, item.size * 3, 0, Math.PI * 2);
                            ctx.stroke();
                            
                            // Highlight on bubble
                            ctx.beginPath();
                            ctx.arc(bx - item.size, bpos - item.size, item.size * 0.5, 0, Math.PI * 2);
                            ctx.fillStyle = '#ffffff';
                            ctx.fill();
                        } else {
                            // Falling/Drifting marine snow
                            const sx = (item.x * canvas.width + Math.cos(time * 0.5 + item.y) * 30) % canvas.width;
                            const sy = (item.y * canvas.height + time * 10 * (item.speed || 1)) % canvas.height;
                            
                            ctx.globalAlpha = item.alpha * 0.3;
                            ctx.fillStyle = '#f8fafc';
                            ctx.beginPath();
                            ctx.arc(sx, sy, item.size * 0.8, 0, Math.PI * 2);
                            ctx.fill();
                        }
                    });
                }
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
            linkCanvasObject={(link: any, ctx, globalScale) => {
                const start = link.source;
                const end = link.target;
                if (typeof start !== 'object' || typeof end !== 'object') return;

                const isDimmed = (selectedClusterId !== null && (start.clusterId !== selectedClusterId || end.clusterId !== selectedClusterId)) || 
                                (searchResults.length > 0 && (!start.isHighlighted || !end.isHighlighted));

                ctx.beginPath();
                ctx.moveTo(start.x, start.y);
                
                if (graphTheme === 'deep-sea') {
                    // Sine wave link
                    const dx = end.x - start.x;
                    const dy = end.y - start.y;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    const angle = Math.atan2(dy, dx);
                    const segments = Math.max(5, Math.floor(dist / 20));
                    const time = Date.now() / 500;
                    
                    for (let i = 1; i <= segments; i++) {
                        const t = i / segments;
                        const x = start.x + dx * t;
                        const y = start.y + dy * t;
                        const offset = Math.sin(t * Math.PI * 2 + time + (link.index || 0)) * (4 / globalScale);
                        const ox = x + Math.cos(angle + Math.PI/2) * offset;
                        const oy = y + Math.sin(angle + Math.PI/2) * offset;
                        ctx.lineTo(ox, oy);
                    }
                } else {
                    ctx.lineTo(end.x, end.y);
                }

                ctx.strokeStyle = isDimmed ? 'rgba(255,255,255,0.05)' : (graphTheme === 'cyberpunk' ? 'rgba(56, 189, 248, 0.4)' : (graphTheme === 'deep-sea' ? 'rgba(153, 246, 228, 0.5)' : 'rgba(255,255,255,0.2)'));
                ctx.lineWidth = (graphTheme === 'cyberpunk' ? 1.5 : (graphTheme === 'deep-sea' ? 2 : 1)) / globalScale;
                ctx.stroke();
            }}
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

                // 3. Draw favicon or colored circle/chip
                const baseSize = (n.val || 2) * 2 / globalScale + 4;
                const size = baseSize * iconSize;
                
                if (graphTheme === 'cyberpunk') {
                    // Cyberpunk Rectangular Chip
                    ctx.save();
                    ctx.globalAlpha = alpha;
                    
                    // Outer glow
                    ctx.shadowBlur = 10 / globalScale;
                    ctx.shadowColor = n.clusterColor || '#3b82f6';
                    
                    // Main body
                    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
                    ctx.beginPath();
                    const r = 2 / globalScale; // corner radius
                    ctx.roundRect(n.x! - size/2, n.y! - size/2, size, size, r);
                    ctx.fill();
                    
                    // Border
                    ctx.strokeStyle = n.clusterColor || '#3b82f6';
                    ctx.lineWidth = 1 / globalScale;
                    ctx.stroke();

                    // Corner accents
                    ctx.lineWidth = 2 / globalScale;
                    const accentLen = size * 0.3;
                    ctx.beginPath();
                    // Top-left
                    ctx.moveTo(n.x! - size/2, n.y! - size/2 + accentLen);
                    ctx.lineTo(n.x! - size/2, n.y! - size/2);
                    ctx.lineTo(n.x! - size/2 + accentLen, n.y! - size/2);
                    // Bottom-right
                    ctx.moveTo(n.x! + size/2 - accentLen, n.y! + size/2);
                    ctx.lineTo(n.x! + size/2, n.y! + size/2);
                    ctx.lineTo(n.x! + size/2, n.y! + size/2 - accentLen);
                    ctx.stroke();
                    
                    ctx.restore();

                    // Favicon inside chip
                    if (n.img) {
                        const imgSize = size * 0.7;
                        ctx.save();
                        ctx.globalAlpha = alpha;
                        
                        // Icon outline for visibility
                        ctx.beginPath();
                        ctx.rect(n.x! - imgSize / 2, n.y! - imgSize / 2, imgSize, imgSize);
                        ctx.strokeStyle = '#ffffff';
                        ctx.lineWidth = 0.5 / globalScale;
                        ctx.stroke();

                        ctx.beginPath();
                        ctx.rect(n.x! - imgSize / 2, n.y! - imgSize / 2, imgSize, imgSize);
                        ctx.clip();
                        ctx.drawImage(n.img, n.x! - imgSize / 2, n.y! - imgSize / 2, imgSize, imgSize);
                        ctx.restore();
                    }
                } else if (graphTheme === 'deep-sea') {
                    // Deep Sea Organic Bubble
                    ctx.save();
                    ctx.globalAlpha = alpha;
                    const time = Date.now() / 1000;
                    
                    // Bubble glow
                    const grad = ctx.createRadialGradient(n.x!, n.y!, size * 0.3, n.x!, n.y!, size * 0.8);
                    grad.addColorStop(0, n.clusterColor || '#0ea5e9');
                    grad.addColorStop(1, 'transparent');
                    ctx.fillStyle = grad;
                    
                    ctx.beginPath();
                    // Wobbling edge
                    for(let i=0; i<12; i++) {
                        const angle = (i/12) * Math.PI * 2;
                        const idHash = n.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                        const wobble = Math.sin(time * 2 + i + idHash) * (2 / globalScale);
                        const r = (size * 0.6) + wobble;
                        const px = n.x! + Math.cos(angle) * r;
                        const py = n.y! + Math.sin(angle) * r;
                        if(i===0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                    }
                    ctx.closePath();
                    ctx.fill();

                    // Favicon in a circle
                    if (n.img) {
                        const imgSize = size * 0.6;
                        ctx.save();
                        
                        // Icon outline for visibility
                        ctx.beginPath();
                        ctx.arc(n.x!, n.y!, imgSize / 2, 0, Math.PI * 2);
                        ctx.strokeStyle = '#ffffff';
                        ctx.lineWidth = 0.5 / globalScale;
                        ctx.stroke();

                        ctx.beginPath();
                        ctx.arc(n.x!, n.y!, imgSize / 2, 0, Math.PI * 2);
                        ctx.clip();
                        ctx.drawImage(n.img, n.x! - imgSize / 2, n.y! - imgSize / 2, imgSize, imgSize);
                        ctx.restore();
                    }
                    ctx.restore();
                } else {
                    // Original Universe Circle
                    if (n.img) {
                        // Icon outline for visibility
                        ctx.beginPath();
                        ctx.arc(n.x!, n.y!, size / 2, 0, Math.PI * 2);
                        ctx.strokeStyle = '#ffffff';
                        ctx.lineWidth = 0.5 / globalScale;
                        ctx.stroke();

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
                        const radius = ((n.val || 2) / globalScale + 2) * iconSize;
                        ctx.beginPath();
                        ctx.arc(n.x!, n.y!, radius, 0, 2 * Math.PI);
                        ctx.fillStyle = n.clusterColor || '#3b82f6';
                        ctx.globalAlpha = alpha;
                        ctx.fill();
                    }
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
                        onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setThreshold(val);
                            chrome.storage?.local.set({ threshold: val });
                        }}
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
                    <span className="text-xs text-slate-300">背景エフェクトを表示</span>
                    <button onClick={() => setShowStars(!showStars)} className={`w-10 h-5 rounded-full transition-colors relative ${showStars ? 'bg-blue-600' : 'bg-slate-700'}`}>
                        <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${showStars ? 'left-6' : 'left-1'}`} />
                    </button>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-800">
                    <span className="text-xs text-slate-300">マップテーマ</span>
                        <div className="flex bg-slate-950 border border-slate-800 rounded-lg p-0.5">
                            <button 
                                onClick={() => {
                                    setGraphTheme('universe');
                                    chrome.storage?.local.set({ graphTheme: 'universe' });
                                }}
                                className={`flex-1 px-1 py-1 rounded text-[9px] font-bold transition-all ${graphTheme === 'universe' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                Universe
                            </button>
                            <button 
                                onClick={() => {
                                    setGraphTheme('cyberpunk');
                                    chrome.storage?.local.set({ graphTheme: 'cyberpunk' });
                                }}
                                className={`flex-1 px-1 py-1 rounded text-[9px] font-bold transition-all ${graphTheme === 'cyberpunk' ? 'bg-cyan-600/20 text-cyan-400 border border-cyan-500/30' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                Cyberpunk
                            </button>
                            <button 
                                onClick={() => {
                                    setGraphTheme('deep-sea');
                                    chrome.storage?.local.set({ graphTheme: 'deep-sea' });
                                }}
                                className={`flex-1 px-1 py-1 rounded text-[9px] font-bold transition-all ${graphTheme === 'deep-sea' ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                DeepSea
                            </button>
                        </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-800">
                    <div className="flex justify-between items-center text-xs text-slate-300">
                        <span>アイコンサイズ</span>
                        <span className="font-mono text-blue-400">{iconSize.toFixed(1)}x</span>
                    </div>
                    <input 
                        type="range" min="0.5" max="5.0" step="0.1" value={iconSize} 
                        onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setIconSize(val);
                            chrome.storage?.local.set({ iconSize: val });
                        }}
                        className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
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
