import { useLayoutEffect, useRef, useState } from 'react';
import { useAppContext, type StatusFilter } from '../../context/AppContext';

const OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'office', label: 'In Office' },
  { value: 'candidate', label: 'Candidates' },
];

export function StatusFilterPill() {
  const { statusFilter, setStatusFilter } = useAppContext();
  const containerRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicator, setIndicator] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const recalc = () => {
      const idx = OPTIONS.findIndex((o) => o.value === statusFilter);
      const btn = btnRefs.current[idx];
      const container = containerRef.current;
      if (!btn || !container) return;
      const cRect = container.getBoundingClientRect();
      const bRect = btn.getBoundingClientRect();
      setIndicator({
        left: bRect.left - cRect.left,
        top: bRect.top - cRect.top,
        width: bRect.width,
        height: bRect.height,
      });
    };
    recalc();
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, [statusFilter]);

  return (
    <div
      ref={containerRef}
      className="relative flex items-center rounded-full bg-black/[.04] p-0.5"
    >
      {indicator && (
        <span
          aria-hidden
          className="absolute rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
          style={{
            left: indicator.left,
            top: indicator.top,
            width: indicator.width,
            height: indicator.height,
            transition: 'left 380ms cubic-bezier(0.32, 0.72, 0, 1), top 380ms cubic-bezier(0.32, 0.72, 0, 1), width 380ms cubic-bezier(0.32, 0.72, 0, 1), height 380ms cubic-bezier(0.32, 0.72, 0, 1)',
          }}
        />
      )}
      {OPTIONS.map(({ value, label }, i) => {
        const active = statusFilter === value;
        return (
          <button
            key={value}
            ref={(el) => { btnRefs.current[i] = el; }}
            onClick={() => setStatusFilter(value)}
            className={`relative z-10 border-none cursor-pointer text-[10px] font-medium tracking-tight px-2.5 py-1 rounded-full bg-transparent transition-colors duration-200 ${
              active ? 'text-[#1D1D1F]' : 'text-[#86868B] hover:text-[#1D1D1F]'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
