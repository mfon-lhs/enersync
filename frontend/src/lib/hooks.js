import { useCallback, useEffect, useRef, useState } from "react";

// Runs an async loader, and keeps the latest data, error and loading state.
// With intervalMs it reloads quietly on a timer (the screen does not flash a spinner on reloads).
export function useAsync(loader, deps = [], { intervalMs = 0 } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: true, updatedAt: null });
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const counter = useRef(0);

  const run = useCallback(async (quiet) => {
    const ticket = ++counter.current;
    if (!quiet) setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await loaderRef.current();
      if (ticket === counter.current) {
        setState({ data, error: null, loading: false, updatedAt: new Date() });
      }
    } catch (error) {
      if (ticket === counter.current) {
        // A failed quiet reload keeps the old data on screen and only records the error
        setState((s) => ({ ...s, error, loading: false }));
      }
    }
  }, []);

  useEffect(() => {
    run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (!intervalMs) return undefined;
    const timer = setInterval(() => {
      if (!document.hidden) run(true);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, run]);

  const reload = useCallback(() => run(true), [run]);
  return { ...state, reload };
}

// Counts up from 0 to a number, for the big figures on the dashboard.
export function useCountUp(target, durationMs = 700) {
  const [value, setValue] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !Number.isFinite(target)) {
      setValue(target);
      from.current = target;
      return undefined;
    }
    const start = performance.now();
    const origin = from.current;
    let frame;
    const tick = (now) => {
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(origin + (target - origin) * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
      else from.current = target;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);

  return value;
}

// Keeps a value for a moment, so a search box does not filter on every single key press.
export function useDebounced(value, delayMs = 200) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
