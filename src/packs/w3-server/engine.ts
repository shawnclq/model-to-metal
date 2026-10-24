import { Link, arTime } from "../../shared/engine/server.ts";
// World 3's maths beyond the shared server model: the NCCL all-reduce benchmark table.
export function ncclTable(srv: Link, n: number) {
  const rows: { b: number; t: number; alg: number; bus: number }[] = [];
  for (let b = 8; b <= 8 * 1024 * 1024 * 1024; b *= 16) {
    const t = arTime(n, b, srv);
    rows.push({ b, t, alg: b / t / 1e9, bus: (((2 * (n - 1)) / n) * b) / t / 1e9 });
  }
  return rows;
}
