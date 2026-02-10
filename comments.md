This is a strong spec. Here are the improvements I'd prioritize, roughly ordered by impact:

**Tournament structure**

The weekly cohort with fresh $10K is clean, but one week is a short window — most markets won't resolve within a single cohort. You'll likely end most weeks with 80%+ of bets unsettled. Consider either (a) letting bets settle across cohort boundaries (the bet belongs to the cohort it was placed in, but P&L lands whenever the market resolves), or (b) only selecting markets with resolution dates within the current cohort week. Option (a) is better — it preserves your 1-60 day horizon filter while keeping cohorts meaningful. You'd just need a "cohort P&L" that accumulates as markets resolve over subsequent weeks, and a "final cohort standings" that might not be known for 60 days after the cohort ends.

The 2x daily rounds (14/week) with 15 markets each means ~210 market-model decisions per model per week. That's a lot of data, which is good, but many will be the same markets re-evaluated at different prices. You should track whether a model has already bet on a market *in this cohort* and present that context in the prompt ("You previously bet YES on this market at $0.65; it's now at $0.72"). This tests whether models can update beliefs, and avoids the awkwardness of contradictory positions.

**The `:online` suffix concern**

This is the biggest technical risk in the spec. The `:online` model variants on OpenRouter route through different model versions than the base IDs. Check whether `google/gemini-3-flash-preview:online` actually exists and behaves identically to the base model with the `plugins` approach. The plugins-based web search (`plugins: [{ id: "web" }]`) gives you more control and doesn't change the model routing. I'd verify this before committing — if `:online` silently swaps to an older model version, your benchmark is compromised.

**Brier score on passes is problematic**

You say Brier score applies to all predictions including passes, but this creates a perverse incentive. If a model passes on a market with YES at $0.50 and reports `estimated_probability: 0.50`, its Brier score on that market is 0.25 regardless of outcome — the coin-flip baseline. A model that always passes and parrots the market price will have a Brier score equal to the market's calibration (which is quite good). Meanwhile, a model that takes contrarian positions and bets will have higher Brier variance. You should either (a) only score Brier on non-pass bets, or (b) require the model to report `estimated_probability` even on passes but weight those differently. Option (a) is cleaner and what Forecaster Arena does.

**Missing: deduplication of correlated markets**

Polymarket frequently has clusters of related markets ("Will Trump win the 2026 midterms?", "Will Republicans control the Senate after 2026?", "Will Trump's approval rating exceed 50% by July?"). If a model bets the same direction on 5 correlated markets, a single event resolves all 5 the same way, massively amplifying the P&L swing. This isn't measuring forecasting skill — it's measuring exposure to a single outcome. At minimum, you should log a `correlation_cluster` field and let the UI show "adjusted P&L excluding correlated bets." A simple heuristic: if two markets share >50% of the same words in their question, flag them.

**Settlement verification**

Your settlement logic checks `outcomePrices` for `[1.00, 0.00]` or `[0.00, 1.00]`. But Polymarket markets can also resolve as "N/A" (voided), especially for poorly worded or disputed markets. A voided market should refund the escrowed bet amount with zero P&L and no Brier score impact. The `resolved` field needs a third state (0=open, 1=yes, 2=no, 3=voided).

**Cost tracking underestimates web search**

Your cost table shows web search at ~$0.004/call, but OpenRouter's Exa integration charges vary by result count. With `max_results: 5`, you're likely paying $0.005-0.01 per search on top of the model token costs. At 90 calls/round, that's an extra $0.45-0.90. Not huge, but it means your $2.60/round estimate is probably closer to $3-4. More importantly, some models may trigger multiple search rounds internally — you won't see that in the billed cost but it affects latency.

**Tech: Turso is the right call**

The switch from `better-sqlite3` to Turso/libSQL is correct for Vercel deployment. `better-sqlite3` requires native bindings that don't work in Vercel's serverless environment. One thing to add: Turso has a generous free tier (500 databases, 9GB storage, 25M row reads/month) that will easily cover this project. Worth mentioning so Claude Code doesn't overthink the database choice.

**Missing: a "market difficulty" metric**

Not all markets are equally hard to predict. A market at YES $0.90 that resolves YES is easy — almost everyone will get it right. A market at YES $0.50 is maximally uncertain. You should compute and display the **base rate difficulty** per market (entropy of the market price at bet time). This contextualizes model performance: beating the market on a 50/50 question is far more impressive than correctly predicting a 90/10 outcome.

**The "Options to Consider" section is excellent but too long for a build spec**

It reads more like a research proposal appendix. I'd move it to a separate `FUTURE.md` or collapse it into a shorter "Future Work" section with just the top 5 priorities. For the build spec that Claude Code will execute, the options list is noise that could cause scope creep. Keep the spec focused on what to build *now*.

**One concrete addition worth building in v1: the ensemble prediction**

It's nearly free to compute and scientifically interesting. After all 6 models report their `estimated_probability`, compute the simple average and the median. Track these as a virtual 7th "model" called "Ensemble" or "Wisdom of Crowd." Superforecasting research consistently shows that aggregating independent forecasts beats individual forecasters. If the ensemble beats all 6 models, that's a publishable finding. If it doesn't, that's also interesting. It costs zero API calls and adds one row to the leaderboard.