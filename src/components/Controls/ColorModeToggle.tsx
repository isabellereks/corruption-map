import { useLayoutEffect, useRef, useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import type { ColorMode } from '../../data/types';

const modes: { value: ColorMode; label: string }[] = [
  { value: 'industry', label: 'Industry' },
  { value: 'amount', label: 'Net Worth Growth' },
  { value: 'alignment', label: 'Donor Alignment' },
  { value: 'map', label: 'Map' },
];

export function ColorModeToggle() {
  const { colorMode, setColorMode } = useAppContext();
  const containerRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicator, setIndicator] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const recalc = () => {
      const idx = modes.findIndex((m) => m.value === colorMode);
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
  }, [colorMode]);

  return (
    <div
      ref={containerRef}
      className="relative flex flex-wrap items-center gap-0.5 p-0.5 rounded-full bg-black/[.04]"
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
      {modes.map((m, i) => {
        const active = colorMode === m.value;
        return (
          <button
            key={m.value}
            ref={(el) => { btnRefs.current[i] = el; }}
            onClick={() => setColorMode(m.value)}
            className={`relative z-10 px-3 h-7 text-[11px] font-medium tracking-tight rounded-full cursor-pointer whitespace-nowrap transition-colors duration-200 ${
              active ? 'text-[#1D1D1F]' : 'text-[#86868B] hover:text-[#1D1D1F]'
            }`}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
