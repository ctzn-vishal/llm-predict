export function fmtDollars(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function fmtPct(n: number): string {
  return n.toFixed(1) + "%";
}

export function fmtBrier(n: number): string {
  return n.toFixed(3);
}

export function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function fmtDateShort(d: string): string {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// A probability in [0,1] as a whole-number percent, e.g. 0.62 -> "62%".
export function fmtProb(n: number): string {
  return Math.round(n * 100) + "%";
}

// Skill = crowdBrier - forecasterBrier. Positive (signed) means it beat the
// crowd. Shown with 3 decimals since Brier differences are small.
export function fmtSkill(n: number): string {
  return (n >= 0 ? "+" : "") + n.toFixed(3);
}

// Small API costs, e.g. 0.0123 -> "$0.012".
export function fmtCost(n: number): string {
  if (n === 0) return "$0";
  if (n < 0.01) return "$" + n.toFixed(4);
  return "$" + n.toFixed(2);
}
