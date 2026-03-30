import { useMemo } from 'react';
import * as d3 from 'd3';
import type { ColorMode, Politician } from '../data/types';
import { buildHierarchy, buildNetWorthHierarchy, type LeafNode } from '../utils/buildHierarchy';

export interface LayoutNode {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  politicianId: string;
  politician: Politician;
  industryId: string;
  amount: number;
}

export interface LayoutGroup {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  industryName: string;
  industryId: string;
  children: LayoutNode[];
}

export function useTreemapLayout(
  politicians: Politician[],
  width: number,
  height: number,
  searchQuery: string,
  colorMode: ColorMode = 'industry'
) {
  return useMemo(() => {
    if (width === 0 || height === 0) return { groups: [], maxDonation: 0 };

    const filtered = searchQuery
      ? politicians.filter((p) => {
          const q = searchQuery.toLowerCase();
          return (
            p.name.toLowerCase().includes(q) ||
            p.state.toLowerCase().includes(q)
          );
        })
      : politicians;

    const isNetWorth = colorMode === 'amount';
    const data = isNetWorth ? buildNetWorthHierarchy(filtered) : buildHierarchy(filtered);
    const root = d3
      .hierarchy(data)
      .sum((d: any) => (d as LeafNode).amount ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    const isMobile = width < 640;
    const treemap = d3.treemap<typeof data>()
      .size([width, height])
      .tile(d3.treemapSquarify)
      .paddingOuter(isMobile ? 3 : 6)
      .paddingInner(isMobile ? 3 : 2);

    // No top padding for flat net worth layout (no group labels)
    if (!isNetWorth) {
      treemap.paddingTop(24);
    }

    treemap(root as any);

    let maxDonation = 0;
    if (isNetWorth) {
      for (const p of politicians) {
        const growth = p.netWorthCurrent - p.netWorthStart;
        if (growth > maxDonation) maxDonation = growth;
      }
    } else {
      for (const p of politicians) {
        const total = p.donations.reduce((s, d) => s + d.amount, 0);
        if (total > maxDonation) maxDonation = total;
      }
    }

    const groups: LayoutGroup[] = [];

    if (root.children) {
      for (const group of root.children) {
        const g = group as any;
        const industryChildren = group.children ?? [];
        const industryId = (industryChildren[0]?.data as unknown as LeafNode)?.industryId ?? '';

        groups.push({
          x0: g.x0,
          y0: g.y0,
          x1: g.x1,
          y1: g.y1,
          industryName: g.data.name,
          industryId,
          children: industryChildren.map((child: any) => {
            const leaf = child.data as LeafNode;
            return {
              x0: child.x0,
              y0: child.y0,
              x1: child.x1,
              y1: child.y1,
              politicianId: leaf.politicianId,
              politician: leaf.politician,
              industryId: leaf.industryId,
              amount: leaf.amount,
            };
          }),
        });
      }
    }

    return { groups, maxDonation };
  }, [politicians, width, height, searchQuery, colorMode]);
}
