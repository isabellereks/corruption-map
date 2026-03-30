import { useMemo, useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import { politicians } from '../../data/politicians';
import { industries } from '../../data/industries';
import { partyColors } from '../../utils/colors';
import { formatDollars } from '../../utils/format';
import type { ColorMode } from '../../data/types';

export function StatsRow() {
  const { colorMode, statusFilter } = useAppContext();

  const stats = useMemo(() => {
    const filtered = statusFilter === 'all'
      ? politicians
      : politicians.filter((p) => p.status === statusFilter);

    const total = filtered.length;
    const totalDonations = filtered.reduce(
      (s, p) => s + p.donations.reduce((s2, d) => s2 + d.amount, 0),
      0
    );
    const withAlignment = filtered.filter((p) => p.voteAlignmentScore > 0);
    const avgAlignment = withAlignment.length > 0
      ? withAlignment.reduce((s, p) => s + p.voteAlignmentScore, 0) / withAlignment.length
      : 0;
    const hasAlignmentData = withAlignment.length > 0;
    const hasWealthData = filtered.some((p) => p.netWorthStart > 0);

    const byParty = { D: 0, R: 0, I: 0 };
    for (const p of filtered) byParty[p.party]++;

    const byChamber = { Senate: 0, House: 0 };
    for (const p of filtered) byChamber[p.chamber]++;

    const tiers = [
      { label: 'High (80%+)', min: 80, max: 101, color: '#D94A4A' },
      { label: 'Medium (50–79%)', min: 50, max: 80, color: '#DAA520' },
      { label: 'Low (<50%)', min: 0, max: 50, color: '#2E8B57' },
    ].map((t) => ({
      ...t,
      count: filtered.filter(
        (p) => p.voteAlignmentScore >= t.min && p.voteAlignmentScore < t.max
      ).length,
    }));

    const industryTotals = new Map<string, number>();
    for (const p of filtered) {
      for (const d of p.donations) {
        industryTotals.set(d.industryId, (industryTotals.get(d.industryId) ?? 0) + d.amount);
      }
    }
    const topIndustries = industries
      .map((ind) => ({ ...ind, total: industryTotals.get(ind.id) ?? 0 }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
    const maxIndustryTotal = topIndustries[0]?.total ?? 1;

    const suspicious = hasWealthData ? filtered.filter((p) => {
      const growth = p.netWorthCurrent - p.netWorthStart;
      return growth > p.salary * p.yearsInOffice * 3;
    }) : [];

    const totalNetWorthGains = filtered.reduce(
      (s, p) => s + (p.netWorthCurrent - p.netWorthStart), 0
    );

    const avgGrowthMultiple = total > 0
      ? filtered.reduce(
          (s, p) => s + (p.netWorthStart > 0 ? p.netWorthCurrent / p.netWorthStart : 1), 0
        ) / total
      : 0;

    const biggestGainer = filtered.length > 0
      ? filtered.reduce((best, p) => {
          const growth = p.netWorthCurrent - p.netWorthStart;
          const bestGrowth = best.netWorthCurrent - best.netWorthStart;
          return growth > bestGrowth ? p : best;
        })
      : { name: '—', netWorthStart: 0, netWorthCurrent: 0 };

    const mostAligned = filtered.length > 0
      ? filtered.reduce((best, p) =>
          p.voteAlignmentScore > best.voteAlignmentScore ? p : best
        )
      : { name: '—', voteAlignmentScore: 0 };

    const totalSuspiciousVotes = filtered.reduce(
      (s, p) => s + p.suspiciousVotes.length, 0
    );
    const highAligned = filtered
      .filter((p) => p.voteAlignmentScore >= 75)
      .sort((a, b) => b.voteAlignmentScore - a.voteAlignmentScore);

    return {
      total,
      totalDonations,
      avgAlignment,
      hasAlignmentData,
      hasWealthData,
      byParty,
      byChamber,
      tiers,
      topIndustries,
      maxIndustryTotal,
      suspiciousCount: suspicious.length,
      totalNetWorthGains,
      avgGrowthMultiple,
      biggestGainer,
      mostAligned,
      highAligned,
      totalSuspiciousVotes,
      statesRepresented: new Set(filtered.map((p) => p.state)).size,
      topLobbyState: (() => {
        const byState = new Map<string, number>();
        for (const p of filtered) {
          const total = p.donations.reduce((s, d) => s + d.amount, 0);
          byState.set(p.state, (byState.get(p.state) ?? 0) + total);
        }
        let best = { state: '', total: 0 };
        for (const [state, total] of byState) {
          if (total > best.total) best = { state, total };
        }
        return best;
      })(),
    };
  }, [statusFilter]);

  const maxParty = Math.max(stats.byParty.D, stats.byParty.R, stats.byParty.I);

  return (
    <div className="flex flex-wrap items-start text-[#e0e0e8] gap-y-[20px] gap-x-[28px]">
      <StatBlock label="Politicians">
        <div className="text-[32px] font-bold leading-none tracking-[-0.03em]">{stats.total}</div>
        <div className="text-[11px] text-[#888894]">
          {stats.byChamber.Senate} senators · {stats.byChamber.House} reps
        </div>
      </StatBlock>

      <Divider />

      {renderModeStats(colorMode, stats, maxParty)}
    </div>
  );
}

function renderModeStats(
  colorMode: ColorMode,
  stats: Stats,
  maxParty: number
) {
  switch (colorMode) {
    case 'industry':
      return <IndustryStats stats={stats} maxParty={maxParty} />;
    case 'amount':
      return <AmountStats stats={stats} />;
    case 'alignment':
      return <AlignmentStats stats={stats} maxParty={maxParty} />;
    case 'map':
      return <MapStats stats={stats} />;
  }
}

type Stats = {
  total: number;
  totalDonations: number;
  avgAlignment: number;
  hasAlignmentData: boolean;
  hasWealthData: boolean;
  byParty: { D: number; R: number; I: number };
  byChamber: { Senate: number; House: number };
  tiers: { label: string; min: number; max: number; color: string; count: number }[];
  topIndustries: { id: string; name: string; color: string; total: number }[];
  maxIndustryTotal: number;
  suspiciousCount: number;
  totalNetWorthGains: number;
  avgGrowthMultiple: number;
  biggestGainer: { name: string; netWorthStart: number; netWorthCurrent: number };
  mostAligned: { name: string; voteAlignmentScore: number };
  highAligned: { id: string; name: string; party: string; state: string; voteAlignmentScore: number }[];
  totalSuspiciousVotes: number;
  statesRepresented: number;
  topLobbyState: { state: string; total: number };
};

function IndustryStats({ stats, maxParty }: { stats: Stats; maxParty: number }) {
  return (
    <>
      <StatBlock label="Total PAC Donations">
        <div className="text-[32px] font-bold leading-none tracking-[-0.03em] text-[#D94A4A]">
          {formatDollars(stats.totalDonations)}
        </div>
        <div className="text-[11px] text-[#888894]">from PACs</div>
      </StatBlock>

      <Divider />

      <ByPartyBlock stats={stats} maxParty={maxParty} />

      <Divider />

      <StatBlock label="Top Industries">
        <div className="flex flex-col gap-1">
          {stats.topIndustries.map((ind) => (
            <div key={ind.id} className="flex items-center gap-2 text-[11px]">
              <div
                className="h-2 rounded-sm shrink-0"
                style={{
                  width: `${Math.max(8, (ind.total / stats.maxIndustryTotal) * 40)}px`,
                  backgroundColor: ind.color,
                }}
              />
              <span className="text-[#888894] whitespace-nowrap">{ind.name}</span>
              <span className="text-[#e0e0e8] font-semibold tabular-nums whitespace-nowrap ml-1">{formatDollars(ind.total)}</span>
            </div>
          ))}
        </div>
      </StatBlock>

      {stats.hasAlignmentData && (
        <>
          <Divider />
          <StatBlock label="Donor Alignment">
            <div className="text-[32px] font-bold leading-none tracking-[-0.03em]" style={{
              color: stats.avgAlignment > 70 ? '#D94A4A' : stats.avgAlignment > 50 ? '#DAA520' : '#2E8B57'
            }}>
              {stats.avgAlignment.toFixed(0)}%
            </div>
            <div className="text-[11px] text-[#888894]">avg vote alignment</div>
          </StatBlock>
        </>
      )}

      {stats.hasWealthData && (
        <>
          <Divider />
          <StatBlock label="Flagged Wealth">
            <div className="text-[32px] font-bold leading-none tracking-[-0.03em] text-[#D94A4A]">
              {stats.suspiciousCount}
            </div>
            <div className="text-[11px] text-[#888894]">growth &gt; 3x salary</div>
          </StatBlock>
        </>
      )}
    </>
  );
}

function AmountStats({ stats }: { stats: Stats }) {
  return (
    <>
      <StatBlock label="Total PAC Donations">
        <div className="text-[32px] font-bold leading-none tracking-[-0.03em] text-[#D94A4A]">
          {formatDollars(stats.totalDonations)}
        </div>
        <div className="text-[11px] text-[#888894]">from PACs</div>
      </StatBlock>

      {stats.hasWealthData && (
        <>
          <Divider />

          <StatBlock label="Net Worth Gains">
            <div className="text-[32px] font-bold leading-none tracking-[-0.03em] text-[#D94A4A]">
              {formatDollars(stats.totalNetWorthGains)}
            </div>
            <div className="text-[11px] text-[#888894]">while in office</div>
          </StatBlock>

          <Divider />

          <StatBlock label="Avg. Growth">
            <div className="text-[32px] font-bold leading-none tracking-[-0.03em] text-[#DAA520]">
              {stats.avgGrowthMultiple.toFixed(0)}x
            </div>
            <div className="text-[11px] text-[#888894]">net worth multiple</div>
          </StatBlock>

          <Divider />

          <StatBlock label="Largest Gain">
            <div className="text-[20px] font-bold leading-none tracking-[-0.03em] text-[#D94A4A]">
              +{formatDollars(stats.biggestGainer.netWorthCurrent - stats.biggestGainer.netWorthStart)}
            </div>
            <div className="text-[10px] text-[#888894] mt-1 whitespace-nowrap">{stats.biggestGainer.name}</div>
          </StatBlock>

          <Divider />

          <StatBlock label="Flagged Wealth">
            <div className="text-[32px] font-bold leading-none tracking-[-0.03em] text-[#D94A4A]">
              {stats.suspiciousCount}
            </div>
            <div className="text-[11px] text-[#888894]">growth &gt; 3x salary</div>
          </StatBlock>
        </>
      )}
    </>
  );
}

function AlignmentStats({ stats, maxParty }: { stats: Stats; maxParty: number }) {
  const { setSelectedPoliticianId } = useAppContext();
  const [showHighAligned, setShowHighAligned] = useState(false);

  if (!stats.hasAlignmentData) {
    return (
      <>
        <StatBlock label="Total PAC Donations">
          <div className="text-[32px] font-bold leading-none tracking-[-0.03em] text-[#D94A4A]">
            {formatDollars(stats.totalDonations)}
          </div>
          <div className="text-[11px] text-[#888894]">from PACs</div>
        </StatBlock>

        <Divider />

        <ByPartyBlock stats={stats} maxParty={maxParty} />

        <Divider />

        <StatBlock label="Vote Data">
          <div className="text-[14px] text-[#888894]">Not yet available</div>
        </StatBlock>
      </>
    );
  }

  return (
    <>
      <StatBlock label="Donor Alignment">
        <div className="text-[32px] font-bold leading-none tracking-[-0.03em]" style={{
          color: stats.avgAlignment > 70 ? '#D94A4A' : stats.avgAlignment > 50 ? '#DAA520' : '#2E8B57'
        }}>
          {stats.avgAlignment.toFixed(0)}%
        </div>
        <div className="text-[11px] text-[#888894]">avg vote alignment</div>
      </StatBlock>

      <Divider />

      <StatBlock label="Alignment Tiers">
        <div className="flex flex-col gap-1">
          {stats.tiers.map((t) => (
            <div key={t.label} className="flex items-center gap-2 text-[11px]">
              <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: t.color }} />
              <span className="text-[#888894] whitespace-nowrap">{t.label}</span>
              <span className="text-[#e0e0e8] font-semibold tabular-nums ml-1">{t.count}</span>
            </div>
          ))}
        </div>
      </StatBlock>

      <Divider />

      <StatBlock label={`Most Aligned (${stats.highAligned.length})`}>
        <button
          onClick={() => setShowHighAligned(!showHighAligned)}
          className="text-left bg-transparent border-none p-0 cursor-pointer"
        >
          <div className="text-[20px] font-bold leading-none tracking-[-0.03em] text-[#D94A4A]">
            {stats.mostAligned.voteAlignmentScore}%
          </div>
          <div className="text-[10px] text-[#888894] mt-1 whitespace-nowrap">
            {stats.mostAligned.name} <span className="text-[#555]">· click to see all</span>
          </div>
        </button>
      </StatBlock>

      {showHighAligned && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowHighAligned(false)}
        >
          <div
            className="bg-[#12121a] border border-white/10 rounded-xl p-5 w-[420px] max-w-[90vw] max-h-[70vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm font-semibold text-[#e0e0e8]">
                  Most Aligned with Donors
                </div>
                <div className="text-[11px] text-[#888894]">
                  {stats.highAligned.length} politicians with 75%+ donor alignment
                </div>
              </div>
              <button
                onClick={() => setShowHighAligned(false)}
                className="text-[#888894] hover:text-[#e0e0e8] text-xl cursor-pointer bg-transparent border-none p-1"
              >
                &times;
              </button>
            </div>
            <div className="overflow-y-auto flex-1" style={{ scrollbarWidth: 'thin' }}>
              {stats.highAligned.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setSelectedPoliticianId(p.id); setShowHighAligned(false); }}
                  className="w-full text-left bg-transparent hover:bg-white/5 border-none px-3 py-2 cursor-pointer rounded-lg flex items-center justify-between gap-3 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: p.party === 'R' ? '#D94A4A' : p.party === 'D' ? '#4A90D9' : '#9B59B6' }}
                    />
                    <span className="text-[13px] text-[#e0e0e8] font-medium truncate">{p.name}</span>
                    <span className="text-[11px] text-[#555] shrink-0">{p.party}-{p.state}</span>
                  </div>
                  <span className="text-[13px] font-bold text-[#D94A4A] tabular-nums shrink-0">{p.voteAlignmentScore}%</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <Divider />

      <StatBlock label="Suspicious Votes">
        <div className="text-[32px] font-bold leading-none tracking-[-0.03em] text-[#D94A4A]">
          {stats.totalSuspiciousVotes}
        </div>
        <div className="text-[11px] text-[#888894]">total</div>
      </StatBlock>

      <Divider />

      <ByPartyBlock stats={stats} maxParty={maxParty} />
    </>
  );
}

function MapStats({ stats }: { stats: Stats }) {
  return (
    <>
      <StatBlock label="Coverage">
        <div className="text-[32px] font-bold leading-none tracking-[-0.03em]">{stats.statesRepresented}</div>
        <div className="text-[11px] text-[#888894]">states + territories</div>
      </StatBlock>

      <Divider />

      <StatBlock label="Total Donations">
        <div className="text-[32px] font-bold leading-none tracking-[-0.03em] text-[#D94A4A]">
          {formatDollars(stats.totalDonations)}
        </div>
        <div className="text-[11px] text-[#888894]">from lobbyists</div>
      </StatBlock>

      <Divider />

      <StatBlock label="Partisan Lean">
        {(() => {
          const total = stats.byParty.D + stats.byParty.R + stats.byParty.I;
          const demPct = Math.round((stats.byParty.D / total) * 100);
          const repPct = Math.round((stats.byParty.R / total) * 100);
          const lean = demPct > repPct ? 'D' : repPct > demPct ? 'R' : 'Even';
          const leanPct = lean === 'D' ? demPct : lean === 'R' ? repPct : 50;
          const leanColor = lean === 'D' ? '#4A90D9' : lean === 'R' ? '#D94A4A' : '#888894';
          return (
            <>
              <div className="text-[32px] font-bold leading-none tracking-[-0.03em]" style={{ color: leanColor }}>
                {lean === 'Even' ? '50/50' : `${lean}+${leanPct - 50}`}
              </div>
              <div className="flex items-center gap-1.5 mt-1.5">
                <div className="flex h-2 w-24 rounded-full overflow-hidden">
                  <div className="h-full bg-[#4A90D9]" style={{ width: `${demPct}%` }} />
                  <div className="h-full bg-[#D94A4A]" style={{ width: `${repPct}%` }} />
                </div>
                <span className="text-[10px] text-[#888894]">{demPct}% D · {repPct}% R</span>
              </div>
            </>
          );
        })()}
      </StatBlock>

      <Divider />

      <StatBlock label="Most Lobbied State">
        <div className="text-[20px] font-bold leading-none tracking-[-0.03em] text-[#D94A4A]">
          {formatDollars(stats.topLobbyState.total)}
        </div>
        <div className="text-[10px] text-[#888894] mt-1">{stats.topLobbyState.state}</div>
      </StatBlock>
    </>
  );
}

// Shared blocks

function ByPartyBlock({ stats, maxParty }: { stats: Stats; maxParty: number }) {
  return (
    <StatBlock label="By Party">
      <div className="flex items-end gap-2 h-[42px]">
        {(['D', 'R', 'I'] as const).map((p) => (
          <div key={p} className="flex flex-col items-center">
            <div
              className="w-[16px] rounded-t-sm mb-1"
              style={{
                height: `${Math.max(4, (stats.byParty[p] / maxParty) * 28)}px`,
                backgroundColor: partyColors[p],
              }}
            />
            <span className="text-[9px] text-[#888894] leading-none tabular-nums">{stats.byParty[p]}</span>
          </div>
        ))}
      </div>
    </StatBlock>
  );
}

function StatBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[5px]">
      <div className="text-[11px] font-semibold tracking-[0.08em] text-[#888894] uppercase">
        {label}
      </div>
      {children}
    </div>
  );
}

function Divider() {
  return null;
}
