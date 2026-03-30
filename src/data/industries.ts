import type { Industry } from './types';

export const industries: Industry[] = [
  { id: 'finance', name: 'Finance', color: '#4682B4' },
  { id: 'healthcare', name: 'Healthcare', color: '#2E8B57' },
  { id: 'energy', name: 'Energy & Environment', color: '#8B6914' },
  { id: 'defense', name: 'Defense & Security', color: '#8B4513' },
  { id: 'technology', name: 'Technology', color: '#5F9EA0' },
  { id: 'transportation', name: 'Transportation', color: '#7B68AE' },
  { id: 'trade', name: 'Trade & Tariffs', color: '#CD853F' },
  { id: 'labor', name: 'Labor & Education', color: '#BC8F8F' },
  { id: 'agriculture', name: 'Agriculture & Food', color: '#DAA520' },
  { id: 'real-estate', name: 'Real Estate & Housing', color: '#6B8E23' },
  { id: 'ideological', name: 'Ideological / Political', color: '#9B59B6' },
  { id: 'other', name: 'Other', color: '#888894' },
];

export const industryMap = new Map(industries.map((i) => [i.id, i]));
