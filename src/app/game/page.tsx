import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { AlphaChart, BaselineChart, BankrollChart } from "@/components/game-charts";
import { getGameData, type GameData, type NotableBet } from "@/lib/game";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "The Game — LLM Prediction Arena",
  description:
    "Stage two: after forecasting blind, each model sees the price and decides whether its own edge is worth betting. Does it know which of its forecasts to trust?",
};

async function fetchGame(): Promise<GameData | null> {
  try {
    return await getGameData();
  } catch (error) {
    console.error("Error loading game page:", error);
    return null;
  }
}

const unit = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(3)}`;

function Stat({ value, label, sub, tone }: { value: string; label: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p
        className={`font-mono text-lg font-semibold ${
          tone === "good" ? "text-emerald-400" : tone === "bad" ? "text-red-400" : "text-foreground"
        }`}
      >
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground/70">{sub}</p>}
    </div>
  );
}

function BetCard({ bet, kind }: { bet: NotableBet; kind: "won" | "lost" | "dodged" }) {
  const tone =
    kind === "won" ? "text-emerald-400" : kind === "lost" ? "text-red-400" : "text-amber-400";
  const verb = kind === "won" ? "won" : kind === "lost" ? "lost" : "dodged";
  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-foreground">
          <span className="mr-1.5">{bet.emoji}</span>
          {bet.name}
        </p>
        <p className={`shrink-0 font-mono text-xs ${tone}`}>
          {verb} {Math.abs(bet.pnl).toFixed(2)}u
        </p>
      </div>
      <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{bet.question}</p>
      <p className="mt-1 font-mono text-[11px] text-muted-foreground/80">
        said {Math.round(bet.probYes * 100)}% · price {Math.round(bet.price * 100)}% ·{" "}
        {kind === "dodged" ? "passed on" : "backed"} {bet.side.toUpperCase()} · resolved{" "}
        {bet.outcome === 1 ? "YES" : "NO"}
      </p>
      {bet.rationale && (
        <p className="mt-2 border-l-2 border-border pl-2 text-[11px] italic leading-relaxed text-muted-foreground">
          &ldquo;{bet.rationale}&rdquo;
        </p>
      )}
    </div>
  );
}

export default async function GamePage() {
  const g = await fetchGame();

  const intro = (
    <header className="max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight">
        The Game: does a model know which of its own forecasts to trust?
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        The arena&apos;s original question is settled — six cheap models, blind and pooled, do not
        beat the market (see{" "}
        <Link href="/data" className="text-primary hover:underline">
          the data
        </Link>
        ). This is a second, still-open question. After making its blind forecast, each model is
        shown the price and asked one thing:{" "}
        <strong className="text-foreground">is this disagreement worth acting on?</strong> It picks
        no side and no stake — those follow from the number it already gave. Only the bet/pass bit
        is its own.
      </p>
    </header>
  );

  if (!g || g.nSettled === 0) {
    return (
      <div className="space-y-6 pb-12">
        {intro}
        <Card>
          <CardContent className="space-y-3 p-5 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">
              {g && g.nDecisions > 0
                ? `${g.nDecisions.toLocaleString()} decisions recorded, none settled yet.`
                : "No decisions recorded yet."}
            </p>
            <p>
              Decisions are made twice daily alongside each forecasting round, and become scoreable
              once their markets resolve — typically within a week or two. This page fills in then.
            </p>
            <p>
              Until it does, here is what will appear and why it is built this way. Each model is
              scored against{" "}
              <strong className="text-foreground">itself betting every edge</strong>: same
              probabilities, same prices, same Kelly stakes, same markets, with the bet/pass choice
              as the only difference. That difference — selectivity alpha — is positive exactly when
              the bets a model declined would have lost money.
            </p>
            <p>
              Five zero-cost baselines run alongside, and the important one is{" "}
              <em>always bet NO</em>: this sample resolves YES only about 28% of the time and every
              model under-predicts YES, so reflexive NO-betting is profitable from bias alone. A
              model that cannot beat that has shown nothing. A random passer abstaining at the same
              rate as the models controls for the other trap — that abstaining reduces variance and
              can flatter a bankroll all by itself.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const best = g.rows[0];
  const anySig = g.rows.some((r) => r.alphaSignificant);
  const nullBaseline = g.baselines.find((b) => b.key === "bet-everything");
  const alwaysNo = g.baselines.find((b) => b.key === "always-no");
  const beatsAlwaysNo = alwaysNo ? g.rows.filter((r) => r.chosenPnl > alwaysNo.pnl) : [];
  const richest = [...g.rows].sort((a, b) => b.finalBankroll - a.finalBankroll)[0];

  return (
    <div className="space-y-10 pb-12">
      {intro}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          value={g.nSettled.toLocaleString()}
          label="scored decisions"
          sub={`${g.nPending.toLocaleString()} awaiting resolution`}
        />
        <Stat
          value={unit(best.alpha)}
          label={`best selectivity alpha (${best.name})`}
          tone={best.alpha > 0 ? "good" : "bad"}
          sub={best.alphaSignificant ? "interval clears zero" : "not significant"}
        />
        <Stat
          value={nullBaseline ? unit(nullBaseline.pnl) : "—"}
          label="betting every edge"
          sub="the arm each model is measured against"
        />
        <Stat value={`$${g.totalCost.toFixed(2)}`} label="stage-2 API spend" sub="no web search" />
      </div>

      <section className="space-y-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">01</p>
          <h2 className="text-lg font-semibold tracking-tight">The scored result</h2>
        </div>
        <AlphaChart data={g.rows} />
        <div className="max-w-3xl space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            {anySig ? (
              <>
                {g.rows.filter((r) => r.alphaSignificant && r.alpha > 0).length > 0 ? (
                  <>
                    Some models show a selectivity edge the sample can actually support. That is the
                    interesting case: it means the bet/pass bit carries information the probability
                    alone did not.
                  </>
                ) : (
                  <>
                    The only intervals clear of zero are negative — those models actively chose
                    worse than betting indiscriminately, which is a real (if unflattering) finding
                    about metacognition.
                  </>
                )}
              </>
            ) : (
              <>
                No model&apos;s interval clears zero yet. At {g.nSettled.toLocaleString()} scored
                decisions the honest reading is that selectivity is not yet measurable — not that it
                is absent. These intervals narrow with the square root of the sample.
              </>
            )}
          </p>
          <p>
            Read the pass rate alongside the alpha. A model that bets on everything has an alpha of
            exactly zero by construction, and a model that passes on everything has an alpha of
            minus the null — neither has demonstrated judgement. The signal lives in models that
            pass selectively <em>and</em> whose declined bets turn out badly.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">02</p>
          <h2 className="text-lg font-semibold tracking-tight">What the models must beat</h2>
        </div>
        <BaselineChart data={g.baselines} />
        <div className="max-w-3xl space-y-3 text-sm leading-relaxed text-muted-foreground">
          {alwaysNo && (
            <p>
              Reflexive NO-betting returns{" "}
              <span className="font-mono">{unit(alwaysNo.pnl)}</span> per opportunity on this
              sample, without consulting a model at all.{" "}
              {beatsAlwaysNo.length === 0 ? (
                <>
                  No model&apos;s own choices beat it. Any apparent profitability in the table above
                  should therefore be read as the sample&apos;s pessimism showing through, not as
                  forecasting skill.
                </>
              ) : (
                <>
                  {beatsAlwaysNo.length} of {g.rows.length} models beat it on their own choices —
                  the minimum bar for claiming the model contributed anything beyond a standing bias.
                </>
              )}
            </p>
          )}
          <p>
            The random passer matters as much. Abstaining reduces variance, and reduced variance
            flatters a bankroll on its own. Comparing against a bot that passes exactly as often but
            picks which to skip at random is what separates &quot;choosing well&quot; from
            &quot;choosing less&quot;.
          </p>
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">03</p>
          <h2 className="text-lg font-semibold tracking-tight">The bankrolls (for watching)</h2>
        </div>
        <BankrollChart data={g.bankrollCurve} models={g.rows} start={g.startingBankroll} />
        <div className="max-w-3xl space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            {richest.name} leads at{" "}
            <span className="font-mono">${richest.finalBankroll.toFixed(0)}</span> with a maximum
            drawdown of {(richest.maxDrawdown * 100).toFixed(0)}%. Enjoy the chart, but do not
            score the project on it: compounding makes an early win echo through every later bet, so
            the ordering here reflects luck and path as much as judgement. The flat-stake alpha
            above is the number that means something, because there each market contributes exactly
            one independent observation.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">04</p>
          <h2 className="text-lg font-semibold tracking-tight">In their own words</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-emerald-400">Best calls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {g.bestBets.map((b) => (
                <BetCard key={`${b.forecasterId}-${b.marketId}`} bet={b} kind="won" />
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-red-400">Worst calls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {g.worstBets.map((b) => (
                <BetCard key={`${b.forecasterId}-${b.marketId}`} bet={b} kind="lost" />
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-amber-400">Bullets dodged</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {g.bestPasses.length === 0 ? (
                <p className="text-xs text-muted-foreground">No passes recorded yet.</p>
              ) : (
                g.bestPasses.map((b) => (
                  <BetCard key={`${b.forecasterId}-${b.marketId}`} bet={b} kind="dodged" />
                ))
              )}
            </CardContent>
          </Card>
        </div>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          The rationale under each card is what the model actually wrote at decision time. The
          &quot;bullets dodged&quot; column is the one worth reading closely — those are the bets it
          declined that would have lost, and the stated reason is the closest thing this project has
          to evidence about <em>why</em> a model abstains.
        </p>
      </section>

      <Card className="border-dashed">
        <CardContent className="space-y-2 p-5 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">How failures are handled.</span> A
            decision counts only if the model produced both a valid blind forecast and a valid
            bet/pass answer. If either fails, the market drops out of{" "}
            <em>both</em> arms of that model&apos;s comparison. That matters more than it sounds:
            abstention is the thing being measured, so a model that simply times out would otherwise
            collect the benefit of passing without ever having chosen to. The reliability column on
            the{" "}
            <Link href="/data" className="text-primary hover:underline">
              data page
            </Link>{" "}
            tracks how often that happens.
          </p>
          <p>
            <span className="font-medium text-foreground">No real money, and no claim of
            tradeability.</span> Stakes are notional, fills are assumed at the displayed price, and
            slippage, fees and liquidity are all ignored. Prices are also captured at forecast time
            and can be stale — see the lead-lag section on the data page for how much that matters.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
