export type Party = 'D' | 'R' | 'I';
export type Chamber = 'Senate' | 'House';
export type ColorMode = 'industry' | 'amount' | 'alignment' | 'map';

export interface Industry {
  id: string;
  name: string;
  color: string;
}

export interface Donation {
  industryId: string;
  amount: number;
  topDonor: string;
}

export interface SuspiciousVote {
  bill: string;
  description: string;
  industryId: string;
  howTheyVoted?: string;
  alignmentScore?: number;
  confidence?: string;
  reason?: string;
}

export type Status = 'office' | 'candidate';

export interface Politician {
  id: string;
  name: string;
  state: string;
  party: Party;
  chamber: Chamber;
  status?: Status;
  yearsInOffice: number;
  netWorthStart: number;
  netWorthCurrent: number;
  salary: number;
  donations: Donation[];
  voteAlignmentScore: number; // 0-100, how often they vote with donors
  suspiciousVotes: SuspiciousVote[];
}
