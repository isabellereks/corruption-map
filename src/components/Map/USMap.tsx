import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import { politicians } from '../../data/politicians';
import { useAppContext } from '../../context/AppContext';
import { partyColors } from '../../utils/colors';
import { formatDollars } from '../../utils/format';
import { industryMap } from '../../data/industries';
import { fipsToState, stateNames } from '../../data/stateFips';
import type { Politician, Party } from '../../data/types';

interface StateData {
  politicians: Politician[];
  totalDonations: number;
  dominantParty: Party;
  topIndustries: { name: string; total: number }[];
}

function computeStateData(filteredPoliticians: Politician[]): Map<string, StateData> {
  const byState = new Map<string, Politician[]>();
  for (const p of filteredPoliticians) {
    const list = byState.get(p.state) ?? [];
    list.push(p);
    byState.set(p.state, list);
  }

  const result = new Map<string, StateData>();
  for (const [state, pols] of byState) {
    const totalDonations = pols.reduce(
      (s, p) => s + p.donations.reduce((s2, d) => s2 + d.amount, 0), 0
    );

    const partyCount = { D: 0, R: 0, I: 0 };
    for (const p of pols) partyCount[p.party]++;
    const dominantParty: Party = partyCount.R >= partyCount.D
      ? (partyCount.R > 0 ? 'R' : 'I')
      : 'D';

    const industryTotals = new Map<string, number>();
    for (const p of pols) {
      for (const d of p.donations) {
        industryTotals.set(d.industryId, (industryTotals.get(d.industryId) ?? 0) + d.amount);
      }
    }
    const topIndustries = [...industryTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id, total]) => ({ name: industryMap.get(id)?.name ?? id, total }));

    result.set(state, { politicians: pols, totalDonations, dominantParty, topIndustries });
  }
  return result;
}

/** Scale a GeoJSON feature's coordinates around its centroid */
function scaleFeature(feature: any, factor: number): any {
  const [cLon, cLat] = d3.geoCentroid(feature);
  function scaleCoord(coord: [number, number]): [number, number] {
    return [
      cLon + (coord[0] - cLon) * factor,
      cLat + (coord[1] - cLat) * factor,
    ];
  }
  function scaleRing(ring: [number, number][]): [number, number][] {
    return ring.map(scaleCoord);
  }
  function scalePolygon(polygon: [number, number][][]): [number, number][][] {
    return polygon.map(scaleRing);
  }
  const geo = feature.geometry;
  let newCoords: any;
  if (geo.type === 'Polygon') {
    newCoords = scalePolygon(geo.coordinates);
  } else if (geo.type === 'MultiPolygon') {
    newCoords = geo.coordinates.map(scalePolygon);
  } else {
    return feature;
  }
  return { ...feature, geometry: { ...geo, coordinates: newCoords } };
}

/** Translate a GeoJSON feature's coordinates by [dLon, dLat] */
function translateFeature(feature: any, dLon: number, dLat: number): any {
  function moveCoord(coord: [number, number]): [number, number] {
    return [coord[0] + dLon, coord[1] + dLat];
  }
  function moveRing(ring: [number, number][]): [number, number][] {
    return ring.map(moveCoord);
  }
  function movePolygon(polygon: [number, number][][]): [number, number][][] {
    return polygon.map(moveRing);
  }
  const geo = feature.geometry;
  let newCoords: any;
  if (geo.type === 'Polygon') {
    newCoords = movePolygon(geo.coordinates);
  } else if (geo.type === 'MultiPolygon') {
    newCoords = geo.coordinates.map(movePolygon);
  } else {
    return feature;
  }
  return { ...feature, geometry: { ...geo, coordinates: newCoords } };
}

/** Blend a hex color toward white by `amount` (0–1) */
function lightenColor(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);
  return `rgb(${lr},${lg},${lb})`;
}

export function USMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ width: 960, height: 540 });
  const [hoveredState, setHoveredState] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [topoData, setTopoData] = useState<any>(null);
  const [rotationTick, setRotationTick] = useState(0);
  const { setSelectedPoliticianId, setSelectedState, statusFilter } = useAppContext();

  const rotationRef = useRef<[number, number, number]>([83, -38, 0]);
  const zoomRef = useRef(1.0); // 1.0 = default zoom
  // Track previous hover for smooth canvas transition
  const prevHoverRef = useRef<string | null>(null);
  const hoverAnimRef = useRef<number>(0);
  const filteredPoliticians = useMemo(() => {
    if (statusFilter === 'all') return politicians;
    return politicians.filter((p) => p.status === statusFilter);
  }, [statusFilter]);
  const stateData = useMemo(() => computeStateData(filteredPoliticians), [filteredPoliticians]);
  const maxDonations = useMemo(
    () => Math.max(...[...stateData.values()].map((s) => s.totalDonations)),
    [stateData]
  );

  // Load topology
  useEffect(() => {
    import('us-atlas/states-10m.json').then((data) => {
      setTopoData(data.default ?? data);
    });
  }, []);

  // Responsive sizing
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      const ratio = w < 640 ? 0.75 : 0.55;
      setDims({ width: w, height: w * ratio });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Derived geo data — all states, plus conus for fitting
  const geoData = useMemo(() => {
    if (!topoData) return null;
    const states = topojson.feature(topoData, topoData.objects.states) as any;
    const mesh = topojson.mesh(topoData, topoData.objects.states, (a: any, b: any) => a !== b);
    const conus = {
      type: 'FeatureCollection' as const,
      features: states.features.filter((f: any) => f.id !== '02' && f.id !== '15'),
    };
    // Scale up Hawaii and move it closer (below-left of contiguous US)
    // Scale up small east coast states so they're more visible
    const scaledStates = {
      ...states,
      features: states.features.map((f: any) => {
        if (f.id === '15') return translateFeature(scaleFeature(f, 3), 30, 7);       // Hawaii: bigger + closer
        if (f.id === '02') return translateFeature(scaleFeature(f, 0.35), 18, -22);  // Alaska: 35% size, below-left of WA
        return f;
      }),
    };
    return { states: scaledStates, mesh, conus };
  }, [topoData]);

  // Build projection — fit to contiguous 48, zoomed in and centered
  const buildProjection = useCallback((width: number, height: number, rotation: [number, number, number], zoom?: number) => {
    const z = zoom ?? zoomRef.current;
    const projection = d3.geoOrthographic()
      .rotate(rotation)
      .clipAngle(110);
    if (geoData) {
      projection.fitSize([width, height], geoData.conus);
      const baseScale = projection.scale();
      projection.scale(baseScale * 1.6 * z);
      projection.translate([width * 0.63, height * 0.50]);
    }
    return projection;
  }, [geoData]);

  // Get state fill/opacity with hover brightness boost
  const getStateFill = useCallback((abbr: string | undefined, hoverProgress: number) => {
    const data = abbr ? stateData.get(abbr) : null;
    let fill = '#1a1a2e';
    let opacity = 0.3;
    if (data) {
      fill = partyColors[data.dominantParty];
      opacity = 0.25 + (data.totalDonations / maxDonations) * 0.55;
    }
    // Smooth hover: interpolate brightness and opacity
    if (hoverProgress > 0) {
      fill = lightenColor(fill, hoverProgress * 0.2);
      opacity = Math.min(opacity + hoverProgress * 0.25, 1);
    }
    return { fill, opacity };
  }, [stateData, maxDonations]);

  // Canvas draw function
  const drawGlobe = useCallback((
    currentHoveredState: string | null,
    currentRotation?: [number, number, number],
    hoverProgress = 1,
  ) => {
    const canvas = canvasRef.current;
    if (!canvas || !geoData) return;

    const rotation = currentRotation ?? rotationRef.current;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = dims.width * dpr;
    canvas.height = dims.height * dpr;
    canvas.style.width = `${dims.width}px`;
    canvas.style.height = `${dims.height}px`;

    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    const projection = buildProjection(dims.width, dims.height, rotation);
    const path = d3.geoPath(projection, ctx);
    const globeRadius = projection.scale();
    const [cx, cy] = projection.translate();

    // 1. Clear background
    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(0, 0, dims.width, dims.height);

    // 2. Drop shadow under globe
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 8;
    ctx.beginPath();
    ctx.arc(cx, cy, globeRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#0d1525';
    ctx.fill();
    ctx.restore();

    // 3. Ocean sphere — distinct from background
    ctx.beginPath();
    path({ type: 'Sphere' } as any);
    ctx.fillStyle = '#0d1525';
    ctx.fill();

    // 4. Graticule — more visible
    const graticule = d3.geoGraticule10();
    ctx.beginPath();
    path(graticule);
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // 5. State fills — all states on globe
    for (const feature of geoData.states.features) {
      const fips = feature.id;
      const abbr = fipsToState[fips];
      const isHovered = currentHoveredState === abbr;
      const hp = isHovered ? hoverProgress : 0;
      const { fill, opacity } = getStateFill(abbr, hp);

      ctx.beginPath();
      path(feature);
      ctx.globalAlpha = opacity;
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // 6. State borders — lighter for better differentiation
    ctx.beginPath();
    path(geoData.mesh);
    ctx.strokeStyle = 'rgba(200,200,220,0.18)';
    ctx.lineWidth = 0.75;
    ctx.stroke();

    // 7. Hovered state highlight — white stroke
    if (currentHoveredState && hoverProgress > 0) {
      for (const feature of geoData.states.features) {
        const abbr = fipsToState[feature.id];
        if (abbr === currentHoveredState) {
          ctx.beginPath();
          path(feature);
          ctx.strokeStyle = `rgba(255,255,255,${0.7 * hoverProgress})`;
          ctx.lineWidth = 2;
          ctx.stroke();
          break;
        }
      }
    }

    // 8. Atmosphere glow — multi-layer for realism
    // Inner glow
    const glow1 = ctx.createRadialGradient(cx, cy, globeRadius * 0.97, cx, cy, globeRadius * 1.08);
    glow1.addColorStop(0, 'rgba(80,140,255,0)');
    glow1.addColorStop(0.4, 'rgba(80,140,255,0.12)');
    glow1.addColorStop(1, 'rgba(80,140,255,0)');
    ctx.beginPath();
    ctx.arc(cx, cy, globeRadius * 1.08, 0, Math.PI * 2);
    ctx.fillStyle = glow1;
    ctx.fill();

    // Outer glow
    const glow2 = ctx.createRadialGradient(cx, cy, globeRadius * 1.0, cx, cy, globeRadius * 1.25);
    glow2.addColorStop(0, 'rgba(60,120,255,0)');
    glow2.addColorStop(0.3, 'rgba(60,120,255,0.06)');
    glow2.addColorStop(0.7, 'rgba(60,120,255,0.03)');
    glow2.addColorStop(1, 'rgba(60,120,255,0)');
    ctx.beginPath();
    ctx.arc(cx, cy, globeRadius * 1.25, 0, Math.PI * 2);
    ctx.fillStyle = glow2;
    ctx.fill();

    // Rim light along the globe edge
    ctx.beginPath();
    ctx.arc(cx, cy, globeRadius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(100,160,255,0.15)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, [geoData, dims, buildProjection, getStateFill]);

  // Smooth hover transition via animation frames
  useEffect(() => {
    if (hoveredState === prevHoverRef.current) return;

    cancelAnimationFrame(hoverAnimRef.current);
    const duration = 150;
    const start = performance.now();
    const from = prevHoverRef.current;
    const to = hoveredState;
    prevHoverRef.current = hoveredState;

    const animate = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      // Ease in-out
      const progress = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      // Draw with transition: outgoing state fades out, incoming fades in
      const canvas = canvasRef.current;
      if (!canvas || !geoData) return;

      const rotation = rotationRef.current;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = dims.width * dpr;
      canvas.height = dims.height * dpr;
      canvas.style.width = `${dims.width}px`;
      canvas.style.height = `${dims.height}px`;

      const ctx = canvas.getContext('2d')!;
      ctx.scale(dpr, dpr);

      const projection = buildProjection(dims.width, dims.height, rotation);
      const path = d3.geoPath(projection, ctx);
      const globeRadius = projection.scale();
      const [cx, cy] = projection.translate();

      // Background
      ctx.fillStyle = '#0a0a12';
      ctx.fillRect(0, 0, dims.width, dims.height);

      // Drop shadow
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 40;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 8;
      ctx.beginPath();
      ctx.arc(cx, cy, globeRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#0d1525';
      ctx.fill();
      ctx.restore();

      // Ocean
      ctx.beginPath();
      path({ type: 'Sphere' } as any);
      ctx.fillStyle = '#0d1525';
      ctx.fill();

      // Graticule
      const graticule = d3.geoGraticule10();
      ctx.beginPath();
      path(graticule);
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // State fills with animated hover
      for (const feature of geoData.states.features) {
        const fips = feature.id;
        const abbr = fipsToState[fips];
        let hp = 0;
        if (abbr === to) hp = progress;
        else if (abbr === from) hp = 1 - progress;

        const { fill, opacity } = getStateFill(abbr, hp);
        ctx.beginPath();
        path(feature);
        ctx.globalAlpha = opacity;
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Borders
      ctx.beginPath();
      path(geoData.mesh);
      ctx.strokeStyle = 'rgba(200,200,220,0.18)';
      ctx.lineWidth = 0.75;
      ctx.stroke();

      // Hover highlight — animate stroke in/out
      const drawHighlight = (abbr: string, alpha: number) => {
        if (alpha <= 0) return;
        for (const feature of geoData.states.features) {
          if (fipsToState[feature.id] === abbr) {
            ctx.beginPath();
            path(feature);
            ctx.strokeStyle = `rgba(255,255,255,${0.7 * alpha})`;
            ctx.lineWidth = 2;
            ctx.stroke();
            break;
          }
        }
      };
      if (to) drawHighlight(to, progress);
      if (from) drawHighlight(from, 1 - progress);

      // Atmosphere glow
      const glow1 = ctx.createRadialGradient(cx, cy, globeRadius * 0.97, cx, cy, globeRadius * 1.08);
      glow1.addColorStop(0, 'rgba(80,140,255,0)');
      glow1.addColorStop(0.4, 'rgba(80,140,255,0.12)');
      glow1.addColorStop(1, 'rgba(80,140,255,0)');
      ctx.beginPath();
      ctx.arc(cx, cy, globeRadius * 1.08, 0, Math.PI * 2);
      ctx.fillStyle = glow1;
      ctx.fill();

      const glow2 = ctx.createRadialGradient(cx, cy, globeRadius * 1.0, cx, cy, globeRadius * 1.25);
      glow2.addColorStop(0, 'rgba(60,120,255,0)');
      glow2.addColorStop(0.3, 'rgba(60,120,255,0.06)');
      glow2.addColorStop(0.7, 'rgba(60,120,255,0.03)');
      glow2.addColorStop(1, 'rgba(60,120,255,0)');
      ctx.beginPath();
      ctx.arc(cx, cy, globeRadius * 1.25, 0, Math.PI * 2);
      ctx.fillStyle = glow2;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, globeRadius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(100,160,255,0.15)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      if (t < 1) {
        hoverAnimRef.current = requestAnimationFrame(animate);
      }
    };

    hoverAnimRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(hoverAnimRef.current);
  }, [hoveredState, geoData, dims, buildProjection, getStateFill]);

  // Initial draw + redraw on data/dims changes (not hover — that's animated above)
  useEffect(() => {
    drawGlobe(hoveredState);
  }, [drawGlobe]);

  // Drag-to-rotate
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !geoData) return;

    const sensitivity = 0.15;
    const drag = d3.drag<HTMLCanvasElement, unknown>()
      .on('drag', (event) => {
        const [lam, phi, gamma] = rotationRef.current;
        const newLam = Math.max(83 - 15, Math.min(83 + 15, lam - event.dx * sensitivity));
        const newPhi = Math.max(-38 - 15, Math.min(-38 + 15, phi + event.dy * sensitivity));
        rotationRef.current = [newLam, newPhi, gamma];
        drawGlobe(hoveredState, rotationRef.current);
        setRotationTick((t) => t + 1);
      });

    d3.select(canvas).call(drag as any);
    return () => {
      d3.select(canvas).on('.drag', null);
    };
  }, [geoData, drawGlobe, hoveredState]);

  // Scroll-to-zoom (zoom in freely, zoom out limited)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !geoData) return;

    const MIN_ZOOM = 0.9;  // can barely zoom out past default
    const MAX_ZOOM = 3.0;  // can zoom in a lot

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = -e.deltaY * 0.001;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomRef.current * (1 + delta)));
      zoomRef.current = newZoom;
      drawGlobe(hoveredState, rotationRef.current);
      setRotationTick((t) => t + 1);
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [geoData, drawGlobe, hoveredState]);

  // Keyboard pan (WASD / arrow keys) + zoom (+/-)
  const PAN_SPEED = 3;
  const ZOOM_STEP = 0.15;
  const MIN_ZOOM = 0.9;
  const MAX_ZOOM = 3.0;

  const nudgeRotation = useCallback((dLon: number, dLat: number) => {
    const [lam, phi, gamma] = rotationRef.current;
    rotationRef.current = [lam + dLon, Math.max(-80, Math.min(20, phi + dLat)), gamma];
    drawGlobe(hoveredState, rotationRef.current);
    setRotationTick((t) => t + 1);
  }, [drawGlobe, hoveredState]);

  const nudgeZoom = useCallback((delta: number) => {
    zoomRef.current = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomRef.current + delta));
    drawGlobe(hoveredState, rotationRef.current);
    setRotationTick((t) => t + 1);
  }, [drawGlobe, hoveredState]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case 'ArrowLeft': case 'a': case 'A': nudgeRotation(PAN_SPEED, 0); break;
        case 'ArrowRight': case 'd': case 'D': nudgeRotation(-PAN_SPEED, 0); break;
        case 'ArrowUp': case 'w': case 'W': nudgeRotation(0, PAN_SPEED); break;
        case 'ArrowDown': case 's': case 'S': nudgeRotation(0, -PAN_SPEED); break;
        case '=': case '+': nudgeZoom(ZOOM_STEP); break;
        case '-': case '_': nudgeZoom(-ZOOM_STEP); break;
        default: return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nudgeRotation, nudgeZoom]);

  // Hit detection
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!geoData) return;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const projection = buildProjection(dims.width, dims.height, rotationRef.current);
    const coords = projection.invert?.([x, y]);
    if (!coords) {
      setHoveredState(null);
      canvas.style.cursor = 'default';
      return;
    }

    let found: string | null = null;
    for (const feature of geoData.states.features) {
      if (d3.geoContains(feature, coords)) {
        const abbr = fipsToState[feature.id];
        if (abbr) { found = abbr; break; }
      }
    }

    setHoveredState(found);
    canvas.style.cursor = found && stateData.has(found) ? 'pointer' : 'default';
    setMousePos({ x: e.clientX, y: e.clientY });
  }, [geoData, dims, buildProjection, stateData]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!geoData) return;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const projection = buildProjection(dims.width, dims.height, rotationRef.current);
    const coords = projection.invert?.([x, y]);
    if (!coords) return;

    for (const feature of geoData.states.features) {
      if (d3.geoContains(feature, coords)) {
        const abbr = fipsToState[feature.id];
        const data = abbr ? stateData.get(abbr) : null;
        if (abbr && data) {
          if (data.politicians.length === 1) {
            setSelectedPoliticianId(data.politicians[0].id);
          } else {
            setSelectedState(abbr);
          }
        }
        break;
      }
    }
  }, [geoData, dims, buildProjection, stateData, setSelectedPoliticianId, setSelectedState]);

  // Small east coast states get labels offset to the right with leader lines
  const leaderLineStates: Record<string, { dx: number; dy: number }> = {
    'VT': { dx: 45, dy: -12 },
    'NH': { dx: 50, dy: -4 },
    'MA': { dx: 55, dy: 4 },
    'RI': { dx: 55, dy: 12 },
    'CT': { dx: 50, dy: 20 },
    'NJ': { dx: 45, dy: 4 },
    'DE': { dx: 45, dy: 12 },
    'MD': { dx: 50, dy: 20 },
    'DC': { dx: 55, dy: 28 },
  };

  // Compute label positions for SVG overlay
  const labelPositions = useMemo(() => {
    if (!geoData) return [];
    const projection = buildProjection(dims.width, dims.height, rotationRef.current);
    const labels: { abbr: string; x: number; y: number; ox: number; oy: number; hasLeader: boolean }[] = [];

    for (const feature of geoData.states.features) {
      const fips = feature.id;
      const abbr = fipsToState[fips];
      if (!abbr || !stateData.has(abbr)) continue;

      const centroid = d3.geoCentroid(feature);
      const projected = projection(centroid);
      if (!projected) continue;

      // Check if on visible hemisphere
      const center = projection.invert!(projection.translate());
      if (!center) continue;
      const dist = d3.geoDistance(centroid, center);
      if (dist > Math.PI / 2) continue;

      const leader = leaderLineStates[abbr];
      if (leader) {
        labels.push({ abbr, x: projected[0], y: projected[1], ox: projected[0] + leader.dx, oy: projected[1] + leader.dy, hasLeader: true });
      } else {
        labels.push({ abbr, x: projected[0], y: projected[1], ox: projected[0], oy: projected[1], hasLeader: false });
      }
    }
    return labels;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoData, dims, buildProjection, stateData, rotationTick]);

  if (!topoData) return <div className="px-6 pb-6 text-[#555]">Loading map...</div>;

  const hoveredData = hoveredState ? stateData.get(hoveredState) : null;

  return (
    <div ref={containerRef} className="px-6 pb-6 flex-1">
      <div style={{ position: 'relative', width: dims.width, height: dims.height }}>
        {/* Canvas globe */}
        <canvas
          ref={canvasRef}
          className="rounded-lg"
          style={{ display: 'block' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => {
            setHoveredState(null);
            if (canvasRef.current) canvasRef.current.style.cursor = 'default';
          }}
          onClick={handleClick}
        />

        {/* SVG label overlay */}
        <svg
          width={dims.width}
          height={dims.height}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            pointerEvents: 'none',
          }}
        >
          {/* Text shadow filter for readability */}
          <defs>
            <filter id="label-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#000" floodOpacity="0.8" />
            </filter>
          </defs>
          {labelPositions.map(({ abbr, x, y, ox, oy, hasLeader }) => (
            <g key={abbr}>
              {hasLeader && (
                <>
                  <line x1={x} y1={y} x2={ox} y2={oy} stroke="rgba(255,255,255,0.25)" strokeWidth={0.75} />
                  <circle cx={x} cy={y} r={2} fill="rgba(255,255,255,0.4)" />
                </>
              )}
              <text
                x={ox}
                y={oy}
                textAnchor={hasLeader ? 'start' : 'middle'}
                dx={hasLeader ? 4 : 0}
                dominantBaseline="central"
                fontSize={dims.width > 800 ? 10 : 8}
                fontWeight={600}
                fill="#e0e0e8"
                filter="url(#label-shadow)"
                style={{ pointerEvents: 'none' }}
              >
                {abbr}
              </text>
            </g>
          ))}
        </svg>

        {/* Nav pill */}
        <div
          style={{
            position: 'absolute',
            bottom: 16,
            left: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            background: 'rgba(255,255,255,0.12)',
            backdropFilter: 'blur(12px)',
            borderRadius: 999,
            padding: '4px 6px',
            border: '1px solid rgba(255,255,255,0.15)',
          }}
        >
          <NavButton label="−" onClick={() => nudgeZoom(-ZOOM_STEP)} />
          <NavButton label="←" onClick={() => nudgeRotation(PAN_SPEED, 0)} />
          <NavButton label="↑" onClick={() => nudgeRotation(0, -PAN_SPEED)} />
          <NavButton label="↓" onClick={() => nudgeRotation(0, PAN_SPEED)} />
          <NavButton label="→" onClick={() => nudgeRotation(-PAN_SPEED, 0)} />
          <NavButton label="+" onClick={() => nudgeZoom(ZOOM_STEP)} />
        </div>
      </div>

      {/* Tooltip */}
      {hoveredState && hoveredData && (
        <MapTooltip
          x={mousePos.x}
          y={mousePos.y}
          state={hoveredState}
          data={hoveredData}
        />
      )}
    </div>
  );
}

function MapTooltip({ x, y, state, data }: {
  x: number;
  y: number;
  state: string;
  data: StateData;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const w = 340;

  const sortByDonations = (a: Politician, b: Politician) => {
    const totalA = a.donations.reduce((s, d) => s + d.amount, 0);
    const totalB = b.donations.reduce((s, d) => s + d.amount, 0);
    return totalB - totalA;
  };

  const allSenators = data.politicians.filter((p) => p.chamber === 'Senate').sort(sortByDonations);
  const allReps = data.politicians.filter((p) => p.chamber === 'House').sort(sortByDonations);
  const senators = allSenators.slice(0, 5);
  const reps = allReps.slice(0, 10);
  const hiddenSenators = allSenators.length - senators.length;
  const hiddenReps = allReps.length - reps.length;

  const tooltipHeight = ref.current?.offsetHeight ?? 400;
  let left = x + 16;
  if (left + w + 8 > window.innerWidth) left = x - w - 16;
  if (left < 8) left = 8;
  let top = y - 12;
  if (top + tooltipHeight + 8 > window.innerHeight) top = window.innerHeight - tooltipHeight - 8;
  if (top < 8) top = 8;

  return (
    <div
      ref={ref}
      className="fixed z-50 rounded-lg px-4 py-3 pointer-events-none overflow-y-auto"
      style={{
        left,
        top,
        width: w,
        maxHeight: window.innerHeight - 16,
        background: 'linear-gradient(135deg, rgba(18,18,28,0.97), rgba(12,12,22,0.97))',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div className="text-sm font-semibold text-white mb-1">
        {stateNames[state] ?? state}
      </div>
      <div className="text-xs text-[#888894] mb-2">
        {data.politicians.length} politician{data.politicians.length !== 1 ? 's' : ''} tracked · {formatDollars(data.totalDonations)} total donations
      </div>

      {senators.length > 0 && (
        <div className="mb-2">
          <div className="text-[10px] text-[#555] uppercase tracking-wide mb-1">Senators</div>
          {senators.map((p) => (
            <div key={p.id} className="flex items-center gap-2 text-xs mb-0.5">
              <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: partyColors[p.party] }} />
              <span className="text-[#e0e0e8] truncate">{p.name}</span>
              <span className="text-[#888894] tabular-nums shrink-0 ml-auto">{formatDollars(p.donations.reduce((s, d) => s + d.amount, 0))}</span>
            </div>
          ))}
          {hiddenSenators > 0 && <div className="text-[10px] text-[#555] mt-0.5">+{hiddenSenators} more</div>}
        </div>
      )}

      {reps.length > 0 && (
        <div className="mb-2">
          <div className="text-[10px] text-[#555] uppercase tracking-wide mb-1">Representatives</div>
          {reps.map((p) => (
            <div key={p.id} className="flex items-center gap-2 text-xs mb-0.5">
              <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: partyColors[p.party] }} />
              <span className="text-[#e0e0e8] truncate">{p.name}</span>
              <span className="text-[#888894] tabular-nums shrink-0 ml-auto">{formatDollars(p.donations.reduce((s, d) => s + d.amount, 0))}</span>
            </div>
          ))}
          {hiddenReps > 0 && <div className="text-[10px] text-[#555] mt-0.5">+{hiddenReps} more — click to see all</div>}
        </div>
      )}

      {data.topIndustries.length > 0 && (
        <div>
          <div className="text-[10px] text-[#555] uppercase tracking-wide mb-1">Top Industries</div>
          {data.topIndustries.map((ind) => (
            <div key={ind.name} className="flex items-center justify-between text-xs mb-0.5">
              <span className="text-[#888894]">{ind.name}</span>
              <span className="text-[#e0e0e8] tabular-nums">{formatDollars(ind.total)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NavButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 28,
        height: 28,
        borderRadius: 999,
        border: 'none',
        background: 'transparent',
        color: 'rgba(255,255,255,0.85)',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 150ms',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      {label}
    </button>
  );
}
