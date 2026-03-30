import { useState, useRef, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';

export function SearchFilter() {
  const { searchQuery, setSearchQuery } = useAppContext();
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  return (
    <div className="flex items-center gap-2">
      {open && (
        <input
          ref={inputRef}
          type="text"
          placeholder="Search name or state..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onBlur={() => { if (!searchQuery) setOpen(false); }}
          onKeyDown={(e) => { if (e.key === 'Escape') { setSearchQuery(''); setOpen(false); } }}
          className="bg-transparent border border-white/10 rounded px-3 py-1.5 text-sm text-[#e0e0e8] placeholder-[#555] w-52 outline-none focus:border-white/20 transition-colors"
        />
      )}
      <button
        onClick={() => {
          if (open && searchQuery) {
            setSearchQuery('');
          } else {
            setOpen(!open);
          }
        }}
        className="p-1.5 rounded hover:bg-[#2a2a40] transition-colors cursor-pointer"
        aria-label="Search"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#888894" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {open && searchQuery ? (
            <>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </>
          ) : (
            <>
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </>
          )}
        </svg>
      </button>
    </div>
  );
}
