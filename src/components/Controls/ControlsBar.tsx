import { SearchFilter } from './SearchFilter';
import { StatusFilterPill } from './StatusFilterPill';
import { ColorModeToggle } from './ColorModeToggle';
import { StatsRow } from './StatsRow';
import { ColorLegend } from './ColorLegend';

export function ControlsBar() {
  return (
    <div className="px-8 py-4">
      {/* Top row */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          <ColorModeToggle />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusFilterPill />
          <SearchFilter />
        </div>
      </div>
      <div className="mb-4">
        <ColorLegend />
      </div>
      {/* Stats row */}
      <StatsRow />
    </div>
  );
}
