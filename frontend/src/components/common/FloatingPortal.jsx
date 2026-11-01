import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const VIEWPORT_GAP = 8;

export default function FloatingPortal({ open, anchorRef, onDismiss, children, className = '', align = 'start', placement = 'auto', offset = 6, minWidth = 0, matchAnchorWidth = false, role, id }) {
  const floatingRef = useRef(null);
  const [position, setPosition] = useState(null);

  useLayoutEffect(() => {
    if (!open) return undefined;
    let frame;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const anchor = anchorRef.current?.getBoundingClientRect();
        const floating = floatingRef.current;
        if (!anchor || !floating) return;
        const width = matchAnchorWidth ? Math.max(anchor.width, minWidth) : Math.max(floating.offsetWidth, minWidth);
        const height = floating.offsetHeight;
        const below = window.innerHeight - anchor.bottom - offset - VIEWPORT_GAP;
        const above = anchor.top - offset - VIEWPORT_GAP;
        const placeAbove = placement === 'top' || (placement === 'auto' && height > below && above > below);
        const availableHeight = Math.max(96, placeAbove ? above : below);
        const rawLeft = align === 'end' ? anchor.right - width : anchor.left;
        const maxLeft = Math.max(VIEWPORT_GAP, window.innerWidth - width - VIEWPORT_GAP);
        setPosition({
          left: Math.min(Math.max(rawLeft, VIEWPORT_GAP), maxLeft),
          top: placeAbove ? Math.max(VIEWPORT_GAP, anchor.top - Math.min(height, availableHeight) - offset) : anchor.bottom + offset,
          width: matchAnchorWidth ? width : undefined,
          maxHeight: availableHeight,
        });
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [align, anchorRef, matchAnchorWidth, minWidth, offset, open, placement]);

  useEffect(() => {
    if (!open) return undefined;
    const outside = event => {
      if (!anchorRef.current?.contains(event.target) && !floatingRef.current?.contains(event.target)) onDismiss?.();
    };
    const keyboard = event => { if (event.key === 'Escape') onDismiss?.(); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    document.addEventListener('keydown', keyboard);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('keydown', keyboard);
    };
  }, [anchorRef, onDismiss, open]);

  if (!open || typeof document === 'undefined') return null;
  return createPortal(<div ref={floatingRef} id={id} role={role} className={className} style={{ position: 'fixed', zIndex: 2200, left: position?.left ?? 0, top: position?.top ?? 0, width: position?.width, maxWidth: `calc(100vw - ${VIEWPORT_GAP * 2}px)`, maxHeight: position?.maxHeight, visibility: position ? 'visible' : 'hidden', overflowY: 'auto', overscrollBehavior: 'contain' }}>{children}</div>, document.body);
}
