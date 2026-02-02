'use client';

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
} from 'lucide-react';

export type ViewId = 'dashboard' | 'season' | 'seasoncomp' | 'products' | 'pricing' | 'sales' | 'costs' | 'margins' | 'linelist' | 'validation';

interface SidebarProps {
  activeView: ViewId;
  onViewChange: (view: ViewId) => void;
  onImportClick?: () => void;
  onSeasonsClick?: () => void;
}

const views = [
  { id: 'dashboard' as ViewId, label: 'Dashboard', icon: LayoutDashboard },
  { id: 'season' as ViewId, label: 'Season View', icon: Calendar },
  { id: 'seasoncomp' as ViewId, label: 'Season Comp', icon: GitCompare },
  { id: 'linelist' as ViewId, label: 'Line List', icon: List },
  { id: 'validation' as ViewId, label: 'Validation', icon: AlertTriangle },
  { id: 'sales' as ViewId, label: 'Sales', icon: ShoppingBag },
  { id: 'costs' as ViewId, label: 'Costs', icon: DollarSign },
  { id: 'pricing' as ViewId, label: 'Pricing', icon: TrendingUp },
  { id: 'products' as ViewId, label: 'Style Master', icon: Package },
  { id: 'margins' as ViewId, label: 'Margins', icon: Percent },
];

export default function Sidebar({ activeView, onViewChange, onImportClick, onSeasonsClick }: SidebarProps) {
  return (
    <aside className="w-56 bg-gray-900 text-white flex flex-col h-screen fixed left-0 top-0">
      {/* Logo */}
      <div className="p-4 border-b border-gray-800">
        <h1 className="font-display font-bold text-xl tracking-tight">KÜHL</h1>
        <p className="text-xs text-gray-400 mt-0.5">Pricing Tracker</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4">
        <div className="px-3 mb-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Views
          </span>
        </div>
        <ul className="space-y-1 px-2">
          {views.map((view) => {
            const isActive = activeView === view.id;
            return (
              <li key={view.id}>
                <button
                  onClick={() => onViewChange(view.id)}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
                    ${isActive
                      ? 'bg-cyan-600 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                    }
                  `}
                >
                  <view.icon className="w-4 h-4" />
                  {view.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Action Buttons */}
      <div className="px-2 pb-2 space-y-2">
        {onImportClick && (
          <button
            onClick={onImportClick}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-all border border-dashed border-gray-700 hover:border-cyan-500"
          >
            <Upload className="w-4 h-4" />
            Import Data
          </button>
        )}
        {onSeasonsClick && (
          <button
            onClick={onSeasonsClick}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-all"
          >
            <Settings className="w-4 h-4" />
            Manage Seasons
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-800">
        <p className="text-[10px] text-gray-500">
          Product Database
        </p>
      </div>
    </aside>
  );
}
