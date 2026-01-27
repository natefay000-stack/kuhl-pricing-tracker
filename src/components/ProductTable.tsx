'use client';

import { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, Edit2, Trash2, Check } from 'lucide-react';
import { Product, calculateMargins, formatCurrency, formatPercent, getMarginClass } from '@/types/product';

interface ProductTableProps {
  products: Product[];
  selectedIds: Set<string>;
  onSelectProduct: (product: Product) => void;
  onSelectionChange: (ids: Set<string>) => void;
  onEditProduct: (product: Product) => void;
  onDeleteProduct: (product: Product) => void;
}

type SortKey = 'styleNumber' | 'styleDesc' | 'divisionDesc' | 'season' | 'cost' | 'price' | 'msrp' | 'margin';
type SortDirection = 'asc' | 'desc';

export default function ProductTable({ 
  products, 
  selectedIds, 
  onSelectProduct, 
  onSelectionChange,
  onEditProduct,
  onDeleteProduct,
}: ProductTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('styleNumber');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const sortedProducts = useMemo(() => {
    return [...products].sort((a, b) => {
      let aVal: any;
      let bVal: any;

      if (sortKey === 'margin') {
        const aMargin = calculateMargins(a.cost, a.price, a.msrp);
        const bMargin = calculateMargins(b.cost, b.price, b.msrp);
        aVal = aMargin.wholesaleToMsrp;
        bVal = bMargin.wholesaleToMsrp;
      } else {
        aVal = a[sortKey];
        bVal = b[sortKey];
      }

      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = (bVal || '').toLowerCase();
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [products, sortKey, sortDirection]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.size === products.length) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(products.map(p => p.id)));
    }
  };

  const handleSelectOne = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    onSelectionChange(newSet);
  };

  const allSelected = products.length > 0 && selectedIds.size === products.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < products.length;

  const SortHeader = ({ label, sortKeyName }: { label: string; sortKeyName: SortKey }) => (
    <th
      onClick={() => handleSort(sortKeyName)}
      className="cursor-pointer hover:bg-kuhl-sand/20 select-none"
    >
      <div className="flex items-center gap-1">
        {label}
        {sortKey === sortKeyName && (
          sortDirection === 'asc' 
            ? <ChevronUp className="w-3 h-3" /> 
            : <ChevronDown className="w-3 h-3" />
        )}
      </div>
    </th>
  );

  if (products.length === 0) {
    return (
      <div className="card">
        <div className="p-12 text-center text-kuhl-stone/50">
          <Package className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">No products found</p>
          <p className="text-sm mt-1">Import a CSV or adjust your filters</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="pricing-table">
          <thead>
            <tr>
              <th className="w-12">
                <button
                  onClick={handleSelectAll}
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                    allSelected 
                      ? 'bg-kuhl-sage border-kuhl-sage text-white' 
                      : someSelected
                        ? 'bg-kuhl-sage/30 border-kuhl-sage'
                        : 'border-kuhl-sand hover:border-kuhl-sage'
                  }`}
                >
                  {(allSelected || someSelected) && <Check className="w-3 h-3" />}
                </button>
              </th>
              <SortHeader label="Style #" sortKeyName="styleNumber" />
              <SortHeader label="Description" sortKeyName="styleDesc" />
              <th>Color</th>
              <SortHeader label="Season" sortKeyName="season" />
              <th>Currency</th>
              <SortHeader label="Cost" sortKeyName="cost" />
              <SortHeader label="Wholesale" sortKeyName="price" />
              <SortHeader label="MSRP" sortKeyName="msrp" />
              <SortHeader label="Margin" sortKeyName="margin" />
              <th className="w-20">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedProducts.map((product) => {
              const margins = calculateMargins(product.cost, product.price, product.msrp);
              const isSelected = selectedIds.has(product.id);
              
              return (
                <tr
                  key={product.id}
                  className={isSelected ? 'bg-kuhl-sage/10' : ''}
                >
                  <td onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleSelectOne(product.id)}
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                        isSelected 
                          ? 'bg-kuhl-sage border-kuhl-sage text-white' 
                          : 'border-kuhl-sand hover:border-kuhl-sage'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3" />}
                    </button>
                  </td>
                  <td 
                    className="font-mono text-sm font-medium text-kuhl-stone cursor-pointer"
                    onClick={() => onSelectProduct(product)}
                  >
                    {product.styleNumber}
                  </td>
                  <td 
                    className="max-w-[200px] cursor-pointer"
                    onClick={() => onSelectProduct(product)}
                  >
                    <div className="truncate font-medium">{product.styleDesc}</div>
                    <div className="text-xs text-kuhl-stone/50">{product.productLineDesc || product.divisionDesc}</div>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      {product.color && (
                        <span className="font-mono text-xs bg-kuhl-sand/30 px-1.5 py-0.5 rounded">
                          {product.color}
                        </span>
                      )}
                      <span className="text-sm truncate max-w-[100px]">{product.colorDesc}</span>
                    </div>
                  </td>
                  <td>
                    <div>
                      <span className="font-mono text-sm bg-kuhl-stone/5 px-2 py-1 rounded">
                        {product.season}
                      </span>
                    </div>
                  </td>
                  <td className="text-sm text-kuhl-stone/70">{product.currency || 'USD'}</td>
                  <td className="font-mono text-sm">{formatCurrency(product.cost || null)}</td>
                  <td className="font-mono text-sm font-medium">{formatCurrency(product.price)}</td>
                  <td className="font-mono text-sm">{formatCurrency(product.msrp)}</td>
                  <td>
                    <span className={`px-2 py-1 rounded text-sm font-medium ${getMarginClass(margins.wholesaleToMsrp)}`}>
                      {formatPercent(margins.wholesaleToMsrp)}
                    </span>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onEditProduct(product)}
                        className="p-1.5 text-kuhl-stone/50 hover:text-kuhl-sage hover:bg-kuhl-sage/10 rounded transition-colors"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onDeleteProduct(product)}
                        className="p-1.5 text-kuhl-stone/50 hover:text-kuhl-rust hover:bg-kuhl-rust/10 rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-3 bg-kuhl-cream/50 border-t border-kuhl-sand/30 text-sm text-kuhl-stone/60 flex items-center justify-between">
        <span>Showing {products.length.toLocaleString()} products</span>
        {selectedIds.size > 0 && (
          <span className="text-kuhl-sage font-medium">
            {selectedIds.size.toLocaleString()} selected
          </span>
        )}
      </div>
    </div>
  );
}

function Package({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m7.5 4.27 9 5.15" />
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  );
}
