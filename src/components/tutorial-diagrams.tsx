// ---------------------------------------------------------------------------
// Hand-authored SVG diagrams for the /learn tutorial.
//
// These are teaching diagrams, not decoration: each one shows a mechanism that
// is hard to convey in prose (what information flows where, why a squared error
// is a *square*, why log-odds is the natural scale for pooling opinions).
//
// Conventions:
//   * viewBox + `h-auto w-full` so every diagram scales with the column.
//   * Colors come from the app's theme utilities (fill-foreground,
//     stroke-border, ...) so they track the palette, with the forecaster brand
//     hexes from lib/models.ts used literally where identity matters.
//   * No client JS -- these are pure server-rendered SVG.
// ---------------------------------------------------------------------------

const MUTED = "currentColor";

/** Shared arrowhead marker. Each diagram needs its own id to stay self-contained. */
function ArrowMarker({ id, color = "#94A3B8" }: { id: string; color?: string }) {
  return (
    <defs>
      <marker
        id={id}
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="6"
        markerHeight="6"
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
      </marker>
    </defs>
  );
}

function Figure({
  caption,
  children,
}: {
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <figure className="my-5 rounded-lg border border-border bg-card p-4">
      {children}
      <figcaption className="mt-3 text-xs leading-relaxed text-muted-foreground">
        {caption}
      </figcaption>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// 1. The whole pipeline, with the blind zone made explicit.
// ---------------------------------------------------------------------------
export function PipelineDiagram() {
  const box = "fill-background stroke-border";
  return (
    <Figure caption="Top row: how a market earns its way into a round. Bottom row: what happens to one market inside a round. The dashed rose box is the whole point of the design — the market price is stored alongside every forecast, but it is never placed in the prompt the six models see.">
      <svg viewBox="0 0 900 440" className="h-auto w-full" role="img" aria-label="End-to-end pipeline of the forecasting arena">
        <ArrowMarker id="arrow-pipe" />
        <g strokeWidth="1" className="text-muted-foreground">
          {/* ---------------- Row 1: ingest -> gate -> DB -> round ------------- */}
          <text x="8" y="16" className="fill-muted-foreground" fontSize="11" fontWeight="600">
            ① EVERY SYNC — choosing what is worth forecasting
          </text>

          <rect x="8" y="28" width="150" height="64" rx="6" className={box} />
          <text x="20" y="50" className="fill-foreground" fontSize="12" fontWeight="600">Polymarket Gamma</text>
          <text x="20" y="67" className="fill-muted-foreground" fontSize="10">600 open events,</text>
          <text x="20" y="80" className="fill-muted-foreground" fontSize="10">ranked by 24h volume</text>

          <line x1="162" y1="60" x2="196" y2="60" stroke={MUTED} markerEnd="url(#arrow-pipe)" />

          <rect x="200" y="18" width="196" height="122" rx="6" className={box} />
          <text x="212" y="38" className="fill-foreground" fontSize="12" fontWeight="600">The selection gate</text>
          <text x="212" y="57" className="fill-muted-foreground" fontSize="10">✕ sports, ✕ weather</text>
          <text x="212" y="73" className="fill-muted-foreground" fontSize="10">resolves in 1–45 days</text>
          <text x="212" y="89" className="fill-muted-foreground" fontSize="10">price between 5¢ and 95¢</text>
          <text x="212" y="105" className="fill-muted-foreground" fontSize="10">≥ $500 24h volume</text>
          <text x="212" y="121" className="fill-muted-foreground" fontSize="10">≤ 1 market per event</text>

          <line x1="400" y1="60" x2="434" y2="60" stroke={MUTED} markerEnd="url(#arrow-pipe)" />

          <rect x="438" y="34" width="140" height="52" rx="6" className={box} />
          <text x="450" y="56" className="fill-foreground" fontSize="12" fontWeight="600">markets table</text>
          <text x="450" y="73" className="fill-muted-foreground" fontSize="10">Turso (libSQL)</text>

          <line x1="582" y1="60" x2="616" y2="60" stroke={MUTED} markerEnd="url(#arrow-pipe)" />

          <rect x="620" y="26" width="170" height="68" rx="6" className={box} />
          <text x="632" y="48" className="fill-foreground" fontSize="12" fontWeight="600">A round: 12 markets</text>
          <text x="632" y="65" className="fill-muted-foreground" fontSize="10">≤ 3 per category</text>
          <text x="632" y="79" className="fill-muted-foreground" fontSize="10">10:00 and 22:00 UTC</text>

          {/* elbow down into row 2, routed clear of the section label above it */}
          <path d="M 705 96 L 705 136 L 80 136 L 80 168" fill="none" stroke={MUTED} strokeDasharray="3 3" markerEnd="url(#arrow-pipe)" />

          {/* ---------------- Row 2: one market -> forecasters ---------------- */}
          <text x="8" y="118" className="fill-muted-foreground" fontSize="11" fontWeight="600">
            ② FOR EACH MARKET IN THE ROUND
          </text>

          <rect x="8" y="176" width="150" height="90" rx="6" className={box} />
          <text x="20" y="197" className="fill-foreground" fontSize="12" fontWeight="600">One market</text>
          <text x="20" y="215" className="fill-muted-foreground" fontSize="10">question</text>
          <text x="20" y="230" className="fill-muted-foreground" fontSize="10">description</text>
          <text x="20" y="245" className="fill-muted-foreground" fontSize="10">resolution date</text>
          <text x="20" y="260" fill="#F43F5E" fontSize="10">yes_price ⟵ withheld</text>

          {/* blind zone */}
          <rect x="184" y="168" width="248" height="196" rx="8" fill="none" stroke="#F43F5E" strokeDasharray="5 4" />
          <text x="192" y="185" fill="#F43F5E" fontSize="10" fontWeight="600">BLIND ZONE — no price inside</text>

          {[
            { label: "DeepSeek V4", color: "#FF6B35", y: 196 },
            { label: "Qwen3 235B", color: "#06B6D4", y: 224 },
            { label: "Seed 1.6", color: "#EC4899", y: 252 },
            { label: "GPT-4.1 Mini", color: "#10A37F", y: 280 },
            { label: "Gemini 3.1 FL", color: "#4285F4", y: 308 },
            { label: "Mistral Small", color: "#8B5CF6", y: 336 },
          ].map((m) => (
            <g key={m.label}>
              <rect x="196" y={m.y - 12} width="128" height="22" rx="4" fill={m.color} fillOpacity="0.12" stroke={m.color} strokeOpacity="0.5" />
              <text x="206" y={m.y + 3} className="fill-foreground" fontSize="10">{m.label}</text>
            </g>
          ))}

          <rect x="336" y="196" width="86" height="152" rx="4" className={box} strokeDasharray="2 2" />
          <text x="345" y="216" className="fill-muted-foreground" fontSize="9">each call:</text>
          <text x="345" y="233" className="fill-muted-foreground" fontSize="9">+ Exa web</text>
          <text x="345" y="246" className="fill-muted-foreground" fontSize="9">  search ×4</text>
          <text x="345" y="266" className="fill-muted-foreground" fontSize="9">temperature 0</text>
          <text x="345" y="286" className="fill-muted-foreground" fontSize="9">JSON schema</text>
          <text x="345" y="306" className="fill-muted-foreground" fontSize="9">30s timeout</text>
          <text x="345" y="326" className="fill-muted-foreground" fontSize="9">fail ⇒ ok=0</text>

          <line x1="162" y1="220" x2="190" y2="220" stroke={MUTED} markerEnd="url(#arrow-pipe)" />
          <line x1="436" y1="266" x2="470" y2="266" stroke={MUTED} markerEnd="url(#arrow-pipe)" />

          {/* forecaster rows written */}
          <rect x="474" y="176" width="196" height="188" rx="6" className={box} />
          <text x="486" y="196" className="fill-foreground" fontSize="12" fontWeight="600">9 rows written</text>

          <text x="486" y="220" className="fill-muted-foreground" fontSize="10">6 × model P(YES)</text>
          <line x1="486" y1="228" x2="656" y2="228" stroke={MUTED} strokeOpacity="0.3" />

          <text x="486" y="248" fill="#F59E0B" fontSize="10" fontWeight="600">ensemble</text>
          <text x="486" y="262" className="fill-muted-foreground" fontSize="9">mean of valid model probs</text>

          <text x="486" y="286" fill="#F43F5E" fontSize="10" fontWeight="600">hybrid — Market × Models</text>
          <text x="486" y="300" className="fill-muted-foreground" fontSize="9">0.8·logit(price) + 0.2·logit(models)</text>

          <text x="486" y="324" fill="#94A3B8" fontSize="10" fontWeight="600">crowd</text>
          <text x="486" y="338" className="fill-muted-foreground" fontSize="9">the Polymarket price itself</text>

          {/* price feeds hybrid + crowd only */}
          <path d="M 84 266 L 84 392 L 560 392 L 560 368" fill="none" stroke="#F43F5E" strokeWidth="1.2" markerEnd="url(#arrow-pipe)" />
          <text x="150" y="406" fill="#F43F5E" fontSize="10">the withheld price goes straight to the crowd + hybrid rows — never to a prompt</text>

          {/* settle + score */}
          <line x1="674" y1="266" x2="706" y2="266" stroke={MUTED} markerEnd="url(#arrow-pipe)" />
          <rect x="710" y="212" width="182" height="52" rx="6" className={box} />
          <text x="722" y="234" className="fill-foreground" fontSize="12" fontWeight="600">Settlement, every 4h</text>
          <text x="722" y="251" className="fill-muted-foreground" fontSize="10">did the market resolve YES?</text>

          <line x1="801" y1="268" x2="801" y2="290" stroke={MUTED} markerEnd="url(#arrow-pipe)" />
          <rect x="710" y="294" width="182" height="70" rx="6" className={box} />
          <text x="722" y="316" className="fill-foreground" fontSize="12" fontWeight="600">Scores</text>
          <text x="722" y="333" className="fill-muted-foreground" fontSize="10">Brier · log loss · ECE</text>
          <text x="722" y="349" className="fill-muted-foreground" fontSize="10">skill vs. crowd</text>
        </g>
      </svg>
    </Figure>
  );
}

// ---------------------------------------------------------------------------
// 2. Who sees what. The information-set diagram.
// ---------------------------------------------------------------------------
export function InformationSetDiagram() {
  return (
    <Figure caption="The forecasters differ in exactly one respect that matters: whether the market price is in their information set. A model that could see the price could score well by copying it — and an ensemble of copies would tell you nothing about whether language models know anything.">
      <svg viewBox="0 0 860 250" className="h-auto w-full" role="img" aria-label="What information each forecaster can see">
        <ArrowMarker id="arrow-info" />
        {/* column headers */}
        <text x="230" y="20" className="fill-muted-foreground" fontSize="11" fontWeight="600" textAnchor="middle">The 6 models</text>
        <text x="470" y="20" fill="#F43F5E" fontSize="11" fontWeight="600" textAnchor="middle">hybrid</text>
        <text x="680" y="20" fill="#94A3B8" fontSize="11" fontWeight="600" textAnchor="middle">crowd</text>

        {[
          { label: "Question text", y: 56, models: true, hybrid: false, crowd: false },
          { label: "Description / resolution rules", y: 92, models: true, hybrid: false, crowd: false },
          { label: "Resolution date", y: 128, models: true, hybrid: false, crowd: false },
          { label: "Live web search results", y: 164, models: true, hybrid: false, crowd: false },
          { label: "The market price", y: 200, models: false, hybrid: true, crowd: true },
        ].map((r) => (
          <g key={r.label}>
            <rect x="8" y={r.y - 20} width="176" height="30" rx="5" className="fill-background stroke-border" strokeWidth="1" />
            <text x="20" y={r.y - 1} className="fill-foreground" fontSize="10">{r.label}</text>
            {[
              { x: 230, on: r.models },
              { x: 470, on: r.hybrid },
              { x: 680, on: r.crowd },
            ].map((c) => (
              <g key={c.x}>
                <circle
                  cx={c.x}
                  cy={r.y - 6}
                  r="10"
                  fill={c.on ? (r.label === "The market price" ? "#F43F5E" : "#10A37F") : "transparent"}
                  fillOpacity={c.on ? 0.18 : 0}
                  stroke={c.on ? (r.label === "The market price" ? "#F43F5E" : "#10A37F") : "#3F3F46"}
                  strokeDasharray={c.on ? undefined : "2 2"}
                />
                {c.on && (
                  <path
                    d={`M ${c.x - 4} ${r.y - 6} l 3 3 l 6 -7`}
                    fill="none"
                    stroke={r.label === "The market price" ? "#F43F5E" : "#10A37F"}
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                )}
              </g>
            ))}
          </g>
        ))}

        <line x1="196" y1="36" x2="196" y2="216" className="stroke-border" strokeDasharray="3 3" />
        <text x="230" y="236" className="fill-muted-foreground" fontSize="9" textAnchor="middle">independent estimate</text>
        <text x="470" y="236" className="fill-muted-foreground" fontSize="9" textAnchor="middle">price, nudged by models</text>
        <text x="680" y="236" className="fill-muted-foreground" fontSize="9" textAnchor="middle">the price, unchanged</text>
      </svg>
    </Figure>
  );
}

// ---------------------------------------------------------------------------
// 3. Brier score, drawn as an actual square.
// ---------------------------------------------------------------------------
export function BrierDiagram() {
  // Two worked examples, side by side so both squares are drawn at the SAME
  // scale -- the visual comparison of their areas IS the lesson, so the axis
  // length is chosen such that even the 0.9-error square fits the canvas.
  const AXIS = 240;
  const BASE = 316; // baseline y for both panels
  const panels = [
    { x0: 50, p: 0.7, outcome: 1, label: "You said 70% — it happened", color: "#10A37F" },
    { x0: 430, p: 0.9, outcome: 0, label: "You said 90% — it didn't", color: "#F43F5E" },
  ];
  return (
    <Figure caption="The Brier score is the squared distance between your probability and what happened — literally the area of the square drawn on that gap. Both squares here are drawn to the same scale, and that is the point: being 30 points off costs 0.09, being 90 points off costs 0.81, nine times more. Squaring is what makes confident mistakes expensive. Averaged over every forecast, 0 is perfect and 0.25 is what you get by always saying 50%.">
      <svg viewBox="0 0 720 380" className="h-auto w-full" role="img" aria-label="Brier score as a squared distance">
        {panels.map((c) => {
          const px = (p: number) => c.x0 + p * AXIS;
          const fx = px(c.p);
          const ox = px(c.outcome);
          const gap = Math.abs(c.p - c.outcome);
          const side = Math.abs(ox - fx);
          return (
            <g key={c.label}>
              <text x={c.x0} y="24" className="fill-foreground" fontSize="11" fontWeight="600">
                {c.label}
              </text>
              {/* the square, standing on the error segment */}
              <rect
                x={Math.min(fx, ox)}
                y={BASE - side}
                width={side}
                height={side}
                fill={c.color}
                fillOpacity="0.12"
                stroke={c.color}
                strokeDasharray="4 3"
              />
              <text
                x={(fx + ox) / 2}
                y={BASE - side - 10}
                fill={c.color}
                fontSize="11"
                textAnchor="middle"
                fontWeight="600"
              >
                error {gap.toFixed(1)} → Brier {(gap * gap).toFixed(2)}
              </text>
              {/* axis */}
              <line x1={c.x0} y1={BASE} x2={c.x0 + AXIS} y2={BASE} className="stroke-border" strokeWidth="1.5" />
              {[0, 0.5, 1].map((t) => (
                <g key={t}>
                  <line x1={px(t)} y1={BASE - 4} x2={px(t)} y2={BASE + 4} className="stroke-border" />
                  <text x={px(t)} y={BASE + 18} className="fill-muted-foreground" fontSize="9" textAnchor="middle">
                    {t === 0 ? "0 = NO" : t === 1 ? "1 = YES" : "0.5"}
                  </text>
                </g>
              ))}
              {/* the error segment itself */}
              <line x1={fx} y1={BASE} x2={ox} y2={BASE} stroke={c.color} strokeWidth="3" />
              <circle cx={fx} cy={BASE} r="5" fill={c.color} />
              <circle cx={ox} cy={BASE} r="5" className="fill-background" stroke={c.color} strokeWidth="2" />
            </g>
          );
        })}
        <text x="50" y="358" className="fill-muted-foreground" fontSize="10">
          filled dot = your forecast · hollow dot = what actually happened · shaded square = the penalty you pay
        </text>
      </svg>
    </Figure>
  );
}

// ---------------------------------------------------------------------------
// 4. Calibration: how to read a reliability diagram.
// ---------------------------------------------------------------------------
export function CalibrationDiagram() {
  const O = { x: 70, y: 250 };
  const S = 200; // side length
  const p = (v: number) => O.x + v * S;
  const q = (v: number) => O.y - v * S;
  const under = [0.18, 0.3, 0.42, 0.56, 0.66, 0.78, 0.86, 0.92]; // actual rates for stated 0.1..0.8
  const stated = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
  return (
    <Figure caption="A reliability diagram sorts every forecast into confidence buckets and asks: of the times you said 30%, how often did it actually happen? On the diagonal means calibrated. This arena's models sit above the line at the low end — when they say 15%, those events land closer to a third of the time. That is the skepticism bias the Findings page measures, and averaging six models does not remove it, because all six share it.">
      <svg viewBox="0 0 620 300" className="h-auto w-full" role="img" aria-label="How to read a reliability diagram">
        {/* axes */}
        <line x1={O.x} y1={O.y} x2={O.x + S} y2={O.y} className="stroke-border" strokeWidth="1.5" />
        <line x1={O.x} y1={O.y} x2={O.x} y2={O.y - S} className="stroke-border" strokeWidth="1.5" />
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <text x={p(t)} y={O.y + 16} className="fill-muted-foreground" fontSize="9" textAnchor="middle">{t * 100}%</text>
            <text x={O.x - 8} y={q(t) + 3} className="fill-muted-foreground" fontSize="9" textAnchor="end">{t * 100}%</text>
          </g>
        ))}
        <text x={O.x + S / 2} y={O.y + 34} className="fill-muted-foreground" fontSize="10" textAnchor="middle">what you said</text>
        <text x="16" y={O.y - S / 2} className="fill-muted-foreground" fontSize="10" textAnchor="middle" transform={`rotate(-90 16 ${O.y - S / 2})`}>
          what happened
        </text>

        {/* perfect */}
        <line x1={p(0)} y1={q(0)} x2={p(1)} y2={q(1)} className="stroke-border" strokeDasharray="4 4" strokeWidth="1.5" />
        <text x={p(0.72)} y={q(0.66)} className="fill-muted-foreground" fontSize="9" transform={`rotate(-45 ${p(0.72)} ${q(0.66)})`}>
          perfectly calibrated
        </text>

        {/* under-confident curve (above diagonal) */}
        <polyline
          points={stated.map((s, i) => `${p(s)},${q(under[i])}`).join(" ")}
          fill="none"
          stroke="#F59E0B"
          strokeWidth="2.5"
        />
        {stated.map((s, i) => (
          <circle key={s} cx={p(s)} cy={q(under[i])} r="3.5" fill="#F59E0B" />
        ))}

        {/* region labels */}
        <text x={p(0.18)} y={q(0.78)} fill="#F59E0B" fontSize="10" fontWeight="600">above the line =</text>
        <text x={p(0.18)} y={q(0.71)} fill="#F59E0B" fontSize="10" fontWeight="600">too skeptical</text>
        <text x={p(0.5)} y={q(0.16)} className="fill-muted-foreground" fontSize="10" fontWeight="600">below the line =</text>
        <text x={p(0.5)} y={q(0.09)} className="fill-muted-foreground" fontSize="10" fontWeight="600">overconfident</text>

        {/* side note */}
        <g>
          <text x="330" y="60" className="fill-foreground" fontSize="11" fontWeight="600">Calibration is not accuracy</text>
          <text x="330" y="82" className="fill-muted-foreground" fontSize="10">A forecaster that says &quot;50%&quot; to everything</text>
          <text x="330" y="98" className="fill-muted-foreground" fontSize="10">is perfectly calibrated and completely</text>
          <text x="330" y="114" className="fill-muted-foreground" fontSize="10">useless. You also need resolution: the</text>
          <text x="330" y="130" className="fill-muted-foreground" fontSize="10">willingness to say 10% and 90% and be</text>
          <text x="330" y="146" className="fill-muted-foreground" fontSize="10">right about which is which.</text>
          <text x="330" y="176" className="fill-muted-foreground" fontSize="10">The Brier score bundles both:</text>
          <text x="330" y="196" className="fill-foreground" fontSize="11" fontFamily="monospace">Brier = reliability − resolution</text>
          <text x="330" y="212" className="fill-foreground" fontSize="11" fontFamily="monospace">        + uncertainty</text>
          <text x="330" y="236" className="fill-muted-foreground" fontSize="10">Reliability is the vertical gap from the</text>
          <text x="330" y="252" className="fill-muted-foreground" fontSize="10">diagonal in this chart, squared.</text>
        </g>
      </svg>
    </Figure>
  );
}

// ---------------------------------------------------------------------------
// 5. Probability vs log-odds: why the hybrid blends in logit space.
// ---------------------------------------------------------------------------
export function LogitDiagram() {
  const X0 = 80;
  const X1 = 700;
  const pxProb = (p: number) => X0 + p * (X1 - X0);
  const L = 7; // logit axis range +-7
  const logit = (p: number) => Math.log(p / (1 - p));
  const pxLogit = (p: number) => X0 + ((logit(p) + L) / (2 * L)) * (X1 - X0);
  const marks = [0.02, 0.1, 0.25, 0.5, 0.75, 0.9, 0.98];
  const pairs = [
    { a: 0.5, b: 0.6, color: "#94A3B8", label: "50% → 60%" },
    { a: 0.9, b: 0.99, color: "#F43F5E", label: "90% → 99%" },
  ];
  return (
    <Figure caption="The same 10-point move means something completely different depending on where you start. Going from 50% to 60% barely changes the odds (1:1 → 1.5:1); going from 90% to 99% multiplies them tenfold (9:1 → 99:1). Averaging raw probabilities treats those as equal. Log-odds space stretches the ends so evidence adds up the way Bayes' rule says it should — which is why both the hybrid blend and the logit pool do their arithmetic there.">
      <svg viewBox="0 0 780 300" className="h-auto w-full" role="img" aria-label="Probability scale versus log-odds scale">
        <ArrowMarker id="arrow-logit" />
        {/* probability axis */}
        <text x={X0} y="34" className="fill-foreground" fontSize="11" fontWeight="600">Probability scale — evenly spaced</text>
        <line x1={X0} y1="60" x2={X1} y2="60" className="stroke-border" strokeWidth="1.5" />
        {marks.map((m) => (
          <g key={`p${m}`}>
            <line x1={pxProb(m)} y1="54" x2={pxProb(m)} y2="66" className="stroke-border" />
            <text x={pxProb(m)} y="82" className="fill-muted-foreground" fontSize="9" textAnchor="middle">{Math.round(m * 100)}%</text>
          </g>
        ))}
        {pairs.map((pr) => (
          <g key={`p-${pr.label}`}>
            <line x1={pxProb(pr.a)} y1="44" x2={pxProb(pr.b)} y2="44" stroke={pr.color} strokeWidth="3.5" />
            <circle cx={pxProb(pr.a)} cy="44" r="3.5" fill={pr.color} />
            <circle cx={pxProb(pr.b)} cy="44" r="3.5" fill={pr.color} />
          </g>
        ))}

        {/* log-odds axis */}
        <text x={X0} y="176" className="fill-foreground" fontSize="11" fontWeight="600">Log-odds scale — the ends stretch out</text>
        <line x1={X0} y1="202" x2={X1} y2="202" className="stroke-border" strokeWidth="1.5" />
        {marks.map((m) => (
          <g key={`l${m}`}>
            <line x1={pxLogit(m)} y1="196" x2={pxLogit(m)} y2="208" className="stroke-border" />
            <text x={pxLogit(m)} y="224" className="fill-muted-foreground" fontSize="9" textAnchor="middle">{Math.round(m * 100)}%</text>
          </g>
        ))}
        {pairs.map((pr) => (
          <g key={`l-${pr.label}`}>
            <line x1={pxLogit(pr.a)} y1="186" x2={pxLogit(pr.b)} y2="186" stroke={pr.color} strokeWidth="3.5" />
            <circle cx={pxLogit(pr.a)} cy="186" r="3.5" fill={pr.color} />
            <circle cx={pxLogit(pr.b)} cy="186" r="3.5" fill={pr.color} />
          </g>
        ))}

        {/* connectors showing the stretch */}
        {pairs.map((pr) => (
          <g key={`c-${pr.label}`} opacity="0.5">
            <line x1={pxProb(pr.a)} y1="96" x2={pxLogit(pr.a)} y2="176" stroke={pr.color} strokeDasharray="3 3" />
            <line x1={pxProb(pr.b)} y1="96" x2={pxLogit(pr.b)} y2="176" stroke={pr.color} strokeDasharray="3 3" />
          </g>
        ))}

        <text x={pxProb(0.5)} y="120" fill="#94A3B8" fontSize="10">50% → 60%: odds barely move</text>
        <text x={pxProb(0.62)} y="142" fill="#F43F5E" fontSize="10">90% → 99%: odds go 9:1 → 99:1</text>

        <text x={X0} y="262" className="fill-foreground" fontSize="11" fontFamily="monospace">
          logit(p) = ln( p / (1−p) )
        </text>
        <text x={X0} y="284" className="fill-muted-foreground" fontSize="11" fontFamily="monospace">
          hybrid = invLogit( 0.8·logit(price) + 0.2·mean logit(model) )
        </text>
      </svg>
    </Figure>
  );
}

// ---------------------------------------------------------------------------
// 6. Why averaging helps -- and when it doesn't.
// ---------------------------------------------------------------------------
const ERR_TRUTH_X = 300;
const ERR_COLORS = ["#FF6B35", "#06B6D4", "#EC4899", "#10A37F", "#4285F4", "#8B5CF6"];

/** One row of the ensemble diagram: six forecast errors around the truth line. */
function ErrorPanel({
  errs,
  y,
  title,
  note,
}: {
  errs: number[];
  y: number;
  title: string;
  note: string;
}) {
  const truth = ERR_TRUTH_X;
  const colors = ERR_COLORS;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return (
    <g>
      <text x="20" y={y - 30} className="fill-foreground" fontSize="11" fontWeight="600">{title}</text>
      <line x1="20" y1={y} x2="580" y2={y} className="stroke-border" />
      <line x1={truth} y1={y - 22} x2={truth} y2={y + 46} stroke="#10A37F" strokeWidth="2" />
      <text x={truth} y={y - 28} fill="#10A37F" fontSize="9" textAnchor="middle">truth</text>
      {errs.map((e, i) => (
        <g key={i}>
          <line
            x1={truth}
            y1={y}
            x2={truth + e}
            y2={y}
            stroke={colors[i]}
            strokeWidth="2"
            opacity="0.75"
          />
          <circle cx={truth + e} cy={y} r="4" fill={colors[i]} />
        </g>
      ))}
      <circle cx={truth + mean(errs)} cy={y + 30} r="6" fill="#F59E0B" />
      <line x1={truth} y1={y + 30} x2={truth + mean(errs)} y2={y + 30} stroke="#F59E0B" strokeWidth="2.5" />
      <text x="600" y={y + 4} className="fill-muted-foreground" fontSize="10">six forecasts</text>
      <text x="600" y={y + 34} fill="#F59E0B" fontSize="10">their average</text>
      <text x="20" y={y + 62} className="fill-muted-foreground" fontSize="10">{note}</text>
    </g>
  );
}

export function EnsembleDiagram() {
  const rowY = 96;
  // Same six error magnitudes in both panels -- only the SIGNS differ, so the
  // diagram isolates correlation as the single cause of the difference.
  const independent = [-70, 45, -30, 60, -50, 25];
  const correlated = [-60, -50, -70, -45, -65, -55];
  return (
    <Figure caption="Averaging cancels the part of the error that differs between models and keeps the part they share. That is the whole reason the roster spans five companies and three regions — and also why a bias every model has (like this arena's shared skepticism) survives the ensemble untouched. Adding a seventh model that thinks like the other six buys you nothing.">
      <svg viewBox="0 0 720 290" className="h-auto w-full" role="img" aria-label="Independent errors cancel, shared errors do not">
        <ErrorPanel
          errs={independent}
          y={rowY}
          title="Independent errors — they point different ways"
          note="Individual forecasts are scattered, but the misses cancel: the average lands close to the truth."
        />
        <ErrorPanel
          errs={correlated}
          y={rowY + 110}
          title="Correlated errors — they all lean the same way"
          note="Every model is wrong in the same direction, so the average is just as wrong. Averaging cannot fix a shared prior."
        />
      </svg>
    </Figure>
  );
}

// ---------------------------------------------------------------------------
// 7. The training-cutoff question, answered visually.
// ---------------------------------------------------------------------------
export function TrainingCutoffDiagram() {
  return (
    <Figure caption="A model's weights are frozen at its training cutoff, but a forecast is made at request time with fresh evidence pasted into the context window. The split matters: pretraining supplies the base rate (how often things like this happen), retrieval supplies the current state (what has happened so far). A model whose search comes back empty silently falls back to memory alone — which is exactly the failure this codebase hit with one provider's native search, and why the Exa engine is forced for every model.">
      <svg viewBox="0 0 820 280" className="h-auto w-full" role="img" aria-label="How a frozen model forecasts a future event">
        <ArrowMarker id="arrow-cut" />
        {/* timeline */}
        <line x1="40" y1="60" x2="760" y2="60" className="stroke-border" strokeWidth="1.5" markerEnd="url(#arrow-cut)" />
        <line x1="300" y1="42" x2="300" y2="78" stroke="#F43F5E" strokeWidth="2" strokeDasharray="4 3" />
        <text x="300" y="34" fill="#F43F5E" fontSize="10" textAnchor="middle" fontWeight="600">training cutoff</text>
        <line x1="560" y1="42" x2="560" y2="78" className="stroke-border" strokeWidth="2" />
        <text x="560" y="34" className="fill-foreground" fontSize="10" textAnchor="middle" fontWeight="600">forecast made</text>
        <line x1="700" y1="42" x2="700" y2="78" stroke="#10A37F" strokeWidth="2" />
        <text x="700" y="34" fill="#10A37F" fontSize="10" textAnchor="middle" fontWeight="600">resolution</text>
        <text x="150" y="96" className="fill-muted-foreground" fontSize="10" textAnchor="middle">weights frozen here</text>
        <text x="430" y="96" className="fill-muted-foreground" fontSize="10" textAnchor="middle">the gap search must fill</text>
        <text x="630" y="96" className="fill-muted-foreground" fontSize="10" textAnchor="middle">nobody knows this yet</text>

        {/* two inputs merging */}
        <rect x="40" y="130" width="250" height="86" rx="6" className="fill-background stroke-border" />
        <text x="56" y="152" className="fill-foreground" fontSize="11" fontWeight="600">From pretraining (frozen)</text>
        <text x="56" y="172" className="fill-muted-foreground" fontSize="10">base rates: how often do</text>
        <text x="56" y="187" className="fill-muted-foreground" fontSize="10">announced deals actually close?</text>
        <text x="56" y="205" className="fill-muted-foreground" fontSize="10">causal structure, entity knowledge</text>

        <rect x="40" y="228" width="250" height="44" rx="6" className="fill-background" stroke="#10A37F" strokeOpacity="0.6" />
        <text x="56" y="248" fill="#10A37F" fontSize="11" fontWeight="600">From web search (live)</text>
        <text x="56" y="264" className="fill-muted-foreground" fontSize="10">4 Exa results: what has happened</text>

        <path d="M 294 173 L 360 173 L 360 200 L 420 200" fill="none" className="stroke-border" markerEnd="url(#arrow-cut)" />
        <path d="M 294 250 L 360 250 L 360 210 L 420 210" fill="none" stroke="#10A37F" markerEnd="url(#arrow-cut)" />

        <rect x="424" y="168" width="170" height="76" rx="6" className="fill-background stroke-border" />
        <text x="440" y="192" className="fill-foreground" fontSize="11" fontWeight="600">One forward pass</text>
        <text x="440" y="211" className="fill-muted-foreground" fontSize="10">&quot;base rate, then adjust</text>
        <text x="440" y="226" className="fill-muted-foreground" fontSize="10">for specific evidence&quot;</text>

        <line x1="598" y1="206" x2="640" y2="206" className="stroke-border" markerEnd="url(#arrow-cut)" />
        <rect x="644" y="180" width="150" height="52" rx="6" className="fill-background" stroke="#F59E0B" strokeOpacity="0.6" />
        <text x="660" y="202" fill="#F59E0B" fontSize="11" fontWeight="600">P(YES) = 0.34</text>
        <text x="660" y="220" className="fill-muted-foreground" fontSize="10">+ reasoning, key factors</text>
      </svg>
    </Figure>
  );
}
