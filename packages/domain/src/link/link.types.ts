export interface WikilinkMatch {
  /** Full match including the brackets. */
  raw: string;
  /** Normalized target page title. */
  target: string;
  /** Alias after `|`, or the target when no alias exists. */
  displayText: string;
  startIndex: number;
  endIndex: number;
}
