'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Download,
  FileSpreadsheet,
  FolderOpen,
  Search,
  ChevronDown,
  ChevronRight,
  HardDrive,
  AlertCircle,
} from 'lucide-react';

interface FileInfo {
  name: string;
  size: number;
  modified: string;
  category: string;
  ext: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const CATEGORY_COLORS: Record<string, string> = {
  Sales: 'bg-emerald-500/15 text-emerald-400',
  Invoices: 'bg-blue-500/15 text-blue-400',
  Inventory: 'bg-amber-500/15 text-amber-400',
  'Line List': 'bg-purple-500/15 text-purple-400',
  Costs: 'bg-red-500/15 text-red-400',
  Pricing: 'bg-cyan-500/15 text-cyan-400',
  Colors: 'bg-pink-500/15 text-pink-400',
  Product: 'bg-orange-500/15 text-orange-400',
  Tariffs: 'bg-yellow-500/15 text-yellow-400',
  Other: 'bg-kuhl-stone/15 text-kuhl-stone/60',
};

export default function SourceFilesView() {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/files')
      .then(r => r.json())
      .then(d => {
        if (d.success) setFiles(d.files || []);
        else setError(d.message || 'Failed to load files');
        setLoading(false);
      })
      .catch(() => {
        setError('Could not connect to file server');
        setLoading(false);
      });
  }, []);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    files.forEach(f => cats.add(f.category));
    return Array.from(cats).sort();
  }, [files]);

  const filtered = useMemo(() => {
    return files.filter(f => {
      if (categoryFilter && f.category !== categoryFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return f.name.toLowerCase().includes(q) || f.category.toLowerCase().includes(q);
      }
      return true;
    });
  }, [files, search, categoryFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, FileInfo[]>();
    filtered.forEach(f => {
      const arr = map.get(f.category) || [];
      arr.push(f);
      map.set(f.category, arr);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const totalSize = useMemo(() => filtered.reduce((s, f) => s + f.size, 0), [filtered]);

  const toggleCategory = (cat: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const handleDownload = async (fileName: string) => {
    setDownloading(fileName);
    try {
      const res = await fetch(`/api/files?download=${encodeURIComponent(fileName)}`);
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Download failed: ' + fileName);
    }
    setDownloading(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-kuhl-stone/50">
        <div className="animate-spin w-6 h-6 border-2 border-kuhl-stone/30 border-t-kuhl-blue rounded-full mr-3" />
        Loading source files...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-text-primary">Source Files</h2>
        <p className="text-sm text-kuhl-stone/50 mt-1">
          Download the raw Excel source files used to build the database
        </p>
      </div>

      {files.length === 0 ? (
        <div className="bg-card-bg border border-kuhl-stone/10 rounded-xl p-8 text-center">
          <AlertCircle className="w-12 h-12 text-amber-400/50 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-text-primary mb-2">No Source Files Available</h3>
          <p className="text-sm text-kuhl-stone/50 max-w-md mx-auto">
            {error || 'Source Excel files are available when running the local development server. Place .xlsx files in the data/ folder to make them available here.'}
          </p>
        </div>
      ) : (
        <>
          {/* Stats + Filters */}
          <div className="flex flex-wrap items-center gap-4">
            {/* Stats */}
            <div className="flex items-center gap-6 mr-auto">
              <div className="flex items-center gap-2 text-sm text-kuhl-stone/60">
                <FileSpreadsheet className="w-4 h-4" />
                <span className="font-semibold text-text-primary">{filtered.length}</span> files
              </div>
              <div className="flex items-center gap-2 text-sm text-kuhl-stone/60">
                <HardDrive className="w-4 h-4" />
                <span className="font-semibold text-text-primary">{formatBytes(totalSize)}</span> total
              </div>
            </div>

            {/* Category filter */}
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="bg-card-bg border border-kuhl-stone/10 rounded-lg px-3 py-1.5 text-sm text-text-primary"
            >
              <option value="">All Categories</option>
              {categories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-kuhl-stone/40" />
              <input
                type="text"
                placeholder="Search files..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="bg-card-bg border border-kuhl-stone/10 rounded-lg pl-9 pr-3 py-1.5 text-sm text-text-primary w-56 placeholder:text-kuhl-stone/30"
              />
            </div>
          </div>

          {/* File List by Category */}
          <div className="space-y-4">
            {grouped.map(([category, catFiles]) => {
              const collapsed = collapsedCategories.has(category);
              const catSize = catFiles.reduce((s, f) => s + f.size, 0);
              return (
                <div key={category} className="bg-card-bg border border-kuhl-stone/10 rounded-xl overflow-hidden">
                  {/* Category Header */}
                  <button
                    onClick={() => toggleCategory(category)}
                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-kuhl-stone/5 transition-colors"
                  >
                    {collapsed ? (
                      <ChevronRight className="w-4 h-4 text-kuhl-stone/40" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-kuhl-stone/40" />
                    )}
                    <FolderOpen className="w-4 h-4 text-kuhl-stone/50" />
                    <span className="font-semibold text-text-primary text-sm">{category}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[category] || CATEGORY_COLORS.Other}`}>
                      {catFiles.length} {catFiles.length === 1 ? 'file' : 'files'}
                    </span>
                    <span className="text-xs text-kuhl-stone/40 ml-auto">{formatBytes(catSize)}</span>
                  </button>

                  {/* File Rows */}
                  {!collapsed && (
                    <div className="border-t border-kuhl-stone/5">
                      {catFiles.map((file, idx) => (
                        <div
                          key={file.name + idx}
                          className="flex items-center gap-3 px-5 py-2.5 hover:bg-kuhl-stone/5 transition-colors group border-b border-kuhl-stone/5 last:border-0"
                        >
                          <FileSpreadsheet className="w-4 h-4 text-emerald-500/70 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-text-primary truncate">{file.name}</p>
                            <p className="text-[11px] text-kuhl-stone/40">
                              {formatBytes(file.size)} &middot; {formatDate(file.modified)}
                            </p>
                          </div>
                          <button
                            onClick={() => handleDownload(file.name)}
                            disabled={downloading === file.name}
                            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-kuhl-blue/10 text-kuhl-blue hover:bg-kuhl-blue/20 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
                          >
                            {downloading === file.name ? (
                              <div className="animate-spin w-3 h-3 border-2 border-kuhl-blue/30 border-t-kuhl-blue rounded-full" />
                            ) : (
                              <Download className="w-3 h-3" />
                            )}
                            Download
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
