'use client';

import { AlertTriangle, Trash2, X } from 'lucide-react';
import { Product } from '@/types/product';

interface DeleteConfirmModalProps {
  product: Product;
  styleCount: number; // How many products share this style number
  onDeleteSingle: () => void;
  onDeleteStyle: () => void;
  onClose: () => void;
}

export default function DeleteConfirmModal({ 
  product, 
  styleCount, 
  onDeleteSingle, 
  onDeleteStyle, 
  onClose 
}: DeleteConfirmModalProps) {
  const hasMultipleColors = styleCount > 1;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-white rounded-2xl max-w-md w-full animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-kuhl-sand/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-kuhl-rust/10 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-kuhl-rust" />
            </div>
            <h2 className="text-xl font-display font-bold">Delete Product</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-kuhl-sand/30 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <div className="mb-4">
            <p className="font-medium text-kuhl-stone">
              {product.styleNumber} - {product.colorDesc || product.color || 'All Colors'}
            </p>
            <p className="text-sm text-kuhl-stone/60">{product.styleDesc}</p>
          </div>

          <div className="space-y-3">
            {/* Delete single */}
            <button
              onClick={onDeleteSingle}
              className="w-full flex items-center justify-between p-4 border border-kuhl-sand/50 rounded-lg hover:border-kuhl-rust hover:bg-kuhl-rust/5 transition-colors group"
            >
              <div className="text-left">
                <p className="font-medium text-kuhl-stone group-hover:text-kuhl-rust">
                  Delete this SKU only
                </p>
                <p className="text-sm text-kuhl-stone/60">
                  Remove {product.styleNumber} - {product.color || 'N/A'}
                </p>
              </div>
              <Trash2 className="w-5 h-5 text-kuhl-stone/40 group-hover:text-kuhl-rust" />
            </button>

            {/* Delete entire style */}
            {hasMultipleColors && (
              <button
                onClick={onDeleteStyle}
                className="w-full flex items-center justify-between p-4 border border-kuhl-rust/30 bg-kuhl-rust/5 rounded-lg hover:border-kuhl-rust hover:bg-kuhl-rust/10 transition-colors group"
              >
                <div className="text-left">
                  <p className="font-medium text-kuhl-rust">
                    Delete entire style
                  </p>
                  <p className="text-sm text-kuhl-rust/70">
                    Remove all {styleCount} colors of style {product.styleNumber}
                  </p>
                </div>
                <Trash2 className="w-5 h-5 text-kuhl-rust" />
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-kuhl-sand/30">
          <button onClick={onClose} className="btn-secondary w-full">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
