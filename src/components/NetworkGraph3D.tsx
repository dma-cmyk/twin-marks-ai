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
const createGlowTexture = (color: string, outlineOnly: boolean = false) => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    
    if (outlineOnly) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(32, 32, 30, 0, Math.PI * 2);
        ctx.stroke();
    } else {
        const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, color);
        gradient.addColorStop(0.5, 'rgba(255, 200, 0, 0.2)');
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 64, 64);
    }
    return new THREE.CanvasTexture(canvas);
};

export const NetworkGraph3D: React.FC<NetworkGraph3DProps> = ({ onNodeClick, className }) => {
  const fgRef = useRef<ForceGraphMethods>(null!);
  const [data, setData] = useState<GraphData>({ nodes: [], links: [] });
  const [isLoading, setIsLoading] = useState(false);
  
  // UI States
  const [threshold, setThreshold] = useState(0.75);
  const [iconSize, setIconSize] = useState(1.0);
  const [graphTheme, setGraphTheme] = useState<'universe' | 'cyberpunk' | 'deep-sea'>('universe');
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

  // Persistence: Load settings
  useEffect(() => {
    chrome.storage.local.get(['graph_threshold_3d', 'graph_showClusters_3d', 'graph_showStars_3d', 'iconSize'], (res) => {
        if (res.graph_threshold_3d !== undefined) setThreshold(res.graph_threshold_3d as number);
        if (res.graph_showClusters_3d !== undefined) setShowClusters(res.graph_showClusters_3d as boolean);
        if (res.graph_showStars_3d !== undefined) setShowStars(res.graph_showStars_3d as boolean);
        if (res.iconSize !== undefined) setIconSize(res.iconSize as number);
    });
  }, []);

  // Persistence: Save settings
  useEffect(() => {
    chrome.storage.local.set({
        graph_threshold_3d: threshold,
        graph_showClusters_3d: showClusters,
        graph_showStars_3d: showStars,
        iconSize: iconSize
    });
  }, [threshold, showClusters, showStars, iconSize]);

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

  // マルチ・ギャラクシー（深宇宙）を創るためのヘルパー:
  const createNebulaTexture = (color1: string, color2: string) => {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
    grad.addColorStop(0, color1);
    grad.addColorStop(0.5, color2);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 120; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const r = Math.random() * 100 + 40;
        const dx = x - 256, dy = y - 256;
        if (dx*dx + dy*dy > 250*250) continue; 
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        const opacity = (Math.random() * 0.08 + 0.02);
        g.addColorStop(0, color2.replace(/0\.[0-9]+/g, opacity.toString()));
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.globalAlpha = 0.6;
        ctx.fillRect(0, 0, 512, 512);
    }
    return new THREE.CanvasTexture(canvas);
  };

  const nebulaRef = useRef<THREE.Group | null>(null);
  const starMaterialRef = useRef<THREE.ShaderMaterial | null>(null);

  // Starfield and Deep Space Objects
  useEffect(() => {
    const timer = setTimeout(() => {
        if (!fgRef.current) return;
        const scene = fgRef.current.scene();
        
        // Enhance Starfield (Multi-Galactic Structure)
        if (!starsRef.current) {
            const starsCount = 100000; 
            const starsGeometry = new THREE.BufferGeometry();
            const posArray = new Float32Array(starsCount * 3);
            const colorArray = new Float32Array(starsCount * 3);
            const sizeArray = new Float32Array(starsCount);
            const alphaArray = new Float32Array(starsCount);
            const randomOffsetArray = new Float32Array(starsCount);

            // Define Multiple Galactic Centers
            const galaxies = [
                { pos: new THREE.Vector3(0, 0, 0), rot: new THREE.Euler(0.2, 0, 0.1), scale: 1.0, color: 'warm' }, // Central Galaxy
                { pos: new THREE.Vector3(5000, 2000, -3000), rot: new THREE.Euler(1.2, 0.5, 0.3), scale: 0.7, color: 'blue' }, // Top Right Distant
                { pos: new THREE.Vector3(-4000, -1500, 2000), rot: new THREE.Euler(-0.5, -0.8, -0.2), scale: 0.8, color: 'violet' }, // Bottom Left
                { pos: new THREE.Vector3(2000, -3000, 5000), rot: new THREE.Euler(0.4, 2.1, 0.9), scale: 0.6, color: 'gold' }  // Front Down
            ];
            
            for(let i=0; i<starsCount; i++) {
                let worldPos = new THREE.Vector3();
                let pAlpha, size, baseColor = new THREE.Color(1, 1, 1);
                
                // 85% of stars belong to a galaxy, 15% are background intergalactic stars
                if (Math.random() < 0.85) {
                    const galaxy = galaxies[Math.floor(Math.random() * galaxies.length)];
                    const localPos = new THREE.Vector3();
                    
                    const dType = Math.random();
                    if (dType < 0.3) { // Bulge
                        const radius = Math.pow(Math.random(), 2) * 1800 * galaxy.scale;
                        const theta = Math.random() * Math.PI * 2;
                        const phi = Math.random() * Math.PI;
                        localPos.set(radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi) * 0.75, radius * Math.sin(phi) * Math.sin(theta));
                        pAlpha = 0.5 + Math.random() * 0.5;
                        size = (1.0 + Math.random() * 1.5) * galaxy.scale;
                    } else { // Disk
                        const radius = (1200 + Math.random() * 7000) * galaxy.scale;
                        const theta = Math.random() * Math.PI * 2;
                        const thickness = (Math.random() - 0.5) * 400 * galaxy.scale * (1.0 - radius/(8000*galaxy.scale) + 0.1);
                        localPos.set(radius * Math.cos(theta), thickness, radius * Math.sin(theta));
                        pAlpha = 0.2 + Math.random() * 0.6;
                        size = (0.7 + Math.random() * 1.2) * galaxy.scale;
                    }

                    // Rotate and Translate to World coordinates
                    localPos.applyEuler(galaxy.rot);
                    worldPos.addVectors(galaxy.pos, localPos);

                    // Galaxy Thematic Coloring
                    if (galaxy.color === 'blue') baseColor.setRGB(0.7, 0.85, 1.0);
                    else if (galaxy.color === 'violet') baseColor.setRGB(0.9, 0.7, 1.0);
                    else if (galaxy.color === 'gold') baseColor.setRGB(1.0, 0.9, 0.6);
                    else baseColor.setRGB(1.0, 0.95, 0.9); // warm/white
                } else {
                    // Intergalactic background stars
                    const dist = 7000 + Math.random() * 8000;
                    const theta = Math.random() * Math.PI * 2;
                    const phi = Math.random() * Math.PI;
                    worldPos.set(dist * Math.sin(phi) * Math.cos(theta), dist * Math.sin(phi) * Math.sin(theta), dist * Math.cos(phi));
                    pAlpha = 0.05 + Math.random() * 0.3;
                    size = 0.4 + Math.random() * 0.7;
                }

                posArray[i * 3] = worldPos.x;
                posArray[i * 3 + 1] = worldPos.y;
                posArray[i * 3 + 2] = worldPos.z;
                
                // Final Star Jitter and Color Tweak
                const cTweak = 0.9 + Math.random() * 0.1;
                colorArray[i * 3] = baseColor.r * cTweak;
                colorArray[i * 3 + 1] = baseColor.g * cTweak;
                colorArray[i * 3 + 2] = baseColor.b * cTweak;
                
                // Occasional Rare variants
                if (Math.random() > 0.99) { // Blue Supergiants
                    colorArray[i * 3] *= 0.8; colorArray[i * 3 + 1] *= 0.9; colorArray[i * 3 + 2] = 1.0;
                    size *= 2.5;
                }

                sizeArray[i] = size;
                alphaArray[i] = pAlpha;
                randomOffsetArray[i] = Math.random() * Math.PI * 2;
            }
            
            starsGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
            starsGeometry.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
            starsGeometry.setAttribute('size', new THREE.BufferAttribute(sizeArray, 1));
            starsGeometry.setAttribute('pAlpha', new THREE.BufferAttribute(alphaArray, 1));
            starsGeometry.setAttribute('pOffset', new THREE.BufferAttribute(randomOffsetArray, 1));
            
            const starMaterial = new THREE.ShaderMaterial({
                uniforms: { uTime: { value: 0 }, uOpacity: { value: 0.9 } },
                vertexShader: `
                    attribute float size;
                    attribute float pAlpha;
                    attribute float pOffset;
                    varying float vAlpha;
                    varying vec3 vColor;
                    uniform float uTime;
                    void main() {
                        vColor = color;
                        float twinkle = 0.75 + 0.25 * sin(uTime * (1.2 + pOffset * 0.5) + pOffset);
                        vAlpha = pAlpha * twinkle;
                        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                        gl_PointSize = size * (450.0 / -mvPosition.z);
                        gl_Position = projectionMatrix * mvPosition;
                    }
                `,
                fragmentShader: `
                    varying vec3 vColor;
                    varying float vAlpha;
                    uniform float uOpacity;
                    void main() {
                        float d = distance(gl_PointCoord, vec2(0.5, 0.5));
                        if (d > 0.5) discard;
                        float core = smoothstep(0.5, 0.0, d);
                        float glow = exp(-d * 9.0);
                        gl_FragColor = vec4(vColor, vAlpha * uOpacity * (core * 0.6 + glow * 0.4));
                    }
                `,
                transparent: true,
                vertexColors: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
            
            starMaterialRef.current = starMaterial;
            starsRef.current = new THREE.Points(starsGeometry, starMaterial);
            scene.add(starsRef.current);
            
            let startTime = Date.now();
            const animateStars = () => {
                if (starMaterialRef.current) starMaterialRef.current.uniforms.uTime.value = (Date.now() - startTime) / 1000;
                requestAnimationFrame(animateStars);
            };
            animateStars();
        }

        // Add Multi-Galactic Nebulae & Glow Bulges
        if (!nebulaRef.current) {
            const group = new THREE.Group();
            
            const galaxies = [
                { pos: new THREE.Vector3(0, 0, 0), rot: new THREE.Euler(0.2, 0, 0.1), scale: 1.0, colorTheme: ['rgba(255, 200, 150, 0.12)', 'rgba(255, 100, 50, 0)'] },
                { pos: new THREE.Vector3(5000, 2000, -3000), rot: new THREE.Euler(1.2, 0.5, 0.3), scale: 1.2, colorTheme: ['rgba(100, 150, 255, 0.1)', 'rgba(50, 80, 255, 0)'] },
                { pos: new THREE.Vector3(-4000, -1500, 2000), rot: new THREE.Euler(-0.5, -0.8, -0.2), scale: 1.1, colorTheme: ['rgba(200, 100, 255, 0.1)', 'rgba(100, 50, 200, 0)'] },
                { pos: new THREE.Vector3(2000, -3000, 5000), rot: new THREE.Euler(0.4, 2.1, 0.9), scale: 0.9, colorTheme: ['rgba(255, 220, 100, 0.1)', 'rgba(200, 150, 50, 0)'] }
            ];

            galaxies.forEach(galaxy => {
                // 1. Bulge Glow for each galaxy
                const bulgeTex = createNebulaTexture(galaxy.colorTheme[0], galaxy.colorTheme[1]);
                const bulgeMat = new THREE.SpriteMaterial({ map: bulgeTex, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false });
                const bulgeSprite = new THREE.Sprite(bulgeMat);
                bulgeSprite.position.copy(galaxy.pos);
                bulgeSprite.scale.set(6000 * galaxy.scale, 5000 * galaxy.scale, 1);
                group.add(bulgeSprite);

                // 2. Localized Nebulae
                const nebulaColors = [
                    ['rgba(40, 50, 200, 0.12)', 'rgba(20, 20, 100, 0)'],
                    ['rgba(200, 50, 100, 0.1)', 'rgba(100, 20, 50, 0)'],
                    ['rgba(50, 200, 150, 0.08)', 'rgba(20, 100, 70, 0)']
                ];

                for (let i = 0; i < 15; i++) {
                    const colorPair = nebulaColors[Math.floor(Math.random() * nebulaColors.length)];
                    const tex = createNebulaTexture(colorPair[0], colorPair[1]);
                    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.2 + Math.random() * 0.2, blending: THREE.AdditiveBlending, depthWrite: false });
                    const sprite = new THREE.Sprite(mat);
                    
                    const radius = (1500 + Math.random() * 5000) * galaxy.scale;
                    const theta = Math.random() * Math.PI * 2;
                    const localPos = new THREE.Vector3(radius * Math.cos(theta), (Math.random() - 0.5) * 1500 * galaxy.scale, radius * Math.sin(theta));
                    localPos.applyEuler(galaxy.rot);
                    sprite.position.addVectors(galaxy.pos, localPos);
                    
                    const size = (3000 + Math.random() * 4000) * galaxy.scale;
                    sprite.scale.set(size, size, 1);
                    sprite.rotation.z = Math.random() * Math.PI;
                    group.add(sprite);
                }
            });

            nebulaRef.current = group;
            scene.add(group);
        }

        if (starsRef.current) starsRef.current.visible = showStars && graphTheme === 'universe';
        if (nebulaRef.current) nebulaRef.current.visible = showStars && graphTheme === 'universe';
    }, 1000);
    return () => clearTimeout(timer);
  }, [showStars, graphTheme]);

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

        // Cleanup removed clusters
        clusterObjects.current.forEach((obj, id) => {
            if (!data.clusters?.find(c => c.id === id) || !showClusters) {
                scene.remove(obj);
                clusterObjects.current.delete(id);
            }
        });

        // Scene objects management
        let grid = scene.getObjectByName('cyberpunkGrid');
        let dataStream = scene.getObjectByName('cyberpunkDataStream') as THREE.Points;
        let bubbles = scene.getObjectByName('deepSeaBubbles') as THREE.Points;
        let snow = scene.getObjectByName('deepSeaSnow') as THREE.Points;
        
        if (graphTheme === 'cyberpunk') {
            if (bubbles) bubbles.visible = false;
            if (snow) snow.visible = false;

            if (!grid) {
                grid = new THREE.GridHelper(10000, 100, 0x0ea5e9, 0x1e293b);
                grid.position.y = -2000;
                grid.name = 'cyberpunkGrid';
                scene.add(grid);
            }
            grid.visible = showStars;

            if (!dataStream) {
                const count = 2000;
                const geom = new THREE.BufferGeometry();
                const pos = new Float32Array(count * 3);
                for(let i=0; i<count; i++) {
                    pos[i*3] = (Math.random() - 0.5) * 6000;
                    pos[i*3+1] = (Math.random() - 0.5) * 6000;
                    pos[i*3+2] = (Math.random() - 0.5) * 6000;
                }
                geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
                dataStream = new THREE.Points(geom, new THREE.PointsMaterial({ color: 0x0ea5e9, size: 4, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending }));
                dataStream.name = 'cyberpunkDataStream';
                scene.add(dataStream);
            }
            dataStream.visible = showStars;
            
            // Animate data stream
            dataStream.rotation.y += 0.01;
            const positions = dataStream.geometry.attributes.position.array as Float32Array;
            for(let i=0; i<positions.length; i+=3) {
                positions[i+1] -= 20;
                if (positions[i+1] < -3000) positions[i+1] = 3000;
            }
            dataStream.geometry.attributes.position.needsUpdate = true;
        } else if (graphTheme === 'deep-sea') {
            if (grid) grid.visible = false;
            if (dataStream) dataStream.visible = false;
            
            if (!bubbles) {
                // Varied rising bubbles
                const count = 1500;
                const geom = new THREE.BufferGeometry();
                const pos = new Float32Array(count * 3);
                const speeds = new Float32Array(count);
                for(let i=0; i<count; i++) {
                    pos[i*3] = (Math.random() - 0.5) * 8000;
                    pos[i*3+1] = (Math.random() - 0.5) * 8000;
                    pos[i*3+2] = (Math.random() - 0.5) * 8000;
                    speeds[i] = 5 + Math.random() * 20;
                }
                geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
                geom.setAttribute('speed', new THREE.BufferAttribute(speeds, 1));
                bubbles = new THREE.Points(geom, new THREE.PointsMaterial({ 
                    color: 0x99f6e4, 
                    size: 8, 
                    transparent: true, 
                    opacity: 0.3, 
                    blending: THREE.AdditiveBlending 
                }));
                bubbles.name = 'deepSeaBubbles';
                scene.add(bubbles);
            }
            bubbles.visible = showStars;
            
            // Rising bubbles
            const bPos = bubbles.geometry.attributes.position.array as Float32Array;
            const bSpeeds = bubbles.geometry.attributes.speed.array as Float32Array;
            for(let i=0; i<bPos.length/3; i++) {
                bPos[i*3+1] += bSpeeds[i];
                if (bPos[i*3+1] > 4000) bPos[i*3+1] = -4000;
                // Wobble
                bPos[i*3] += Math.sin(Date.now() * 0.001 + i) * 2;
            }
            bubbles.geometry.attributes.position.needsUpdate = true;

            if (!snow) {
                // Drifting marine snow
                const count = 3000;
                const geom = new THREE.BufferGeometry();
                const pos = new Float32Array(count * 3);
                for(let i=0; i<count; i++) {
                    pos[i*3] = (Math.random() - 0.5) * 8000;
                    pos[i*3+1] = (Math.random() - 0.5) * 8000;
                    pos[i*3+2] = (Math.random() - 0.5) * 8000;
                }
                geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
                snow = new THREE.Points(geom, new THREE.PointsMaterial({ 
                    color: 0xffffff, 
                    size: 3, 
                    transparent: true, 
                    opacity: 0.15,
                    depthWrite: false
                }));
                snow.name = 'deepSeaSnow';
                scene.add(snow);
            }
            snow.visible = showStars;
            
            // Drifting snow
            const sPos = snow.geometry.attributes.position.array as Float32Array;
            for(let i=0; i<sPos.length/3; i++) {
                sPos[i*3+1] -= 2; // slow fall
                sPos[i*3] += Math.cos(Date.now() * 0.0005 + i) * 1;
                if (sPos[i*3+1] < -4000) sPos[i*3+1] = 4000;
            }
            snow.geometry.attributes.position.needsUpdate = true;
        } else {
            if (grid) grid.visible = false;
            if (dataStream) dataStream.visible = false;
            if (bubbles) bubbles.visible = false;
            if (snow) snow.visible = false;
        }

    }, 100);
    return () => clearInterval(timer);
  }, [data.clusters, data.nodes, showClusters, selectedClusterId, graphTheme, showStars]);

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
          const baseScale = (n.isHighlighted ? 20 : 12) * iconSize;
          const scale = isCurrent ? baseScale * 1.5 : baseScale;
          sprite.scale.set(scale, scale, 1);
          group.add(sprite);

          // Icon outline for visibility
          // ring variable removed
          // Look at camera is handled by ForceGraph3D for Sprites, but for Meshes in a Group it's tricky.
          // However, ForceGraph3D manages the whole object. If we use a Sprite for the ring too, it's safer.
          const ringSprite = new THREE.Sprite(new THREE.SpriteMaterial({
              map: createGlowTexture('rgba(255, 255, 255, 0.5)', true), // true means circle outline
              transparent: true,
              opacity: isDimmed ? 0.1 : 0.8
          }));
          ringSprite.scale.set(scale * 1.1, scale * 1.1, 1);
          group.add(ringSprite);

          if (graphTheme === 'cyberpunk') {
              // Holographic Box Frame
              const boxSize = scale * 1.1;
              const boxGeom = new THREE.BoxGeometry(boxSize, boxSize, boxSize);
              const edges = new THREE.EdgesGeometry(boxGeom);
              const box = new THREE.LineSegments(
                  edges,
                  new THREE.LineBasicMaterial({ 
                      color: n.clusterColor || '#3b82f6', 
                      transparent: true, 
                      opacity: isDimmed ? 0.05 : 0.4,
                      blending: THREE.AdditiveBlending
                  })
              );
              group.add(box);
              
              // Internal subtle light
              const pointLight = new THREE.PointLight(n.clusterColor || '#3b82f6', isDimmed ? 0.1 : 0.5, scale * 2);
              group.add(pointLight);
          } else if (graphTheme === 'deep-sea') {
              // Organic Bubble Shell
              const bubbleSize = scale * 0.7;
              const bubbleGeom = new THREE.SphereGeometry(bubbleSize, 32, 32);
              const bubbleMat = new THREE.MeshPhongMaterial({
                  color: n.clusterColor || '#99f6e4',
                  transparent: true,
                  opacity: isDimmed ? 0.05 : 0.3,
                  shininess: 100,
                  specular: 0xffffff
              });
              const bubble = new THREE.Mesh(bubbleGeom, bubbleMat);
              group.add(bubble);
              
              // Internal subtle glow
              const light = new THREE.PointLight(n.clusterColor || '#99f6e4', isDimmed ? 0.1 : 0.4, scale * 2);
              group.add(light);
          }

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
                  <input type="range" min="0.5" max="0.99" step="0.01" value={threshold} onChange={e => {
                      const val = parseFloat(e.target.value);
                      setThreshold(val);
                      chrome.storage?.local.set({ threshold: val });
                  }} className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
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
