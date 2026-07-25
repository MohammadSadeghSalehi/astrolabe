import { scaleLinear, scaleTime, type ScaleLinear, type ScaleTime } from "d3-scale";

/** Parse "HH:MM" wall clock onto a fixed reference day (date is meaningless). */
export function parseTime(t: string): Date {
  const [h, m] = t.split(":").map((x) => Number(x));
  return new Date(2000, 0, 1, h, m || 0, 0, 0);
}

export function makeXScale(
  times: string[],
  width: number,
): ScaleTime<number, number> {
  if (times.length === 0) {
    return scaleTime().domain([new Date(2000, 0, 1), new Date(2000, 0, 2)]).range([0, width]);
  }
  const dates = times.map(parseTime);
  const t0 = dates[0]!;
  const t1 = dates[dates.length - 1]!;
  return scaleTime().domain([t0, t1]).range([0, width]);
}

/** State index 0..6; inverted so severe dyskinesia (6) is at the top. */
export function makeYScale(height: number): ScaleLinear<number, number> {
  return scaleLinear().domain([0, 6]).range([height, 0]);
}

export function minutesBetween(a: string, b: string): number {
  return (parseTime(b).getTime() - parseTime(a).getTime()) / 60_000;
}
