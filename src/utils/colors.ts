import type { ColorMode, Party } from '../data/types';

export const partyColors: Record<Party, string> = {
  D: '#4A90D9',
  R: '#D94A4A',
  I: '#9B59B6',
};

export function getTileColor(
  colorMode: ColorMode,
  _industryId: string,
  party: Party,
  totalDonations: number,
  alignmentScore: number,
  maxDonation: number
): string {
  switch (colorMode) {
    case 'industry':
      return partyColors[party];
    case 'amount': {
      const t = Math.sqrt(totalDonations / maxDonation);
      const r = Math.round(40 + t * 200);
      const g = Math.round(40 + (1 - t) * 80);
      const b = Math.round(60 + (1 - t) * 60);
      return `rgb(${r},${g},${b})`;
    }
    case 'alignment': {
      const t = alignmentScore / 100;
      if (t < 0.5) {
        const s = t / 0.5;
        return `rgb(${Math.round(80 + s * 180)},${Math.round(180 - s * 40)},60)`;
      }
      const s = (t - 0.5) / 0.5;
      return `rgb(${Math.round(220 + s * 30)},${Math.round(140 - s * 100)},${Math.round(60 - s * 20)})`;
    }
    case 'map':
      return partyColors[party];
  }
}
