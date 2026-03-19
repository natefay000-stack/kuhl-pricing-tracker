'use client';

import { useState } from 'react';
import retryDynamic from '@/lib/retryDynamic';
import { Product, SalesRecord, CostRecord } from '@/types/product';
import type { SalesAggregations } from '@/app/page';

const ExecutiveDashboardView = retryDynamic(() => import('./ExecutiveDashboardView'));
const DashboardView = retryDynamic(() => import('./DashboardView'));

type TabId = 'dashboard' | 'executive';

const TABS: { id: TabId; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'executive', label: 'Executive' },
];

interface Props {
  products: Product[];
  sales: SalesRecord[];
  costs: CostRecord[];
  salesAggregations: SalesAggregations | null;
  selectedSeason: string;
  selectedDivision: string;
  selectedCategory: string;
  searchQuery: string;
  onStyleClick: (styleNumber: string) => void;
  initialTab?: TabId;
}

export default function DashboardWithExecutiveView({
  products,
  sales,
  costs,
  salesAggregations,
  selectedSeason,
  selectedDivision,
  selectedCategory,
  searchQuery,
  onStyleClick,
  initialTab = 'dashboard',
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  return (
    <div>
      {/* Tab Bar */}
      <div
        className="flex gap-1 px-6 py-2 sticky top-14 z-20"
        style={{
          background: 'var(--color-surface)',
          borderBottom: '1px solid var(--glass-border)',
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              activeTab === tab.id
                ? 'bg-cyan-600/20 text-cyan-400'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-tertiary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'dashboard' && (
        <DashboardView
          products={products}
          sales={sales}
          costs={costs}
          salesAggregations={salesAggregations}
          selectedSeason={selectedSeason}
          selectedDivision={selectedDivision}
          selectedCategory={selectedCategory}
          searchQuery={searchQuery}
          onStyleClick={onStyleClick}
        />
      )}
      {activeTab === 'executive' && <ExecutiveDashboardView />}
    </div>
  );
}
