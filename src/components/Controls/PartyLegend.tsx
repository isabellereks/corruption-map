import { partyColors } from '../../utils/colors';

const parties = [
  { key: 'D' as const, label: 'Democrat' },
  { key: 'R' as const, label: 'Republican' },
  { key: 'I' as const, label: 'Independent' },
];

export function PartyLegend() {
  return (
    <div className="flex gap-3 items-center">
      {parties.map((p) => (
        <div key={p.key} className="flex items-center gap-1.5 text-xs text-[#86868B]">
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: partyColors[p.key] }}
          />
          {p.label}
        </div>
      ))}
    </div>
  );
}
