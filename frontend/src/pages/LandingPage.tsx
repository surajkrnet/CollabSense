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
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  Sparkles,
  X,
  ShieldCheck,
  Terminal,
  Zap,
} from 'lucide-react';
import { PostHogDesktopShell, PostHogBrandMark, loginFor } from '../components/PostHogDesktopShell';
import { calculateRice } from '../lib/calculators';
import { getActiveProjectId } from '../lib/projects';

interface StageShowcaseItem {
  slug: string;
  num: string;
  phase: 'ingest' | 'roadmap';
  category: string;
  icon: React.ElementType;
  title: string;
  desc: string;
  metricBadge: string;
  accentBg: string;
}

const STAGES: StageShowcaseItem[] = [
  {
    slug: 'upload',
    num: '01',
    phase: 'ingest',
    category: 'RFC-4180 MULTI-LINE INGESTION',
    icon: Upload,
    title: 'UPLOAD & NORMALIZE DATA',
    desc: 'Ingest up to 2,000 rows from Zendesk, Discord, Linear, AppStore, or multi-line quoted CSVs with automatic formula-injection sanitization.',
    metricBadge: '2,000 Rows · 100% Capture',
    accentBg: '#F9E2E1',
  },
  {
    slug: 'noise',
    num: '02',
    phase: 'ingest',
    category: 'PARALLEL SEMAPHORE(5) FILTER',
    icon: Filter,
    title: 'NOISE QUARANTINE & TIER TAGS',
    desc: 'Process 100% of rows in parallel 25-ticket chunks to quarantine OOO replies, password resets, routine invoices, and spam with 1-click PM override.',
    metricBadge: '3.7s Batch · 1-Click Override',
    accentBg: '#F3E5DE',
  },
  {
    slug: 'intent',
    num: '03',
    phase: 'ingest',
    category: '2-PASS MAP-REDUCE CLUSTERING',
    icon: Layers,
    title: 'OPEN TAXONOMY & CLUSTERS',
    desc: 'Group signals across 17+ unrestricted product domains into a vertical P0→P4 severity hierarchy stack with Top 3 + N expandable citations.',
    metricBadge: 'P0→P4 Stack · Top 3+N Citations',
    accentBg: '#FDE8DF',
  },
  {
    slug: 'triage',
    num: '04',
    phase: 'ingest',
    category: 'ENGINEERING BOTTLENECK DIAGNOSIS',
    icon: AlertOctagon,
    title: 'ROOT CAUSE & ROADMAP TRIAGE',
    desc: 'Distinguish surface symptoms from systemic root causes, assign persona & churn risk, and mark clusters Ready for Roadmap, Needs Review, or Deferred.',
    metricBadge: 'Verified Citations · Zero Jargon',
    accentBg: '#F7E3DC',
  },
  {
    slug: 'prioritization',
    num: '05',
    phase: 'roadmap',
    category: 'DETERMINISTIC PYTHON & TS MATH',
    icon: Calculator,
    title: 'TOP-TO-BOTTOM PRIORITY STACK',
    desc: 'Rank initiatives #1 downward across RICE, WSJF, ICE, MoSCoW, and Kano with collapsible 60fps weight sliders and 0.00% LLM math drift.',
    metricBadge: '0.00% LLM Math Drift',
    accentBg: '#F9E2E1',
  },
  {
    slug: 'prd',
    num: '06',
    phase: 'roadmap',
    category: 'INTERACTIVE AI SPEC CO-PILOT',
    icon: FileCode2,
    title: 'PRD STUDIO & LIVE DIFF VIEWER',
    desc: 'Chat with the Stage 6 PRD Assistant on the left and watch Gherkin Given/When/Then criteria, edge cases, and telemetry update live on the right.',
    metricBadge: 'Live Section Diffs + Linear Export',
    accentBg: '#FDE8DF',
  },
  {
    slug: 'validation',
    num: '07',
    phase: 'roadmap',
    category: 'POST-LAUNCH TELEMETRY BOARD',
    icon: ActivitySquare,
    title: 'RELEASE VALIDATION ANALYTICS',
    desc: 'Track pre- vs. post-release daily ticket delta bars, channel & customer tier mix, staged feature-flag rollout %, and automated spike alerts.',
    metricBadge: 'Canary Flags · Spike Detection',
    accentBg: '#F3E5DE',
  },
  {
    slug: 'closure',
    num: '08',
    phase: 'roadmap',
    category: 'MULTI-CHANNEL RELEASE COMMS',
    icon: CheckCircle2,
    title: 'CLOSING THE CUSTOMER LOOP',
    desc: 'Draft citation-backed customer resolution notifications across Zendesk, Discord, Email, and Linear alongside internal Support & Sales playbooks.',
    metricBadge: 'Customer Comms + Support Playbook',
    accentBg: '#F7E3DC',
  },
];

const SERVICE_RIBBON_ITEMS = [
  {
    leftWord: 'MULTI-MODEL',
    rightWord: 'AI ROUTING',
    badge: '7.5s',
    pillText:
      'Kimi K3.1 Pro on NVIDIA NIM with a strict 7.5s wall-clock cap and instant failover to Nemotron 3.5 Super VL 120B & OpenRouter :free models.',
    tilt: '-2deg',
  },
  {
    leftWord: 'DETERMINISTIC',
    rightWord: 'SCORE ENGINE',
    badge: '0.00%',
    pillText:
      'LLMs never touch arithmetic. RICE, WSJF, ICE, MoSCoW, and Kano execute exclusively in pure Python and 60fps TypeScript.',
    tilt: '2.5deg',
  },
  {
    leftWord: 'VERIFIED',
    rightWord: 'CITATION GUARD',
    badge: '100%',
    pillText:
      'Every cited ticket ID is cross-checked against your uploaded batch; hallucinated IDs and fake $0 ARR labels are stripped automatically.',
    tilt: '-1.5deg',
  },
  {
    leftWord: 'LIVE GHERKIN',
    rightWord: 'PRD CO-PILOT',
    badge: 'AC-01',
    pillText:
      'Co-author engineering-ready specs with real-time section diff highlighting, multi-step undo stack, and 1-click Linear GraphQL export.',
    tilt: '2deg',
  },
];

const FAQ_ITEMS = [
  {
    q: 'How does CollabSense prevent LLMs from hallucinating ticket citations or math scores?',
    a: 'Every LLM response passes through verify_citations(), which strips any ticket ID not present in your uploaded batch. Even better, LLMs only estimate bounded qualitative parameters (Impact 0.5–3.0, Confidence 10–100%, Effort 1–5m) while scorer_service.py computes RICE, WSJF, ICE, MoSCoW, and Kano in pure Python with 0.00% arithmetic drift.',
  },
  {
    q: 'What happens if I upload a messy 250+ row CSV with multi-line quoted cells?',
    a: 'Stage 1 uses a full RFC-4180 state-machine parser (csvParser.ts) that preserves embedded newlines inside quoted cells, auto-detects comma/tab/semicolon delimiters, converts MRR to ARR, strips spreadsheet formula-injection prefixes (=, +, -, @), and processes 100% of rows in parallel Stage 2 batches.',
  },
  {
    q: 'What if the primary reasoning model (Kimi K3.1 Pro) is slow or rate-limited?',
    a: 'Our 3-tier router enforces a strict 7.5-second asyncio.wait_for wall-clock cap on Kimi K3.1 Pro and maintains per-model HTTP 429 cooldown timers. If Kimi queues past 7.5s, the request fails over automatically to sub-second NVIDIA NIM Nemotron 3.5 Super VL 120B or OpenRouter :free models.',
  },
  {
    q: 'How does the Stage 6 AI PRD Assistant & Live PRD Viewer work?',
    a: 'In Stage 6, you chat with the PRD Assistant on the left (or click 1-click actions like "Add Gherkin edge cases" or "Add security & privacy") and the Live PRD Viewer on the right immediately highlights the exact modified sections with an undo stack and split Markdown editor.',
  },
  {
    q: 'Are project workspaces isolated across different product lines or teams?',
    a: 'Yes. Every project workspace maintains isolated ticket batches, Stage 2 noise filters, Stage 3/4 clusters, prioritization overrides, Stage 6 PRDs, Stage 7 release monitors, and Stage 8 customer drafts backed by Supabase Auth (Google OAuth + Email/Password) and Row-Level Security.',
  },
];

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const pid = getActiveProjectId();
  const [copiedCli, setCopiedCli] = useState(false);
  const [stageFilter, setStageFilter] = useState<'all' | 'ingest' | 'roadmap'>('all');
  const [manifestoFocus, setManifestoFocus] = useState<'all' | 'math' | 'citations' | 'latency'>('all');
  const [activeDeckIdx, setActiveDeckIdx] = useState<number>(0);
  const [openFaqIdx, setOpenFaqIdx] = useState<number>(0);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);

  // Interactive Deterministic RICE Lab state
  const [demoReach, setDemoReach] = useState(12);
  const [demoImpact, setDemoImpact] = useState(2.9);
  const [demoConfidence, setDemoConfidence] = useState(0.95);
  const [demoEffort, setDemoEffort] = useState(2.0);
  const liveRice = calculateRice(demoReach, demoImpact, demoConfidence, demoEffort);
  const liveMoscow =
    liveRice >= 10 && demoImpact >= 2.0 ? 'MUST' : liveRice >= 5 ? 'SHOULD' : liveRice >= 2 ? 'COULD' : 'WONT';

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

  const openAppModule = (slug?: string) => {
    setDrawerOpen(false);
    navigate(loginFor(slug ? `/app/${pid}/${slug}` : '/projects'));
  };

  const handleQuickJump = (sectionId: string) => {
    setDrawerOpen(false);
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

  const applyPreset = (reach: number, impact: number, conf: number, effort: number) => {
    setDemoReach(reach);
    setDemoImpact(impact);
    setDemoConfidence(conf);
    setDemoEffort(effort);
  };

  const sliders = [
    { label: 'Reach', unit: 'verified tickets', value: demoReach, display: String(demoReach), min: 1, max: 50, step: 1, set: setDemoReach },
    { label: 'Impact', unit: '0.5 to 3.0x', value: demoImpact, display: demoImpact.toFixed(1), min: 0.5, max: 3, step: 0.1, set: setDemoImpact },
    { label: 'Confidence', unit: 'evidence %', value: demoConfidence, display: `${Math.round(demoConfidence * 100)}%`, min: 0.1, max: 1, step: 0.05, set: setDemoConfidence },
    { label: 'Effort', unit: 'person-months', value: demoEffort, display: `${demoEffort.toFixed(1)}m`, min: 0.5, max: 5, step: 0.5, set: setDemoEffort },
  ];

  const visibleStages = STAGES.filter((s) => stageFilter === 'all' || s.phase === stageFilter);

  return (
    <PostHogDesktopShell onQuickJumpSection={handleQuickJump}>
      {/* FIXED TOP TWO26 STUDIO PILL NAVBAR */}
      <header className="fixed top-4 inset-x-3 sm:inset-x-6 z-40 pointer-events-none">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-3">
          {/* Left Floating White Pills */}
          <nav aria-label="Primary sections" className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto">
            <button type="button" onClick={() => handleQuickJump('product-os')} className="two26-nav-pill">
              Workflow
            </button>
            <button type="button" onClick={() => handleQuickJump('step-data-in')} className="two26-nav-pill">
              Scoring Lab
            </button>
            <button type="button" onClick={() => handleQuickJump('step-mcp')} className="two26-nav-pill hidden md:inline-flex">
              Live Specs
            </button>
            <button type="button" onClick={() => handleQuickJump('faq-section')} className="two26-nav-pill hidden lg:inline-flex">
              FAQ
            </button>
          </nav>

          {/* Center Brand Wordmark */}
          <button
            type="button"
            onClick={() => handleQuickJump('top')}
            aria-label="CollabSense, back to top"
            className="pointer-events-auto bg-[#F9E2E1]/90 backdrop-blur-md px-4 py-1.5 rounded-full border border-[#111111]/10 hover:scale-[1.02] transition-transform"
          >
            <PostHogBrandMark size="md" textLabel="COLLABSENSE" />
          </button>

          {/* Right Status + Auth + Signature Two26 Black Pill CTA */}
          <div className="flex items-center gap-2 sm:gap-3 pointer-events-auto">
            <div className="hidden xl:block text-right leading-tight text-[11px] font-semibold text-[#111111]">
              <div>Deterministic OS</div>
              <div className="text-[#6E6059]">v4.1 · &lt;8s Failover</div>
            </div>

            <button
              type="button"
              onClick={() => navigate('/login')}
              data-testid="hero-signin-btn"
              className="two26-nav-pill"
            >
              Log in
            </button>

            <button
              type="button"
              onClick={() => navigate('/signup')}
              data-testid="hero-signup-btn"
              className="two26-cta-pill"
            >
              <span>Get Started</span>
              <span className="two26-arrow-circle" aria-hidden="true">
                <ArrowUpRight className="w-4 h-4" />
              </span>
            </button>

            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open quick studio launcher"
              className="two26-nav-pill hidden sm:inline-flex border-[#FF5400]"
            >
              <span className="w-2 h-2 rounded-full bg-[#FF5400]" />
              <span>Studio Menu</span>
            </button>
          </div>
        </div>
      </header>

      {/* =====================================================================
          SECTION 1: TWO26 HERO (#F9E2E1 BLUSH CANVAS + GIANT #FF5400 CONDENSED
          DISPLAY + ROTATED BLACK STICKER PILLS + EDITORIAL LINE-ART & DOSSIER)
         ===================================================================== */}
      <section id="top" className="two26-blush-surface relative pt-28 sm:pt-36 pb-0 overflow-hidden">
        {/* Decorative Edge-Bleeding #FF5400 Looping Ribbons (Left & Right) */}
        <svg
          className="pointer-events-none absolute -left-24 top-16 w-72 sm:w-96 h-96 opacity-95"
          viewBox="0 0 320 380"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M-40 30 C 140 30, 210 160, 110 230 C 30 280, -20 180, 90 150 C 200 120, 240 280, 80 360"
            stroke="#FF5400"
            strokeWidth="26"
            strokeLinecap="round"
          />
        </svg>
        <svg
          className="pointer-events-none absolute -right-24 top-10 w-72 sm:w-96 h-96 opacity-95"
          viewBox="0 0 320 380"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M350 20 C 170 50, 110 190, 220 260 C 290 300, 330 190, 210 160 C 120 140, 110 290, 340 340"
            stroke="#FF5400"
            strokeWidth="26"
            strokeLinecap="round"
          />
        </svg>

        <div className="max-w-[1400px] mx-auto px-4 sm:px-8 relative z-10">
          {/* Top Micro-Label */}
          <div className="text-center">
            <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[#111111]">
              <span className="w-2 h-2 rounded-full bg-[#FF5400]" />
              AUTONOMOUS PRODUCT DISCOVERY, TRIAGE &amp; GHERKIN SPEC STUDIO
            </span>
          </div>

          {/* Giant Centered #FF5400 Condensed Display Headline with Rotated Black Sticker Pills */}
          <div className="relative mt-6 mx-auto max-w-5xl text-center">
            <span
              className="two26-sticker-pill hidden sm:inline-flex absolute -top-4 left-[8%] md:left-[14%] z-20 shadow-sm"
              style={{ transform: 'rotate(-6deg)' }}
            >
              0.00% LLM math drift
            </span>

            <span
              className="two26-sticker-pill hidden sm:inline-flex absolute top-[36%] right-[4%] md:right-[10%] z-20 shadow-sm"
              style={{ transform: 'rotate(4deg)' }}
            >
              No hallucinated citations
            </span>

            <h1 className="two26-display text-[#FF5400] text-[3.5rem] sm:text-[5.5rem] md:text-[7.2rem] lg:text-[8.4rem] select-none">
              <span className="block">LOOKING</span>
              <span className="block">SUSPICIOUSLY</span>
              <span className="block">GOOD AT SPECS</span>
            </h1>

            <span
              className="two26-sticker-pill inline-flex mt-3 sm:mt-0 sm:absolute sm:-bottom-3 sm:left-[54%] z-20 shadow-sm"
              style={{ transform: 'rotate(-4deg)' }}
            >
              No funny business · &lt;7.5s failover
            </span>
          </div>

          <p className="mt-8 mx-auto max-w-2xl text-center text-base sm:text-lg font-medium leading-relaxed text-[#241F1C]">
            Turn noisy multi-channel tickets into P0–P4 root-cause hierarchies, deterministic RICE &amp; WSJF
            roadmaps, and live Gherkin PRDs backed by verified customer citations.
          </p>

          {/* Primary Hero Pill CTA Bar */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3.5">
            <button
              type="button"
              data-testid="hero-launch-btn"
              onClick={() => navigate('/signup')}
              className="two26-cta-pill cs-btn-lg"
            >
              <span>Launch Workspace Free</span>
              <span className="two26-arrow-circle" aria-hidden="true">
                <ArrowUpRight className="w-4 h-4" />
              </span>
            </button>

            <button
              type="button"
              data-testid="hero-demo-os-btn"
              onClick={() => handleQuickJump('product-os')}
              className="two26-nav-pill h-[46px] px-6 text-sm font-bold border border-[#111111]/15"
            >
              <span>Explore 8-Stage Workflow</span>
            </button>

            <button
              type="button"
              onClick={() => handleQuickJump('step-data-in')}
              className="two26-nav-pill h-[46px] px-6 text-sm font-bold border border-[#FF5400]/40 text-[#FF5400]"
            >
              <span>Try Live RICE Calculator</span>
            </button>
          </div>

          {/* Two26 Editorial Character + Cat Illustration & Live Interactive Triage Dossier */}
          <div className="mt-12 grid grid-cols-1 lg:grid-cols-12 gap-8 items-end">
            {/* Left/Center: Custom Two26-Style Editorial Vector Illustration (2 Architects + 2 Studio Cats) */}
            <div className="lg:col-span-7 flex justify-center">
              <svg
                viewBox="0 0 760 350"
                className="w-full max-w-[680px] h-auto"
                role="img"
                aria-label="Two26 style editorial illustration of product architects carrying SIGNAL and PRD 26 boards with two studio cats"
              >
                {/* Left Walking Orange Cat */}
                <g transform="translate(24, 215)">
                  <path
                    d="M15 88 L35 62 L95 62 L115 88 L103 92 L88 74 L44 74 L26 92 Z"
                    fill="#FF5400"
                    stroke="#111111"
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M28 62 C 12 45, 16 20, 26 16 C 34 14, 30 42, 42 56"
                    fill="#FF5400"
                    stroke="#111111"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  <path
                    d="M88 62 L96 42 L106 50 L116 40 L122 58 C 126 68, 114 78, 96 74 Z"
                    fill="#FF5400"
                    stroke="#111111"
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                  />
                  {/* Tiger stripes */}
                  <path d="M52 63 L56 73 M66 63 L70 73 M80 63 L84 73" stroke="#111111" strokeWidth="2.2" />
                </g>

                {/* Left Architect carrying "SIGNAL" Board */}
                <g transform="translate(185, 32)">
                  {/* Legs */}
                  <path
                    d="M72 185 L44 275 L72 282 L94 205 L116 282 L144 282 L124 185 Z"
                    fill="#F8EEE8"
                    stroke="#111111"
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                  />
                  {/* Black platform sneakers */}
                  <rect x="34" y="275" width="44" height="18" rx="6" fill="#111111" />
                  <rect x="112" y="278" width="46" height="16" rx="6" fill="#111111" />
                  {/* Head & Sunglasses */}
                  <circle cx="104" cy="42" r="22" fill="#F8EEE8" stroke="#111111" strokeWidth="2.5" />
                  <path
                    d="M84 32 C 84 14, 122 12, 128 28 C 118 28, 96 28, 84 32 Z"
                    fill="#111111"
                  />
                  <rect x="102" y="36" width="22" height="11" rx="2" fill="#111111" />
                  {/* Jacket & Sign Board */}
                  <g transform="rotate(-7 104 135)">
                    <rect
                      x="26"
                      y="92"
                      width="156"
                      height="92"
                      rx="6"
                      fill="#F8EEE8"
                      stroke="#111111"
                      strokeWidth="2.5"
                    />
                    <text
                      x="104"
                      y="156"
                      textAnchor="middle"
                      fontFamily="'Barlow Condensed', sans-serif"
                      fontWeight="900"
                      fontSize="54"
                      fill="#FF5400"
                    >
                      SIGNAL
                    </text>
                  </g>
                  {/* Orange Sleeve over board */}
                  <path
                    d="M86 68 L118 68 L122 162 L92 162 Z"
                    fill="#FF5400"
                    stroke="#111111"
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                  />
                </g>

                {/* Right Architect carrying "SPEC 26" Board */}
                <g transform="translate(410, 24)">
                  {/* Flared Orange Trousers */}
                  <path
                    d="M66 175 L24 282 L68 292 L98 205 L132 288 L174 274 L122 175 Z"
                    fill="#FF5400"
                    stroke="#111111"
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                  />
                  {/* White platform shoes */}
                  <rect x="18" y="282" width="52" height="16" rx="6" fill="#F8EEE8" stroke="#111111" strokeWidth="2.5" />
                  <rect x="132" y="276" width="50" height="16" rx="6" fill="#F8EEE8" stroke="#111111" strokeWidth="2.5" />
                  {/* Head & Flowing Hair */}
                  <circle cx="96" cy="44" r="22" fill="#F8EEE8" stroke="#111111" strokeWidth="2.5" />
                  <path
                    d="M72 34 C 58 45, 58 76, 76 86 C 84 72, 82 48, 96 24 Z"
                    fill="#F8EEE8"
                    stroke="#111111"
                    strokeWidth="2.5"
                  />
                  {/* Sign Board */}
                  <g transform="rotate(4 102 132)">
                    <rect
                      x="22"
                      y="86"
                      width="162"
                      height="92"
                      rx="6"
                      fill="#F8EEE8"
                      stroke="#111111"
                      strokeWidth="2.5"
                    />
                    <text
                      x="103"
                      y="152"
                      textAnchor="middle"
                      fontFamily="'Barlow Condensed', sans-serif"
                      fontWeight="900"
                      fontSize="56"
                      fill="#FF5400"
                    >
                      SPEC 26
                    </text>
                  </g>
                  {/* Cream Arm holding board */}
                  <path
                    d="M74 72 L106 72 L114 152 L84 152 Z"
                    fill="#F8EEE8"
                    stroke="#111111"
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                  />
                </g>

                {/* Right Black & White Studio Cat */}
                <g transform="translate(612, 208)">
                  <path
                    d="M18 96 L36 66 L94 66 L112 96 L98 98 L84 78 L46 78 L30 98 Z"
                    fill="#F8EEE8"
                    stroke="#111111"
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                  />
                  <path d="M44 66 Q66 76 88 66 L82 74 L48 74 Z" fill="#111111" />
                  <path
                    d="M28 66 C 22 36, 26 14, 34 14 C 40 14, 34 42, 38 66 Z"
                    fill="#111111"
                  />
                  <path
                    d="M88 66 L96 48 L106 56 L116 46 L122 64 C 124 74, 112 82, 94 78 Z"
                    fill="#F8EEE8"
                    stroke="#111111"
                    strokeWidth="2.5"
                  />
                  <path d="M96 48 L106 56 L116 46 L118 60 L94 60 Z" fill="#111111" />
                </g>
              </svg>
            </div>

            {/* Right: Live Interactive Triage Dossier Card */}
            <div className="lg:col-span-5 pb-6">
              <figure className="bg-[#FFFFFF] border-2 border-[#111111] rounded-[24px] p-6 relative">
                <span
                  className="two26-sticker-pill absolute -top-3.5 right-5 text-xs"
                  style={{ transform: 'rotate(3deg)' }}
                >
                  Live Dossier · CLU-01
                </span>

                <div className="flex items-start justify-between gap-3 border-b border-[#DFCFC6] pb-4">
                  <div className="min-w-0">
                    <div className="text-xs font-bold uppercase tracking-wider text-[#FF5400]">
                      Security &amp; Compliance · P0 Blocker
                    </div>
                    <div className="mt-1 text-lg font-extrabold text-[#111111]">
                      Enterprise SAML 2.0 &amp; Okta SCIM Sync
                    </div>
                  </div>
                </div>

                <ul className="mt-4 space-y-3 text-sm text-[#3D3531]">
                  <li className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 font-medium">
                      <Check className="h-4 w-4 shrink-0 text-[#FF5400]" aria-hidden="true" />
                      Verified ticket citations
                    </span>
                    <span className="fig font-mono font-bold text-[#111111]">[TCK-101] [TCK-102] +6</span>
                  </li>
                  <li className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 font-medium">
                      <Check className="h-4 w-4 shrink-0 text-[#FF5400]" aria-hidden="true" />
                      Triage decision
                    </span>
                    <span className="cs-badge-verified">Ready for Roadmap</span>
                  </li>
                  <li className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 font-medium">
                      <Check className="h-4 w-4 shrink-0 text-[#FF5400]" aria-hidden="true" />
                      Deterministic RICE ({liveMoscow})
                    </span>
                    <span className="fig font-mono text-base font-extrabold text-[#FF5400]">
                      {liveRice.toFixed(2)}
                    </span>
                  </li>
                </ul>

                <div className="mt-5 pt-3 border-t border-[#DFCFC6] flex items-center justify-between gap-2">
                  <span className="text-xs text-[#6E6059]">
                    Connected to the live RICE sliders below
                  </span>
                  <button
                    type="button"
                    onClick={() => openAppModule('prd')}
                    className="text-xs font-bold text-[#FF5400] hover:underline inline-flex items-center gap-1"
                  >
                    <span>Open in PRD Studio</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </figure>
            </div>
          </div>
        </div>

        {/* Iconic Two26 Curved #FF5400 Marquee Ribbon at Bottom of Hero */}
        <div className="relative mt-6 bg-[#FF5400] text-[#FFFFFF] py-5 border-y-2 border-[#111111] overflow-hidden">
          <div className="two26-display text-2xl sm:text-4xl tracking-wider whitespace-nowrap flex items-center justify-around gap-8 px-4">
            <span>ZERO LLM MATH DRIFT</span>
            <span>•</span>
            <span>RFC-4180 2,000-ROW CSV PARSER</span>
            <span>•</span>
            <span>TOP 3 + N VERIFIED CITATIONS</span>
            <span>•</span>
            <span>LIVE GHERKIN PRD CO-PILOT</span>
            <span>•</span>
            <span>&lt;7.5S AUTOMATIC FAILOVER</span>
          </div>
        </div>
      </section>

      {/* =====================================================================
          SECTION 2: TWO26 EDITORIAL MANIFESTO ("A BIT ABOUT COLLABSENSE")
          WITH INTERACTIVE COLOR-REVEAL PILLARS
         ===================================================================== */}
      <section className="desk-surface py-20 sm:py-28 px-4 sm:px-8">
        <div className="max-w-[1120px] mx-auto text-center space-y-8">
          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-[#111111]">
              A BIT ABOUT COLLABSENSE
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {(
                [
                  { id: 'all', label: 'All Architecture Pillars' },
                  { id: 'math', label: '0.00% Math Drift' },
                  { id: 'citations', label: 'Anti-Hallucination Citations' },
                  { id: 'latency', label: '<7.5s Multi-Model Failover' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setManifestoFocus(tab.id)}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                    manifestoFocus === tab.id
                      ? 'bg-[#FF5400] text-white'
                      : 'bg-[#EFE3DC] text-[#111111] hover:bg-[#111111] hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <p className="text-2xl sm:text-4xl md:text-[2.75rem] font-extrabold leading-[1.18] tracking-tight max-w-[1020px] mx-auto">
            <span
              className={`transition-colors duration-300 ${
                manifestoFocus === 'all' || manifestoFocus === 'citations'
                  ? 'text-[#FF5400]'
                  : 'text-[#FF5400]/35'
              }`}
            >
              We built CollabSense so product teams never ship a roadmap based on hallucinated AI quotes or dropped CSV rows.{' '}
            </span>
            <span
              className={`transition-colors duration-300 ${
                manifestoFocus === 'all' || manifestoFocus === 'math'
                  ? 'text-[#FF5400]'
                  : 'text-[#FF5400]/35'
              }`}
            >
              Models do the qualitative reading, while pure deterministic code computes every RICE, WSJF, ICE, MoSCoW, and Kano score.{' '}
            </span>
            <span
              className={`transition-colors duration-300 ${
                manifestoFocus === 'all' || manifestoFocus === 'latency'
                  ? 'text-[#FF5400]'
                  : 'text-[#FF5400]/35'
              }`}
            >
              And with our 3-tier NVIDIA NIM &amp; OpenRouter failover engine, you go from raw tickets to an approved Gherkin PRD in under 90 seconds.
            </span>
          </p>
        </div>
      </section>

      {/* =====================================================================
          SECTION 3: SELECTED WORKS — THE 8-STAGE PRODUCT DISCOVERY GRID
         ===================================================================== */}
      <section id="product-os" className="desk-surface py-16 sm:py-24 px-4 sm:px-8">
        <div className="max-w-[1400px] mx-auto">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.18em] text-[#111111]">
                FEATURED WORKFLOW MODULES
              </div>
              <h2 className="two26-display mt-2 text-[3.2rem] sm:text-[5rem] text-[#111111]">
                <span className="block">EIGHT STAGES,</span>
                <span className="block">ONE DECISION TRAIL</span>
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  { id: 'all', label: 'All 8 Stages' },
                  { id: 'ingest', label: 'S1–S4 · Ingestion & Triage' },
                  { id: 'roadmap', label: 'S5–S8 · Specs & Analytics' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setStageFilter(f.id)}
                  className={`px-4 py-2 rounded-full text-xs font-bold transition-colors ${
                    stageFilter === f.id
                      ? 'bg-[#111111] text-white'
                      : 'bg-[#FFFFFF] text-[#111111] border border-[#DFCFC6] hover:border-[#FF5400]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Two26 Selected Works Portrait Card Grid */}
          <div className="mt-12 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
            {visibleStages.map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.slug}
                  type="button"
                  onClick={() => openAppModule(s.slug)}
                  className="group text-left flex flex-col justify-between rounded-[24px] bg-[#FFFFFF] border border-[#DFCFC6] hover:border-[#FF5400] p-4 transition-all duration-200 hover:-translate-y-1.5"
                >
                  {/* Visual Preview Container (Two26 Rounded Artwork Frame) */}
                  <div
                    className="w-full rounded-[18px] p-5 relative overflow-hidden border border-[#111111]/10 flex flex-col justify-between min-h-[210px]"
                    style={{ backgroundColor: s.accentBg }}
                  >
                    {/* Subtle Hover Brush Accent */}
                    <svg
                      viewBox="0 0 240 120"
                      className="pointer-events-none absolute -right-8 -bottom-8 w-44 h-28 opacity-25 group-hover:opacity-60 transition-opacity"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="M10 100 C 70 20, 150 20, 220 90"
                        stroke="#FF5400"
                        strokeWidth="28"
                        strokeLinecap="round"
                      />
                    </svg>

                    <div className="flex items-center justify-between gap-2 relative z-10">
                      <span className="two26-sticker-pill text-xs px-3 py-1">
                        STAGE {s.num}
                      </span>
                      <span className="w-10 h-10 rounded-full bg-[#FFFFFF] border border-[#111111] flex items-center justify-center text-[#FF5400]">
                        <Icon className="w-5 h-5" aria-hidden="true" />
                      </span>
                    </div>

                    <div className="mt-6 relative z-10 space-y-2">
                      <span className="inline-block font-mono text-[11px] font-bold bg-[#FFFFFF] text-[#111111] px-2.5 py-1 rounded-full border border-[#111111]/15">
                        {s.metricBadge}
                      </span>
                      <p className="text-xs font-medium leading-relaxed text-[#241F1C]">
                        {s.desc}
                      </p>
                    </div>
                  </div>

                  {/* Two26 Bottom Metadata Row: Circular Badge + Condensed Title + #FF5400 Category + Orange Arrow Circle */}
                  <div className="mt-4 pt-1 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-10 h-10 rounded-full bg-[#111111] text-[#FFFFFF] two26-display text-lg flex items-center justify-center shrink-0">
                        {s.num}
                      </span>
                      <div className="min-w-0">
                        <h3 className="two26-display text-2xl text-[#111111] truncate">
                          {s.title}
                        </h3>
                        <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#FF5400] truncate">
                          {s.category}
                        </div>
                      </div>
                    </div>

                    <span className="w-9 h-9 rounded-full bg-[#FF5400] text-[#FFFFFF] flex items-center justify-center shrink-0 group-hover:bg-[#111111] group-hover:rotate-12 transition-all">
                      <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Iconic Two26 Giant #FF5400 Callout with 3 Rotated Black Sticker Pills */}
          <div className="mt-20 sm:mt-28 text-center relative max-w-3xl mx-auto">
            <span
              className="two26-sticker-pill hidden sm:inline-flex absolute -top-3 left-[10%] z-20"
              style={{ transform: 'rotate(-7deg)' }}
            >
              The plot thickens
            </span>

            <span
              className="two26-sticker-pill hidden sm:inline-flex absolute top-[44%] left-[26%] z-20"
              style={{ transform: 'rotate(3deg)' }}
            >
              19/19 Pytest verified
            </span>

            <span
              className="two26-sticker-pill hidden sm:inline-flex absolute bottom-[16%] right-[14%] z-20"
              style={{ transform: 'rotate(-4deg)' }}
            >
              There&apos;s more inside
            </span>

            <h3 className="two26-display text-[#FF5400] text-[3rem] sm:text-[4.8rem] md:text-[5.8rem]">
              <span className="block">WE COULD</span>
              <span className="block">KEEP GOING,</span>
              <span className="block">BUT THERE&apos;S A</span>
              <span className="block">WHOLE WORKSPACE</span>
              <span className="block">FOR THAT.</span>
            </h3>

            <div className="mt-8">
              <button
                type="button"
                onClick={() => openAppModule()}
                className="two26-cta-pill cs-btn-lg"
              >
                <span>Open your workspace</span>
                <span className="two26-arrow-circle" aria-hidden="true">
                  <ArrowUpRight className="w-4 h-4" />
                </span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          SECTION 4: TWO26 SERVICES RIBBON ("THIS IS OUR THING") +
          INTERACTIVE DETERMINISTIC RICE SCORING LAB
         ===================================================================== */}
      <section id="step-data-in" className="desk-surface py-20 sm:py-28 px-4 sm:px-8 relative overflow-hidden">
        <div className="max-w-[1400px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-end">
            <div className="lg:col-span-3">
              <div className="text-xs font-bold uppercase tracking-[0.18em] text-[#111111]">
                DETERMINISTIC ARCHITECTURE
              </div>
            </div>
            <div className="lg:col-span-9">
              <h2 className="two26-display text-[3.4rem] sm:text-[5.2rem] text-[#111111]">
                <span className="block">THIS IS OUR THING:</span>
                <span className="block">CODE DOES THE MATH.</span>
              </h2>
            </div>
          </div>

          {/* Winding #FF5400 Service Rows with Inline Badges & Tilted Description Pills */}
          <div className="mt-14 relative space-y-6">
            {SERVICE_RIBBON_ITEMS.map((item, idx) => (
              <div
                key={item.leftWord}
                className="rounded-[24px] bg-[#FBF6F3] border border-[#DFCFC6] p-5 sm:p-7 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="two26-display text-3xl sm:text-5xl text-[#FF5400]">
                    {item.leftWord}
                  </span>
                  <span className="inline-flex items-center justify-center px-3.5 py-1 rounded-full bg-[#111111] text-[#FFFFFF] font-mono text-sm font-extrabold border-2 border-[#FF5400]">
                    {item.badge}
                  </span>
                  <span className="two26-display text-3xl sm:text-5xl text-[#FF5400]">
                    {item.rightWord}
                  </span>
                </div>

                <div
                  className="bg-[#F8EEE8] border-2 border-[#FF5400] rounded-full px-5 py-2.5 text-xs sm:text-sm font-medium text-[#FF5400] max-w-xl"
                  style={{ transform: `rotate(${idx % 2 === 0 ? '-1deg' : '1deg'})` }}
                >
                  {item.pillText}
                </div>
              </div>
            ))}
          </div>

          {/* Interactive RICE / MoSCoW Scoring Lab */}
          <div className="mt-12 rounded-[28px] bg-[#FFFFFF] border-2 border-[#111111] p-6 sm:p-10">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#DFCFC6] pb-6">
              <div>
                <div className="text-xs font-extrabold uppercase tracking-wider text-[#FF5400]">
                  INTERACTIVE DETERMINISTIC SCORING LAB
                </div>
                <h3 className="two26-display text-3xl sm:text-4xl text-[#111111] mt-1">
                  MODELS SUGGEST. PLAIN CODE CALCULATES.
                </h3>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => applyPreset(12, 2.9, 0.95, 2.0)}
                  className="two26-nav-pill border border-[#DFCFC6] text-xs"
                >
                  P0 SAML Preset
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset(18, 2.6, 0.9, 1.5)}
                  className="two26-nav-pill border border-[#DFCFC6] text-xs"
                >
                  P0 CSV Burst Preset
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset(7, 1.8, 0.8, 2.5)}
                  className="two26-nav-pill border border-[#DFCFC6] text-xs"
                >
                  P2 Mobile Preset
                </button>
                <button type="button" onClick={resetBaseline} className="cs-btn-secondary text-xs">
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Reset</span>
                </button>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 bg-[#F8EEE8] border border-[#DFCFC6] rounded-[18px] p-4">
              <div className="text-sm font-medium text-[#241F1C]">
                <strong className="text-[#111111]">RICE Formula</strong> = (Reach × Impact × Confidence) / max(Effort, 0.1)
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="two26-sticker-pill text-xs">MoSCoW: {liveMoscow}</span>
                <output className="fig rounded-full bg-[#FF5400] px-5 py-2 font-mono text-sm font-extrabold text-[#FFFFFF]">
                  ({demoReach} × {demoImpact.toFixed(1)} × {demoConfidence.toFixed(2)}) / {demoEffort.toFixed(1)} ={' '}
                  {liveRice.toFixed(2)}
                </output>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {sliders.map((sl) => (
                <label
                  key={sl.label}
                  className="block rounded-[18px] bg-[#FBF6F3] border border-[#DFCFC6] p-4"
                >
                  <span className="flex items-baseline justify-between text-sm">
                    <span className="font-bold text-[#111111]">
                      {sl.label} <span className="font-normal text-xs text-[#6E6059]">({sl.unit})</span>
                    </span>
                    <span className="fig font-mono font-extrabold text-[#FF5400]">{sl.display}</span>
                  </span>
                  <input
                    type="range"
                    min={sl.min}
                    max={sl.max}
                    step={sl.step}
                    value={sl.value}
                    aria-label={`${sl.label} slider`}
                    onChange={(e) => sl.set(Number(e.target.value))}
                    className="ph-slider mt-4 w-full"
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          SECTION 5: TWO26 ROUNDED #FF5400 STAGE ("APPARENTLY, PM TEAMS LIKE IT")
          WITH ROTATED STACKED DECK OF #F8EEE8 CARDS
         ===================================================================== */}
      <section id="step-mcp" className="desk-surface py-16 sm:py-24 px-4 sm:px-8">
        <div className="max-w-[1400px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-end mb-10">
            <div className="lg:col-span-3">
              <div className="text-xs font-bold uppercase tracking-[0.18em] text-[#111111]">
                VERIFIED IN PRODUCTION
              </div>
            </div>
            <div className="lg:col-span-9">
              <h2 className="two26-display text-[3.2rem] sm:text-[5rem] text-[#111111]">
                <span className="block">APPARENTLY,</span>
                <span className="block">ENGINEERS LIKE PROOF</span>
              </h2>
            </div>
          </div>

          {/* Rounded #FF5400 Stage Container */}
          <div className="rounded-[32px] bg-[#FF5400] p-6 sm:p-12 lg:p-16 relative overflow-hidden">
            {/* Top Deck Tab Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-10 relative z-20">
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { idx: 0, label: '01 · Terminal & CSV Ingestion' },
                  { idx: 1, label: '02 · Live Gherkin PRD Studio' },
                  { idx: 2, label: '03 · <7.5s Multi-Model Benchmarks' },
                ].map((t) => (
                  <button
                    key={t.idx}
                    type="button"
                    onClick={() => setActiveDeckIdx(t.idx)}
                    className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${
                      activeDeckIdx === t.idx
                        ? 'bg-[#111111] text-[#FFFFFF]'
                        : 'bg-[#F8EEE8] text-[#111111] hover:bg-[#111111] hover:text-[#FFFFFF]'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveDeckIdx((p) => (p + 2) % 3)}
                  aria-label="Previous proof card"
                  className="w-10 h-10 rounded-full bg-[#F8EEE8] text-[#111111] hover:bg-[#111111] hover:text-white flex items-center justify-center transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDeckIdx((p) => (p + 1) % 3)}
                  aria-label="Next proof card"
                  className="w-10 h-10 rounded-full bg-[#111111] text-[#FFFFFF] hover:bg-[#F8EEE8] hover:text-[#111111] flex items-center justify-center transition-colors"
                >
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Stacked Tilted #F8EEE8 Cards Deck */}
            <div className="relative max-w-4xl mx-auto my-4">
              {/* Back decorative rotated cards */}
              <div
                className="hidden sm:block absolute inset-0 rounded-[28px] bg-[#F8EEE8]/55 border border-[#111111]/10 pointer-events-none"
                style={{ transform: 'rotate(-3.2deg) scale(0.98)' }}
              />
              <div
                className="hidden sm:block absolute inset-0 rounded-[28px] bg-[#F8EEE8]/75 border border-[#111111]/10 pointer-events-none"
                style={{ transform: 'rotate(2.4deg) scale(0.99)' }}
              />

              {/* Active Front Card */}
              <div className="relative z-10 rounded-[28px] bg-[#F8EEE8] border-2 border-[#111111] p-6 sm:p-10">
                {activeDeckIdx === 0 && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                    <div className="lg:col-span-5 space-y-3">
                      <span className="two26-sticker-pill text-xs">Stage 1 · RFC-4180 Engine</span>
                      <h3 className="two26-display text-3xl sm:text-4xl text-[#FF5400]">
                        INGEST FROM TERMINAL OR 2,000-ROW CSVS
                      </h3>
                      <p className="text-sm text-[#3D3531] leading-relaxed">
                        Preserves multi-line quoted cells, converts MRR to ARR, strips spreadsheet formula
                        injection (<code className="cs-inline-code">=</code>,{' '}
                        <code className="cs-inline-code">+</code>, <code className="cs-inline-code">-</code>,{' '}
                        <code className="cs-inline-code">@</code>), and requires every insight to cite a real
                        ticket ID like <code className="cs-inline-code">TCK-101</code>.
                      </p>
                      <button
                        type="button"
                        onClick={() => openAppModule('upload')}
                        className="two26-cta-pill mt-2"
                      >
                        <span>Open Stage 1 Ingestion</span>
                        <span className="two26-arrow-circle">
                          <ArrowUpRight className="w-4 h-4" />
                        </span>
                      </button>
                    </div>

                    <div className="lg:col-span-7">
                      <div className="cs-code-block flex items-start justify-between gap-3">
                        <code className="min-w-0 break-all text-xs sm:text-sm">$ {cliCommand}</code>
                        <button
                          type="button"
                          onClick={handleCopyCli}
                          className="copy-btn inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#FFFFFF] px-3 py-1 text-xs font-bold text-[#111111]"
                          aria-label="Copy command"
                        >
                          {copiedCli ? (
                            <Check className="h-3.5 w-3.5 text-[#15803D]" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                          <span>{copiedCli ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                        <div className="rounded-[14px] bg-[#FFFFFF] border border-[#DFCFC6] p-3">
                          <div className="two26-display text-2xl text-[#FF5400]">2,000</div>
                          <div className="text-xs font-semibold text-[#6E6059]">Max CSV Rows</div>
                        </div>
                        <div className="rounded-[14px] bg-[#FFFFFF] border border-[#DFCFC6] p-3">
                          <div className="two26-display text-2xl text-[#111111]">100%</div>
                          <div className="text-xs font-semibold text-[#6E6059]">Multi-Line Capture</div>
                        </div>
                        <div className="rounded-[14px] bg-[#FFFFFF] border border-[#DFCFC6] p-3">
                          <div className="two26-display text-2xl text-[#15803D]">SAFE</div>
                          <div className="text-xs font-semibold text-[#6E6059]">Formula Sanitized</div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeDeckIdx === 1 && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                    <div className="lg:col-span-5 space-y-3">
                      <span className="two26-sticker-pill text-xs">Stage 6 · Interactive PRD Co-Pilot</span>
                      <h3 className="two26-display text-3xl sm:text-4xl text-[#FF5400]">
                        SPECS WITH LIVE GHERKIN DIFFS
                      </h3>
                      <p className="text-sm text-[#3D3531] leading-relaxed">
                        Instruct the AI PRD Assistant to add security edge cases, latency SLAs, or canary
                        rollout phases—and watch the Live PRD Viewer highlight modified sections in real time.
                      </p>
                      <button
                        type="button"
                        onClick={() => openAppModule('prd')}
                        className="two26-cta-pill mt-2"
                      >
                        <span>Launch Stage 6 PRD Studio</span>
                        <span className="two26-arrow-circle">
                          <ArrowUpRight className="w-4 h-4" />
                        </span>
                      </button>
                    </div>

                    <div className="lg:col-span-7">
                      <pre className="cs-code-block overflow-x-auto whitespace-pre text-xs sm:text-sm">
{`Feature: Enterprise SAML SSO and Okta SCIM sync
  Given an Enterprise tenant starts an Okta SAML handshake
  When the assertion and SCIM group claims validate
  Then RBAC roles sync in <400ms and emit SOC2 audit logs`}
                      </pre>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold">
                        <span className="cs-badge-verified">Updated: user_stories</span>
                        <span className="cs-badge-verified">Updated: defensive_edge_cases</span>
                        <span className="cs-badge">Undo History Active</span>
                      </div>
                    </div>
                  </div>
                )}

                {activeDeckIdx === 2 && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                    <div className="lg:col-span-5 space-y-3">
                      <span className="two26-sticker-pill text-xs">3-Tier Low-Latency Router</span>
                      <h3 className="two26-display text-3xl sm:text-4xl text-[#FF5400]">
                        SUB-8S FAILOVER &amp; COOLDOWN ISOLATION
                      </h3>
                      <p className="text-sm text-[#3D3531] leading-relaxed">
                        If Kimi K3.1 Pro queues past 7.5 seconds or a free OpenRouter model hits HTTP 429,
                        CollabSense cools down only that model and fails over immediately to Nemotron 3.5 Super
                        VL 120B.
                      </p>
                      <button
                        type="button"
                        onClick={() => openAppModule('home')}
                        className="two26-cta-pill mt-2"
                      >
                        <span>Test Home AI Co-Pilot</span>
                        <span className="two26-arrow-circle">
                          <ArrowUpRight className="w-4 h-4" />
                        </span>
                      </button>
                    </div>

                    <div className="lg:col-span-7 space-y-2.5 text-xs font-mono">
                      <div className="rounded-[14px] bg-[#FFFFFF] border border-[#DFCFC6] p-3.5 flex items-center justify-between">
                        <span className="font-bold text-[#111111]">NVIDIA NIM · nemotron-3.5-super-vl-120b</span>
                        <span className="text-[#15803D] font-extrabold">0.52s chat · 3.7s S2 noise</span>
                      </div>
                      <div className="rounded-[14px] bg-[#FFFFFF] border border-[#DFCFC6] p-3.5 flex items-center justify-between">
                        <span className="font-bold text-[#111111]">OpenRouter · nemotron-3.5-lightning:free</span>
                        <span className="text-[#15803D] font-extrabold">0.74s chat · 4.9s S3 cluster</span>
                      </div>
                      <div className="rounded-[14px] bg-[#FFFFFF] border border-[#DFCFC6] p-3.5 flex items-center justify-between">
                        <span className="font-bold text-[#111111]">NVIDIA NIM · moonshotai/kimi-k3.1-pro</span>
                        <span className="text-[#FF5400] font-extrabold">Hard 7.5s wall-clock cap</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          SECTION 6: TWO26 CHAT-BUBBLE FAQ ("THINGS YOU MIGHT ASK")
          WITH SLEEPING STUDIO CAT ILLUSTRATION & "26" AVATAR ANSWERS
         ===================================================================== */}
      <section id="faq-section" className="desk-surface py-20 sm:py-28 px-4 sm:px-8">
        <div className="max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          {/* Left Sticky Header + Sleeping Cat Illustration */}
          <div className="lg:col-span-5 lg:sticky lg:top-28 space-y-6">
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-[#111111]">
              FREQUENTLY ASKED QUESTIONS
            </div>
            <h2 className="two26-display text-[3.4rem] sm:text-[5rem] text-[#111111]">
              <span className="block">THINGS YOU</span>
              <span className="block">MIGHT ASK</span>
            </h2>

            {/* Custom Sleeping Cat with 3D #FF5400 Arrow SVG (Two26 FAQ Homage) */}
            <div className="pt-4">
              <svg
                viewBox="0 0 360 220"
                className="w-full max-w-[320px] h-auto"
                role="img"
                aria-label="Sleeping studio cat illustration with orange arrow"
              >
                {/* ZZZ */}
                <text x="115" y="42" fontFamily="monospace" fontWeight="900" fontSize="18" fill="#111111">
                  Z
                </text>
                <text x="132" y="30" fontFamily="monospace" fontWeight="900" fontSize="22" fill="#111111">
                  Z
                </text>
                <text x="152" y="18" fontFamily="monospace" fontWeight="900" fontSize="26" fill="#111111">
                  Z
                </text>
                {/* Sleeping Cat Body */}
                <path
                  d="M65 145 C 45 110, 85 75, 130 95 C 175 85, 240 105, 255 150 C 260 185, 200 198, 135 190 C 85 192, 60 175, 65 145 Z"
                  fill="#FFFFFF"
                  stroke="#111111"
                  strokeWidth="3"
                />
                {/* Cat Ears & Markings */}
                <path d="M62 110 L48 82 L78 92 Z" fill="#111111" />
                <path d="M92 92 L104 68 L116 90 Z" fill="#111111" />
                {/* Tail */}
                <path
                  d="M254 162 C 295 162, 315 188, 305 202 C 295 212, 265 192, 246 182"
                  fill="#111111"
                />
                {/* Happy closed eyes */}
                <path d="M78 122 Q86 130 94 122" stroke="#111111" strokeWidth="2.5" fill="none" />
                <path d="M106 116 Q114 124 122 116" stroke="#111111" strokeWidth="2.5" fill="none" />
                {/* Bold 3D #FF5400 Arrow pointing to belly */}
                <g transform="translate(160, 48) rotate(16)">
                  <polygon
                    points="24,0 54,0 54,42 74,42 39,88 4,42 24,42"
                    fill="#111111"
                    transform="translate(5, 5)"
                  />
                  <polygon
                    points="24,0 54,0 54,42 74,42 39,88 4,42 24,42"
                    fill="#FF5400"
                    stroke="#111111"
                    strokeWidth="2.5"
                  />
                </g>
              </svg>
            </div>
          </div>

          {/* Right Column: Interactive Chat-Bubble FAQ Items */}
          <div className="lg:col-span-7 space-y-4">
            {FAQ_ITEMS.map((item, idx) => {
              const isOpen = openFaqIdx === idx;
              return (
                <div key={item.q} className="space-y-3">
                  {/* Question Bubble (sharp bottom-left corner) */}
                  <button
                    type="button"
                    onClick={() => setOpenFaqIdx(isOpen ? -1 : idx)}
                    aria-expanded={isOpen}
                    className={`w-full text-left px-6 py-4 rounded-[24px] rounded-bl-none transition-all flex items-center justify-between gap-4 ${
                      isOpen
                        ? 'bg-[#F3E5DE] border-2 border-[#FF5400] text-[#111111]'
                        : 'bg-[#EADAD2] border border-transparent hover:border-[#FF5400]/50 text-[#111111]'
                    }`}
                  >
                    <span className="text-sm sm:text-base font-bold leading-snug">{item.q}</span>
                    <span className="font-mono text-xs font-extrabold text-[#FF5400] shrink-0">
                      {isOpen ? '−' : '+'}
                    </span>
                  </button>

                  {/* Expanded Right-Aligned Answer Bubble + Circular #FF5400 "26" Avatar */}
                  {isOpen && (
                    <div className="flex items-end justify-end gap-3 pl-6 sm:pl-16 cs-panel-enter">
                      <div className="rounded-[24px] rounded-br-none bg-[#FBF6F3] border border-[#DFCFC6] p-5 sm:p-6 text-sm leading-relaxed text-[#241F1C]">
                        {item.a}
                      </div>
                      <span className="w-12 h-12 rounded-full bg-[#FF5400] text-[#FFFFFF] two26-display text-xl flex items-center justify-center shrink-0">
                        26
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* =====================================================================
          SECTION 7: FULL-VIEWPORT #FF5400 TWO26 FOOTER ("OKAY, THAT'S ENOUGH
          WEBSITE" + GIANT EDGE-TO-EDGE #F8EEE8 "COLLABSENSE 26" WORDMARK)
         ===================================================================== */}
      <footer
        id="pricing-calculator"
        className="bg-[#FF5400] text-[#F8EEE8] pt-20 pb-8 px-4 sm:px-8 relative overflow-hidden"
      >
        {/* Subtle Swirling Darker-Orange Background Vector Loops */}
        <svg
          viewBox="0 0 1440 700"
          className="pointer-events-none absolute inset-0 w-full h-full opacity-25"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M-80 120 C 320 -40, 520 460, 220 520 C -20 560, 140 180, 640 260 C 1080 320, 960 660, 1520 420"
            stroke="#D94600"
            strokeWidth="44"
            strokeLinecap="round"
          />
        </svg>

        <div className="max-w-[1400px] mx-auto relative z-10">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-10 pb-16">
            {/* Left Callout */}
            <div className="md:col-span-5 space-y-6">
              <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-[1.08] text-[#F8EEE8]">
                Okay, that&apos;s
                <br />
                enough website.
                <br />
                Let&apos;s ship specs.
              </h2>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => navigate('/signup')}
                  className="two26-cta-pill"
                >
                  <span>Create account</span>
                  <span className="two26-arrow-circle" aria-hidden="true">
                    <ArrowUpRight className="w-4 h-4" />
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="two26-nav-pill"
                >
                  Sign in
                </button>
              </div>

              <div className="pt-2 space-y-1 text-sm">
                <div className="text-[#F8EEE8]/75 font-medium">Live Production Endpoint</div>
                <div className="font-bold text-base text-[#F8EEE8]">https://collabsense.vercel.app</div>
              </div>
            </div>

            {/* Middle Navigation Column */}
            <div className="md:col-span-3 space-y-3 text-sm">
              <div className="text-[#F8EEE8]/75 font-semibold">Main Menu</div>
              <ul className="space-y-2.5 font-bold text-base">
                <li>
                  <button type="button" onClick={() => handleQuickJump('product-os')} className="footer-link">
                    8-Stage Workflow
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => handleQuickJump('step-data-in')} className="footer-link">
                    Deterministic Scoring Lab
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => handleQuickJump('step-mcp')} className="footer-link">
                    Ingest &amp; Live Gherkin PRD
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => handleQuickJump('faq-section')} className="footer-link">
                    Frequently Asked Questions
                  </button>
                </li>
              </ul>
            </div>

            {/* Right Workspace & Links Column */}
            <div className="md:col-span-4 flex flex-col justify-between gap-6 text-sm">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2.5">
                  <div className="text-[#F8EEE8]/75 font-semibold">Workspace</div>
                  <ul className="space-y-2 font-bold">
                    <li>
                      <button type="button" onClick={() => openAppModule()} className="footer-link">
                        Projects Hub ↗
                      </button>
                    </li>
                    <li>
                      <button type="button" onClick={() => openAppModule('prioritization')} className="footer-link">
                        Prioritization ↗
                      </button>
                    </li>
                    <li>
                      <button type="button" onClick={() => openAppModule('prd')} className="footer-link">
                        PRD Studio ↗
                      </button>
                    </li>
                    <li>
                      <button type="button" onClick={() => openAppModule('validation')} className="footer-link">
                        Release Analytics ↗
                      </button>
                    </li>
                  </ul>
                </div>

                <div className="space-y-2.5">
                  <div className="text-[#F8EEE8]/75 font-semibold">Developer</div>
                  <ul className="space-y-2 font-bold">
                    <li>
                      <a
                        href="https://github.com/surajkrnet/CollabSense"
                        target="_blank"
                        rel="noreferrer"
                        className="footer-link"
                      >
                        GitHub Repo ↗
                      </a>
                    </li>
                    <li>
                      <a href="/docs" target="_blank" rel="noreferrer" className="footer-link">
                        OpenAPI Docs ↗
                      </a>
                    </li>
                    <li>
                      <a href="/health" target="_blank" rel="noreferrer" className="footer-link">
                        System Health ↗
                      </a>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs font-semibold text-[#F8EEE8]/90 pt-4 border-t border-[#F8EEE8]/25">
                <span>Handmade for Staff Product Teams.</span>
                <span>0.00% Math Drift · v4.1.0</span>
              </div>
            </div>
          </div>

          {/* Giant Edge-to-Edge #F8EEE8 Condensed Footer Wordmark */}
          <div className="pt-4 border-t border-[#F8EEE8]/25 select-none">
            <div className="text-xs font-bold text-[#F8EEE8]/85 mb-2">
              © Copyright 2026 — CollabSense Autonomous Product Discovery OS
            </div>
            <div className="two26-display text-[#F8EEE8] text-[4.2rem] sm:text-[8.5rem] md:text-[11.5rem] lg:text-[13.8rem] leading-[0.84] tracking-tight text-center">
              COLLABSENSE 26
            </div>
          </div>
        </div>
      </footer>

      {/* =====================================================================
          TWO26 FULL-SCREEN #FF5400 STUDIO QUICK-LAUNCHER OVERLAY
         ===================================================================== */}
      {drawerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="CollabSense Studio Quick Launcher"
          className="fixed inset-0 z-50 bg-[#FF5400] text-[#F8EEE8] overflow-y-auto p-5 sm:p-10 flex flex-col justify-between cs-panel-enter"
        >
          <div className="max-w-[1400px] w-full mx-auto flex items-center justify-between gap-4">
            <PostHogBrandMark size="lg" textLabel="COLLABSENSE" variant="light" />
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="two26-nav-pill font-bold"
            >
              <X className="w-4 h-4" />
              <span>Close</span>
            </button>
          </div>

          <div className="max-w-[1400px] w-full mx-auto my-10 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-6 space-y-4">
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#F8EEE8]/80">
                DIRECT STAGE LAUNCHER
              </div>
              <h2 className="two26-display text-[3.8rem] sm:text-[6.2rem] text-[#F8EEE8]">
                <span className="block">WANT TO</span>
                <span className="block">START A NEW</span>
                <span className="block">PRODUCT SPEC?</span>
              </h2>
              <p className="text-lg font-medium text-[#F8EEE8]/85 max-w-md">
                Jump straight into any stage of the 8-stage discovery pipeline or authenticate with Google OAuth.
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    navigate('/signup');
                  }}
                  className="two26-cta-pill cs-btn-lg"
                >
                  <span>Create Free Account</span>
                  <span className="two26-arrow-circle">
                    <ArrowUpRight className="w-4 h-4" />
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    navigate('/login');
                  }}
                  className="two26-nav-pill h-[46px] px-6 font-bold"
                >
                  Sign In
                </button>
              </div>
            </div>

            <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {STAGES.map((s) => (
                <button
                  key={s.slug}
                  type="button"
                  onClick={() => openAppModule(s.slug)}
                  className="text-left rounded-[20px] bg-[#F8EEE8] text-[#111111] p-4 hover:bg-[#111111] hover:text-[#FFFFFF] transition-colors flex items-center justify-between gap-3 group"
                >
                  <div>
                    <div className="text-[11px] font-mono font-bold text-[#FF5400]">STAGE {s.num}</div>
                    <div className="two26-display text-2xl mt-0.5">{s.title}</div>
                  </div>
                  <span className="w-8 h-8 rounded-full bg-[#FF5400] text-white flex items-center justify-center shrink-0">
                    <ArrowUpRight className="w-4 h-4" />
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="max-w-[1400px] w-full mx-auto pt-4 border-t border-[#F8EEE8]/25 flex flex-wrap items-center justify-between gap-3 text-xs font-bold">
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              Supabase Auth (Google OAuth + RLS) · FastAPI v4.1.0
            </span>
            <span className="inline-flex items-center gap-4">
              <span className="inline-flex items-center gap-1">
                <Terminal className="w-3.5 h-3.5" /> 0.00% LLM Math Drift
              </span>
              <span className="inline-flex items-center gap-1">
                <Zap className="w-3.5 h-3.5" /> &lt;7.5s Kimi Failover
              </span>
            </span>
          </div>
        </div>
      )}
    </PostHogDesktopShell>
  );
};
