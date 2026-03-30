import type { Politician } from '../data/types';
import { industries } from '../data/industries';

export interface LeafNode {
  politicianId: string;
  politician: Politician;
  industryId: string;
  amount: number;
}

export interface HierarchyData {
  name: string;
  children?: { name: string; children?: LeafNode[] }[];
}

export function buildHierarchy(politicians: Politician[]): HierarchyData {
  const industryGroups = new Map<string, LeafNode[]>();

  for (const ind of industries) {
    industryGroups.set(ind.id, []);
  }

  // Exclude ideological/other from treemap — they dominate and aren't real industries
  const excludedGroups = new Set(['ideological', 'other']);

  for (const p of politicians) {
    for (const d of p.donations) {
      if (excludedGroups.has(d.industryId)) continue;
      const group = industryGroups.get(d.industryId);
      if (group) {
        group.push({
          politicianId: p.id,
          politician: p,
          industryId: d.industryId,
          amount: d.amount,
        });
      }
    }
  }

  const children = industries
    .filter((ind) => (industryGroups.get(ind.id)?.length ?? 0) > 0)
    .map((ind) => ({
      name: ind.name,
      children: industryGroups.get(ind.id)!,
    }));

  return { name: 'root', children };
}

/** Flat hierarchy — no industry grouping. Sized by net worth growth when available, otherwise total donations. */
export function buildNetWorthHierarchy(politicians: Politician[]): HierarchyData {
  const leaves: LeafNode[] = politicians.map((p) => {
    const growth = p.netWorthCurrent - p.netWorthStart;
    // Fall back to total donations if net worth data isn't populated
    const amount = growth > 0
      ? growth
      : p.donations.reduce((s, d) => s + d.amount, 0);
    return {
      politicianId: p.id,
      politician: p,
      industryId: '',
      amount,
    };
  });

  return {
    name: 'root',
    children: [{ name: '', children: leaves }],
  };
}
