import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check,
  Copy,
  Upload,
  Filter,
  Layers,
  AlertOctagon,
  Calculator,
  FileCode2,
  ActivitySquare,
  CheckCircle2,
  ArrowRight,
  RotateCcw,
} from 'lucide-react';
import { PostHogDesktopShell, PostHogBrandMark, loginFor } from '../components/PostHogDesktopShell';
import { calculateRice } from '../lib/calculators';
import { getActiveProjectId } from '../lib/projects';

const STAGES = [
  { slug: 'upload', num: '01', icon: Upload, title: 'Upload data', desc: 'Zendesk, Discord, Linear, Jira and CSV batches in one stream.' },
  { slug: 'noise', num: '02', icon: Filter, title: 'Noise and enrichment', desc: 'Quarantine spam and out-of-office, tag account tier and ARR.' },
  { slug: 'intent', num: '03', icon: Layers, title: 'Intent and clusters', desc: 'Bug, UI friction, feature request, performance, grouped by theme.' },
  { slug: 'triage', num: '04', icon: AlertOctagon, title: 'Root cause and Gate 1', desc: 'Problem statement, P0 to P2 severity, and your approval.' },
  { slug: 'prioritization', num: '05', icon: Calculator, title: 'Prioritization', desc: 'RICE, MoSCoW, ICE, Kano and WSJF on approved items only.' },
  { slug: 'prd', num: '06', icon: FileCode2, title: 'PRD studio', desc: 'Draft, edit and refine specs with Gherkin acceptance criteria.' },
  { slug: 'validation', num: '07', icon: ActivitySquare, title: 'Release validation', desc: 'Compare complaint volume before and after the release.' },
  { slug: 'closure', num: '08', icon: CheckCircle2, title: 'Loop closure', desc: 'Tell the customers who asked, citing the tickets you fixed.' },
];

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const pid = getActiveProjectId();
  const [copiedCli, setCopiedCli] = useState(false);

  const [demoReach, setDemoReach] = useState(12);
  const [demoImpact, setDemoImpact] = useState(2.9);
  const [demoConfidence, setDemoConfidence] = useState(0.95);
  const [demoEffort, setDemoEffort] = useState(2.0);
  const liveRice = calculateRice(demoReach, demoImpact, demoConfidence, demoEffort);

  const cliCommand = 'npx @collabsense/triage ingest --source=zendesk,discord,linear --schema=strict';

  const handleCopyCli = async () => {
    try {
      await navigator.clipboard.writeText(cliCommand);
      setCopiedCli(true);
      setTimeout(() => setCopiedCli(false), 2000);
    } catch {
      setCopiedCli(false);
    }
  };

  /** Any route into the product: sign in first, then land on the requested view. */
  const openAppModule = (slug?: string) => {
    navigate(loginFor(slug ? `/app/${pid}/${slug}` : '/projects'));
  };

  const handleQuickJump = (sectionId: string) => {
    if (sectionId === 'top') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const resetBaseline = () => {
    setDemoReach(12);
    setDemoImpact(2.9);
    setDemoConfidence(0.95);
    setDemoEffort(2.0);
  };

  const sliders = [
    { label: 'Reach', unit: 'tickets', value: demoReach, display: String(demoReach), min: 1, max: 30, step: 1, set: setDemoReach },
    { label: 'Impact', unit: '0.5 to 3', value: demoImpact, display: demoImpact.toFixed(1), min: 0.5, max: 3, step: 0.1, set: setDemoImpact },
    { label: 'Confidence', unit: 'percent', value: demoConfidence, display: `${Math.round(demoConfidence * 100)}%`, min: 0.1, max: 1, step: 0.05, set: setDemoConfidence },
    { label: 'Effort', unit: 'months', value: demoEffort, display: demoEffort.toFixed(1), min: 0.5, max: 5, step: 0.5, set: setDemoEffort },
  ];

  return (
    <PostHogDesktopShell onQuickJumpSection={handleQuickJump}>
      <div className="text-ink">
        {/* HERO */}
        <section id="top" className="landing-hero">
          <div className="flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => handleQuickJump('top')}
              className="rounded-input"
              aria-label="CollabSense, back to top"
            >
              <PostHogBrandMark size="lg" textLabel="CollabSense" />
            </button>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="cs-btn-secondary"
                data-testid="hero-signin-btn"
              >
                Log in
              </button>
              <button
                type="button"
                onClick={() => navigate('/signup')}
                className="cs-btn-primary"
                data-testid="hero-signup-btn"
              >
                Sign up
              </button>
            </div>
          </div>

          <div className="mt-12 grid grid-cols-1 items-center gap-10 lg:mt-16 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <h1 className="hero-title font-bold text-ink">Turn customer noise into shipped specs.</h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-2">
                Triage feedback, verify every citation, and score priorities without math drift.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  data-testid="hero-launch-btn"
                  onClick={() => navigate('/signup')}
                  className="cs-btn-primary cs-btn-lg"
                >
                  Get started free
                </button>
                <button
                  type="button"
                  data-testid="hero-demo-os-btn"
                  onClick={() => handleQuickJump('product-os')}
                  className="cs-btn-secondary cs-btn-lg"
                >
                  See the workflow
                </button>
              </div>
            </div>

            {/* Signature: a triage dossier stamped at Gate 1 */}
            <div className="lg:col-span-5">
              <figure className="stock-card p-6">
                <div className="flex items-start justify-between gap-3 border-b border-rule pb-4">
                  <div className="min-w-0">
                    <div className="text-xs text-muted">Sample dossier, cluster CLU-01</div>
                    <div className="mt-0.5 text-base font-bold text-ink">Enterprise SAML and Okta SCIM</div>
                  </div>
                  <span className="stamp-settled shrink-0 text-xs">Gate 1 approved</span>
                </div>
                <ul className="mt-4 space-y-3 text-sm text-ink-2">
                  <li className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2">
                      <Check className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                      Cited tickets
                    </span>
                    <span className="fig font-mono text-ink">TCK-101, TCK-107</span>
                  </li>
                  <li className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2">
                      <Check className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                      Severity
                    </span>
                    <span className="cs-badge-p0">P0</span>
                  </li>
                  <li className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2">
                      <Check className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                      RICE score
                    </span>
                    <span className="fig font-mono font-semibold text-paid">{liveRice.toFixed(2)}</span>
                  </li>
                </ul>
                <figcaption className="mt-4 border-t border-rule pt-3 text-xs text-muted">
                  The score updates as you move the sliders below.
                </figcaption>
              </figure>
            </div>
          </div>
        </section>

        {/* WORKFLOW */}
        <section id="product-os" className="landing-section reveal">
          <div className="section-head">
            <div>
              <h2 className="section-title font-bold text-ink">Eight stages, one decision trail</h2>
              <p className="mt-2 text-base text-ink-2">Each stage hands verified evidence to the next.</p>
            </div>
            <button type="button" onClick={() => openAppModule()} className="cs-btn-primary">
              <span>Open your workspace</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {STAGES.map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.slug}
                  type="button"
                  onClick={() => openAppModule(s.slug)}
                  className="stage-card stock-card group flex flex-col p-5 text-left"
                >
                  <div className="flex items-center justify-between">
                    <span className="fig font-mono text-xs font-semibold text-muted">{s.num}</span>
                    <Icon className="h-5 w-5 text-paid" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 text-base font-bold text-ink">{s.title}</h3>
                  <p className="mt-1.5 flex-1 text-sm leading-relaxed text-ink-2">{s.desc}</p>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink group-hover:text-paid">
                    Open
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* SCORING */}
        <section id="step-data-in" className="landing-section reveal">
          <div className="section-head">
            <div>
              <h2 className="section-title font-bold text-ink">Models suggest. Code does the math.</h2>
              <p className="mt-2 text-base text-ink-2">Drag a parameter: the RICE score recalculates in plain code.</p>
            </div>
            <button type="button" onClick={resetBaseline} className="cs-btn-secondary">
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              <span>Reset</span>
            </button>
          </div>

          <div className="mt-8 stock-card p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-rule pb-5">
              <div className="text-sm text-ink-2">
                <span className="font-semibold text-ink">RICE</span> = (Reach × Impact × Confidence) / Effort
              </div>
              <output className="fig rounded-input bg-board px-4 py-2 font-mono text-sm font-semibold text-board-type">
                ({demoReach} × {demoImpact.toFixed(1)} × {demoConfidence.toFixed(2)}) / {demoEffort.toFixed(1)} ={' '}
                {liveRice.toFixed(2)}
              </output>
            </div>
            <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {sliders.map((sl) => (
                <label key={sl.label} className="block">
                  <span className="flex items-baseline justify-between text-sm">
                    <span className="font-semibold text-ink">
                      {sl.label} <span className="font-normal text-muted">({sl.unit})</span>
                    </span>
                    <span className="fig font-mono font-semibold text-ink">{sl.display}</span>
                  </span>
                  <input
                    type="range"
                    min={sl.min}
                    max={sl.max}
                    step={sl.step}
                    value={sl.value}
                    aria-label={`${sl.label} slider`}
                    onChange={(e) => sl.set(Number(e.target.value))}
                    className="ph-slider mt-3 w-full"
                  />
                </label>
              ))}
            </div>
          </div>
        </section>

        {/* INGEST + SPEC */}
        <section id="step-mcp" className="landing-section reveal">
          <div className="section-head">
            <div>
              <h2 className="section-title font-bold text-ink">From raw tickets to a cited spec</h2>
              <p className="mt-2 text-base text-ink-2">Pipe feedback in, get acceptance criteria out.</p>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="doc-card flex flex-col p-6">
              <h3 className="text-base font-bold text-ink">Ingest from the terminal or a CSV</h3>
              <div className="cs-code-block mt-4 flex items-start justify-between gap-3">
                <code className="min-w-0 break-all">$ {cliCommand}</code>
                <button
                  type="button"
                  onClick={handleCopyCli}
                  className="copy-btn inline-flex shrink-0 items-center gap-1.5 rounded-input bg-cotton px-2.5 py-1 text-xs font-semibold text-ink"
                  aria-label="Copy command"
                >
                  {copiedCli ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedCli ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-ink-2">
                Formula characters are stripped on import, and every finding must cite a source ticket such as{' '}
                <code className="cs-inline-code">TCK-101</code>.
              </p>
            </div>

            <div className="doc-card flex flex-col p-6">
              <h3 className="text-base font-bold text-ink">Specs with acceptance criteria</h3>
              <pre className="cs-code-block mt-4 overflow-x-auto whitespace-pre">
{`Feature: Enterprise SAML SSO and Okta SCIM sync
  Given an Enterprise tenant starts an Okta SAML handshake
  When the assertion and SCIM group claims validate
  Then RBAC roles sync and the login event is recorded`}
              </pre>
              <p className="mt-4 text-sm leading-relaxed text-ink-2">
                You edit the draft; nothing ships without your approval.
              </p>
            </div>
          </div>
        </section>

        {/* EARLY ACCESS */}
        <section id="pricing-calculator" className="landing-section reveal">
          <div className="stock-card flex flex-col items-start justify-between gap-6 p-8 sm:p-10 lg:flex-row lg:items-center">
            <div>
              <h2 className="section-title font-bold text-ink">Free during early access</h2>
              <p className="mt-2 max-w-xl text-base text-ink-2">
                Create an account, start a project, and run all eight stages on your own feedback.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => navigate('/signup')} className="cs-btn-primary cs-btn-lg">
                Create account
              </button>
              <button type="button" onClick={() => navigate('/login')} className="cs-btn-secondary cs-btn-lg">
                Sign in
              </button>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="mt-20 border-t border-rule pt-10 text-sm text-ink-2">
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            <div className="col-span-2 sm:col-span-1">
              <PostHogBrandMark size="sm" textLabel="CollabSense" />
              <p className="mt-3 max-w-[28ch] text-sm text-muted">Product discovery, triage and specs for product teams.</p>
            </div>
            <div>
              <div className="font-bold text-ink">Product</div>
              <ul className="mt-3 space-y-2">
                <li><button type="button" onClick={() => handleQuickJump('product-os')} className="footer-link">Workflow</button></li>
                <li><button type="button" onClick={() => handleQuickJump('step-data-in')} className="footer-link">Scoring</button></li>
                <li><button type="button" onClick={() => handleQuickJump('step-mcp')} className="footer-link">Ingest and specs</button></li>
              </ul>
            </div>
            <div>
              <div className="font-bold text-ink">Workspace</div>
              <ul className="mt-3 space-y-2">
                <li><button type="button" onClick={() => openAppModule()} className="footer-link">Projects</button></li>
                <li><button type="button" onClick={() => openAppModule('prioritization')} className="footer-link">Prioritization</button></li>
                <li><button type="button" onClick={() => openAppModule('prd')} className="footer-link">PRD studio</button></li>
              </ul>
            </div>
            <div>
              <div className="font-bold text-ink">Account</div>
              <ul className="mt-3 space-y-2">
                <li><button type="button" onClick={() => navigate('/login')} className="footer-link">Sign in</button></li>
                <li><button type="button" onClick={() => navigate('/signup')} className="footer-link">Create account</button></li>
              </ul>
            </div>
          </div>
          <div className="mt-10 border-t border-rule-2 pt-6 text-xs text-muted">CollabSense</div>
        </footer>
      </div>
    </PostHogDesktopShell>
  );
};
