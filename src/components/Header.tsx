'use client';

import { Package, Upload, Download, Trash2, BarChart3 } from 'lucide-react';

interface HeaderProps {
  onImport: () => void;
  onExport: () => void;
  onClearAll: () => void;
  productCount: number;
}

export default function Header({ onImport, onExport, onClearAll, productCount }: HeaderProps) {
  return (
    <header className="bg-kuhl-stone text-kuhl-cream">
      <div className="max-w-[1600px] mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-kuhl-rust rounded-lg flex items-center justify-center">
                <BarChart3 className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-display font-bold tracking-tight">KÜHL Pricing</h1>
                <p className="text-xs text-kuhl-sand">MSRP • Wholesale • Cost Tracker</p>
              </div>
            </div>
            {productCount > 0 && (
              <div className="ml-6 px-3 py-1 bg-kuhl-earth rounded-full text-sm">
                {productCount.toLocaleString()} products
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={onImport}
              className="flex items-center gap-2 px-4 py-2 bg-kuhl-sage text-white rounded-lg hover:bg-kuhl-sage/80 transition-colors font-medium"
            >
              <Upload className="w-4 h-4" />
              Import CSV
            </button>
            <button
              onClick={onExport}
              className="flex items-center gap-2 px-4 py-2 bg-kuhl-earth text-kuhl-cream rounded-lg hover:bg-kuhl-stone transition-colors font-medium"
              disabled={productCount === 0}
            >
              <Download className="w-4 h-4" />
              Export
            </button>
            {productCount > 0 && (
              <button
                onClick={onClearAll}
                className="flex items-center gap-2 px-3 py-2 text-kuhl-rust hover:bg-kuhl-earth rounded-lg transition-colors"
                title="Clear all data"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
