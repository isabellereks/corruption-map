import type { Politician } from '../../data/types';
import { industryMap } from '../../data/industries';

interface Props {
  politician: Politician;
}

export function VoteAlignment({ politician }: Props) {
  const score = politician.voteAlignmentScore;

  if (score === 0 && politician.suspiciousVotes.length === 0) {
    return null;
  }

  const color = score > 75 ? '#D94A4A' : score > 50 ? '#DAA520' : '#2E8B57';

  return (
    <div className="mb-4">
      <div className="flex justify-between text-xs text-[#888894] mb-1.5">
        <span>Donor Vote Alignment</span>
        <span style={{ color }} className="font-medium">{score}%</span>
      </div>
      <div className="h-3 bg-[#1a1a2e] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${score}%`, backgroundColor: color }}
        />
      </div>
      {politician.suspiciousVotes.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] font-semibold tracking-[0.08em] text-[#888894] uppercase mb-2">
            Suspicious Votes
          </div>
          {politician.suspiciousVotes.slice(0, 5).map((v, i) => (
            <div key={i} className="text-xs mb-1.5 pl-3 py-2.5 pr-3 rounded-lg bg-white/3 border-l-2 border-[#333]">
              <div className="flex items-center gap-1.5">
                <span className="text-[#e0e0e8] font-mono">{v.bill}</span>
                {v.howTheyVoted && (
                  <span
                    className="px-1 py-0.5 rounded text-[9px] font-bold leading-none"
                    style={{
                      backgroundColor: v.howTheyVoted === 'Yea' ? 'rgba(46,139,87,0.2)' : 'rgba(217,74,74,0.2)',
                      color: v.howTheyVoted === 'Yea' ? '#2E8B57' : '#D94A4A',
                    }}
                  >
                    {v.howTheyVoted}
                  </span>
                )}
                {industryMap.get(v.industryId)?.name && (
                  <span className="text-[#666]">
                    ({industryMap.get(v.industryId)!.name})
                  </span>
                )}
              </div>
              <div className="text-[#888894] mt-0.5">{v.description}</div>
              {v.reason && (
                <div className="text-[#666] mt-0.5 italic">{v.reason}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
