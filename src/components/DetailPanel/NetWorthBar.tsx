import type { Politician } from '../../data/types';
import { formatDollars } from '../../utils/format';

interface Props {
  politician: Politician;
}

export function NetWorthBar({ politician }: Props) {
  const { netWorthStart, netWorthCurrent, salary, yearsInOffice } = politician;

  if (netWorthStart === 0 && netWorthCurrent === 0) {
    return null;
  }

  const maxSalaryGrowth = salary * yearsInOffice;
  const actualGrowth = netWorthCurrent - netWorthStart;
  const isSuspicious = actualGrowth > maxSalaryGrowth * 3;
  const ratio = netWorthStart / netWorthCurrent;

  return (
    <div className="mb-4">
      <div className="flex justify-between text-xs text-[#86868B] mb-1.5">
        <span>Net Worth Growth</span>
        {isSuspicious && (
          <span className="text-red-400 font-medium">Exceeds salary income</span>
        )}
      </div>
      <div className="h-6 bg-black/[.06] rounded overflow-hidden flex">
        <div
          className="h-full bg-[#4682B4] transition-all"
          style={{ width: `${ratio * 100}%` }}
        />
        <div
          className="h-full transition-all"
          style={{
            width: `${(1 - ratio) * 100}%`,
            backgroundColor: isSuspicious ? '#D94A4A' : '#5F9EA0',
          }}
        />
      </div>
      <div className="flex justify-between text-xs mt-1">
        <span className="text-[#86868B]">{formatDollars(netWorthStart)}</span>
        <span className="text-[#1D1D1F] font-medium">{formatDollars(netWorthCurrent)}</span>
      </div>
    </div>
  );
}
