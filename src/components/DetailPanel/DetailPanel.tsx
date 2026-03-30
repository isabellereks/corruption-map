import { useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { politicians } from '../../data/politicians';
import { industryMap } from '../../data/industries';
import { partyColors } from '../../utils/colors';
import { formatDollars } from '../../utils/format';
import { stateNames } from '../../data/stateFips';
import { NetWorthBar } from './NetWorthBar';
import { VoteAlignment } from './VoteAlignment';

export function DetailPanel() {
  const { selectedPoliticianId, selectedState, selectedIndustry, setSelectedPoliticianId, setSelectedState, setSelectedIndustry } = useAppContext();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedPoliticianId(null);
        setSelectedState(null);
        setSelectedIndustry(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setSelectedPoliticianId, setSelectedState, setSelectedIndustry]);

  if (selectedIndustry) {
    return (
      <IndustryPanel
        industryId={selectedIndustry}
        onClose={() => setSelectedIndustry(null)}
        onSelect={(id) => { setSelectedIndustry(null); setSelectedPoliticianId(id); }}
      />
    );
  }

  if (selectedState) {
    return (
      <StatePanel
        state={selectedState}
        onClose={() => setSelectedState(null)}
        onSelect={(id) => { setSelectedState(null); setSelectedPoliticianId(id); }}
      />
    );
  }

  const politician = selectedPoliticianId
    ? politicians.find((p) => p.id === selectedPoliticianId)
    : null;

  if (!politician) return null;

  return <PoliticianPanel politician={politician} onClose={() => setSelectedPoliticianId(null)} />;
}

function PoliticianPanel({ politician, onClose }: { politician: (typeof politicians)[0]; onClose: () => void }) {
  const totalDonations = politician.donations.reduce((s, d) => s + d.amount, 0);

  const sortedDonations = politician.donations.slice().sort((a, b) => b.amount - a.amount);
  const topDonor = sortedDonations[0]?.topDonor;
  const partyLabel = politician.party === 'D' ? 'Democrat' : politician.party === 'R' ? 'Republican' : 'Independent';

  return (
    <SidePanel>
      <div className="flex justify-between items-start mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: partyColors[politician.party] }}
            />
            <h2 className="text-lg font-semibold text-[#e0e0e8] m-0">{politician.name}</h2>
          </div>
          <div className="text-sm text-[#888894]">
            {partyLabel} · {politician.state} · {politician.chamber}{politician.yearsInOffice > 0 ? ` · ${politician.yearsInOffice} years` : ''}
          </div>
          <div className="text-sm text-[#888894] mt-1">
            Received: <span className="text-[#D94A4A] font-semibold">{formatDollars(totalDonations)}</span> from PACs
          </div>
          {topDonor && (
            <div className="text-sm text-[#888894] mt-1">
              Top donor: <span className="text-[#e0e0e8] font-bold uppercase">{topDonor}</span>
            </div>
          )}
        </div>
        <CloseButton onClick={onClose} />
      </div>

      <NetWorthBar politician={politician} />
      <VoteAlignment politician={politician} />

      <div className="mt-4">
        <div className="text-[10px] font-semibold tracking-[0.08em] text-[#888894] uppercase mb-2">
          Who's Paying
        </div>
        {sortedDonations.map((d, i) => {
            const industry = industryMap.get(d.industryId);
            const pct = (d.amount / totalDonations) * 100;
            return (
              <div key={i} className="mb-1.5 rounded-lg bg-white/3 px-3 py-2.5">
                <div className="flex justify-between text-xs mb-0.5">
                  <span className="text-[#bbb]">{industry?.name ?? d.industryId}</span>
                  <span className="text-[#e0e0e8] font-semibold tabular-nums">{formatDollars(d.amount)}</span>
                </div>
                <div className="h-2 bg-[#1a1a2e] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: industry?.color ?? '#555',
                    }}
                  />
                </div>
                <div className="text-[10px] text-[#666] mt-0.5">
                  via {d.topDonor}
                </div>
              </div>
            );
          })}
      </div>

    </SidePanel>
  );
}

function IndustryPanel({ industryId, onClose, onSelect }: { industryId: string; onClose: () => void; onSelect: (id: string) => void }) {
  const industry = industryMap.get(industryId);

  // Find all politicians who have donations in this industry
  const industryPols = politicians
    .map((p) => {
      const donation = p.donations.find((d) => d.industryId === industryId);
      return donation ? { politician: p, amount: donation.amount, topDonor: donation.topDonor } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.amount - a.amount);

  const totalAmount = industryPols.reduce((s, x) => s + x.amount, 0);

  return (
    <SidePanel>
      <div className="flex justify-between items-start mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: industry?.color ?? '#555' }} />
            <h2 className="text-lg font-semibold text-[#e0e0e8] m-0">{industry?.name ?? industryId}</h2>
          </div>
          <div className="text-sm text-[#888894]">
            {industryPols.length} politicians · {formatDollars(totalAmount)} total
          </div>
        </div>
        <CloseButton onClick={onClose} />
      </div>

      {industryPols.map(({ politician: p, amount, topDonor }) => (
        <button
          key={p.id}
          onClick={() => onSelect(p.id)}
          className="w-full text-left px-3 py-2.5 rounded-lg mb-1 bg-white/3 hover:bg-white/8 cursor-pointer border-none transition-colors block"
        >
          <div className="flex items-center gap-2 mb-0.5">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: partyColors[p.party] }} />
            <span className="text-sm font-medium text-[#e0e0e8]">{p.name}</span>
            <span className="text-[10px] text-[#555]">{p.party}-{p.state}</span>
            <span className="text-sm font-semibold tabular-nums ml-auto" style={{ color: industry?.color ?? '#888' }}>{formatDollars(amount)}</span>
          </div>
          <div className="text-[10px] text-[#555] pl-4 truncate">via {topDonor}</div>
        </button>
      ))}
    </SidePanel>
  );
}

function StatePanel({ state, onClose, onSelect }: { state: string; onClose: () => void; onSelect: (id: string) => void }) {
  const statePols = politicians
    .filter((p) => p.state === state)
    .sort((a, b) => {
      const totalA = a.donations.reduce((s, d) => s + d.amount, 0);
      const totalB = b.donations.reduce((s, d) => s + d.amount, 0);
      return totalB - totalA;
    });

  const senators = statePols.filter((p) => p.chamber === 'Senate');
  const reps = statePols.filter((p) => p.chamber === 'House');
  const totalDonations = statePols.reduce((s, p) => s + p.donations.reduce((s2, d) => s2 + d.amount, 0), 0);

  return (
    <SidePanel>
      <div className="flex justify-between items-start mb-4">
        <div>
          <h2 className="text-lg font-semibold text-[#e0e0e8] m-0">{stateNames[state] ?? state}</h2>
          <div className="text-sm text-[#888894]">
            {statePols.length} politician{statePols.length !== 1 ? 's' : ''} · {formatDollars(totalDonations)} total PAC donations
          </div>
        </div>
        <CloseButton onClick={onClose} />
      </div>

      {senators.length > 0 && (
        <div className="mb-4">
          <div className="text-[10px] text-[#555] uppercase tracking-wide font-semibold mb-2">
            Senators ({senators.length})
          </div>
          {senators.map((p) => (
            <PoliticianRow key={p.id} politician={p} onClick={() => onSelect(p.id)} />
          ))}
        </div>
      )}

      {reps.length > 0 && (
        <div>
          <div className="text-[10px] text-[#555] uppercase tracking-wide font-semibold mb-2">
            Representatives ({reps.length})
          </div>
          {reps.map((p) => (
            <PoliticianRow key={p.id} politician={p} onClick={() => onSelect(p.id)} />
          ))}
        </div>
      )}
    </SidePanel>
  );
}

function PoliticianRow({ politician, onClick }: { politician: (typeof politicians)[0]; onClick: () => void }) {
  const total = politician.donations.reduce((s, d) => s + d.amount, 0);
  const topDonation = politician.donations.reduce((best, d) => d.amount > best.amount ? d : best, politician.donations[0]);
  const topIndustry = topDonation ? industryMap.get(topDonation.industryId) : null;

  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2.5 rounded-lg mb-1 bg-white/3 hover:bg-white/8 cursor-pointer border-none transition-colors block"
    >
      <div className="flex items-center gap-2 mb-1">
        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: partyColors[politician.party] }} />
        <span className="text-sm font-medium text-[#e0e0e8]">{politician.name}</span>
        <span className="text-sm font-semibold text-[#D94A4A] ml-auto tabular-nums">{formatDollars(total)}</span>
      </div>
      <div className="flex items-center gap-2 pl-4">
        {topIndustry && (
          <div className="flex items-center gap-1 text-[10px] text-[#888894]">
            <div className="w-1.5 h-1.5 rounded-sm" style={{ backgroundColor: topIndustry.color }} />
            {topIndustry.name}
          </div>
        )}
        {topDonation && (
          <span className="text-[10px] text-[#555] truncate">via {topDonation.topDonor}</span>
        )}
      </div>
    </button>
  );
}

function SidePanel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="fixed top-0 right-0 h-full w-[420px] max-w-full bg-[#12121a] border-l border-white/10 z-40 overflow-y-auto"
      style={{ animation: 'slideIn 300ms ease-out' }}
    >
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
      <div className="p-5">{children}</div>
    </div>
  );
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-[#888894] hover:text-[#e0e0e8] text-xl cursor-pointer bg-transparent border-none p-1"
    >
      ×
    </button>
  );
}
