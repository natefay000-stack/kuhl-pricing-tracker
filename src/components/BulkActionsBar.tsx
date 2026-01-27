'use client';

import { Edit2, Trash2, X } from 'lucide-react';

interface BulkActionsBarProps {
  selectedCount: number;
  onEdit: () => void;
  onDelete: () => void;
  onClearSelection: () => void;
}

export default function BulkActionsBar({ 
  selectedCount, 
  onEdit, 
  onDelete, 
  onClearSelection 
}: BulkActionsBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 animate-slide-up">
      <div className="bg-kuhl-stone text-kuhl-cream px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-4">
        <span className="font-medium">
          {selectedCount.toLocaleString()} selected
        </span>
        
        <div className="w-px h-6 bg-kuhl-cream/20" />
        
        <button
          onClick={onEdit}
          className="flex items-center gap-2 px-3 py-1.5 bg-kuhl-sage rounded-lg hover:bg-kuhl-sage/80 transition-colors text-sm font-medium"
        >
          <Edit2 className="w-4 h-4" />
          Edit
        </button>
        
        <button
          onClick={onDelete}
          className="flex items-center gap-2 px-3 py-1.5 bg-kuhl-rust rounded-lg hover:bg-kuhl-rust/80 transition-colors text-sm font-medium"
        >
          <Trash2 className="w-4 h-4" />
          Delete
        </button>
        
        <div className="w-px h-6 bg-kuhl-cream/20" />
        
        <button
          onClick={onClearSelection}
          className="p-1.5 hover:bg-kuhl-earth rounded-lg transition-colors"
          title="Clear selection"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
