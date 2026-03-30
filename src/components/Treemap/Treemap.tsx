import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { useTreemapLayout } from '../../hooks/useTreemapLayout';
import { useTooltip } from '../../hooks/useTooltip';
import { useAppContext } from '../../context/AppContext';
import { politicians } from '../../data/politicians';
import { IndustryGroup } from './IndustryGroup';
import { Tooltip } from '../Tooltip/Tooltip';

const DEFAULT_LIMIT = window.innerWidth < 640 ? 10 : 20;

/** Pre-sort politicians by total donations descending (stable across renders). */
const sortedPoliticians = [...politicians].sort((a, b) => {
  const totalA = a.donations.reduce((s, d) => s + d.amount, 0);
  const totalB = b.donations.reduce((s, d) => s + d.amount, 0);
  return totalB - totalA;
});

export function Treemap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [displayLimit, setDisplayLimit] = useState<number>(DEFAULT_LIMIT);
  const { searchQuery, hoveredPoliticianId, colorMode, statusFilter } = useAppContext();
  const { tooltip, onMouseMove, onMouseLeave } = useTooltip();

  const updateDimensions = useCallback(() => {
    if (containerRef.current) {
      const w = containerRef.current.clientWidth;
      // On mobile (<640px), use a taller ratio so tiles stay large and scrollable
      const ratio = w < 640 ? 1.0 : 0.6;
      setDimensions({ width: w, height: w * ratio });
    }
  }, []);

  useEffect(() => {
    updateDimensions();
    const observer = new ResizeObserver(updateDimensions);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [updateDimensions]);

  const filteredPoliticians = useMemo(() => {
    if (statusFilter === 'all') return sortedPoliticians;
    return sortedPoliticians.filter((p) => p.status === statusFilter);
  }, [statusFilter]);

  const displayedPoliticians = useMemo(() => {
    // When searching, show all matches regardless of limit
    if (searchQuery) return filteredPoliticians;
    return filteredPoliticians.slice(0, displayLimit);
  }, [displayLimit, searchQuery, filteredPoliticians]);

  const { groups, maxDonation } = useTreemapLayout(
    displayedPoliticians,
    dimensions.width,
    dimensions.height,
    searchQuery,
    colorMode
  );

  const hoveredPolitician = hoveredPoliticianId
    ? politicians.find((p) => p.id === hoveredPoliticianId) ?? null
    : null;

  const isSearching = searchQuery.length > 0;
  const canShowMore = displayLimit < sortedPoliticians.length;

  return (
    <div className="px-6 pb-6 flex-1">
      <div ref={containerRef} className="w-full max-w-[1400px] mx-auto">
        <svg
          width={dimensions.width}
          height={dimensions.height}
          className="rounded-lg"
          style={{ background: '#0a0a12' }}
          onMouseMove={onMouseMove}
          onMouseLeave={onMouseLeave}
        >
          {groups.map((group, i) => (
            <IndustryGroup key={i} group={group} maxDonation={maxDonation} />
          ))}
        </svg>

        {/* Show more / less controls */}
        {!isSearching && (
          <div className="flex items-center justify-center gap-3 mt-3">
            <span className="text-[11px] text-[#555]">
              Showing top {Math.min(displayLimit, sortedPoliticians.length)} of {sortedPoliticians.length} politicians
            </span>
            {canShowMore && (
              <button
                onClick={() => setDisplayLimit((n) => Math.min(n + 20, sortedPoliticians.length))}
                className="px-3 py-1 text-xs rounded-md border border-white/10 bg-transparent text-[#888894] hover:bg-white/5 hover:text-[#bbb] cursor-pointer transition-colors"
              >
                Show more
              </button>
            )}
            {displayLimit > DEFAULT_LIMIT && (
              <button
                onClick={() => setDisplayLimit(DEFAULT_LIMIT)}
                className="px-3 py-1 text-xs rounded-md border border-white/10 bg-transparent text-[#888894] hover:bg-white/5 hover:text-[#bbb] cursor-pointer transition-colors"
              >
                Reset
              </button>
            )}
          </div>
        )}
      </div>
      {tooltip.visible && hoveredPolitician && (
        <Tooltip x={tooltip.x} y={tooltip.y} politician={hoveredPolitician} />
      )}
    </div>
  );
}
