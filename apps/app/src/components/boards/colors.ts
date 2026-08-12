export const BOARD_ACCENTS = [
  "#5b8def",
  "#8b6fd6",
  "#d58b39",
  "#3f9b75",
  "#c85d68",
] as const;

export function nextBoardAccent(current: string | null): string | null {
  if (current === null) return BOARD_ACCENTS[0];
  const index = BOARD_ACCENTS.indexOf(current as (typeof BOARD_ACCENTS)[number]);
  return index < 0 || index === BOARD_ACCENTS.length - 1 ? null : BOARD_ACCENTS[index + 1]!;
}
