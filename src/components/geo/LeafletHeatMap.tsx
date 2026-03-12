'use client';

/**
 * Leaflet-based heat map with CartoDB dark tiles.
 * Must be loaded via dynamic import with ssr:false (Leaflet needs window).
 */

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';

import type { HeatPoint } from '@/lib/geo-coords';

// ── Types ──

export interface MetroMarker {
  cbsaCode: string;
  name: string;
  lat: number;
  lng: number;
  radius: number;
  value: number;
  formattedValue: string;
  rank: number;
  isSelected: boolean;
  isHovered: boolean;
}

export interface LeafletHeatMapProps {
  heatPoints: HeatPoint[];
  metroMarkers: MetroMarker[];
  showMetroBubbles: boolean;
  onMetroClick: (cbsaCode: string) => void;
  onMetroHover: (cbsaCode: string | null) => void;
  maxIntensity: number;
}

// ── Heat gradient — cool-to-hot with visible contrast ──
const HEAT_GRADIENT: Record<number, string> = {
  0.0: 'rgba(0, 0, 0, 0)',
  0.08: 'rgba(10, 20, 60, 0.3)',
  0.18: '#0d2266',
  0.30: '#1a3a9a',
  0.40: '#6a1b9a',
  0.50: '#b71c1c',
  0.60: '#d84315',
  0.70: '#ef6c00',
  0.80: '#f9a825',
  0.90: '#ffee58',
  1.0: '#ffffff',
};

// ── US Bounds ──
const US_BOUNDS: L.LatLngBoundsExpression = [
  [24.0, -126.0],
  [50.0, -65.0],
];

// ── Heat Layer Component (imperative integration) ──

function HeatOverlay({
  points,
  maxIntensity,
}: {
  points: HeatPoint[];
  maxIntensity: number;
}) {
  const map = useMap();
  const layerRef = useRef<L.HeatLayer | null>(null);

  useEffect(() => {
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
    }

    if (points.length === 0) return;

    const heat = L.heatLayer(points, {
      radius: 25,
      blur: 18,
      maxZoom: 10,
      max: maxIntensity * 0.35 || 1,
      minOpacity: 0.15,
      gradient: HEAT_GRADIENT,
    });

    heat.addTo(map);
    layerRef.current = heat;

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, points, maxIntensity]);

  return null;
}

// ── Metro Bubble Overlay ──

function MetroBubbles({
  markers,
  onMetroClick,
  onMetroHover,
}: {
  markers: MetroMarker[];
  onMetroClick: (cbsaCode: string) => void;
  onMetroHover: (cbsaCode: string | null) => void;
}) {
  return (
    <>
      {markers.map((m) => {
        const isTop5 = m.rank <= 5;
        const isTop10 = m.rank <= 10;

        return (
          <React.Fragment key={m.cbsaCode}>
            {/* Glow ring for top 5 */}
            {isTop5 && (
              <CircleMarker
                center={[m.lat, m.lng]}
                radius={m.radius + 4}
                pathOptions={{
                  fillColor: '#ff9f0a',
                  fillOpacity: 0.12,
                  stroke: false,
                }}
              />
            )}

            {/* Main bubble */}
            <CircleMarker
              center={[m.lat, m.lng]}
              radius={m.radius}
              pathOptions={{
                fillColor: m.isSelected ? '#ff9f0a' : 'rgba(255, 159, 10, 0.35)',
                fillOpacity: m.isSelected ? 0.7 : 0.5,
                color: m.isSelected
                  ? '#ffcc00'
                  : m.isHovered
                    ? '#ffcc00'
                    : isTop5
                      ? '#ff9f0a'
                      : isTop10
                        ? 'rgba(255, 159, 10, 0.7)'
                        : 'rgba(255, 159, 10, 0.4)',
                weight: m.isSelected ? 2.5 : isTop5 ? 2 : 1.5,
              }}
              eventHandlers={{
                click: () => onMetroClick(m.cbsaCode),
                mouseover: () => onMetroHover(m.cbsaCode),
                mouseout: () => onMetroHover(null),
              }}
            >
              {/* Show label for larger bubbles or top 10 */}
              {(m.radius >= 10 || isTop10) && (
                <Tooltip
                  direction="top"
                  offset={[0, -m.radius - 2]}
                  permanent
                  className="metro-label-tooltip"
                >
                  <span className="text-[10px] font-semibold text-white/90">
                    {m.name}
                  </span>
                </Tooltip>
              )}
            </CircleMarker>
          </React.Fragment>
        );
      })}
    </>
  );
}

// ── Main Component ──
// Wrapper that cleans up any stale Leaflet map instance on the container div
// before react-leaflet tries to re-initialize (fixes HMR "already initialized" error)

export default function LeafletHeatMap({
  heatPoints,
  metroMarkers,
  showMetroBubbles,
  onMetroClick,
  onMetroHover,
  maxIntensity,
}: LeafletHeatMapProps) {
  const memoizedPoints = useMemo(() => heatPoints, [heatPoints]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapReady, setMapReady] = useState(false);

  // On mount, clean up any existing Leaflet instance on the container (HMR scenario)
  // then signal that we're ready to render MapContainer
  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      // Leaflet attaches _leaflet_id to initialized containers
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const leafletEl = el.querySelector('.leaflet-container') as any;
      if (leafletEl && leafletEl._leaflet_id) {
        // Remove old map instance
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const oldMap = (leafletEl as any)._leaflet_map;
          if (oldMap) oldMap.remove();
        } catch {
          // Brute force: clear the container
        }
        leafletEl.remove();
      }
    }
    setMapReady(true);
    return () => setMapReady(false);
  }, []);

  return (
    <div ref={containerRef} style={{ height: '100%', width: '100%' }}>
      {mapReady && (
        <MapContainer
          bounds={US_BOUNDS}
          maxBounds={[
            [10, -180],
            [72, -50],
          ]}
          minZoom={3}
          maxZoom={12}
          scrollWheelZoom={true}
          zoomControl={true}
          attributionControl={true}
          style={{ height: '100%', width: '100%', background: '#0a0a0f' }}
          className="leaflet-dark-theme"
        >
          {/* CartoDB Dark Matter tiles */}
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
            subdomains="abcd"
            maxZoom={20}
          />

          {/* Heat layer */}
          <HeatOverlay points={memoizedPoints} maxIntensity={maxIntensity} />

          {/* Metro markers */}
          {showMetroBubbles && (
            <MetroBubbles
              markers={metroMarkers}
              onMetroClick={onMetroClick}
              onMetroHover={onMetroHover}
            />
          )}
        </MapContainer>
      )}
    </div>
  );
}
