import { useState, useCallback } from 'react';

interface TooltipState {
  x: number;
  y: number;
  visible: boolean;
}

export function useTooltip() {
  const [tooltip, setTooltip] = useState<TooltipState>({ x: 0, y: 0, visible: false });

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const TOOLTIP_W = 280;
    const TOOLTIP_H = 160;
    const OFFSET = 12;
    let x = e.clientX + OFFSET;
    let y = e.clientY + OFFSET;
    if (x + TOOLTIP_W > window.innerWidth) x = e.clientX - TOOLTIP_W - OFFSET;
    if (y + TOOLTIP_H > window.innerHeight) y = e.clientY - TOOLTIP_H - OFFSET;
    setTooltip({ x, y, visible: true });
  }, []);

  const onMouseLeave = useCallback(() => {
    setTooltip((prev) => ({ ...prev, visible: false }));
  }, []);

  return { tooltip, onMouseMove, onMouseLeave };
}
