import { createContext, useContext, useState, type ReactNode } from 'react';
import type { ColorMode, Status } from '../data/types';

export type StatusFilter = Status | 'all';

interface AppState {
  selectedPoliticianId: string | null;
  selectedState: string | null;
  selectedIndustry: string | null;
  hoveredPoliticianId: string | null;
  colorMode: ColorMode;
  searchQuery: string;
  statusFilter: StatusFilter;
  setSelectedPoliticianId: (id: string | null) => void;
  setSelectedState: (state: string | null) => void;
  setSelectedIndustry: (id: string | null) => void;
  setHoveredPoliticianId: (id: string | null) => void;
  setColorMode: (mode: ColorMode) => void;
  setSearchQuery: (q: string) => void;
  setStatusFilter: (f: StatusFilter) => void;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [selectedPoliticianId, setSelectedPoliticianId] = useState<string | null>(null);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [selectedIndustry, setSelectedIndustry] = useState<string | null>(null);
  const [hoveredPoliticianId, setHoveredPoliticianId] = useState<string | null>(null);
  const [colorMode, setColorMode] = useState<ColorMode>('industry');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  return (
    <AppContext.Provider
      value={{
        selectedPoliticianId,
        selectedState,
        selectedIndustry,
        hoveredPoliticianId,
        colorMode,
        searchQuery,
        statusFilter,
        setSelectedPoliticianId,
        setSelectedState,
        setSelectedIndustry,
        setHoveredPoliticianId,
        setColorMode,
        setSearchQuery,
        setStatusFilter,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}
