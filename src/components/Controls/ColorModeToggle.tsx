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

  return (
    <div className="flex flex-wrap gap-1">
      {modes.map((m) => (
        <button
          key={m.value}
          onClick={() => setColorMode(m.value)}
          className={`px-2.5 py-1 text-[11px] font-medium rounded transition-all cursor-pointer whitespace-nowrap ${
            colorMode === m.value
              ? 'bg-white/8 text-[#e0e0e8] border border-white/20'
              : 'bg-transparent text-[#888894] border border-white/10 hover:bg-white/4'
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
