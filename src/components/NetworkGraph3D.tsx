import React, { useEffect, useState, useRef, useCallback } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import type { ForceGraphMethods, LinkObject, NodeObject } from 'react-force-graph-3d';
import { getAllVectors } from '../utils/vectorStore';
import { getEmbedding } from '../utils/embedding';
import { similarity } from 'ml-distance';
import { kmeans } from 'ml-kmeans';
import { Loader2, Search, X, Settings2, Minimize2, ChevronLeft, ChevronRight, RotateCcw, Sparkles } from 'lucide-react';
import * as THREE from 'three';
import { useDialog } from '../context/DialogContext';

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
}

const textureCache = new Map<string, THREE.Texture>();
const loader = new THREE.TextureLoader();

// Helper to create a text sprite
const createTextSprite = (text: string, color: string) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    
    // Use a large enough base font to ensure sharpness
    const fontSize = 120;
    ctx.font = `bold ${fontSize}px Sans-Serif`;
    
    // Measure text to determine canvas width
    const metrics = ctx.measureText(text);
    const textWidth = Math.ceil(metrics.width);
    const padding = 60; // Extra space for glow/shadow
    
    canvas.width = textWidth + padding * 2;
    canvas.height = fontSize + padding * 2;
    
    // Redo font setting as canvas resize clears it
    ctx.font = `bold ${fontSize}px Sans-Serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = color;
    ctx.shadowBlur = 30;
    ctx.fillStyle = color;
    
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(material);
    
    // Scale sprite based on aspect ratio
    const aspect = canvas.width / canvas.height;
    const baseHeight = 30;
    sprite.scale.set(baseHeight * aspect, baseHeight, 1);
    
    return sprite;
};

// Helper for glow texture
const createGlowTexture = (color: string) => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.5, 'rgba(255, 200, 0, 0.2)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(canvas);
};

export const NetworkGraph3D: React.FC<NetworkGraph3DProps> = ({ onNodeClick, className }) => {
  const fgRef = useRef<ForceGraphMethods>(null!);
  const [data, setData] = useState<GraphData>({ nodes: [], links: [] });
  const [isLoading, setIsLoading] = useState(false);
  
  // UI States
  const [threshold, setThreshold] = useState(0.75);
  const [showControls, setShowControls] = useState(false);
  const [showClusters, setShowClusters] = useState(true);
  const [showStars, setShowStars] = useState(true);
  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<CustomNode[]>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const [searchMode, setSearchMode] = useState<'category' | 'semantic'>('semantic');
  const { showAlert } = useDialog();
  const starsRef = useRef<THREE.Points | null>(null);
  
  // AI Naming states
  const [namingCache, setNamingCache] = useState<Record<string, string>>({});
  const [isNamingAI, setIsNamingAI] = useState(false);
  const [clustersToNameState, setClustersToNameState] = useState<{ id: number, items: { url: string, title: string }[], centroid?: number[] }[]>([]);

  // Hover state for tooltip
  const [hoveredNode, setHoveredNode] = useState<CustomNode | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 }); 
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  
  const [cachedVectors, setCachedVectors] = useState<any[]>([]);
  const clusterObjects = useRef<Map<number, THREE.Group>>(new Map());
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());
  const lastClickWasLabel = useRef(false);

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

  const focusOnNode = (node: CustomNode) => {
    if (node.x !== undefined && node.y !== undefined && node.z !== undefined && fgRef.current) {
        const dist = 300;
        fgRef.current.cameraPosition(
            { x: node.x + dist, y: node.y + dist, z: node.z + dist },
            { x: node.x, y: node.y, z: node.z },
            1000
        );
    }
  };

  const handleAINaming = async () => {
    if (clustersToNameState.length === 0 || isNamingAI) return;
    setIsNamingAI(true);
    try {
        const settings = await chrome.storage.local.get(['geminiApiKey', 'generationModel']);
        const apiKey = settings.geminiApiKey as string | undefined;
        const modelName = (settings.generationModel as string | undefined) || 'gemini-1.5-flash';
        if (!apiKey) {
            await showAlert('APIキーを設定してください');
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
        clustersToProcess.forEach(c => {
            const clusterState = clustersToNameState.find(cts => cts.id === c.id);
            if (clusterState && (clusterState as any).key && c.name) {
                newCache[(clusterState as any).key] = c.name;
            }
        });
        setNamingCache(newCache);
        setClustersToNameState([]);
    } catch (e) {
        console.error("AI naming failed in 3D", e);
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
      id: v.url, title: v.title || v.url, url: v.url, val: 1, vector: v.vector, semanticVector: v.semanticVector, description: v.description, tags: v.tags
    }));

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
          if (node.tags) node.tags.forEach(tag => cData.tags.set(tag, (cData.tags.get(tag) || 0) + 1));
        });

        const clusterColors = ['#8b5cf6', '#ec4899', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#84cc16', '#a855f7', '#64748b'];
        const usedLabels = new Set<string>();

        clusters = Array.from(clustersMap.entries()).map(([id, data]) => {
          const clusterKey = data.nodes.map(n => n.id).sort().slice(0, 5).join('|');
          const cachedName = namingCache[clusterKey];
          let label = cachedName || "";
          if (!label) {
            const sortedTags = Array.from(data.tags.entries()).sort((a, b) => b[1] - a[1]);
            
            // Fallback: use tag or title
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
            const titleSnippet = data.nodes[0].title.split(/[\s・|/-]/)[0].substring(0, 6);
            const tagSnippet = Array.from(data.tags.keys())[0] || "";
            const altLabel = tagSnippet ? `${label}・${tagSnippet}` : `${label}・${titleSnippet}`;
            
            if (!usedLabels.has(altLabel)) {
              finalLabel = altLabel;
            } else {
              finalLabel = `${label} #${id + 1}`;
            }
          }
          usedLabels.add(finalLabel);
          
          const color = clusterColors[id % clusterColors.length];
          data.nodes.forEach(n => n.clusterColor = color);
          
          const currentBatchItem = clustersToNameBatch.find(b => b.id === id);
          if (currentBatchItem) currentBatchItem.key = clusterKey;

          return { id, label: finalLabel, color, key: clusterKey } as any;
        });
        setClustersToNameState(clustersToNameBatch);
      } catch (e) { console.error("Clustering failed in 3D", e); }
    }

    const links: CustomLink[] = [];
    for (let i = 0; i < vectors.length; i++) {
        for (let j = i + 1; j < vectors.length; j++) {
            const sim = similarity.cosine(vectors[i].vector, vectors[j].vector);
            if (sim > threshold) {
                links.push({ source: vectors[i].url, target: vectors[j].url, value: sim });
            }
        }
    }
    setData({ nodes, links, clusters });
  }, [threshold, showClusters, namingCache]);

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
  }, [cachedVectors, isLoading, processVectors]);

  useEffect(() => {
    buildGraph();
  }, [buildGraph]);

  const handleGraphSearch = async () => {
      if (!searchQuery.trim() || data.nodes.length === 0) return;
      setIsSearching(true);
      try {
          const settings = await chrome.storage.local.get(['geminiApiKey', 'embeddingModel']);
          const apiKey = settings.geminiApiKey as string | undefined;
          const modelName = (settings.embeddingModel as string | undefined) || 'models/embedding-001';
          
          if (!apiKey) {
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
          const topNodes = scoredNodes.filter(n => n.score > 0.4).slice(0, 10).map(n => n.node);
          data.nodes.forEach(n => n.isHighlighted = false);
          if (topNodes.length > 0) {
              setSearchResults(topNodes);
              topNodes.forEach(node => node.isHighlighted = true);
              focusOnNode(topNodes[0]);
              setCurrentSearchIndex(0);
          } else {
              await showAlert('関連する星は見つかりませんでした。');
          }
      } catch (e) {
          console.error(e);
          await showAlert('検索エラー');
      } finally { setIsSearching(false); }
  };

  // Label click handler
  const handleLabelClick = useCallback((event: MouseEvent) => {
    if (!fgRef.current || !data.clusters || !showClusters) return false;
    const renderer = fgRef.current.renderer();
    const camera = fgRef.current.camera();
    const canvas = renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    mouse.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.current.setFromCamera(mouse.current, camera);
    const objectsToIntersect: THREE.Object3D[] = [];
    clusterObjects.current.forEach(group => {
        const label = group.getObjectByName('label');
        if (label) objectsToIntersect.push(label);
    });
    const intersects = raycaster.current.intersectObjects(objectsToIntersect);
    if (intersects.length > 0) {
        const clusterId = intersects[0].object.parent?.userData.clusterId;
        if (clusterId !== undefined) {
            lastClickWasLabel.current = true;
            setSelectedClusterId(prev => prev === clusterId ? null : clusterId);
            event.stopPropagation();
            return true;
        }
    }
    return false;
  }, [data.clusters, showClusters]);

  // Starfield
  useEffect(() => {
    const timer = setTimeout(() => {
        if (!fgRef.current) return;
        const scene = fgRef.current.scene();
        if (!starsRef.current) {
            const starsGeometry = new THREE.BufferGeometry();
            const starsCount = 6000;
            const posArray = new Float32Array(starsCount * 3);
            for(let i=0; i<starsCount * 3; i++) posArray[i] = (Math.random() - 0.5) * 5000;
            starsGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
            const starsMaterial = new THREE.PointsMaterial({ size: 1.5, color: 0xffffff, transparent: true, opacity: 0.6, sizeAttenuation: true });
            starsRef.current = new THREE.Points(starsGeometry, starsMaterial);
            scene.add(starsRef.current);
        }
        if (starsRef.current) {
            starsRef.current.visible = showStars;
        }
    }, 1000);
    return () => clearTimeout(timer);
  }, [showStars]);

  // Sync clusters
  useEffect(() => {
    const timer = setInterval(() => {
        if (!fgRef.current || !data.clusters) return;
        const scene = fgRef.current.scene();
        
        if (showClusters) {
            data.clusters.forEach(cluster => {
            const clusterNodes = data.nodes.filter(n => n.clusterId === cluster.id);
            if (clusterNodes.length === 0) return;
            let cx = 0, cy = 0, cz = 0;
            let maxDistSq = 0;
            clusterNodes.forEach(n => { cx += (n.x || 0); cy += (n.y || 0); cz += (n.z || 0); });
            cx /= clusterNodes.length; cy /= clusterNodes.length; cz /= clusterNodes.length;
            clusterNodes.forEach(n => {
                const dx = (n.x || 0) - cx, dy = (n.y || 0) - cy, dz = (n.z || 0) - cz;
                maxDistSq = Math.max(maxDistSq, dx*dx + dy*dy + dz*dz);
            });
            const radius = Math.sqrt(maxDistSq) + 30;
            let group = clusterObjects.current.get(cluster.id);
            if (!group) {
                group = new THREE.Group();
                group.userData = { clusterId: cluster.id };
                
                // 1. Nebula Sphere with Additive Blending
                const sphere = new THREE.Mesh(
                    new THREE.SphereGeometry(1, 32, 32), 
                    new THREE.MeshBasicMaterial({ 
                        color: cluster.color, 
                        transparent: true, 
                        opacity: 0.08, 
                        side: THREE.BackSide,
                        blending: THREE.AdditiveBlending 
                    })
                );
                sphere.name = 'sphere';
                group.add(sphere);
                
                // 2. Wireframe / Edge Outline
                const edges = new THREE.EdgesGeometry(new THREE.SphereGeometry(1, 16, 16));
                const line = new THREE.LineSegments(
                    edges,
                    new THREE.LineBasicMaterial({ 
                        color: cluster.color, 
                        transparent: true, 
                        opacity: 0.2,
                        blending: THREE.AdditiveBlending
                    })
                );
                line.name = 'wireframe';
                group.add(line);

                const label = createTextSprite(cluster.label, cluster.color);
                label.name = 'label';
                label.userData = { labelText: cluster.label }; // Store original text
                group.add(label);
                scene.add(group);
                clusterObjects.current.set(cluster.id, group);
            }
            
            group.position.set(cx, cy, cz);
            
            // Update label if text changed
            let label = group.getObjectByName('label') as THREE.Sprite;
            if (label && label.userData.labelText !== cluster.label) {
                group.remove(label);
                label = createTextSprite(cluster.label, cluster.color);
                label.name = 'label';
                label.userData = { labelText: cluster.label };
                group.add(label);
            }

            // Pulse animation logic
            const isSelected = selectedClusterId === cluster.id;
            const time = Date.now() * 0.002;
            const pulse = isSelected ? 1 + Math.sin(time) * 0.05 : 1;

            const sphere = group.getObjectByName('sphere') as THREE.Mesh;
            if (sphere) {
                sphere.scale.set(radius * pulse, radius * pulse, radius * pulse);
                const isFocused = selectedClusterId === null || isSelected;
                (sphere.material as THREE.MeshBasicMaterial).opacity = isFocused ? 0.08 : 0.01;
            }

            const wireframe = group.getObjectByName('wireframe') as THREE.LineSegments;
            if (wireframe) {
                wireframe.scale.set(radius * pulse, radius * pulse, radius * pulse);
                const isFocused = selectedClusterId === null || isSelected;
                (wireframe.material as THREE.LineBasicMaterial).opacity = isFocused ? 0.3 : 0.05;
            }

            if (label) {
                label.position.set(0, radius * pulse + 20, 0);
                const isFocused = selectedClusterId === null || isSelected;
                (label.material as THREE.SpriteMaterial).opacity = isFocused ? 1.0 : 0.1;
            }
        });
    }
    clusterObjects.current.forEach((obj, id) => {
            if (!data.clusters?.find(c => c.id === id) || !showClusters) {
                scene.remove(obj);
                clusterObjects.current.delete(id);
            }
        });
    }, 100);
    return () => clearInterval(timer);
  }, [data.clusters, data.nodes, showClusters, selectedClusterId]);

  return (
    <div 
        ref={containerRef}
        className={`relative w-full h-full bg-black ${className}`}
        onMouseMove={(e) => {
            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
            }
        }}
        onMouseDown={(e) => {
            handleLabelClick(e.nativeEvent);
        }}
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
          <div className="flex flex-col items-center gap-2 text-blue-300">
            <Loader2 className="animate-spin" size={32} />
            <span className="text-xs tracking-widest uppercase">3D空間を構築中...</span>
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
                    placeholder="3D空間を検索..."
                    className="bg-slate-900/80 backdrop-blur text-xs text-white border border-slate-700 rounded-full px-3 py-1.5 w-48 focus:w-64 transition-all outline-none focus:border-blue-500"
                />
                {searchQuery && (
                    <button 
                        onClick={() => { 
                            setSearchQuery(''); setSearchResults([]);
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
            
            {searchResults.length > 0 && (
                <div className="flex items-center gap-1 bg-slate-900/80 backdrop-blur border border-slate-700 rounded-full px-2 py-1 ml-2 animate-in fade-in slide-in-from-left-4">
                    <button onClick={() => {
                        const newIdx = (currentSearchIndex - 1 + searchResults.length) % searchResults.length;
                        setCurrentSearchIndex(newIdx); focusOnNode(searchResults[newIdx]);
                    }} className="p-1 text-slate-400 hover:text-white rounded-full"><ChevronLeft size={14} /></button>
                    <span className="text-[10px] font-mono text-blue-300 min-w-[30px] text-center">{currentSearchIndex + 1} / {searchResults.length}</span>
                    <button onClick={() => {
                        const newIdx = (currentSearchIndex + 1) % searchResults.length;
                        setCurrentSearchIndex(newIdx); focusOnNode(searchResults[newIdx]);
                    }} className="p-1 text-slate-400 hover:text-white rounded-full"><ChevronRight size={14} /></button>
                </div>
            )}
      </div>

      <ForceGraph3D
        ref={fgRef}
        graphData={data}
        backgroundColor="#000000"
        nodeLabel={(node: any) => (node as CustomNode).title}
        nodeRelSize={8}
        linkWidth={(link: any) => {
            const s = link.source as CustomNode;
            const t = link.target as CustomNode;
            const isDimmed = selectedClusterId !== null && (s.clusterId !== selectedClusterId || t.clusterId !== selectedClusterId);
            return isDimmed ? 0.5 : 1.5;
        }}
        linkOpacity={0.3}
        linkColor={(link: any) => {
          const s = link.source as CustomNode;
          const t = link.target as CustomNode;
          const isDimmed = selectedClusterId !== null && (s.clusterId !== selectedClusterId || t.clusterId !== selectedClusterId);
          return isDimmed ? '#1e293b' : (s.clusterColor || '#334155');
        }}
        onNodeClick={(node) => {
          const n = node as CustomNode;
          if (n.url) window.open(n.url, '_blank');
          onNodeClick(n.url);
        }}
        onNodeHover={(node) => setHoveredNode(node ? (node as CustomNode) : null)}
        showNavInfo={false}
        onBackgroundClick={() => {
            if (lastClickWasLabel.current) { lastClickWasLabel.current = false; return; }
            setSelectedClusterId(null);
        }}
        nodeThreeObject={(node: any) => {
          const n = node as CustomNode;
          const domain = new URL(n.url).hostname;
          const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
          let texture = textureCache.get(faviconUrl);
          if (!texture) { texture = loader.load(faviconUrl); textureCache.set(faviconUrl, texture); }
          const isDimmed = (selectedClusterId !== null && n.clusterId !== selectedClusterId) || (searchResults.length > 0 && !n.isHighlighted);
          const group = new THREE.Group();
          if (n.isHighlighted) {
              const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: createGlowTexture('rgba(255, 200, 0, 1.0)'), transparent: true, blending: THREE.AdditiveBlending, opacity: 0.8 }));
              glow.scale.set(40, 40, 1); group.add(glow);
          }
          const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: isDimmed ? 0.05 : 0.9 }));
          const isCurrent = searchResults.length > 0 && searchResults[currentSearchIndex]?.id === n.id;
          const baseScale = n.isHighlighted ? 20 : 12;
          const scale = isCurrent ? baseScale * 1.5 : baseScale;
          sprite.scale.set(scale, scale, 1);
          group.add(sprite);
          group.userData = { clusterId: n.clusterId };
          return group;
        }}
        nodeThreeObjectExtend={false}
      />

      {/* Bottom Controls */}
      <div className="absolute bottom-4 left-4 z-20 flex gap-2">
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

      {showControls && (
          <div className="absolute bottom-16 left-4 z-20 bg-slate-900/90 backdrop-blur border border-slate-700 rounded-xl p-4 w-64 shadow-2xl space-y-4 animate-in slide-in-from-bottom-2 fade-in">
              <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs text-slate-300">
                      <span>類似度閾値</span>
                      <span className="font-mono text-blue-400">{threshold.toFixed(2)}</span>
                  </div>
                  <input type="range" min="0.5" max="0.99" step="0.01" value={threshold} onChange={e => setThreshold(parseFloat(e.target.value))} className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
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
                      {isNamingAI ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} className="text-yellow-300" />}
                      {isNamingAI ? '命名中...' : 'AIでラベルを生成'}
                  </button>
                  {clustersToNameState.length === 0 && !isNamingAI && (
                      <p className="text-[10px] text-slate-500 mt-1 text-center font-medium">全クラスタ命名済みです</p>
                  )}
              </div>
          </div>
      )}

      <div className="absolute bottom-4 right-4 pointer-events-none text-right z-20">
        <div className="bg-slate-900/80 backdrop-blur px-3 py-1.5 rounded-lg border border-blue-500/30 text-[10px] text-blue-200 shadow-lg shadow-blue-900/20 inline-block">
          星: {data.nodes.length} | 星座: {data.links.length}
        </div>
      </div>

      {hoveredNode && (
          <div 
              className="absolute p-3 bg-slate-900/90 backdrop-blur rounded-lg border border-slate-700 shadow-xl z-30 pointer-events-none animate-in fade-in zoom-in-95"
              style={{
                  left: mousePos.x + 15,
                  top: mousePos.y + 15,
                  transform: `translate(${mousePos.x + 200 > dimensions.width ? '-100%' : '0%'}, ${mousePos.y + 100 > dimensions.height ? '-100%' : '0%'})`
              }}
          >
              <h4 className="text-xs font-bold text-white mb-1 leading-tight line-clamp-2">{hoveredNode.title}</h4>
              {hoveredNode.description && <p className="text-[10px] text-slate-400 max-w-[200px] leading-snug line-clamp-3 mb-1.5">{hoveredNode.description}</p>}
              <p className="text-[10px] text-blue-400 font-medium truncate">{new URL(hoveredNode.url).hostname}</p>
          </div>
      )}
    </div>
  );
};
