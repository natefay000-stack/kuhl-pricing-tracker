'use client';

import { useState } from 'react';
import { X, Save, DollarSign, User } from 'lucide-react';
import { Product } from '@/types/product';

interface BulkEditModalProps {
  selectedCount: number;
  onSave: (updates: Partial<Product>) => void;
  onClose: () => void;
}

type EditField = 'price' | 'msrp' | 'cost' | 'designerName' | 'techDesignerName';

export default function BulkEditModal({ selectedCount, onSave, onClose }: BulkEditModalProps) {
  const [activeFields, setActiveFields] = useState<Set<EditField>>(new Set());
  const [formData, setFormData] = useState({
    price: '',
    msrp: '',
    cost: '',
    designerName: '',
    techDesignerName: '',
  });

  const toggleField = (field: EditField) => {
    const newSet = new Set(activeFields);
    if (newSet.has(field)) {
      newSet.delete(field);
    } else {
      newSet.add(field);
    }
    setActiveFields(newSet);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const updates: Partial<Product> = {};
    
    if (activeFields.has('price') && formData.price) {
      updates.price = parseFloat(formData.price) || 0;
    }
    if (activeFields.has('msrp') && formData.msrp) {
      updates.msrp = parseFloat(formData.msrp) || 0;
    }
    if (activeFields.has('cost') && formData.cost) {
      updates.cost = parseFloat(formData.cost) || 0;
    }
    if (activeFields.has('designerName')) {
      updates.designerName = formData.designerName;
    }
    if (activeFields.has('techDesignerName')) {
      updates.techDesignerName = formData.techDesignerName;
    }
    
    if (Object.keys(updates).length > 0) {
      onSave(updates);
    }
  };

  const FieldToggle = ({ field, label, icon: Icon }: { field: EditField; label: string; icon: any }) => (
    <button
      type="button"
      onClick={() => toggleField(field)}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
        activeFields.has(field)
          ? 'border-kuhl-sage bg-kuhl-sage/10 text-kuhl-sage'
          : 'border-kuhl-sand/50 text-kuhl-stone/60 hover:border-kuhl-sand'
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-white rounded-2xl max-w-lg w-full animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-kuhl-sand/30 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-display font-bold">Bulk Edit</h2>
            <p className="text-sm text-kuhl-stone/60">
              Update {selectedCount.toLocaleString()} selected products
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
          <div className="p-6 space-y-6">
            {/* Field Selection */}
            <div>
              <label className="block text-sm font-medium text-kuhl-stone/70 mb-2">
                Select fields to update:
              </label>
              <div className="flex flex-wrap gap-2">
                <FieldToggle field="cost" label="Cost" icon={DollarSign} />
                <FieldToggle field="price" label="Wholesale" icon={DollarSign} />
                <FieldToggle field="msrp" label="MSRP" icon={DollarSign} />
                <FieldToggle field="designerName" label="Designer" icon={User} />
                <FieldToggle field="techDesignerName" label="Tech Designer" icon={User} />
              </div>
            </div>

            {/* Active Field Inputs */}
            {activeFields.size > 0 && (
              <div className="space-y-4 pt-4 border-t border-kuhl-sand/30">
                {/* Pricing Fields */}
                {(activeFields.has('cost') || activeFields.has('price') || activeFields.has('msrp')) && (
                  <div className="grid grid-cols-3 gap-4">
                    {activeFields.has('cost') && (
                      <div>
                        <label className="block text-sm font-medium text-kuhl-stone/70 mb-1">Cost</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-kuhl-stone/50">$</span>
                          <input
                            type="number"
                            step="0.01"
                            value={formData.cost}
                            onChange={(e) => setFormData(prev => ({ ...prev, cost: e.target.value }))}
                            className="w-full pl-7"
                            placeholder="0.00"
                            autoFocus
                          />
                        </div>
                      </div>
                    )}
                    {activeFields.has('price') && (
                      <div>
                        <label className="block text-sm font-medium text-kuhl-stone/70 mb-1">Wholesale</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-kuhl-stone/50">$</span>
                          <input
                            type="number"
                            step="0.01"
                            value={formData.price}
                            onChange={(e) => setFormData(prev => ({ ...prev, price: e.target.value }))}
                            className="w-full pl-7"
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                    )}
                    {activeFields.has('msrp') && (
                      <div>
                        <label className="block text-sm font-medium text-kuhl-stone/70 mb-1">MSRP</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-kuhl-stone/50">$</span>
                          <input
                            type="number"
                            step="0.01"
                            value={formData.msrp}
                            onChange={(e) => setFormData(prev => ({ ...prev, msrp: e.target.value }))}
                            className="w-full pl-7"
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* People Fields */}
                {(activeFields.has('designerName') || activeFields.has('techDesignerName')) && (
                  <div className="grid grid-cols-2 gap-4">
                    {activeFields.has('designerName') && (
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
                    )}
                    {activeFields.has('techDesignerName') && (
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
                    )}
                  </div>
                )}
              </div>
            )}

            {activeFields.size === 0 && (
              <p className="text-sm text-kuhl-stone/50 text-center py-4">
                Click a field above to enable editing
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-kuhl-sand/30 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn-primary flex items-center gap-2"
              disabled={activeFields.size === 0}
            >
              <Save className="w-4 h-4" />
              Update {selectedCount.toLocaleString()} Products
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
