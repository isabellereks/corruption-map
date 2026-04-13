import { createPortal } from 'react-dom';
import type { Politician } from '../../data/types';
import { useAppContext } from '../../context/AppContext';
import { partyColors } from '../../utils/colors';
import { formatDollars } from '../../utils/format';
import { industryMap } from '../../data/industries';

interface Props {
  x: number;
  y: number;
  politician: Politician;
}

export function Tooltip({ x, y, politician }: Props) {
  const { colorMode } = useAppContext();
  const totalDonations = politician.donations.reduce((s, d) => s + d.amount, 0);
  const topDonation = politician.donations.reduce(
    (max, d) => (d.amount > max.amount ? d : max),
    politician.donations[0]
  );

  return createPortal(
    <div
      className="fixed z-50 rounded-2xl px-4 py-3 pointer-events-none"
      style={{
        left: x,
        top: y,
        width: 300,
        transition: 'opacity 0.12s',
        background: 'rgba(255,255,255,0.95)',
        border: '1px solid rgba(0,0,0,0.06)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.04)',
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <div
          className="w-2.5 h-2.5 rounded-full"
          style={{ backgroundColor: partyColors[politician.party] }}
        />
        <span className="text-sm font-semibold text-[#1D1D1F]">{politician.name}</span>
      </div>
      <div className="text-xs text-[#86868B] mb-2">
        {politician.party === 'D' ? 'Democrat' : politician.party === 'R' ? 'Republican' : 'Independent'} · {politician.state} · {politician.chamber}
      </div>

      {colorMode === 'industry' && (
        <>
          <div className="text-xs text-[#1D1D1F] mb-1">
            Received: <span className="text-[#D94A4A] font-bold">{formatDollars(totalDonations)}</span>
            <span className="text-[#86868B]"> from lobbyists</span>
          </div>
          <div className="text-[11px] text-[#86868B] tracking-tight font-medium mt-2 mb-1">Who's Paying</div>
          {politician.donations
            .slice()
            .sort((a, b) => b.amount - a.amount)
            .map((d) => (
              <div key={d.industryId} className="flex items-center justify-between text-xs mb-0.5">
                <span className="text-[#86868B]">{industryMap.get(d.industryId)?.name}</span>
                <span className="text-[#1D1D1F] font-medium tabular-nums">{formatDollars(d.amount)}</span>
              </div>
            ))}
          <div className="text-xs text-[#1D1D1F] mt-2">
            Top donor: <span className="text-[#1D1D1F] font-medium">{topDonation.topDonor}</span>
          </div>
        </>
      )}

      {colorMode === 'amount' && (
        politician.netWorthStart > 0 ? (
          <>
            <div className="text-xs mb-1">
              <span className="text-[#86868B]">Entered office worth </span>
              <span className="text-[#1D1D1F] font-medium">{formatDollars(politician.netWorthStart)}</span>
            </div>
            <div className="text-xs mb-1">
              <span className="text-[#86868B]">Now worth </span>
              <span className="text-[#D94A4A] font-bold text-sm">{formatDollars(politician.netWorthCurrent)}</span>
            </div>
            <div className="text-xs text-[#1D1D1F] mb-1">
              <span className="text-[#DAA520] font-bold">
                {(politician.netWorthCurrent / politician.netWorthStart).toFixed(0)}x richer
              </span>
              <span className="text-[#86868B]"> in {politician.yearsInOffice} years</span>
            </div>
            <div className="text-xs text-[#86868B] mb-1">
              Salary: {formatDollars(politician.salary)}/yr
            </div>
            {(() => {
              const maxSalaryGrowth = politician.salary * politician.yearsInOffice;
              const actualGrowth = politician.netWorthCurrent - politician.netWorthStart;
              const ratio = maxSalaryGrowth > 0 ? actualGrowth / maxSalaryGrowth : 0;
              return ratio > 3 ? (
                <div className="text-xs text-[#D94A4A] mt-1 font-bold">
                  Gained {ratio.toFixed(0)}x more than their salary explains
                </div>
              ) : null;
            })()}
          </>
        ) : (
          <>
            <div className="text-xs mb-1">
              <span className="text-[#86868B]">Total PAC donations: </span>
              <span className="text-[#D94A4A] font-bold">{formatDollars(totalDonations)}</span>
            </div>
            <div className="text-[11px] text-[#86868B] tracking-tight font-medium mt-2 mb-1">Top Industries</div>
            {politician.donations
              .slice()
              .sort((a, b) => b.amount - a.amount)
              .slice(0, 3)
              .map((d) => (
                <div key={d.industryId} className="flex items-center justify-between text-xs mb-0.5">
                  <span className="text-[#86868B]">{industryMap.get(d.industryId)?.name ?? d.industryId}</span>
                  <span className="text-[#1D1D1F] font-medium tabular-nums">{formatDollars(d.amount)}</span>
                </div>
              ))}
          </>
        )
      )}

      {colorMode === 'alignment' && (
        politician.voteAlignmentScore > 0 ? (
          <>
            <div className="text-xs mb-1">
              <span className="text-[#86868B]">Votes with donors: </span>
              <span className="font-bold text-base" style={{
                color: politician.voteAlignmentScore > 70 ? '#D94A4A' : politician.voteAlignmentScore > 50 ? '#DAA520' : '#2E8B57'
              }}>{politician.voteAlignmentScore}%</span>
              <span className="text-[#86868B]"> of the time</span>
            </div>
            <div className="text-xs text-[#1D1D1F] mb-1">
              Received: <span className="text-[#1D1D1F] font-medium">{formatDollars(totalDonations)}</span>
            </div>
            {politician.suspiciousVotes.length > 0 ? (
              <>
                <div className="text-[11px] text-[#D94A4A] tracking-tight mt-2 mb-1 font-medium">
                  Exposed Votes ({politician.suspiciousVotes.length})
                </div>
                {politician.suspiciousVotes.slice(0, 3).map((v) => (
                  <div key={v.bill} className="text-xs mb-0.5">
                    <span className="text-[#D94A4A]">{v.bill}</span>
                    {v.howTheyVoted && (
                      <span className="text-[#A8A8AD]"> ({v.howTheyVoted})</span>
                    )}
                    <span className="text-[#86868B]"> {v.reason || v.description}</span>
                  </div>
                ))}
              </>
            ) : (
              <div className="text-xs text-[#2E8B57] mt-1">No suspicious votes found</div>
            )}
          </>
        ) : (
          <>
            <div className="text-xs text-[#1D1D1F] mb-1">
              Total PAC donations: <span className="text-[#D94A4A] font-bold">{formatDollars(totalDonations)}</span>
            </div>
            <div className="text-[11px] text-[#86868B] tracking-tight font-medium mt-2 mb-1">Donation Concentration</div>
            {politician.donations
              .slice()
              .sort((a, b) => b.amount - a.amount)
              .slice(0, 3)
              .map((d) => {
                const pct = Math.round((d.amount / totalDonations) * 100);
                return (
                  <div key={d.industryId} className="flex items-center justify-between text-xs mb-0.5">
                    <span className="text-[#86868B]">{industryMap.get(d.industryId)?.name ?? d.industryId}</span>
                    <span className="text-[#1D1D1F] font-medium tabular-nums">{pct}%</span>
                  </div>
                );
              })}
            <div className="text-xs text-[#86868B] mt-2">Vote alignment data not available</div>
          </>
        )
      )}
    </div>,
    document.body
  );
}
