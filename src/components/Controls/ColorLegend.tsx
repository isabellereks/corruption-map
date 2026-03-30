import { useAppContext } from '../../context/AppContext';
import { partyColors } from '../../utils/colors';

export function ColorLegend() {
  const { colorMode } = useAppContext();

  if (colorMode === 'industry') {
    return (
      <div className="flex gap-3 items-center">
        {(['D', 'R', 'I'] as const).map((p) => (
          <div key={p} className="flex items-center gap-1 text-[10px] text-[#888894]">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: partyColors[p] }} />
            {p === 'D' ? 'Democrat' : p === 'R' ? 'Republican' : 'Independent'}
          </div>
        ))}
      </div>
    );
  }

  if (colorMode === 'amount') {
    return (
      <div className="flex items-center gap-1.5 text-[10px] text-[#888894]">
        <span>Low $</span>
        <div
          className="w-20 h-2.5 rounded-sm"
          style={{
            background: 'linear-gradient(to right, rgb(60,80,100), rgb(100,70,85), rgb(140,60,75), rgb(180,50,68), rgb(240,45,60))',
          }}
        />
        <span>High $</span>
      </div>
    );
  }

  if (colorMode === 'map') {
    return (
      <div className="flex gap-3 items-center">
        {(['D', 'R', 'I'] as const).map((p) => (
          <div key={p} className="flex items-center gap-1 text-[10px] text-[#888894]">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: partyColors[p] }} />
            {p === 'D' ? 'Democrat' : p === 'R' ? 'Republican' : 'Independent'}
          </div>
        ))}
        <span className="text-[10px] text-[#555] ml-2">opacity = donation volume</span>
      </div>
    );
  }

  // alignment
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-[#888894]">
      <span>Independent</span>
      <div
        className="w-20 h-2.5 rounded-sm"
        style={{
          background: 'linear-gradient(to right, #2E8B57, #6B8E23, #DAA520, #D9804A, #D94A4A)',
        }}
      />
      <span>Donor-aligned</span>
    </div>
  );
}
