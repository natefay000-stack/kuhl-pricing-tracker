'use client';

import { useState } from 'react';
import type { StyleData, ChannelFit } from '@/lib/styles-data';
import { Lock, ChevronDown } from 'lucide-react';

// ── Category badge colors ──────────────────────────────────────────

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  'True Outdoor': { bg: 'rgba(125,132,113,0.25)', text: '#a8b29c' },   // kuhl-sage tinted
  'Urban / Aktiv': { bg: 'rgba(100,116,139,0.25)', text: '#94a3b8' },  // kuhl-slate tinted
  Workwear: { bg: 'rgba(180,102,77,0.2)', text: '#d4845e' },           // kuhl-rust tinted
};

// ── Channel chip ───────────────────────────────────────────────────

function ChannelChip({ name, fit }: { name: string; fit: ChannelFit }) {
  const isNo = fit === 'No';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium transition-colors ${
        isNo
          ? 'bg-white/5 text-kuhl-earth line-through'
          : 'bg-white/10 text-kuhl-sand'
      }`}
    >
      {name}
      {!isNo && (
        <span className="ml-0.5 text-[10px] text-kuhl-clay">
          {fit}
        </span>
      )}
    </span>
  );
}

// ── Margin color helper ────────────────────────────────────────────

function marginColor(margin: number): string {
  if (margin >= 60) return '#a8b29c';  // sage-green (healthy)
  if (margin >= 52) return '#d4a44e';  // warm amber/clay
  return '#b4664d';                     // kuhl-rust (needs review)
}

function deltaColor(pp: number): string {
  if (pp > 0) return '#a8b29c';
  if (pp === 0) return '#9c7a5a';      // kuhl-clay (neutral)
  if (pp >= -2) return '#d4a44e';
  return '#b4664d';                     // kuhl-rust
}

function formatDelta(pp: number): string {
  const sign = pp > 0 ? '+' : '';
  return `${sign}${pp.toFixed(1)}pp`;
}

// ── Pricing Drawer ─────────────────────────────────────────────────

function PricingDrawer({ pricing, channels }: Pick<StyleData, 'pricing' | 'channels'>) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-6 rounded-lg border border-white/10 bg-white/[0.03] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm text-kuhl-sand hover:text-kuhl-cream transition-colors"
      >
        <span className="flex items-center gap-2">
          <Lock size={14} />
          <span className="font-medium tracking-wide" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
            Internal Pricing Data
          </span>
        </span>
        <ChevronDown
          size={16}
          className={`transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <div
        className={`grid transition-all duration-300 ease-in-out ${
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-4 pt-1">
            {/* KPI grid */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {/* MSRP */}
              <div className="rounded-md bg-white/[0.04] px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-widest text-kuhl-clay mb-1" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                  MSRP
                </div>
                <div className="text-lg font-semibold text-kuhl-cream">${pricing.msrp}</div>
              </div>
              {/* Wholesale */}
              <div className="rounded-md bg-white/[0.04] px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-widest text-kuhl-clay mb-1" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                  Wholesale
                </div>
                <div className="text-lg font-semibold text-kuhl-cream">${pricing.wholesale.toFixed(2)}</div>
              </div>
              {/* COGS */}
              <div className="rounded-md bg-white/[0.04] px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-widest text-kuhl-clay mb-1" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                  COGS
                </div>
                <div className="text-lg font-semibold text-kuhl-cream">${pricing.cogs.toFixed(2)}</div>
              </div>
              {/* Margin */}
              <div className="rounded-md bg-white/[0.04] px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-widest text-kuhl-clay mb-1" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                  Margin (WS)
                </div>
                <div className="text-lg font-semibold" style={{ color: marginColor(pricing.marginWs) }}>
                  {pricing.marginWs.toFixed(1)}%
                </div>
              </div>
              {/* vs Target */}
              <div className="rounded-md bg-white/[0.04] px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-widest text-kuhl-clay mb-1" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                  vs Target
                </div>
                <div className="text-lg font-semibold" style={{ color: deltaColor(pricing.vsTargetPp) }}>
                  {formatDelta(pricing.vsTargetPp)}
                  {pricing.vsTargetPp <= -5 && (
                    <span className="ml-1.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ background: 'rgba(180,102,77,0.2)', color: '#b4664d' }}>
                      Review
                    </span>
                  )}
                </div>
              </div>
              {/* vs SP25 */}
              <div className="rounded-md bg-white/[0.04] px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-widest text-kuhl-clay mb-1" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                  vs SP25
                </div>
                <div className="text-lg font-semibold" style={{ color: deltaColor(pricing.vsSp25Pp) }}>
                  {formatDelta(pricing.vsSp25Pp)}
                </div>
              </div>
            </div>

            {/* Channel fit */}
            <div className="flex flex-wrap gap-2">
              <ChannelChip name="Web" fit={channels.web} />
              <ChannelChip name="REI" fit={channels.rei} />
              <ChannelChip name="Retail" fit={channels.retail} />
              <ChannelChip name="Scheels" fit={channels.scheels} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main StyleCard ─────────────────────────────────────────────────

interface StyleCardProps {
  style: StyleData;
  index: number;
}

export default function StyleCard({ style, index }: StyleCardProps) {
  const isReversed = index % 2 === 1;
  const catColor = CATEGORY_COLORS[style.category] ?? { bg: 'rgba(255,255,255,0.1)', text: '#c4b7a6' };

  // Photo panel
  const photoPanel = (
    <div
      className="relative flex flex-col justify-between min-h-[520px] rounded-xl overflow-hidden p-6"
      style={{ background: style.photoBgGradient }}
    >
      {/* Top badges */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span
            className="rounded px-2 py-1 text-xs font-bold tracking-wider uppercase text-kuhl-sand"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", background: 'rgba(196,183,166,0.12)' }}
          >
            #{style.styleNumber}
          </span>
          <span
            className="rounded px-2 py-1 text-xs font-medium tracking-wide uppercase text-kuhl-clay"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", background: 'rgba(196,183,166,0.08)' }}
          >
            {style.gender}&apos;s
          </span>
        </div>
        <div className="flex items-center gap-2">
          {style.isNew && (
            <span
              className="rounded px-2 py-1 text-xs font-bold tracking-wider uppercase"
              style={{ fontFamily: "'Barlow Condensed', sans-serif", background: 'rgba(250,204,21,0.15)', color: '#facc15' }}
            >
              New SP26
            </span>
          )}
          <span
            className="rounded px-2 py-1 text-xs font-medium tracking-wide uppercase"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", background: catColor.bg, color: catColor.text }}
          >
            {style.category}
          </span>
        </div>
      </div>

      {/* Center placeholder silhouette */}
      <div className="flex-1 flex items-center justify-center my-8">
        <div className="relative flex flex-col items-center gap-4 text-kuhl-earth">
          {/* Simple pant/short silhouette */}
          <svg
            width="120"
            height="180"
            viewBox="0 0 120 180"
            fill="none"
            className="opacity-30"
          >
            {style.productType === 'Shorts' ? (
              <>
                <path
                  d="M25 10 H95 L105 100 H65 V80 H55 V100 H15 Z"
                  fill="currentColor"
                />
                <rect x="35" y="0" width="50" height="14" rx="3" fill="currentColor" />
              </>
            ) : (
              <>
                <path
                  d="M25 10 H95 L85 170 H65 V50 H55 V170 H35 Z"
                  fill="currentColor"
                />
                <rect x="35" y="0" width="50" height="14" rx="3" fill="currentColor" />
              </>
            )}
          </svg>
          <span className="text-xs tracking-widest uppercase text-kuhl-earth" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
            Replace with product photo
          </span>
          {/* To use real photos:
              import Image from 'next/image'
              <Image src={`/styles/${style.id}.jpg`} alt={style.name} fill className="object-cover" />
          */}
        </div>
      </div>

      {/* Bottom tagline */}
      <p
        className="text-sm italic text-kuhl-sand/70 text-center"
        style={{ fontFamily: "'Cormorant Garamond', serif" }}
      >
        &ldquo;{style.tagline}&rdquo;
      </p>
    </div>
  );

  // Content panel
  const contentPanel = (
    <div className="flex flex-col justify-center py-8 px-2 lg:px-6">
      {/* Header */}
      <div className="mb-6">
        <p
          className="text-xs uppercase tracking-[0.2em] text-kuhl-clay mb-2"
          style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
        >
          #{style.styleNumber} &middot; {style.gender}&apos;s {style.productType}
        </p>
        <h2
          className="text-3xl lg:text-4xl font-light text-kuhl-cream mb-1"
          style={{ fontFamily: "'Cormorant Garamond', serif" }}
        >
          {style.name}
        </h2>
        <p className="text-sm text-kuhl-clay" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
          {style.subtitle}
        </p>
      </div>

      {/* Designed for */}
      <div className="mb-6">
        <h3
          className="text-xs uppercase tracking-[0.2em] text-yellow-400/80 mb-2"
          style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
        >
          Designed for
        </h3>
        <p
          className="text-xl text-kuhl-sand italic mb-2"
          style={{ fontFamily: "'Cormorant Garamond', serif" }}
        >
          {style.designedForHeadline}
        </p>
        <p className="text-sm text-kuhl-sand/70 leading-relaxed" style={{ fontFamily: "'Barlow', sans-serif" }}>
          {style.designedForBody}
        </p>
      </div>

      {/* Why we built it */}
      <div className="mb-6">
        <h3
          className="text-xs uppercase tracking-[0.2em] text-yellow-400/80 mb-2"
          style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
        >
          Why we built it
        </h3>
        <div className="border-l-2 border-yellow-400/40 pl-4">
          <p className="text-sm text-kuhl-sand/70 leading-relaxed" style={{ fontFamily: "'Barlow', sans-serif" }}>
            {style.whyWeBuiltIt}
          </p>
        </div>
      </div>

      {/* Construction callouts */}
      <div className="mb-2">
        <h3
          className="text-xs uppercase tracking-[0.2em] text-yellow-400/80 mb-3"
          style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
        >
          Construction
        </h3>
        <ul className="space-y-2">
          {style.constructionFeatures.map((f) => (
            <li key={f.name} className="flex items-start gap-2.5 text-sm">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-yellow-400" />
              <span className="text-kuhl-sand/70 leading-relaxed" style={{ fontFamily: "'Barlow', sans-serif" }}>
                <strong className="text-kuhl-cream font-semibold">{f.name}</strong>{' '}
                &mdash; {f.description}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Pricing drawer */}
      <PricingDrawer pricing={style.pricing} channels={style.channels} />
    </div>
  );

  return (
    <article className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10">
      {isReversed ? (
        <>
          {contentPanel}
          {photoPanel}
        </>
      ) : (
        <>
          {photoPanel}
          {contentPanel}
        </>
      )}
    </article>
  );
}
