import { industryMap } from '../../data/industries';
import { useAppContext } from '../../context/AppContext';
import type { LayoutGroup } from '../../hooks/useTreemapLayout';
import { PoliticianTile } from './PoliticianTile';

interface Props {
  group: LayoutGroup;
  maxDonation: number;
}

export function IndustryGroup({ group, maxDonation }: Props) {
  const { setSelectedIndustry } = useAppContext();
  const w = group.x1 - group.x0;
  const h = group.y1 - group.y0;
  if (w < 1 || h < 1) return null;

  const isFlat = !group.industryId;
  const color = isFlat ? '#B5B5BA' : (industryMap.get(group.industryId)?.color ?? '#B5B5BA');

  const groupClipId = `group-clip-${group.industryId}`;

  return (
    <g>
      {!isFlat && (
        <>
          <defs>
            <clipPath id={groupClipId}>
              <rect x={group.x0} y={group.y0} width={w} height={h} />
            </clipPath>
          </defs>
          <rect
            x={group.x0}
            y={group.y0}
            width={w}
            height={h}
            fill={color}
            opacity={0.08}
            rx={0}
          />
          {w > 60 && (
            <text
              x={group.x0 + 8}
              y={group.y0 + 16}
              fontSize={11}
              fontWeight={600}
              fill={color}
              opacity={0.9}
              clipPath={`url(#${groupClipId})`}
              style={{ cursor: 'pointer' }}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedIndustry(group.industryId);
              }}
            >
              {group.industryName} →
            </text>
          )}
        </>
      )}
      {group.children.map((child, i) => (
        <PoliticianTile key={`${child.politicianId}-${i}`} node={child} maxDonation={maxDonation} />
      ))}
    </g>
  );
}
