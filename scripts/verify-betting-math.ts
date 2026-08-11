import {
  flatPnl, kellyFraction, impliedSide, computeStats, computeBaselines,
  simulateBankroll, type SettledDecision,
} from "../src/lib/betting.ts";

let failures = 0;
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;
function check(name: string, cond: boolean, detail = "") {
  if (!cond) { failures++; console.log(`  FAIL  ${name} ${detail}`); }
  else console.log(`  ok    ${name}`);
}

console.log("--- flatPnl: payoff per 1 unit staked ---");
// Back YES at 25c. One unit buys 4 shares paying 1 each => profit 3.
check("YES @0.25 wins pays +3", near(flatPnl("yes", 0.25, 1), 3));
check("YES @0.25 loses pays -1", near(flatPnl("yes", 0.25, 0), -1));
// Back NO at 25c means buying NO at 75c. One unit buys 1/0.75 shares => +1/3.
check("NO @0.25 wins pays +1/3", near(flatPnl("no", 0.25, 0), 1 / 3));
check("NO @0.25 loses pays -1", near(flatPnl("no", 0.25, 1), -1));
check("fair coin YES @0.5 pays +1", near(flatPnl("yes", 0.5, 1), 1));
check("degenerate price 0 pays 0", near(flatPnl("yes", 0, 1), 0));
check("degenerate price 1 pays 0", near(flatPnl("no", 1, 0), 0));

console.log("\n--- expected value is zero when belief == price ---");
for (const c of [0.1, 0.28, 0.5, 0.77, 0.93]) {
  const ev = c * flatPnl("yes", c, 1) + (1 - c) * flatPnl("yes", c, 0);
  check(`EV(YES @${c}) == 0 at true prob ${c}`, near(ev, 0, 1e-12), `got ${ev}`);
}

console.log("\n--- kellyFraction ---");
check("no edge => 0 stake", near(kellyFraction(0.5, 0.5), 0));
check("YES edge: (p-c)/(1-c)", near(kellyFraction(0.75, 0.5), 0.5));
check("NO edge: (c-p)/c", near(kellyFraction(0.25, 0.5), 0.5));
check("certainty => full stake", near(kellyFraction(1, 0.5), 1));
check("stake bounded to [0,1]", kellyFraction(0.99, 0.01) <= 1);
check("side follows the sign of the edge", impliedSide(0.7, 0.5) === "yes" && impliedSide(0.3, 0.5) === "no");

// Kelly is the growth-optimal fraction: verify it beats neighbours on log growth.
console.log("\n--- Kelly is growth-optimal (log-utility check) ---");
{
  const p = 0.6, c = 0.4;
  const f = kellyFraction(p, c);
  const growth = (x: number) =>
    p * Math.log(1 + x * flatPnl("yes", c, 1)) + (1 - p) * Math.log(1 + x * flatPnl("yes", c, 0));
  check("Kelly beats a smaller stake", growth(f) > growth(f - 0.05));
  check("Kelly beats a larger stake", growth(f) > growth(f + 0.05));
}

console.log("\n--- selectivity alpha semantics ---");
const mk = (o: Partial<SettledDecision>): SettledDecision => ({
  forecasterId: "m", createdAt: "2026-01-01", action: "bet", side: "yes",
  price: 0.5, probYes: 0.7, kellyFraction: 0.4, outcome: 1,
  pnlFlat: 0, nullPnlFlat: 0, ...o,
});
{
  // Passed exactly the losers => alpha must be positive.
  const good = [
    mk({ action: "bet",  pnlFlat: 1, nullPnlFlat: 1 }),
    mk({ action: "pass", pnlFlat: 0, nullPnlFlat: -1 }),
  ];
  const s = computeStats(good, "m");
  check("skipping a loser gives alpha > 0", s.alpha > 0, `alpha=${s.alpha}`);
  check("alpha == -mean(passed null pnl)/n", near(s.alpha, 0.5), `alpha=${s.alpha}`);
  check("passedPnl reports the declined bet", near(s.passedPnl, -1));

  // Passed exactly the winners => alpha must be negative.
  const bad = [
    mk({ action: "bet",  pnlFlat: -1, nullPnlFlat: -1 }),
    mk({ action: "pass", pnlFlat: 0,  nullPnlFlat: 1 }),
  ];
  check("skipping a winner gives alpha < 0", computeStats(bad, "m").alpha < 0);

  // Betting everything must give exactly zero alpha, by construction.
  const all = [mk({ pnlFlat: 1, nullPnlFlat: 1 }), mk({ pnlFlat: -1, nullPnlFlat: -1 })];
  check("betting every edge gives alpha == 0", near(computeStats(all, "m").alpha, 0));

  // Passing everything must equal minus the null, exactly.
  const none = [
    mk({ action: "pass", pnlFlat: 0, nullPnlFlat: 1 }),
    mk({ action: "pass", pnlFlat: 0, nullPnlFlat: -3 }),
  ];
  const sn = computeStats(none, "m");
  check("passing everything gives alpha == -null", near(sn.alpha, -sn.nullPnl));
  check("passing everything leaves bankroll untouched", near(sn.finalBankroll, 1000));
}

console.log("\n--- bankroll simulation ---");
{
  // Half-Kelly on a full-stake win at even money: 1000 * (1 + 0.5*1*1) = 1500.
  const d = [mk({ kellyFraction: 1, pnlFlat: 1, nullPnlFlat: 1, price: 0.5 })];
  check("half-Kelly win compounds correctly", near(simulateBankroll(d).final, 1500));
  const l = [mk({ kellyFraction: 1, pnlFlat: -1, nullPnlFlat: -1, outcome: 0 })];
  check("half-Kelly total loss halves the bankroll", near(simulateBankroll(l).final, 500));
  check("bankroll never goes negative", simulateBankroll([
    mk({ kellyFraction: 1, pnlFlat: -1, outcome: 0 }),
    mk({ kellyFraction: 1, pnlFlat: -1, outcome: 0 }),
    mk({ kellyFraction: 1, pnlFlat: -1, outcome: 0 }),
  ]).final >= 0);
  const dd = simulateBankroll([
    mk({ kellyFraction: 1, pnlFlat: -1, outcome: 0 }),
    mk({ kellyFraction: 1, pnlFlat: 1 }),
  ]);
  check("max drawdown is recorded", dd.maxDrawdown >= 0.5, `dd=${dd.maxDrawdown}`);
  check("ordering is chronological, not insertion", near(
    simulateBankroll([
      mk({ createdAt: "2026-02-01", kellyFraction: 1, pnlFlat: 1 }),
      mk({ createdAt: "2026-01-01", kellyFraction: 1, pnlFlat: -1, outcome: 0 }),
    ]).final, 750));
}

console.log("\n--- baselines ---");
{
  // A pessimistic sample: 3 of 4 resolve NO, priced at 50c.
  const ds = [
    mk({ price: 0.5, outcome: 0, nullPnlFlat: flatPnl("yes", 0.5, 0) }),
    mk({ price: 0.5, outcome: 0, nullPnlFlat: flatPnl("yes", 0.5, 0) }),
    mk({ price: 0.5, outcome: 0, nullPnlFlat: flatPnl("yes", 0.5, 0) }),
    mk({ price: 0.5, outcome: 1, nullPnlFlat: flatPnl("yes", 0.5, 1) }),
  ];
  const b = computeBaselines(ds);
  const no = b.find((x) => x.key === "always-no")!;
  const yes = b.find((x) => x.key === "always-yes")!;
  check("always-NO profits on a NO-heavy sample", no.pnl > 0, `pnl=${no.pnl}`);
  check("always-YES loses on the same sample", yes.pnl < 0, `pnl=${yes.pnl}`);
  check("the two are mirror images at 50c", near(no.pnl, -yes.pnl));
  check("all five baselines present", b.length === 5);
  check("random passer is defined", Number.isFinite(b.find((x) => x.key === "random-passer")!.pnl));
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
