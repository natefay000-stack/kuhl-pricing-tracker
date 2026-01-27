'use client';

import { useState } from 'react';
import { X, Save } from 'lucide-react';
import { Product, formatCurrency } from '@/types/product';

interface EditProductModalProps {
  product: Product;
  onSave: (updated: Product) => void;
  onClose: () => void;
}

export default function EditProductModal({ product, onSave, onClose }: EditProductModalProps) {
  const [formData, setFormData] = useState({
    price: product.price,
    msrp: product.msrp,
    cost: product.cost,
    designerName: product.designerName,
    techDesignerName: product.techDesignerName,
    styleColorNotes: product.styleColorNotes,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...product,
      ...formData,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleNumberChange = (field: 'price' | 'msrp' | 'cost', value: string) => {
    const num = parseFloat(value) || 0;
    setFormData(prev => ({ ...prev, [field]: num }));
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-white rounded-2xl max-w-lg w-full animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-kuhl-sand/30 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-display font-bold">Edit Product</h2>
            <p className="text-sm text-kuhl-stone/60">
              {product.styleNumber} - {product.color || 'All Colors'} • {product.styleDesc}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-kuhl-sand/30 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4">
            {/* Pricing */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-kuhl-stone/70 mb-1">Cost</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-kuhl-stone/50">$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.cost || ''}
                    onChange={(e) => handleNumberChange('cost', e.target.value)}
                    className="w-full pl-7"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-kuhl-stone/70 mb-1">Wholesale</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-kuhl-stone/50">$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.price || ''}
                    onChange={(e) => handleNumberChange('price', e.target.value)}
                    className="w-full pl-7"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-kuhl-stone/70 mb-1">MSRP</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-kuhl-stone/50">$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.msrp || ''}
                    onChange={(e) => handleNumberChange('msrp', e.target.value)}
                    className="w-full pl-7"
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>

            {/* People */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-kuhl-stone/70 mb-1">Designer</label>
                <input
                  type="text"
                  value={formData.designerName}
                  onChange={(e) => setFormData(prev => ({ ...prev, designerName: e.target.value }))}
                  className="w-full"
                  placeholder="Designer name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-kuhl-stone/70 mb-1">Tech Designer</label>
                <input
                  type="text"
                  value={formData.techDesignerName}
                  onChange={(e) => setFormData(prev => ({ ...prev, techDesignerName: e.target.value }))}
                  className="w-full"
                  placeholder="Tech designer name"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-kuhl-stone/70 mb-1">Notes</label>
              <textarea
                value={formData.styleColorNotes}
                onChange={(e) => setFormData(prev => ({ ...prev, styleColorNotes: e.target.value }))}
                className="w-full min-h-[80px] font-body bg-white border border-kuhl-sand rounded-lg px-3 py-2 text-kuhl-stone focus:outline-none focus:ring-2 focus:ring-kuhl-sage/50"
                placeholder="Style/color notes..."
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-kuhl-sand/30 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-primary flex items-center gap-2">
              <Save className="w-4 h-4" />
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
