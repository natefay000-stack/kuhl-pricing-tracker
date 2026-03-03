'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  ShoppingBag,
  Warehouse,
  Package,
  Users,
  Calendar,
  LayoutDashboard,
  GitCompare,
  Trophy,
  Palette,
  List,
  TrendingUp,
  DollarSign,
  FileText,
  AlertTriangle,
  Percent,
  ZoomIn,
  ZoomOut,
  Home,
  X,
  Map,
  ChevronRight,
  ChevronLeft,
  LucideIcon,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────

type NodeType = 'source' | 'entity' | 'page' | 'output';
type ColorClass = 'green' | 'blue' | 'orange' | 'purple' | 'red' | 'cyan' | 'gray';

interface FlowNode {
  id: string;
  title: string;
  type: NodeType;
  icon: LucideIcon;
  colorClass: ColorClass;
  x: number;
  y: number;
  fields: string[];
  flowsTo: string[];
  flowsFrom: string[];
}

interface Connection {
  from: string;
  to: string;
}

// ── Constants ──────────────────────────────────────────────────────

const CANVAS_W = 3000;
const CANVAS_H = 2000;
const NODE_W = 260;
const NODE_H = 72;
const DEFAULT_ZOOM = 0.55;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.0;
const ZOOM_STEP = 0.1;
const PAN_THRESHOLD = 5;

const COLOR_STYLES: Record<ColorClass, { bg: string; border: string; text: string; iconBg: string }> = {
  green:  { bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.35)',  text: '#34d399', iconBg: 'rgba(16,185,129,0.15)' },
  blue:   { bg: 'rgba(59,130,246,0.08)',   border: 'rgba(59,130,246,0.35)',  text: '#60a5fa', iconBg: 'rgba(59,130,246,0.15)' },
  orange: { bg: 'rgba(249,115,22,0.08)',   border: 'rgba(249,115,22,0.35)',  text: '#fb923c', iconBg: 'rgba(249,115,22,0.15)' },
  purple: { bg: 'rgba(168,85,247,0.08)',   border: 'rgba(168,85,247,0.35)',  text: '#c084fc', iconBg: 'rgba(168,85,247,0.15)' },
  red:    { bg: 'rgba(239,68,68,0.08)',    border: 'rgba(239,68,68,0.35)',   text: '#f87171', iconBg: 'rgba(239,68,68,0.15)' },
  cyan:   { bg: 'rgba(6,182,212,0.08)',    border: 'rgba(6,182,212,0.35)',   text: '#22d3ee', iconBg: 'rgba(6,182,212,0.15)' },
  gray:   { bg: 'rgba(148,163,184,0.06)',  border: 'rgba(148,163,184,0.25)', text: '#94a3b8', iconBg: 'rgba(148,163,184,0.10)' },
};

const TYPE_LABELS: Record<NodeType, string> = {
  source: 'Data Source',
  entity: 'Core Entity',
  page: 'App Page',
  output: 'Output',
};

// ── Node Data ──────────────────────────────────────────────────────

function buildNodes(): FlowNode[] {
  // Column centers
  const COL = { sources: 150, entities: 850, pages: 1600, outputs: 2500 };

  // Y positions per column (centered on canvas)
  const srcY = (i: number) => 300 + i * 220;
  const entY = (i: number) => 300 + i * 220;
  const pgY  = (i: number) => 100 + i * 150;
  const outY = (i: number) => 550 + i * 300;

  const nodes: Omit<FlowNode, 'flowsFrom'>[] = [
    // ── Data Sources ──
    { id: 'sales-data',     title: 'Sales Data',      type: 'source', icon: ShoppingBag,    colorClass: 'green',  x: COL.sources, y: srcY(0), fields: ['Revenue', 'Units Booked', 'Units Open', 'Customer', 'Season', 'Style Number', 'Color Code', 'Customer Type'], flowsTo: ['order', 'style', 'customer', 'season'] },
    { id: 'inventory-data', title: 'Inventory Data',   type: 'source', icon: Warehouse,      colorClass: 'blue',   x: COL.sources, y: srcY(1), fields: ['On-Hand Qty', 'Movement Type', 'Warehouse', 'Period', 'Extension Value', 'Size'], flowsTo: ['inventory'] },
    { id: 'product-master', title: 'Product Master',   type: 'source', icon: Package,        colorClass: 'purple', x: COL.sources, y: srcY(2), fields: ['Style Number', 'Description', 'Category', 'Division', 'Gender', 'Designer', 'Season'], flowsTo: ['style', 'season'] },
    { id: 'customer-data',  title: 'Customer Data',    type: 'source', icon: Users,          colorClass: 'orange', x: COL.sources, y: srcY(3), fields: ['Customer Name', 'Customer Type', 'Discount Tier', 'Region', 'Sales Rep', 'Payment Terms'], flowsTo: ['customer'] },
    { id: 'planning-data',  title: 'Planning Data',    type: 'source', icon: Calendar,       colorClass: 'purple', x: COL.sources, y: srcY(4), fields: ['Season Plan', 'MSRP', 'Wholesale Price', 'Landed Cost', 'Factory', 'Country of Origin'], flowsTo: ['style', 'season'] },

    // ── Core Entities ──
    { id: 'style',     title: 'Style',      type: 'entity', icon: Package,   colorClass: 'purple', x: COL.entities, y: entY(0), fields: ['Style Number', 'Description', 'Category', 'Division', 'Designer', 'Gender', 'MSRP', 'Wholesale'], flowsTo: ['page-dashboard', 'page-season', 'page-sales', 'page-products', 'page-pricing', 'page-linelist', 'page-topstyles', 'page-stylecolor'] },
    { id: 'customer',  title: 'Customer',   type: 'entity', icon: Users,     colorClass: 'orange', x: COL.entities, y: entY(1), fields: ['Customer Name', 'Type', 'Tier', 'Region', 'Territory', 'Active Since'], flowsTo: ['page-customers', 'page-sales', 'page-topstyles'] },
    { id: 'order',     title: 'Order',      type: 'entity', icon: ShoppingBag, colorClass: 'green', x: COL.entities, y: entY(2), fields: ['Revenue', 'Units Booked', 'Net Price', 'Season', 'Channel', 'Status'], flowsTo: ['page-dashboard', 'page-season', 'page-seasoncomp', 'page-sales', 'page-margins'] },
    { id: 'inventory', title: 'Inventory',  type: 'entity', icon: Warehouse, colorClass: 'blue',   x: COL.entities, y: entY(3), fields: ['On-Hand Qty', 'Movements', 'Warehouse', 'Extension Value', 'Size Breakdown'], flowsTo: ['page-inventory'] },
    { id: 'season',    title: 'Season',     type: 'entity', icon: Calendar,  colorClass: 'cyan',   x: COL.entities, y: entY(4), fields: ['Season Code', 'Status', 'Date Range', 'Style Count', 'Revenue Total'], flowsTo: ['page-season', 'page-seasoncomp', 'page-dashboard'] },

    // ── Pages ──
    { id: 'page-dashboard',  title: 'Dashboard',        type: 'page', icon: LayoutDashboard, colorClass: 'gray', x: COL.pages, y: pgY(0),  fields: ['Total Revenue', 'Total Units', 'Inventory Value', 'Active Customers', 'Margin %'], flowsTo: ['output-reports', 'output-decisions'] },
    { id: 'page-season',     title: 'Season View',      type: 'page', icon: Calendar,        colorClass: 'gray', x: COL.pages, y: pgY(1),  fields: ['Season Revenue', 'Season Comparison', 'Margin', 'vs Plan', 'Category Breakdown'], flowsTo: ['output-reports', 'output-decisions'] },
    { id: 'page-seasoncomp', title: 'Season Comp',      type: 'page', icon: GitCompare,      colorClass: 'gray', x: COL.pages, y: pgY(2),  fields: ['YoY Revenue', 'YoY Units', 'Margin Change', 'Customer Changes', 'Style Changes'], flowsTo: ['output-reports', 'output-decisions'] },
    { id: 'page-sales',      title: 'Sales Analysis',   type: 'page', icon: ShoppingBag,     colorClass: 'gray', x: COL.pages, y: pgY(3),  fields: ['Revenue by Style', 'Revenue by Category', 'Revenue by Channel', 'Margin by Style'], flowsTo: ['output-reports', 'output-decisions'] },
    { id: 'page-inventory',  title: 'Inventory',        type: 'page', icon: Warehouse,       colorClass: 'gray', x: COL.pages, y: pgY(4),  fields: ['Stock by Style', 'Size Matrix', 'Weeks of Supply', 'Sell-Through %'], flowsTo: ['output-reports', 'output-alerts'] },
    { id: 'page-stylecolor', title: 'Style/Color Perf', type: 'page', icon: Palette,         colorClass: 'gray', x: COL.pages, y: pgY(5),  fields: ['Color Revenue', 'New/Drop Colors', 'YoY by Color', 'Style Trends'], flowsTo: ['output-reports', 'output-decisions'] },
    { id: 'page-customers',  title: 'Customers',        type: 'page', icon: Users,           colorClass: 'gray', x: COL.pages, y: pgY(6),  fields: ['Customer List', 'Revenue per Customer', 'Margin per Customer', 'Top Styles'], flowsTo: ['output-reports', 'output-decisions'] },
    { id: 'page-topstyles',  title: 'Top Styles',       type: 'page', icon: Trophy,          colorClass: 'gray', x: COL.pages, y: pgY(7),  fields: ['Top 10 by Channel', 'F27 Status', 'Channel Gaps', 'Consistency Score'], flowsTo: ['output-reports', 'output-decisions'] },
    { id: 'page-products',   title: 'Style Master',     type: 'page', icon: Package,         colorClass: 'gray', x: COL.pages, y: pgY(8),  fields: ['All Styles', 'Pricing', 'Categories', 'Season Status', 'Designer'], flowsTo: ['output-reports'] },
    { id: 'page-pricing',    title: 'Pricing',          type: 'page', icon: DollarSign,      colorClass: 'gray', x: COL.pages, y: pgY(9),  fields: ['MSRP', 'Wholesale', 'Landed Cost', 'Margin Analysis', 'Price Changes'], flowsTo: ['output-reports', 'output-decisions', 'output-alerts'] },
    { id: 'page-margins',    title: 'Margins',          type: 'page', icon: Percent,         colorClass: 'gray', x: COL.pages, y: pgY(10), fields: ['Margin by Style', 'Margin by Channel', 'Margin Tiers', 'Cost vs Revenue'], flowsTo: ['output-reports', 'output-alerts'] },
    { id: 'page-linelist',   title: 'Line List',        type: 'page', icon: List,            colorClass: 'gray', x: COL.pages, y: pgY(11), fields: ['Full Line Plan', 'Season Styles', 'Pricing Grid', 'Status Tracking'], flowsTo: ['output-reports'] },

    // ── Outputs ──
    { id: 'output-reports',   title: 'Reports',   type: 'output', icon: FileText,      colorClass: 'red', x: COL.outputs, y: outY(0), fields: ['Season Summary PDF', 'Price Lists Excel', 'Margin Analysis', 'Style Performance'], flowsTo: [] },
    { id: 'output-decisions', title: 'Decisions', type: 'output', icon: TrendingUp,    colorClass: 'red', x: COL.outputs, y: outY(1), fields: ['Pricing Strategy', 'Assortment Planning', 'Margin Optimization', 'Inventory Allocation'], flowsTo: [] },
    { id: 'output-alerts',    title: 'Alerts',    type: 'output', icon: AlertTriangle, colorClass: 'red', x: COL.outputs, y: outY(2), fields: ['Margin Below Target', 'Missing Cost Data', 'Price Changes Needed', 'Validation Errors'], flowsTo: [] },
  ];

  // Compute flowsFrom by inverting flowsTo
  const flowsFromMap: Record<string, string[]> = {};
  for (const n of nodes) {
    for (const to of n.flowsTo) {
      if (!flowsFromMap[to]) flowsFromMap[to] = [];
      flowsFromMap[to].push(n.id);
    }
  }

  return nodes.map(n => ({
    ...n,
    flowsFrom: flowsFromMap[n.id] || [],
  }));
}

const NODES: FlowNode[] = buildNodes();
const NODE_MAP: Record<string, FlowNode> = {};
for (const n of NODES) NODE_MAP[n.id] = n;

// Build all connections
const ALL_CONNECTIONS: Connection[] = [];
for (const n of NODES) {
  for (const to of n.flowsTo) {
    ALL_CONNECTIONS.push({ from: n.id, to });
  }
}

// ── Helpers ────────────────────────────────────────────────────────

function getBezierPath(fromX: number, fromY: number, toX: number, toY: number): string {
  const dx = Math.abs(toX - fromX);
  const cp = dx * 0.4;
  return `M ${fromX} ${fromY} C ${fromX + cp} ${fromY}, ${toX - cp} ${toY}, ${toX} ${toY}`;
}

function getConnectedIds(nodeId: string | null): Set<string> {
  if (!nodeId) return new Set();
  const node = NODE_MAP[nodeId];
  if (!node) return new Set();
  const ids = new Set<string>();
  ids.add(nodeId);
  for (const id of node.flowsTo) ids.add(id);
  for (const id of node.flowsFrom) ids.add(id);
  return ids;
}

function isConnectionHighlighted(conn: Connection, selectedId: string | null): boolean {
  if (!selectedId) return false;
  return conn.from === selectedId || conn.to === selectedId;
}

// ── Column labels ──────────────────────────────────────────────────

const COLUMN_LABELS = [
  { label: 'DATA SOURCES', x: 150 + NODE_W / 2, y: 220 },
  { label: 'CORE ENTITIES', x: 850 + NODE_W / 2, y: 220 },
  { label: 'PAGES', x: 1600 + NODE_W / 2, y: 30 },
  { label: 'OUTPUTS', x: 2500 + NODE_W / 2, y: 470 },
];

// ── Legend items ───────────────────────────────────────────────────

const LEGEND_ITEMS: { label: string; colorClass: ColorClass }[] = [
  { label: 'Sales / Revenue', colorClass: 'green' },
  { label: 'Inventory / Stock', colorClass: 'blue' },
  { label: 'Customer Data', colorClass: 'orange' },
  { label: 'Product / Planning', colorClass: 'purple' },
  { label: 'Season / Time', colorClass: 'cyan' },
  { label: 'App Pages', colorClass: 'gray' },
  { label: 'Pricing / Output', colorClass: 'red' },
];

// ── Component ──────────────────────────────────────────────────────

export default function DataFlowView() {
  // State
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [pan, setPan] = useState({ x: 100, y: 50 });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showLegend, setShowLegend] = useState(true);
  const [isPanning, setIsPanning] = useState(false);
  const [didPan, setDidPan] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);

  const selectedNode = selectedNodeId ? NODE_MAP[selectedNodeId] || null : null;
  const connectedIds = useMemo(() => getConnectedIds(selectedNodeId), [selectedNodeId]);

  // ── Pan handlers ─────────────────────────────────────────────────

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only pan on left button, and only on canvas/svg (not node cards)
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-node]')) return;
    setIsPanning(true);
    setDidPan(false);
    panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    e.preventDefault();
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    if (Math.abs(dx) > PAN_THRESHOLD || Math.abs(dy) > PAN_THRESHOLD) {
      setDidPan(true);
    }
    setPan({
      x: panStartRef.current.panX + dx,
      y: panStartRef.current.panY + dy,
    });
  }, [isPanning]);

  const handleMouseUp = useCallback(() => {
    if (isPanning && !didPan) {
      // Was a click on canvas background — deselect
      setSelectedNodeId(null);
    }
    setIsPanning(false);
  }, [isPanning, didPan]);

  // ── Zoom handlers ────────────────────────────────────────────────

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setZoom(prev => {
        const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev + delta));
        const scale = newZoom / prev;
        const rect = viewport.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        setPan(p => ({
          x: mx - scale * (mx - p.x),
          y: my - scale * (my - p.y),
        }));
        return newZoom;
      });
    };

    viewport.addEventListener('wheel', handleWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', handleWheel);
  }, []);

  const handleZoomIn = useCallback(() => setZoom(z => Math.min(MAX_ZOOM, z + ZOOM_STEP)), []);
  const handleZoomOut = useCallback(() => setZoom(z => Math.max(MIN_ZOOM, z - ZOOM_STEP)), []);
  const handleZoomReset = useCallback(() => {
    setZoom(DEFAULT_ZOOM);
    setPan({ x: 100, y: 50 });
  }, []);

  // ── Node click ───────────────────────────────────────────────────

  const handleNodeClick = useCallback((id: string) => {
    setSelectedNodeId(prev => prev === id ? null : id);
  }, []);

  const navigateToNode = useCallback((id: string) => {
    const node = NODE_MAP[id];
    if (!node) return;
    setSelectedNodeId(id);
    // Auto-pan to center the node in the viewport
    if (viewportRef.current) {
      const vw = viewportRef.current.clientWidth - (selectedNodeId ? 380 : 0);
      const vh = viewportRef.current.clientHeight;
      setPan({
        x: vw / 2 - (node.x + NODE_W / 2) * zoom,
        y: vh / 2 - (node.y + NODE_H / 2) * zoom,
      });
    }
  }, [zoom, selectedNodeId]);

  // ── Minimap click ────────────────────────────────────────────────

  const MINIMAP_W = 200;
  const MINIMAP_H = Math.round(MINIMAP_W * (CANVAS_H / CANVAS_W));
  const mmScale = MINIMAP_W / CANVAS_W;

  const handleMinimapClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / mmScale;
    const my = (e.clientY - rect.top) / mmScale;
    if (viewportRef.current) {
      const vw = viewportRef.current.clientWidth;
      const vh = viewportRef.current.clientHeight;
      setPan({
        x: -(mx * zoom - vw / 2),
        y: -(my * zoom - vh / 2),
      });
    }
  }, [zoom, mmScale]);

  // ── Viewport indicator for minimap ───────────────────────────────

  const vpIndicator = useMemo(() => {
    if (!viewportRef.current) return { x: 0, y: 0, w: MINIMAP_W, h: MINIMAP_H };
    const vw = viewportRef.current.clientWidth;
    const vh = viewportRef.current.clientHeight;
    return {
      x: (-pan.x / zoom) * mmScale,
      y: (-pan.y / zoom) * mmScale,
      w: (vw / zoom) * mmScale,
      h: (vh / zoom) * mmScale,
    };
  }, [pan, zoom, mmScale, MINIMAP_H]);

  // ── Render ───────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gray-50 dark:bg-[#0a0a0b]">
      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-5 py-3 border-b z-30 flex-shrink-0"
        style={{
          background: 'rgba(15,15,17,0.85)',
          backdropFilter: 'blur(12px) saturate(1.5)',
          borderColor: 'rgba(255,255,255,0.06)',
        }}
      >
        <div>
          <h2 className="text-xl font-semibold text-text-primary">Data Flow Map</h2>
          <p className="text-xs text-text-muted mt-0.5">How data flows through the KÜHL Pricing Tracker</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <div className="flex items-center gap-1 bg-surface-secondary rounded-lg px-1 py-0.5">
            <button onClick={handleZoomOut} className="p-1.5 rounded hover:bg-white/5 text-text-muted hover:text-text-primary transition-colors" title="Zoom out">
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs font-mono text-text-muted w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={handleZoomIn} className="p-1.5 rounded hover:bg-white/5 text-text-muted hover:text-text-primary transition-colors" title="Zoom in">
              <ZoomIn className="w-4 h-4" />
            </button>
            <div className="w-px h-5 bg-border-primary mx-0.5" />
            <button onClick={handleZoomReset} className="p-1.5 rounded hover:bg-white/5 text-text-muted hover:text-text-primary transition-colors" title="Reset view">
              <Home className="w-4 h-4" />
            </button>
          </div>
          {/* Legend toggle */}
          <button
            onClick={() => setShowLegend(p => !p)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${showLegend ? 'bg-cyan-500/15 text-cyan-400' : 'bg-surface-secondary text-text-muted hover:text-text-primary'}`}
          >
            <Map className="w-3.5 h-3.5" />
            Legend
          </button>
        </div>
      </div>

      {/* ── Viewport ── */}
      <div
        ref={viewportRef}
        className="flex-1 relative"
        style={{ cursor: isPanning ? 'grabbing' : 'grab', overflow: 'hidden' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Canvas */}
        <div
          style={{
            width: CANVAS_W,
            height: CANVAS_H,
            position: 'relative',
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            willChange: 'transform',
          }}
        >
          {/* Column labels */}
          {COLUMN_LABELS.map(col => (
            <div
              key={col.label}
              className="absolute text-center pointer-events-none select-none"
              style={{
                left: col.x - 80,
                top: col.y - 40,
                width: 160,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.12em',
                color: 'rgba(148,163,184,0.35)',
              }}
            >
              {col.label}
            </div>
          ))}

          {/* SVG Connection Layer */}
          <svg
            width={CANVAS_W}
            height={CANVAS_H}
            style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
          >
            <defs>
              <marker id="arrow-default" viewBox="0 0 10 7" refX="9" refY="3.5" markerWidth="7" markerHeight="5" orient="auto-start-reverse">
                <path d="M 0 0 L 10 3.5 L 0 7 z" fill="#475569" fillOpacity={0.4} />
              </marker>
              <marker id="arrow-highlight" viewBox="0 0 10 7" refX="9" refY="3.5" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 3.5 L 0 7 z" fill="#3b82f6" />
              </marker>
            </defs>

            {ALL_CONNECTIONS.map((conn, i) => {
              const fromNode = NODE_MAP[conn.from];
              const toNode = NODE_MAP[conn.to];
              if (!fromNode || !toNode) return null;

              const fx = fromNode.x + NODE_W;
              const fy = fromNode.y + NODE_H / 2;
              const tx = toNode.x;
              const ty = toNode.y + NODE_H / 2;

              const highlighted = isConnectionHighlighted(conn, selectedNodeId);
              const dimmed = selectedNodeId && !highlighted;

              return (
                <path
                  key={`${conn.from}-${conn.to}-${i}`}
                  d={getBezierPath(fx, fy, tx, ty)}
                  fill="none"
                  stroke={highlighted ? '#3b82f6' : '#475569'}
                  strokeWidth={highlighted ? 2.5 : 1}
                  strokeOpacity={dimmed ? 0.06 : highlighted ? 0.9 : 0.18}
                  markerEnd={highlighted ? 'url(#arrow-highlight)' : 'url(#arrow-default)'}
                  style={{ transition: 'stroke-opacity 0.2s, stroke 0.2s, stroke-width 0.2s' }}
                />
              );
            })}
          </svg>

          {/* Node Cards */}
          {NODES.map(node => {
            const style = COLOR_STYLES[node.colorClass];
            const isSelected = selectedNodeId === node.id;
            const isConnected = connectedIds.has(node.id);
            const dimmed = selectedNodeId && !isConnected && !isSelected;
            const Icon = node.icon;

            return (
              <div
                key={node.id}
                data-node
                onClick={(e) => { e.stopPropagation(); handleNodeClick(node.id); }}
                className="absolute rounded-xl transition-all duration-150 select-none"
                style={{
                  left: node.x,
                  top: node.y,
                  width: NODE_W,
                  height: NODE_H,
                  background: isSelected ? 'rgba(59,130,246,0.12)' : style.bg,
                  border: `1.5px solid ${isSelected ? 'rgba(59,130,246,0.6)' : style.border}`,
                  boxShadow: isSelected
                    ? '0 0 20px rgba(59,130,246,0.25), inset 0 1px 0 rgba(255,255,255,0.05)'
                    : 'inset 0 1px 0 rgba(255,255,255,0.03)',
                  opacity: dimmed ? 0.3 : 1,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '0 16px',
                }}
              >
                <div
                  className="flex-shrink-0 rounded-lg flex items-center justify-center"
                  style={{
                    width: 40,
                    height: 40,
                    background: isSelected ? 'rgba(59,130,246,0.2)' : style.iconBg,
                  }}
                >
                  <Icon
                    className="w-5 h-5"
                    style={{ color: isSelected ? '#60a5fa' : style.text }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div
                    className="text-[13px] font-semibold truncate leading-tight"
                    style={{ color: isSelected ? '#e2e8f0' : '#cbd5e1' }}
                  >
                    {node.title}
                  </div>
                  <div
                    className="text-[11px] mt-0.5 truncate"
                    style={{ color: isSelected ? '#60a5fa' : 'rgba(148,163,184,0.6)' }}
                  >
                    {TYPE_LABELS[node.type]}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Legend ── */}
        {showLegend && (
          <div
            className="absolute bottom-4 left-4 z-20 rounded-xl px-4 py-3"
            style={{
              background: 'rgba(15,15,17,0.85)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2">Legend</div>
            <div className="space-y-1.5">
              {LEGEND_ITEMS.map(item => (
                <div key={item.label} className="flex items-center gap-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ background: COLOR_STYLES[item.colorClass].text }}
                  />
                  <span className="text-[11px] text-text-muted">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Minimap ── */}
        <div
          className="absolute z-20 rounded-xl overflow-hidden transition-[right] duration-300"
          style={{
            bottom: 16,
            right: selectedNode ? 396 : 16,
            width: MINIMAP_W,
            height: MINIMAP_H,
            background: 'rgba(15,15,17,0.85)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <svg
            width={MINIMAP_W}
            height={MINIMAP_H}
            onClick={handleMinimapClick}
            style={{ cursor: 'pointer' }}
          >
            {/* Mini nodes */}
            {NODES.map(node => (
              <rect
                key={node.id}
                x={node.x * mmScale}
                y={node.y * mmScale}
                width={NODE_W * mmScale}
                height={NODE_H * mmScale}
                rx={2}
                fill={COLOR_STYLES[node.colorClass].text}
                fillOpacity={selectedNodeId === node.id ? 0.9 : 0.4}
              />
            ))}
            {/* Viewport indicator */}
            <rect
              x={Math.max(0, vpIndicator.x)}
              y={Math.max(0, vpIndicator.y)}
              width={Math.min(MINIMAP_W, vpIndicator.w)}
              height={Math.min(MINIMAP_H, vpIndicator.h)}
              fill="none"
              stroke="#3b82f6"
              strokeWidth={1.5}
              strokeOpacity={0.6}
              rx={1}
            />
          </svg>
        </div>

        {/* ── Detail Panel ── */}
        <div
          className="absolute top-0 right-0 bottom-0 z-30 transition-transform duration-300 ease-out"
          style={{
            width: 380,
            transform: selectedNode ? 'translateX(0)' : 'translateX(100%)',
            background: 'rgba(12,12,14,0.95)',
            backdropFilter: 'blur(16px) saturate(1.5)',
            borderLeft: '1px solid rgba(255,255,255,0.06)',
            boxShadow: '-8px 0 32px rgba(0,0,0,0.3)',
          }}
        >
          {selectedNode && (
            <div className="h-full flex flex-col overflow-hidden">
              {/* Panel header */}
              <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="flex-shrink-0 rounded-lg flex items-center justify-center"
                    style={{
                      width: 44,
                      height: 44,
                      background: COLOR_STYLES[selectedNode.colorClass].iconBg,
                    }}
                  >
                    <selectedNode.icon className="w-5.5 h-5.5" style={{ color: COLOR_STYLES[selectedNode.colorClass].text }} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-text-primary truncate">{selectedNode.title}</h3>
                    <span
                      className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
                      style={{
                        background: COLOR_STYLES[selectedNode.colorClass].iconBg,
                        color: COLOR_STYLES[selectedNode.colorClass].text,
                      }}
                    >
                      {TYPE_LABELS[selectedNode.type]}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedNodeId(null)}
                  className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md hover:bg-white/5 text-text-muted hover:text-text-primary transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Panel body */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                {/* Data fields */}
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2">Data Fields</div>
                  <div className="space-y-1">
                    {selectedNode.fields.map(field => (
                      <div
                        key={field}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg"
                        style={{ background: 'rgba(255,255,255,0.03)' }}
                      >
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: COLOR_STYLES[selectedNode.colorClass].text }} />
                        <span className="text-[12px] text-text-secondary font-mono">{field}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Flows To */}
                {selectedNode.flowsTo.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2 flex items-center gap-1.5">
                      <ChevronRight className="w-3 h-3" />
                      Flows To
                    </div>
                    <div className="space-y-1">
                      {selectedNode.flowsTo.map(id => {
                        const target = NODE_MAP[id];
                        if (!target) return null;
                        const ts = COLOR_STYLES[target.colorClass];
                        return (
                          <button
                            key={id}
                            onClick={() => navigateToNode(id)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left hover:bg-white/5 transition-colors"
                          >
                            <div className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0" style={{ background: ts.iconBg }}>
                              <target.icon className="w-3.5 h-3.5" style={{ color: ts.text }} />
                            </div>
                            <div className="min-w-0">
                              <div className="text-[12px] font-medium text-text-secondary truncate">{target.title}</div>
                              <div className="text-[10px] text-text-muted">{TYPE_LABELS[target.type]}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Flows From */}
                {selectedNode.flowsFrom.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2 flex items-center gap-1.5">
                      <ChevronLeft className="w-3 h-3" />
                      Flows From
                    </div>
                    <div className="space-y-1">
                      {selectedNode.flowsFrom.map(id => {
                        const source = NODE_MAP[id];
                        if (!source) return null;
                        const ss = COLOR_STYLES[source.colorClass];
                        return (
                          <button
                            key={id}
                            onClick={() => navigateToNode(id)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left hover:bg-white/5 transition-colors"
                          >
                            <div className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0" style={{ background: ss.iconBg }}>
                              <source.icon className="w-3.5 h-3.5" style={{ color: ss.text }} />
                            </div>
                            <div className="min-w-0">
                              <div className="text-[12px] font-medium text-text-secondary truncate">{source.title}</div>
                              <div className="text-[10px] text-text-muted">{TYPE_LABELS[source.type]}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
