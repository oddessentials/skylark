export interface HabitatCells {
  both: number[];
  day: number[];
  night: number[];
}

export interface CellRun {
  row: number;
  from: number;
  to: number;
}

export function decodeRanges(text: string): number[] {
  if (text === '') return [];
  const cells: number[] = [];
  for (const part of text.split(',')) {
    const bounds = part.split('-').map(Number);
    const from = bounds[0];
    const end = bounds[1] ?? from;
    if (
      from === undefined ||
      end === undefined ||
      !Number.isInteger(from) ||
      !Number.isInteger(end) ||
      end < from
    ) {
      throw new Error(`bad habitat range ${part}`);
    }
    for (let cell = from; cell <= end; cell++) cells.push(cell);
  }
  return cells;
}

export function runsOf(cells: number[], size: number): CellRun[] {
  const runs: CellRun[] = [];
  for (const cell of [...cells].sort((a, b) => a - b)) {
    const row = Math.floor(cell / size);
    const column = cell % size;
    const last = runs[runs.length - 1];
    if (last && last.row === row && column === last.to + 1) last.to = column;
    else runs.push({ row, from: column, to: column });
  }
  return runs;
}
