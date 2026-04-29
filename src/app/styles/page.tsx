'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { STYLES_DATA, FILTER_TABS, type FilterKey } from '@/lib/styles-data';
import StyleCard from './components/StyleCard';

// ── Nav ────────────────────────────────────────────────────────────

function Nav() {
  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.06]"
      style={{ backdropFilter: 'blur(20px) saturate(1.6)', background: 'rgba(14,12,9,0.85)' }}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-yellow-400">
            <span className="text-sm font-black text-kuhl-stone" style={{ fontFamily: "'Archivo Narrow', sans-serif" }}>
              K
            </span>
          </div>
          <span className="text-sm tracking-wide text-kuhl-sand" style={{ fontFamily: "'Archivo Narrow', sans-serif" }}>
            K&Uuml;HL <span className="text-kuhl-earth mx-1">&middot;</span> SP26 Style Stories
          </span>
        </div>

        {/* Links */}
        <div className="hidden sm:flex items-center gap-6">
          <button
            onClick={() => {
              const el = document.getElementById('styles-grid');
              el?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="text-sm text-kuhl-clay hover:text-kuhl-cream transition-colors"
            style={{ fontFamily: "'Archivo Narrow', sans-serif" }}
          >
            Men&apos;s
          </button>
          <button
            onClick={() => {
              const el = document.getElementById('styles-grid');
              el?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="text-sm text-kuhl-clay hover:text-kuhl-cream transition-colors"
            style={{ fontFamily: "'Archivo Narrow', sans-serif" }}
          >
            Women&apos;s
          </button>
          <Link
            href="/"
            className="group flex items-center gap-1.5 rounded-full border border-yellow-400/30 bg-yellow-400/10 px-4 py-1.5 text-sm font-medium text-yellow-400 hover:bg-yellow-400/20 transition-colors"
            style={{ fontFamily: "'Archivo Narrow', sans-serif" }}
          >
            Pricing Tracker
            <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </nav>
  );
}

// ── Hero ───────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="relative flex items-center justify-center overflow-hidden" style={{ minHeight: '500px' }}>
      {/* Background gradient — sage-tinted forest into charcoal */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(170deg, #0a1a0a 0%, #131f12 25%, #0e0c09 60%, #0e0c09 100%)',
        }}
      />

      {/* Subtle texture overlay */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
      }} />

      {/* Mountain silhouette SVG */}
      <svg
        className="absolute bottom-0 left-0 right-0 w-full"
        viewBox="0 0 1440 160"
        preserveAspectRatio="none"
        style={{ height: '160px' }}
      >
        <path
          d="M0 160 L0 110 L120 70 L240 95 L360 45 L480 80 L600 30 L720 65 L840 20 L960 55 L1080 35 L1200 70 L1320 50 L1440 85 L1440 160 Z"
          fill="#0e0c09"
          opacity="0.6"
        />
        <path
          d="M0 160 L0 130 L180 90 L300 110 L480 60 L600 95 L720 50 L900 80 L1020 45 L1140 75 L1300 55 L1440 100 L1440 160 Z"
          fill="#0e0c09"
        />
      </svg>

      {/* Content */}
      <div className="relative z-10 mx-auto max-w-3xl px-6 text-center py-24">
        <h1
          className="text-4xl sm:text-5xl lg:text-6xl font-light text-kuhl-cream mb-6 leading-tight"
          style={{ fontFamily: "'Archivo Narrow', sans-serif" }}
        >
          Built for the mountain.
          <br />
          <span className="text-yellow-400">Worn everywhere.</span>
        </h1>
        <p
          className="text-base sm:text-lg text-kuhl-sand/80 max-w-xl mx-auto leading-relaxed"
          style={{ fontFamily: "'Archivo Narrow', sans-serif" }}
        >
          The stories behind the styles that define K&Uuml;HL&apos;s SP26 line&mdash;who
          they&apos;re built for, why they exist, and how they&apos;re constructed.
          Internal pricing and channel data included.
        </p>
      </div>

      {/* Scroll indicator */}
      <div className="absolute right-8 bottom-10 flex flex-col items-center gap-2 text-kuhl-earth z-10">
        <span
          className="text-[10px] uppercase tracking-[0.3em]"
          style={{ fontFamily: "'Archivo Narrow', sans-serif", writingMode: 'vertical-rl' }}
        >
          Scroll
        </span>
        <ChevronDown size={14} className="animate-bounce" />
      </div>
    </section>
  );
}

// ── Filter Bar ────────────────────────────────────────────────────

function FilterBar({
  activeFilter,
  onFilter,
}: {
  activeFilter: FilterKey;
  onFilter: (key: FilterKey) => void;
}) {
  return (
    <div className="sticky top-[57px] z-40 border-b border-white/[0.06]" style={{ background: 'rgba(14,12,9,0.92)', backdropFilter: 'blur(16px)' }}>
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex gap-1 overflow-x-auto scrollbar-hide py-1 -mb-px">
          {FILTER_TABS.map((tab) => {
            const count = STYLES_DATA.filter(tab.filter).length;
            const isActive = activeFilter === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => onFilter(tab.key)}
                className={`relative shrink-0 px-4 py-3 text-sm transition-colors ${
                  isActive
                    ? 'text-yellow-400'
                    : 'text-kuhl-clay hover:text-kuhl-sand'
                }`}
                style={{ fontFamily: "'Archivo Narrow', sans-serif" }}
              >
                <span className="tracking-wide">{tab.label}</span>
                <span className={`ml-1.5 text-xs ${isActive ? 'text-yellow-400/60' : 'text-kuhl-earth'}`}>
                  {count}
                </span>
                {/* Active indicator */}
                {isActive && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-yellow-400 rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────

export default function StyleStoriesPage() {
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');

  const activeTab = FILTER_TABS.find((t) => t.key === activeFilter) ?? FILTER_TABS[0];
  const filteredStyles = useMemo(
    () => STYLES_DATA.filter(activeTab.filter),
    [activeFilter] // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <div className="min-h-screen" style={{ background: '#0e0c09', color: '#c4b7a6' }}>
      <Nav />
      <Hero />
      <FilterBar activeFilter={activeFilter} onFilter={setActiveFilter} />

      {/* Style cards */}
      <main id="styles-grid" className="mx-auto max-w-7xl px-6 py-16 space-y-24">
        {filteredStyles.length > 0 ? (
          filteredStyles.map((style, i) => (
            <StyleCard key={style.id} style={style} index={i} />
          ))
        ) : (
          <div className="text-center py-24">
            <p
              className="text-2xl text-kuhl-earth italic"
              style={{ fontFamily: "'Archivo Narrow', sans-serif" }}
            >
              No styles match this filter yet.
            </p>
            <p className="text-sm text-kuhl-earth/60 mt-2" style={{ fontFamily: "'Archivo Narrow', sans-serif" }}>
              Women&apos;s and workwear styles are coming soon for SP26.
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] py-10">
        <div className="mx-auto max-w-7xl px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-yellow-400/80">
              <span className="text-[10px] font-black text-kuhl-stone" style={{ fontFamily: "'Archivo Narrow', sans-serif" }}>K</span>
            </div>
            <span className="text-xs text-kuhl-earth" style={{ fontFamily: "'Archivo Narrow', sans-serif" }}>
              K&Uuml;HL &middot; SP26 Internal
            </span>
          </div>
          <p className="text-xs text-kuhl-earth/60" style={{ fontFamily: "'Archivo Narrow', sans-serif" }}>
            For internal use only. Pricing and margin data is confidential.
          </p>
        </div>
      </footer>
    </div>
  );
}
