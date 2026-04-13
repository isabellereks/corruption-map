import { useAppContext } from '../../context/AppContext';
import { getTileColor } from '../../utils/colors';
import { formatDollars } from '../../utils/format';

import type { LayoutNode } from '../../hooks/useTreemapLayout';
import type { ColorMode, Politician } from '../../data/types';

function getSubtitle(colorMode: ColorMode, politician: Politician, industryId: string): string {
  switch (colorMode) {
    case 'industry': {
      const donation = politician.donations.find((d) => d.industryId === industryId);
      return `+${formatDollars(donation?.amount ?? 0)}`;
    }
    case 'amount': {
      if (politician.netWorthStart > 0) {
        const multiple = (politician.netWorthCurrent / politician.netWorthStart).toFixed(0);
        return `${multiple}x richer in office`;
      }
      const totalDon = politician.donations.reduce((s, d) => s + d.amount, 0);
      return `${formatDollars(totalDon)} from PACs`;
    }
    case 'alignment': {
      if (politician.voteAlignmentScore > 0) {
        const count = politician.suspiciousVotes.length;
        if (politician.voteAlignmentScore >= 80) {
          return `${politician.voteAlignmentScore}% votes for donors`;
        }
        return count > 0
          ? `${politician.voteAlignmentScore}% · ${count} bad vote${count !== 1 ? 's' : ''}`
          : `${politician.voteAlignmentScore}% aligned`;
      }
      // No alignment data — show donation concentration
      const sorted = politician.donations.slice().sort((a, b) => b.amount - a.amount);
      if (sorted.length > 0) {
        const totalDon = sorted.reduce((s, d) => s + d.amount, 0);
        const topPct = Math.round((sorted[0].amount / totalDon) * 100);
        return `${topPct}% from top industry`;
      }
      return 'No data';
    }
    case 'map': {
      const totalDon = politician.donations.reduce((s, d) => s + d.amount, 0);
      return formatDollars(totalDon);
    }
  }
}

interface Props {
  node: LayoutNode;
  maxDonation: number;
}

export function PoliticianTile({ node, maxDonation }: Props) {
  const { hoveredPoliticianId, setHoveredPoliticianId, setSelectedPoliticianId, colorMode } =
    useAppContext();

  const w = node.x1 - node.x0;
  const h = node.y1 - node.y0;
  if (w < 1 || h < 1) return null;

  const isHovered = hoveredPoliticianId === node.politicianId;
  const totalDonations = node.politician.donations.reduce((s, d) => s + d.amount, 0);

  // When no vote alignment data exists, use donation concentration as a proxy
  let effectiveAlignment = node.politician.voteAlignmentScore;
  if (effectiveAlignment === 0 && colorMode === 'alignment' && totalDonations > 0) {
    const sorted = node.politician.donations.slice().sort((a, b) => b.amount - a.amount);
    effectiveAlignment = Math.round((sorted[0].amount / totalDonations) * 100);
  }

  const fill = getTileColor(
    colorMode,
    node.industryId,
    node.politician.party,
    totalDonations,
    effectiveAlignment,
    maxDonation
  );

  const clipId = `clip-${node.politicianId}-${node.industryId}`;
  const fontSize = Math.min(13, Math.max(9, Math.min(w / 10, h / 3)));
  const showName = w > 30 && h > 16;
  const showAmount = w > 60 && h > 34;

  return (
    <g
      onMouseEnter={() => setHoveredPoliticianId(node.politicianId)}
      onMouseLeave={() => setHoveredPoliticianId(null)}
      onClick={() => setSelectedPoliticianId(node.politicianId)}
      style={{ cursor: 'pointer' }}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={node.x0 + 4} y={node.y0 + 4} width={w - 8} height={h - 8} />
        </clipPath>
      </defs>
      <rect
        x={node.x0}
        y={node.y0}
        width={w}
        height={h}
        fill={fill}
        opacity={isHovered ? 1 : 0.88}
        stroke={isHovered ? '#1D1D1F' : 'rgba(255,255,255,0.6)'}
        strokeWidth={isHovered ? 1.5 : 0.5}
        style={{ transition: 'opacity 150ms, stroke 150ms' }}
      />
      <g clipPath={`url(#${clipId})`} style={{ pointerEvents: 'none' }}>
        {showName && (
          <text
            x={node.x0 + 8}
            y={node.y0 + 8 + fontSize}
            fontSize={fontSize}
            fontWeight={500}
            fill={isHovered ? '#fff' : 'rgba(255,255,255,0.85)'}
          >
            {node.politician.name}
          </text>
        )}
        {showAmount && (
          <text
            x={node.x0 + 8}
            y={node.y0 + 8 + fontSize + fontSize + 2}
            fontSize={Math.max(8, fontSize - 2)}
            fill="rgba(255,255,255,0.5)"
          >
            {getSubtitle(colorMode, node.politician, node.industryId)}
          </text>
        )}
      </g>
    </g>
  );
}
