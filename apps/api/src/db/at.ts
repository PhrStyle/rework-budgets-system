/** `list[index]` que falha alto se faltar o elemento, em vez de seguir com `undefined`. */
export function at<T>(list: readonly T[], index: number): T {
  const value = list[index];
  if (value === undefined) throw new RangeError(`índice ${index} fora da lista (${list.length})`);
  return value;
}
