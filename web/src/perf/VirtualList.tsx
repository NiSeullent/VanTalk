import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type UIEvent,
} from 'react';

type VirtualListProps<T> = {
  items: T[];
  estimateSize?: number;
  overscan?: number;
  className?: string;
  style?: CSSProperties;
  onScroll?: (event: UIEvent<HTMLDivElement>) => void;
  onVisibleRange?: (start: number, end: number) => void;
  scrollRef?: React.MutableRefObject<HTMLDivElement | null>;
  stickToBottomRef?: React.MutableRefObject<boolean>;
  renderItem: (item: T, index: number) => ReactNode;
  keyOf: (item: T, index: number) => string;
};

/**
 * Lightweight windowed list — only mounts rows near the viewport.
 * Measures real row heights after paint to keep variable-height chat stable.
 */
export function VirtualList<T>({
  items,
  estimateSize = 88,
  overscan = 8,
  className,
  style,
  onScroll,
  onVisibleRange,
  scrollRef,
  stickToBottomRef,
  renderItem,
  keyOf,
}: VirtualListProps<T>) {
  const localRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef(new Map<number, HTMLDivElement>());
  const heightsRef = useRef<number[]>([]);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(640);
  const [version, setVersion] = useState(0);

  const setNode = useCallback((node: HTMLDivElement | null) => {
    localRef.current = node;
    if (scrollRef) scrollRef.current = node;
  }, [scrollRef]);

  useEffect(() => {
    const el = localRef.current;
    if (!el) return;
    const update = () => setViewport(el.clientHeight || 640);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Drop stale height samples when the list identity shrinks.
  useEffect(() => {
    if (heightsRef.current.length > items.length) {
      heightsRef.current.length = items.length;
      setVersion((v) => v + 1);
    }
  }, [items.length]);

  const offsets = useMemo(() => {
    const next = new Array<number>(items.length + 1);
    next[0] = 0;
    for (let i = 0; i < items.length; i += 1) {
      const h = heightsRef.current[i] || estimateSize;
      next[i + 1] = next[i] + h;
    }
    return next;
    // version bumps after measured heights change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, estimateSize, version]);

  const totalHeight = offsets[items.length] || 0;

  const findIndex = useCallback((y: number) => {
    let lo = 0;
    let hi = items.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (offsets[mid + 1] <= y) lo = mid + 1;
      else hi = mid;
    }
    return Math.min(items.length - 1, Math.max(0, lo));
  }, [items.length, offsets]);

  const start = items.length
    ? Math.max(0, findIndex(scrollTop) - overscan)
    : 0;
  const end = items.length
    ? Math.min(items.length, findIndex(scrollTop + viewport) + 1 + overscan)
    : 0;

  useEffect(() => {
    onVisibleRange?.(start, end);
  }, [start, end, onVisibleRange]);

  const slice = useMemo(() => items.slice(start, end), [items, start, end]);

  useLayoutEffect(() => {
    let changed = false;
    for (let i = start; i < end; i += 1) {
      const node = rowRefs.current.get(i);
      if (!node) continue;
      const h = Math.max(1, Math.round(node.getBoundingClientRect().height));
      if (heightsRef.current[i] !== h) {
        heightsRef.current[i] = h;
        changed = true;
      }
    }
    if (changed) setVersion((v) => v + 1);
  }, [slice, start, end, items]);

  useEffect(() => {
    const el = localRef.current;
    if (!el || !stickToBottomRef?.current) return;
    el.scrollTop = el.scrollHeight;
  }, [items.length, totalHeight, stickToBottomRef]);

  return (
    <div
      ref={setNode}
      className={className}
      style={style}
      onScroll={(event) => {
        setScrollTop(event.currentTarget.scrollTop);
        onScroll?.(event);
      }}
    >
      <div className="virtual-list-spacer" style={{ height: totalHeight, position: 'relative' }}>
        <div
          className="virtual-list-window"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            transform: `translateY(${offsets[start] || 0}px)`,
            willChange: 'transform',
          }}
        >
          {slice.map((item, offset) => {
            const index = start + offset;
            return (
              <div
                key={keyOf(item, index)}
                className="virtual-list-row"
                ref={(node) => {
                  if (node) rowRefs.current.set(index, node);
                  else rowRefs.current.delete(index);
                }}
                style={{ contentVisibility: 'auto' as const }}
              >
                {renderItem(item, index)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
