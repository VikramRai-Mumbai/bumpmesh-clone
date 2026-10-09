// Generic snapshot-based undo/redo history, independent of React and the store.

export type History<T> = {
  past: T[];
  present: T;
  future: T[];
};

const LIMIT = 100;

/** Creates a history whose current state is `present` and nothing to undo or redo. */
export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

/**
 * Records a new state. The previous state becomes undoable and redo is cleared.
 * @param history - Current history.
 * @param next - New state to make current.
 * @returns Updated history (unchanged if `next` is the same object as present).
 */
export function commit<T>(history: History<T>, next: T): History<T> {
  if (next === history.present) return history;
  const past = [...history.past, history.present].slice(-LIMIT);
  return { past, present: next, future: [] };
}

/** Steps back one state; returns the same history if there is nothing to undo. */
export function undo<T>(history: History<T>): History<T> {
  const previous = history.past.at(-1);
  if (previous === undefined) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

/** Steps forward one state; returns the same history if there is nothing to redo. */
export function redo<T>(history: History<T>): History<T> {
  const [next, ...future] = history.future;
  if (next === undefined) return history;
  return { past: [...history.past, history.present], present: next, future };
}
