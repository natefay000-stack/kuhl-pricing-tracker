'use client';

import { useState, useMemo } from 'react';
import { Product, SalesRecord, PricingRecord, FilterState } from '@/types/product';
import { filterProducts, getUniqueValues, getSeasonSummaries, getOverallStats } from '@/lib/store';
import FilterBar from '@/components/FilterBar';
import StatsDashboard from '@/components/StatsDashboard';
import ProductTable from '@/components/ProductTable';
import SummaryTable from '@/components/SummaryTable';
import SeasonComparison from '@/components/SeasonComparison';
import ProductDetail from '@/components/ProductDetail';
import EditProductModal from '@/components/EditProductModal';
import DeleteConfirmModal from '@/components/DeleteConfirmModal';
import BulkEditModal from '@/components/BulkEditModal';
import BulkActionsBar from '@/components/BulkActionsBar';
import { LayoutList, Table2 } from 'lucide-react';

interface LineListTabProps {
  products: Product[];
  sales: SalesRecord[];
  pricing: PricingRecord[];
  onProductsChange: (products: Product[]) => void;
}

const initialFilters: FilterState = {
  search: '',
  division: '',
  category: '',
  season: '',
  productLine: '',
  designer: '',
  carryOver: 'all',
  priceMin: null,
  priceMax: null,
};

export default function LineListTab({ products, sales, pricing, onProductsChange }: LineListTabProps) {
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const [viewMode, setViewMode] = useState<'full' | 'summary'>('full');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [showBulkEdit, setShowBulkEdit] = useState(false);

  // Filter options
  const filterOptions = useMemo(() => ({
    divisions: getUniqueValues(products, 'divisionDesc'),
    categories: getUniqueValues(products, 'categoryDesc'),
    seasons: getUniqueValues(products, 'season'),
    productLines: getUniqueValues(products, 'productLineDesc'),
    designers: getUniqueValues(products, 'designerName'),
  }), [products]);

  // Filtered products
  const filteredProducts = useMemo(() =>
    filterProducts(products, filters),
    [products, filters]
  );

  // Statistics
  const stats = useMemo(() =>
    getOverallStats(filteredProducts),
    [filteredProducts]
  );

  // Season summaries
  const seasonSummaries = useMemo(() =>
    getSeasonSummaries(filteredProducts),
    [filteredProducts]
  );

  // Count products with same style number
  const getStyleCount = (styleNumber: string) => {
    return products.filter(p => p.styleNumber === styleNumber).length;
  };

  // Handle single product edit save
  const handleSaveProduct = (updated: Product) => {
    const newProducts = products.map(p => p.id === updated.id ? updated : p);
    onProductsChange(newProducts);
    setEditingProduct(null);
  };

  // Handle bulk edit save
  const handleBulkEditSave = (updates: Partial<Product>) => {
    const newProducts = products.map(p => {
      if (selectedIds.has(p.id)) {
        return { ...p, ...updates, updatedAt: new Date().toISOString() };
      }
      return p;
    });
    onProductsChange(newProducts);
    setShowBulkEdit(false);
    setSelectedIds(new Set());
  };

  // Handle delete single product
  const handleDeleteSingle = () => {
    if (!deletingProduct) return;
    const newProducts = products.filter(p => p.id !== deletingProduct.id);
    onProductsChange(newProducts);
    setDeletingProduct(null);
    selectedIds.delete(deletingProduct.id);
    setSelectedIds(new Set(selectedIds));
  };

  // Handle delete entire style
  const handleDeleteStyle = () => {
    if (!deletingProduct) return;
    const styleNumber = deletingProduct.styleNumber;
    const newProducts = products.filter(p => p.styleNumber !== styleNumber);
    onProductsChange(newProducts);
    setDeletingProduct(null);
    const remainingIds = new Set(newProducts.map(p => p.id));
    setSelectedIds(new Set(Array.from(selectedIds).filter(id => remainingIds.has(id))));
  };

  // Handle bulk delete
  const handleBulkDelete = () => {
    const count = selectedIds.size;
    if (confirm(`Are you sure you want to delete ${count.toLocaleString()} products? This cannot be undone.`)) {
      const newProducts = products.filter(p => !selectedIds.has(p.id));
      onProductsChange(newProducts);
      setSelectedIds(new Set());
    }
  };

  if (products.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="text-kuhl-stone/40 text-lg">No products in line list</div>
        <p className="text-kuhl-stone/30 mt-2">Product data will appear here once loaded</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <FilterBar
        filters={filters}
        onFilterChange={setFilters}
        {...filterOptions}
      />

      {/* Stats */}
      <StatsDashboard {...stats} />

      {/* Season Comparison */}
      {seasonSummaries.length > 1 && (
        <SeasonComparison summaries={seasonSummaries} />
      )}

      {/* View Toggle */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-display font-semibold text-kuhl-stone">
          {viewMode === 'full' ? 'All Products' : 'Style Summary'}
          <span className="text-kuhl-stone/50 font-normal ml-2">
            ({filteredProducts.length.toLocaleString()} items)
          </span>
        </h2>
        <div className="flex items-center gap-1 bg-white border border-kuhl-sand/50 rounded-lg p-1">
          <button
            onClick={() => setViewMode('full')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              viewMode === 'full'
                ? 'bg-kuhl-stone text-white'
                : 'text-kuhl-stone/60 hover:text-kuhl-stone hover:bg-kuhl-sand/20'
            }`}
          >
            <Table2 className="w-4 h-4" />
            Full View
          </button>
          <button
            onClick={() => setViewMode('summary')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              viewMode === 'summary'
                ? 'bg-kuhl-stone text-white'
                : 'text-kuhl-stone/60 hover:text-kuhl-stone hover:bg-kuhl-sand/20'
            }`}
          >
            <LayoutList className="w-4 h-4" />
            Summary
          </button>
        </div>
      </div>

      {/* Product Table */}
      {viewMode === 'full' ? (
        <ProductTable
          products={filteredProducts}
          selectedIds={selectedIds}
          onSelectProduct={setSelectedProduct}
          onSelectionChange={setSelectedIds}
          onEditProduct={setEditingProduct}
          onDeleteProduct={setDeletingProduct}
        />
      ) : (
        <SummaryTable products={filteredProducts} />
      )}

      {/* Bulk Actions Bar */}
      {viewMode === 'full' && (
        <BulkActionsBar
          selectedCount={selectedIds.size}
          onEdit={() => setShowBulkEdit(true)}
          onDelete={handleBulkDelete}
          onClearSelection={() => setSelectedIds(new Set())}
        />
      )}

      {/* Modals */}
      {selectedProduct && (
        <ProductDetail
          product={selectedProduct}
          sales={sales}
          pricing={pricing}
          onClose={() => setSelectedProduct(null)}
        />
      )}

      {editingProduct && (
        <EditProductModal
          product={editingProduct}
          onSave={handleSaveProduct}
          onClose={() => setEditingProduct(null)}
        />
      )}

      {showBulkEdit && (
        <BulkEditModal
          selectedCount={selectedIds.size}
          onSave={handleBulkEditSave}
          onClose={() => setShowBulkEdit(false)}
        />
      )}

      {deletingProduct && (
        <DeleteConfirmModal
          product={deletingProduct}
          styleCount={getStyleCount(deletingProduct.styleNumber)}
          onDeleteSingle={handleDeleteSingle}
          onDeleteStyle={handleDeleteStyle}
          onClose={() => setDeletingProduct(null)}
        />
      )}
    </div>
  );
}
