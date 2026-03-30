import { useAppContext, type StatusFilter } from '../../context/AppContext';

const OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'office', label: 'In Office' },
  { value: 'candidate', label: 'Candidates' },
];

export function StatusFilterPill() {
  const { statusFilter, setStatusFilter } = useAppContext();

  return (
    <div className="flex items-center rounded-full bg-[#1a1a2e] border border-white/8 p-0.5">
      {OPTIONS.map(({ value, label }) => {
        const isActive = statusFilter === value;
        return (
          <button
            key={value}
            onClick={() => setStatusFilter(value)}
            className="border-none cursor-pointer transition-all text-[10px] font-medium px-2.5 py-0.5 rounded-full"
            style={{
              background: isActive ? 'rgba(255,255,255,0.12)' : 'transparent',
              color: isActive ? '#e0e0e8' : '#666',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
