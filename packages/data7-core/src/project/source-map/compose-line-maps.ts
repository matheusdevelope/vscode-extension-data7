/**
 * Identity map: generated line i ↔ previous line i.
 * Line indices are 0-based throughout the Data7 source-map pipeline.
 */
export function identityLineMap(lineCount: number): number[] {
  const map: number[] = [];
  for (let i = 0; i < lineCount; i++) {
    map.push(i);
  }
  return map;
}

/**
 * Compose two line maps: `outer` maps final→mid, `inner` maps mid→original.
 * Result maps final→original. Missing / out-of-range mids become `-1`.
 */
export function composeLineMaps(outer: readonly number[], inner: readonly number[]): number[] {
  return outer.map((mid) => {
    if (mid < 0 || mid >= inner.length) return -1;
    return inner[mid] ?? -1;
  });
}

/**
 * Adjust a line map after inserting `insertedCount` lines at `insertAt`
 * in the generated text (e.g. runtime logger inject into Principal).
 * Injected lines map to `-1` (no original source).
 */
export function shiftLineMapForInsert(
  lineMap: readonly number[],
  insertAt: number,
  insertedCount: number,
): number[] {
  if (insertedCount <= 0) return [...lineMap];
  const result: number[] = [];
  for (let generated = 0; generated < lineMap.length + insertedCount; generated++) {
    if (generated < insertAt) {
      result.push(lineMap[generated] ?? -1);
    } else if (generated < insertAt + insertedCount) {
      result.push(-1);
    } else {
      result.push(lineMap[generated - insertedCount] ?? -1);
    }
  }
  return result;
}

export function lineCountOf(code: string): number {
  if (code.length === 0) return 0;
  return code.split(/\r?\n/).length;
}
