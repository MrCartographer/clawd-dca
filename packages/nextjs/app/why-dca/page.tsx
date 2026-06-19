import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Why DCA · CLAWD DCA",
  description:
    "Dollar-cost averaging explained: why splitting buys over time beats trying to time the market, and how it works on CLAWD DCA.",
};

const Section = ({ label, title, children }: { label?: string; title: string; children: React.ReactNode }) => (
  <section className="flex flex-col gap-3">
    {label && (
      <span className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-2)] font-semibold">{label}</span>
    )}
    <h2 className="text-2xl sm:text-3xl font-semibold tracking-[-0.025em]">{title}</h2>
    <div className="flex flex-col gap-3 text-[15px] leading-relaxed text-[color:var(--text-1)]">{children}</div>
  </section>
);

const Pillar = ({ n, title, body }: { n: string; title: string; body: string }) => (
  <div className="surface p-5 flex flex-col gap-2">
    <span className="text-[11px] tabular text-[color:var(--clawd)] font-semibold tracking-[0.12em]">{n}</span>
    <h3 className="text-base font-semibold tracking-tight">{title}</h3>
    <p className="text-sm text-[color:var(--text-2)] leading-relaxed">{body}</p>
  </div>
);

const Comparison = ({ label, rows }: { label: string; rows: { a: string; b: string }[] }) => (
  <div className="surface overflow-hidden">
    <div className="grid grid-cols-2 text-[10px] uppercase tracking-[0.12em] text-[color:var(--text-2)] font-medium border-b border-[color:var(--line)]">
      <div className="p-3">Lump-sum / market timing</div>
      <div className="p-3 border-l border-[color:var(--line)] bg-[color:var(--clawd-soft)] text-[color:var(--text-0)]">
        {label}
      </div>
    </div>
    {rows.map((r, i) => (
      <div key={i} className="grid grid-cols-2 text-sm border-b last:border-0 border-[color:var(--line-soft)]">
        <div className="p-3 text-[color:var(--text-2)]">{r.a}</div>
        <div className="p-3 border-l border-[color:var(--line-soft)] text-[color:var(--text-0)]">{r.b}</div>
      </div>
    ))}
  </div>
);

const FAQ = ({ q, a }: { q: string; a: React.ReactNode }) => (
  <details className="surface px-5 py-3 group">
    <summary className="cursor-pointer list-none flex items-center justify-between gap-3">
      <span className="font-medium text-[color:var(--text-0)]">{q}</span>
      <span className="text-[color:var(--text-3)] transition-transform group-open:rotate-45 text-xl leading-none">
        +
      </span>
    </summary>
    <div className="text-sm text-[color:var(--text-1)] leading-relaxed pt-3">{a}</div>
  </details>
);

const WhyDcaPage = () => (
  <div className="max-w-3xl w-full mx-auto px-4 sm:px-6 py-10 sm:py-14 flex flex-col gap-12 mount">
    {/* hero */}
    <header className="flex flex-col gap-4 text-center">
      <span className="chip">For newcomers</span>
      <h1 className="text-4xl sm:text-5xl font-semibold tracking-[-0.03em]">Why dollar-cost average?</h1>
      <p className="text-[color:var(--text-1)] max-w-xl mx-auto text-base sm:text-lg leading-relaxed">
        You can&apos;t reliably time the market. DCA gives up trying — and quietly wins by being consistent instead.
      </p>
    </header>

    {/* THE CORE IDEA */}
    <Section label="The idea" title="Buy a fixed dollar amount on a schedule.">
      <p>
        Instead of placing one big bet at a single moment, you split that same total budget into smaller buys, spaced
        out over time. When the price is high your dollars buy less; when the price dips your dollars buy more. The math
        averages out — and the emotional rollercoaster doesn&apos;t hijack your behavior.
      </p>
      <p className="text-[color:var(--text-2)] text-sm italic">
        &ldquo;Time in the market beats timing the market.&rdquo;
      </p>
    </Section>

    {/* WHY IT WORKS */}
    <Section label="Why it works" title="Three forces stacking in your favor.">
      <div className="grid sm:grid-cols-3 gap-3 mt-2">
        <Pillar
          n="01"
          title="No timing risk"
          body="You stop trying to guess tops and bottoms — a coin-flip even for pros. Bad entries get averaged into many entries."
        />
        <Pillar
          n="02"
          title="Cheaper average price"
          body="A fixed dollar amount buys more units when prices dip. Over volatility, your effective cost basis trends below the simple average price."
        />
        <Pillar
          n="03"
          title="Emotion-proof"
          body="Automation runs through the panic, FOMO, and noise. You skip the part where humans usually lose money."
        />
      </div>
    </Section>

    {/* COMPARISON */}
    <Section label="In practice" title="DCA vs. trying to be a hero.">
      <Comparison
        label="DCA — automated, scheduled"
        rows={[
          { a: "Requires a great call on entry timing.", b: "No timing decision required. Just press start." },
          { a: "Big regret if you get the entry wrong.", b: "Spread across many entries — no single bad day matters." },
          { a: "Emotional swings tempt panic-sells.", b: "Schedule executes regardless of mood or headlines." },
          { a: "Easy to forget or skip when life happens.", b: "Permissionless keepers run the swap for you." },
        ]}
      />
    </Section>

    {/* HOW IT MAPS TO CLAWD DCA */}
    <Section label="How CLAWD DCA does it" title="Your strategy, executed by the network.">
      <ol className="flex flex-col gap-3 text-[15px] leading-relaxed text-[color:var(--text-1)] list-decimal list-inside">
        <li>
          <strong className="text-[color:var(--text-0)]">You deposit USDC.</strong> Pick a total budget and how much to
          spend per swap.
        </li>
        <li>
          <strong className="text-[color:var(--text-0)]">You pick a cadence.</strong> Every 3 hours, daily, weekly, or a
          custom interval. That&apos;s the whole &ldquo;strategy.&rdquo;
        </li>
        <li>
          <strong className="text-[color:var(--text-0)]">Keepers do the work.</strong> Anyone watching the contract can
          trigger your swap when it&apos;s ripe — they earn 10 bps per execution.
        </li>
        <li>
          <strong className="text-[color:var(--text-0)]">Your token accrues to the position.</strong> Pull it out
          anytime with one click. Close the position to recover any unspent USDC.
        </li>
      </ol>
      <p className="text-sm text-[color:var(--text-2)] pt-2">
        Total fee is <span className="text-[color:var(--text-0)] font-medium">30 bps per swap</span> (0.30%). 10 bps to
        keepers, 10 bps to the protocol, and 10 bps always buys CLAWD and burns it to{" "}
        <code className="text-xs px-1.5 py-0.5 rounded bg-[color:var(--surface-2)] border border-[color:var(--line-soft)]">
          0xdead
        </code>{" "}
        forever — every DCA contributes to CLAWD deflation, no matter which token you&apos;re stacking.
      </p>
    </Section>

    {/* WHO IT'S FOR */}
    <Section label="Who it suits" title="Best fits.">
      <ul className="grid sm:grid-cols-2 gap-3">
        {[
          "You like a Base token long-term and want to keep adding without thinking about it.",
          "You hate timing decisions and would rather set rules and walk away.",
          "You have a recurring budget — say $25/week — and want it auto-deployed.",
          "You'd rather not stare at charts. Or stare at them less.",
        ].map((line, i) => (
          <li key={i} className="surface p-4 text-sm text-[color:var(--text-1)] leading-relaxed flex gap-3">
            <span className="text-[color:var(--clawd)] font-semibold">→</span>
            {line}
          </li>
        ))}
      </ul>
    </Section>

    {/* FAQ */}
    <Section label="Common questions" title="Honest answers.">
      <div className="flex flex-col gap-2 mt-2">
        <FAQ
          q="Does DCA guarantee a profit?"
          a={
            <>
              No. Nothing does. DCA reduces the impact of bad timing and emotional decisions, but if the asset trends
              down over your entire DCA window, your average cost is still above the final price. DCA is about{" "}
              <em>process</em>, not magic.
            </>
          }
        />
        <FAQ
          q="Is DCA actually better than lump-sum investing?"
          a={
            <>
              Historically, when markets trend up, a single lump-sum at the start usually beats DCA on raw returns —
              because your money is in the market longer. DCA wins on <em>volatility-adjusted</em> returns and on
              stress, which is why most people stick with it.
            </>
          }
        />
        <FAQ
          q="Can I stop or change my plan anytime?"
          a={
            <>
              Yes. Top up to add more USDC, adjust slippage, or close the position entirely — your remaining USDC + any
              accrued CLAWD come straight back to your wallet.
            </>
          }
        />
        <FAQ
          q="What happens if I forget about my position?"
          a={
            <>
              Nothing bad. The contract runs without you. When the USDC is fully spent the position simply goes
              inactive, with your accumulated CLAWD sitting there waiting for you to withdraw it.
            </>
          }
        />
        <FAQ
          q="Who can run my swaps?"
          a={
            <>
              Anyone. The execution function is permissionless — you, a bot, a stranger, or all of the above. They earn
              a 10 bps reward, which is what keeps the network running even when the team isn&apos;t watching.
            </>
          }
        />
      </div>
    </Section>

    {/* CTA */}
    <div className="surface-elev p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-xl font-semibold tracking-tight">Ready to set it and forget it?</h3>
        <p className="text-sm text-[color:var(--text-2)] m-0">
          Pick a cadence, deposit USDC, let the network do the rest.
        </p>
      </div>
      <Link href="/create" className="btn btn-primary btn-lg whitespace-nowrap">
        Create your first position →
      </Link>
    </div>

    {/* footnote */}
    <p className="text-[11px] text-[color:var(--text-3)] text-center max-w-xl mx-auto">
      Not financial advice. Crypto is volatile and you can lose money. This page is educational. Do your own research.
    </p>
  </div>
);

export default WhyDcaPage;
