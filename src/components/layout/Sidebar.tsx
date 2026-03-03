'use client';

import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Calendar,
  ShoppingBag,
  DollarSign,
  TrendingUp,
  Package,
  Percent,
  Upload,
  List,
  AlertTriangle,
  Settings,
  GitCompare,
  Users,
  Warehouse,
  Trophy,
  Palette,
  Pin,
  PinOff,
  ChevronRight,
  ArrowRightLeft,
  Scale,
  ClipboardList,
  BarChart3,
  MapPin,
  type LucideIcon,
} from 'lucide-react';

export type ViewId = 'executive' | 'dashboard' | 'season' | 'seasoncomp' | 'products' | 'pricing' | 'sales' | 'topstyles' | 'costs' | 'margins' | 'customers' | 'inventory' | 'sellthrough' | 'linelist' | 'validation' | 'datasources' | 'stylecolor' | 'tariffs' | 'invopnseason' | 'geoheatmap';

interface SidebarProps {
  activeView: ViewId;
  onViewChange: (view: ViewId) => void;
  onImportClick?: () => void;
  onSeasonsClick?: () => void;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}

interface NavGroup {
  label: string;
  items: { id: ViewId; label: string; icon: LucideIcon; emoji: string }[];
}

const navGroups: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { id: 'executive', label: 'Executive', icon: BarChart3, emoji: '🏢' },
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, emoji: '📊' },
      { id: 'season', label: 'Season View', icon: Calendar, emoji: '📅' },
      { id: 'seasoncomp', label: 'Season Comp', icon: GitCompare, emoji: '🔀' },
    ],
  },
  {
    label: 'Analytics',
    items: [
      { id: 'sales', label: 'Sales Analysis', icon: ShoppingBag, emoji: '📈' },
      { id: 'inventory', label: 'Inventory', icon: Warehouse, emoji: '📦' },
      { id: 'sellthrough', label: 'Sell-Through', icon: ArrowRightLeft, emoji: '🔄' },
      { id: 'customers', label: 'Customers', icon: Users, emoji: '👥' },
      { id: 'margins', label: 'Margins', icon: Percent, emoji: '💰' },
      { id: 'topstyles', label: 'Top Styles', icon: Trophy, emoji: '🏆' },
      { id: 'stylecolor', label: 'Style/Color', icon: Palette, emoji: '🎨' },
      { id: 'invopnseason', label: 'Inv-Opn Season', icon: ClipboardList, emoji: '📦' },
      { id: 'geoheatmap', label: 'Geo Heat Map', icon: MapPin, emoji: '📍' },
    ],
  },
  {
    label: 'Product',
    items: [
      { id: 'products', label: 'Style Master', icon: Package, emoji: '📋' },
      { id: 'pricing', label: 'Pricing', icon: TrendingUp, emoji: '💵' },
      { id: 'linelist', label: 'Line List', icon: List, emoji: '📑' },
      { id: 'costs', label: 'Costs', icon: DollarSign, emoji: '💲' },
      { id: 'tariffs', label: 'Tariffs', icon: Scale, emoji: '🏛️' },
    ],
  },
  {
    label: 'Data',
    items: [
      { id: 'validation', label: 'Validation', icon: AlertTriangle, emoji: '⚠️' },
      { id: 'datasources', label: 'Sources', icon: GitCompare, emoji: '🔗' },
    ],
  },
];

const SIDEBAR_PINNED_KEY = 'kuhl-sidebar-pinned';

export default function Sidebar({ activeView, onViewChange, onImportClick, onSeasonsClick, collapsed, onCollapsedChange }: SidebarProps) {
  const [pinned, setPinned] = useState(true);
  const [hovered, setHovered] = useState(false);

  // Load pinned state from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_PINNED_KEY);
      if (saved === 'false') {
        setPinned(false);
        onCollapsedChange(true);
      }
    } catch { /* ignore */ }
  }, []);

  const togglePin = () => {
    const newPinned = !pinned;
    setPinned(newPinned);
    onCollapsedChange(!newPinned);
    try { localStorage.setItem(SIDEBAR_PINNED_KEY, String(newPinned)); } catch { /* ignore */ }
  };

  // Expanded = pinned OR hovered (when unpinned)
  const expanded = pinned || hovered;

  return (
    <aside
      className={`text-white flex flex-col h-screen fixed left-0 top-0 z-40 transition-all duration-200 ease-in-out ${
        expanded ? 'w-56' : 'w-[60px]'
      }`}
      style={{
        background: 'rgba(10, 14, 26, 0.82)',
        backdropFilter: 'blur(32px) saturate(1.6)',
        WebkitBackdropFilter: 'blur(32px) saturate(1.6)',
        borderRight: '1px solid rgba(255, 255, 255, 0.06)',
        boxShadow: '4px 0 24px rgba(0, 0, 0, 0.2), inset -1px 0 0 rgba(255, 255, 255, 0.04)',
      }}
      onMouseEnter={() => !pinned && setHovered(true)}
      onMouseLeave={() => !pinned && setHovered(false)}
    >
      {/* Header: Logo + Pin */}
      <div className="flex items-center justify-between p-3 min-h-[56px]" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
        {expanded ? (
          <>
            <div>
              <h1 className="font-display font-bold text-xl tracking-tight">KÜHL</h1>
              <p className="text-[10px] text-gray-400 mt-0.5">Pricing Tracker</p>
            </div>
            <button
              onClick={togglePin}
              className={`p-1.5 rounded-md transition-colors ${
                pinned
                  ? 'text-cyan-400 hover:bg-white/5'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
              title={pinned ? 'Unpin sidebar' : 'Pin sidebar open'}
            >
              {pinned ? <Pin className="w-3.5 h-3.5" /> : <PinOff className="w-3.5 h-3.5" />}
            </button>
          </>
        ) : (
          <div className="w-full flex justify-center">
            <button
              onClick={togglePin}
              className="p-1.5 rounded-md text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
              title="Pin sidebar open"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2 overflow-y-auto overflow-x-hidden">
        {navGroups.map((group) => (
          <div key={group.label} className="mb-1">
            {/* Group label */}
            {expanded && (
              <div className="px-4 pt-3 pb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  {group.label}
                </span>
              </div>
            )}
            {!expanded && group !== navGroups[0] && (
              <div className="mx-3 my-1.5 border-t border-white/5" />
            )}

            <ul className="space-y-0.5 px-2">
              {group.items.map((view) => {
                const isActive = activeView === view.id;
                return (
                  <li key={view.id}>
                    <button
                      onClick={() => onViewChange(view.id)}
                      className={`
                        w-full flex items-center gap-3 rounded-lg text-sm font-medium transition-all
                        ${expanded ? 'px-3 py-2' : 'px-0 py-2 justify-center'}
                        ${isActive
                          ? 'bg-cyan-600/20 text-cyan-400'
                          : 'text-gray-400 hover:text-white hover:bg-white/5'
                        }
                      `}
                      title={!expanded ? view.label : undefined}
                    >
                      <span className="text-base flex-shrink-0 w-5 text-center">{view.emoji}</span>
                      {expanded && <span className="truncate">{view.label}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Action Buttons */}
      <div className="px-2 pb-2 space-y-1">
        {onImportClick && (
          <button
            onClick={onImportClick}
            className={`
              w-full flex items-center gap-3 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-all border border-dashed border-gray-700 hover:border-cyan-500
              ${expanded ? 'px-3 py-2' : 'px-0 py-2 justify-center'}
            `}
            title={!expanded ? 'Import Data' : undefined}
          >
            <Upload className="w-4 h-4 flex-shrink-0" />
            {expanded && 'Import Data'}
          </button>
        )}
        {onSeasonsClick && (
          <button
            onClick={onSeasonsClick}
            className={`
              w-full flex items-center gap-3 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-all
              ${expanded ? 'px-3 py-2' : 'px-0 py-2 justify-center'}
            `}
            title={!expanded ? 'Manage Seasons' : undefined}
          >
            <Settings className="w-4 h-4 flex-shrink-0" />
            {expanded && 'Manage Seasons'}
          </button>
        )}
      </div>

      {/* Footer */}
      {expanded && (
        <div className="p-4 border-t border-white/5">
          <p className="text-[10px] text-gray-500">
            Product Database
          </p>
        </div>
      )}
    </aside>
  );
}
