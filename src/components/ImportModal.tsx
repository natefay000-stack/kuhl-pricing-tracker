'use client';

import { useState, useCallback } from 'react';
import { X, Upload, FileText, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { parseCSV, ImportResult } from '@/lib/csv-import';

interface ImportModalProps {
  onImport: (result: ImportResult) => void;
  onClose: () => void;
}

export default function ImportModal({ onImport, onClose }: ImportModalProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.csv') || file.name.endsWith('.txt'))) {
      setSelectedFile(file);
      processFile(file);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      processFile(file);
    }
  };

  const processFile = async (file: File) => {
    setIsProcessing(true);
    setResult(null);
    
    try {
      const importResult = await parseCSV(file);
      console.log('Import result:', importResult.importedCount, 'products');
      console.log('First 3 products:', importResult.products.slice(0, 3));
      setResult(importResult);
    } catch (err) {
      setResult({
        success: false,
        products: [],
        errors: [err instanceof Error ? err.message : 'Failed to process file'],
        rowCount: 0,
        importedCount: 0,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmImport = () => {
    if (result && result.products.length > 0) {
      onImport(result);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-white rounded-2xl max-w-xl w-full animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-kuhl-sand/30 flex items-center justify-between">
          <h2 className="text-xl font-display font-bold">Import Products</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-kuhl-sand/30 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {/* Drop Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
              border-2 border-dashed rounded-xl p-8 text-center transition-colors
              ${isDragging ? 'border-kuhl-sage bg-kuhl-sage/5' : 'border-kuhl-sand hover:border-kuhl-clay'}
              ${selectedFile ? 'bg-kuhl-cream' : ''}
            `}
          >
            {isProcessing ? (
              <div className="flex flex-col items-center">
                <Loader2 className="w-12 h-12 text-kuhl-sage animate-spin mb-4" />
                <p className="text-kuhl-stone font-medium">Processing file...</p>
              </div>
            ) : selectedFile ? (
              <div className="flex flex-col items-center">
                <FileText className="w-12 h-12 text-kuhl-sage mb-4" />
                <p className="text-kuhl-stone font-medium">{selectedFile.name}</p>
                <p className="text-sm text-kuhl-stone/60 mt-1">
                  {(selectedFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
            ) : (
              <>
                <Upload className="w-12 h-12 text-kuhl-sand mx-auto mb-4" />
                <p className="text-kuhl-stone font-medium mb-2">
                  Drop your CSV file here
                </p>
                <p className="text-sm text-kuhl-stone/60 mb-4">
                  or click to browse
                </p>
                <label className="btn-secondary cursor-pointer">
                  Select File
                  <input
                    type="file"
                    accept=".csv,.txt"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>
              </>
            )}
          </div>

          {/* Results */}
          {result && (
            <div className="mt-6">
              {result.success && result.products.length > 0 ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-emerald-800">
                        Ready to import {result.importedCount.toLocaleString()} products
                      </p>
                      <p className="text-sm text-emerald-600 mt-1">
                        Parsed {result.rowCount.toLocaleString()} rows from file
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-red-800">Import Issues</p>
                      {result.errors.length > 0 && (
                        <ul className="text-sm text-red-600 mt-2 space-y-1">
                          {result.errors.slice(0, 5).map((err, i) => (
                            <li key={i}>• {err}</li>
                          ))}
                          {result.errors.length > 5 && (
                            <li>• ... and {result.errors.length - 5} more errors</li>
                          )}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Info */}
          <div className="mt-6 bg-kuhl-cream rounded-lg p-4 text-sm">
            <p className="font-medium text-kuhl-stone mb-2">Expected CSV columns:</p>
            <p className="text-kuhl-stone/70 leading-relaxed">
              Style#, Style Desc, Clr, Clr Desc, Style/Color, Division Desc, Cat Desc, 
              Season, Price, MSRP, Cost, Carry Over, Product Line Desc, Designer Name...
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-kuhl-sand/30 flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={handleConfirmImport}
            disabled={!result || result.products.length === 0}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Import {result?.importedCount.toLocaleString() || 0} Products
          </button>
        </div>
      </div>
    </div>
  );
}
