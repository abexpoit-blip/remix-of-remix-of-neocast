import { BrandLockup } from "@/components/BrandLogo";
import { cardNetworks } from "@/components/CardNetworks";
import { ReactNode } from "react";
import { BadgeCheck, Zap, Lock, CreditCard } from "lucide-react";

type Props = {
  children: ReactNode;
  title?: string;
  tagline?: ReactNode;
  accent?: "blue" | "red" | "gold";
};

const accentBar: Record<NonNullable<Props["accent"]>, string> = {
  blue: "from-transparent via-[var(--nc-accent-soft)] to-transparent",
  red: "from-transparent via-[var(--nc-accent-hi)] to-transparent",
  gold: "from-transparent via-[var(--nc-accent-hi)] to-transparent",
};

const perks = [
  { icon: Zap, title: "Instant delivery", copy: "Codes land in your account seconds after checkout." },
  { icon: BadgeCheck, title: "Verified stock", copy: "Every card is source-checked before it goes on sale." },
  { icon: Lock, title: "Protected payments", copy: "Encrypted crypto & card checkout with buyer cover." },
];

/** Accepted payment networks. */
function NetworkTile({ name, Mark }: { name: string; Mark: (p: { className?: string }) => ReactNode }) {
  return (
    <div
      title={name}
      className="flex items-center justify-center rounded-xl border border-white/12 bg-white/[0.05] px-3 py-3 backdrop-blur-md transition-transform duration-300 hover:-translate-y-1"
    >
      <Mark className="h-8 w-[52px]" />
    </div>
  );
}


/** Premium card mock used in the brand panel. */
function CardMock({
  label,
  value,
  className = "",
  gradient,
}: {
  label: string;
  value: string;
  className?: string;
  gradient: string;
}) {
  return (
    <div
      className={`absolute w-[230px] rounded-2xl border border-white/15 p-4 backdrop-blur-md shadow-[0_28px_70px_-24px_rgba(8,4,6,0.95)] ${className}`}
      style={{ background: gradient }}
    >
      <div className="flex items-start justify-between">
        <CreditCard className="h-5 w-5 text-white/85" />
        <span className="text-[9px] uppercase tracking-[0.28em] text-white/70">Premium card</span>
      </div>
      <div className="mt-7 text-[11px] uppercase tracking-[0.22em] text-white/70">{label}</div>
      <div
        className="mt-1 text-2xl font-extrabold text-white"
        style={{ fontFamily: '"Space Grotesk", "DM Sans", sans-serif' }}
      >
        {value}
      </div>
      <div className="mt-4 flex gap-1.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <span key={i} className="h-1 w-6 rounded-full bg-white/35" />
        ))}
      </div>
    </div>
  );
}


/**
 * NeoCast auth shell — premium card marketplace split layout.
 * Left: brand story, trust perks and floating card mocks. Right: the form.
 */
export function ScorpionAuthShell({
  children,
  title = "NeoCast",
  tagline,
  accent = "blue",
}: Props) {
  return (
    <main
      className="min-h-screen w-full relative flex items-center justify-center px-4 py-10 sm:py-14 overflow-hidden"
      style={{
        fontFamily: '"DM Sans", "Segoe UI", system-ui, sans-serif',
        background: "linear-gradient(160deg, #0a0a0a 0%, var(--nc-ink) 48%, #0a0a0a 100%)",
      }}
    >
      {/* Grid */}
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(var(--nc-accent-rgb),0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(var(--nc-accent-rgb),0.10) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(ellipse at 50% 35%, black 10%, transparent 78%)",
          WebkitMaskImage: "radial-gradient(ellipse at 50% 35%, black 10%, transparent 78%)",
        }}
      />
      {/* Aurora glows */}
      <div
        className="absolute -top-40 -left-32 h-[460px] w-[460px] rounded-full blur-[130px] opacity-60"
        style={{ background: "radial-gradient(circle, var(--nc-accent) 0%, transparent 70%)" }}
      />
      <div
        className="absolute -bottom-48 -right-24 h-[500px] w-[500px] rounded-full blur-[140px] opacity-50"
        style={{ background: "radial-gradient(circle, var(--nc-accent-hi) 0%, transparent 70%)" }}
      />
      <div
        className="absolute top-1/3 left-1/2 h-[360px] w-[360px] -translate-x-1/2 rounded-full blur-[150px] opacity-30"
        style={{ background: "radial-gradient(circle, var(--nc-accent) 0%, transparent 70%)" }}
      />
      <div
        className="absolute -top-24 right-1/4 h-[300px] w-[300px] rounded-full blur-[130px] opacity-25"
        style={{ background: "radial-gradient(circle, #22c55e 0%, transparent 70%)" }}
      />


      <div className="relative z-10 w-full max-w-[1060px] grid lg:grid-cols-[1.05fr_minmax(0,430px)] gap-10 lg:gap-14 items-center">
        {/* Brand panel */}
        <section className="hidden lg:block text-white">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.05] px-3 py-1.5 backdrop-blur-md">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--nc-accent-soft)] shadow-[0_0_10px_var(--nc-accent-soft)]" />
            <span className="text-[10px] uppercase tracking-[0.3em] text-white/70">
              Premium card marketplace
            </span>
          </div>

          <h2
            className="mt-6 text-[46px] leading-[1.05] font-extrabold tracking-[-0.03em]"
            style={{ fontFamily: '"Space Grotesk", "DM Sans", sans-serif' }}
          >
            Buy cards
            <br />
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(100deg, var(--nc-accent-hi) 0%, var(--nc-accent-soft) 60%, var(--nc-accent-pale) 100%)" }}
            >
              that just work.
            </span>
          </h2>
          <p className="mt-4 max-w-[420px] text-[14px] leading-relaxed text-white/60">
            Visa, Mastercard, Amex, Discover and 200+ brands — verified stock, instant
            delivery and 24/7 support from a marketplace traders actually trust.
          </p>

          <div className="mt-8 space-y-3.5 max-w-[420px]">
            {perks.map(({ icon: Icon, title: t, copy }) => (
              <div key={t} className="flex items-start gap-3.5">
                <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/12 bg-white/[0.05] backdrop-blur-md">
                  <Icon className="h-4 w-4 text-[var(--nc-accent-pale)]" />
                </div>
                <div className="min-w-0">
                  <div className="text-[13.5px] font-semibold text-white">{t}</div>
                  <div className="text-[12.5px] text-white/55 leading-snug">{copy}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Floating card mocks */}
          <div className="relative mt-10 h-[190px] max-w-[440px]">
            <CardMock
              label="Balance"
              value="$100.00"
              className="left-0 top-0 -rotate-6"
              gradient="linear-gradient(140deg, rgba(var(--nc-accent-rgb),0.85) 0%, rgba(var(--nc-accent-rgb),0.7) 100%)"
            />
            <CardMock
              label="Balance"
              value="$50.00"
              className="left-[150px] top-[46px] rotate-3"
              gradient="linear-gradient(140deg, rgba(var(--nc-accent-rgb),0.8) 0%, rgba(18,9,12,0.85) 100%)"
            />
            <CardMock
              label="Balance"
              value="$25.00"
              className="left-[300px] top-[14px] rotate-[9deg]"
              gradient="linear-gradient(140deg, rgba(var(--nc-accent-rgb),0.7) 0%, rgba(30,14,18,0.9) 100%)"
            />
          </div>

          {/* Accepted networks */}
          <div className="mt-8 max-w-[440px]">
            <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">
              We accept
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2.5">
              {cardNetworks.map((n) => (
                <NetworkTile key={n.name} name={n.name} Mark={n.Mark} />
              ))}
            </div>
          </div>



          <div className="mt-8 flex items-center gap-7 text-white/55">
            {[
              ["200+", "Brands"],
              ["1.2M+", "Codes sold"],
              ["4.9/5", "Buyer rating"],
            ].map(([n, l]) => (
              <div key={l}>
                <div
                  className="text-[19px] font-extrabold text-white"
                  style={{ fontFamily: '"Space Grotesk", "DM Sans", sans-serif' }}
                >
                  {n}
                </div>
                <div className="text-[10.5px] uppercase tracking-[0.2em]">{l}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Form card */}
        <div className="w-full max-w-[430px] mx-auto lg:mx-0">
          {/* Mobile brand strip */}
          <div className="lg:hidden mb-5 grid grid-cols-4 gap-2">
            {cardNetworks.map((n) => (
              <n.Mark key={n.name} className="h-8 w-full" />
            ))}
          </div>

          <div className="relative rounded-[22px] overflow-hidden">
            <div
              className="absolute -inset-[1px] rounded-[22px] opacity-80"
              style={{
                background:
                  "linear-gradient(140deg, rgba(var(--nc-accent-rgb),0.55), rgba(var(--nc-accent-rgb),0.35) 45%, rgba(255,255,255,0.05) 100%)",
              }}
            />
            <div
              className="relative rounded-[22px] border border-white/10 shadow-[0_30px_90px_-25px_rgba(8,4,6,0.95)]"
              style={{
                background:
                  "linear-gradient(165deg, rgba(22,10,14,0.86) 0%, rgba(10,6,8,0.92) 100%)",
                backdropFilter: "blur(24px) saturate(140%)",
              }}
            >
              <div className={`h-[2px] w-full bg-gradient-to-r ${accentBar[accent]}`} />
              <div className="px-7 py-8 sm:px-10 sm:py-10 text-white">
                <div className="text-center mb-7">
                  <div className="flex justify-center mb-4">
                    <div className="relative">
                      <div
                        className="absolute -inset-6 blur-2xl opacity-70"
                        style={{
                          background:
                            "radial-gradient(circle, rgba(var(--nc-accent-rgb),0.5) 0%, rgba(var(--nc-accent-rgb),0) 70%)",
                        }}
                      />
                      <BrandLockup className="relative" />
                    </div>
                  </div>

                  <p className="mt-2 text-[10px] uppercase tracking-[0.35em] text-[var(--nc-accent-pale)]/70">
                    Secure Access
                  </p>
                  {tagline && (
                    <p className="mt-4 text-[13px] text-white/65 leading-relaxed">{tagline}</p>
                  )}
                </div>
                {children}
              </div>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-center gap-4 text-[10px] uppercase tracking-[0.2em] text-white/40">
            <span className="inline-flex items-center gap-1.5">
              <Lock className="h-3 w-3" /> SSL secured
            </span>
            <span className="h-3 w-px bg-white/15" />
            <span className="inline-flex items-center gap-1.5">
              <BadgeCheck className="h-3 w-3" /> Verified seller
            </span>
          </div>

          <p className="text-center text-[11px] text-white/35 mt-4 tracking-[0.18em] uppercase">
            © {new Date().getFullYear()} NeoCast · All rights reserved
          </p>
        </div>
      </div>
    </main>
  );
}

export default ScorpionAuthShell;
