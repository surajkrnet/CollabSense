/**
 * CollabSense Client-Side Deterministic Math Engine (60fps Slider Mirror)
 * ENFORCES THE DETERMINISTIC MATH BOUNDARY (.agent/rules/architecture.md):
 * Mirrors backend/app/services/scorer_service.py to 2 decimal places so slider adjustments
 * recalculate RICE, WSJF, ICE, MoSCoW, Kano, and SaaS + AI Unit Economics in < 1ms.
 */

export type TicketSource = string;
export type CustomerTier = 'Enterprise' | 'Mid-Market' | 'Pro' | 'Standard' | 'Free';
export type SeverityLevel = 'P0' | 'P1' | 'P2' | 'P3' | 'P4';
export type MoscowTag = 'MUST' | 'SHOULD' | 'COULD' | 'WONT';
export type KanoCategory =
  | 'Must-Be'
  | 'Performance Feature'
  | 'Attractive / Delighter'
  | 'Indifferent';
export type PrioritizationFramework = 'RICE' | 'WSJF' | 'ICE' | 'MOSCOW' | 'KANO';

export interface RawTicket {
  id: string;
  source: TicketSource;
  customer_tier: CustomerTier;
  arr_weight: number;
  content: string;
  created_at: string;
}

export interface FeedbackCluster {
  cluster_id: string;
  theme_title: string;
  problem_summary: string;
  severity: SeverityLevel;
  ticket_ids: string[];
  representative_quotes: string[];
  channels: string[];
  total_arr_impact: number;
  reach_count: number;
  impact_score: number;
  confidence_score: number;
  effort_score: number;
  wsjf_cod: number;
  wsjf_duration: number;
  ice_ease: number;
  kano_category: KanoCategory;
  computed_rice: number;
  computed_wsjf: number;
  computed_ice: number;
  moscow_tag: MoscowTag;
}

export interface GherkinScenario {
  scenario_id: string;
  title: string;
  given: string;
  when: string;
  then: string;
}

export interface TelemetryEventSpec {
  event_name: string;
  properties: string[];
  success_threshold: string;
}

export interface GeneratedPRD {
  prd_id: string;
  cluster_id: string;
  title: string;
  executive_problem_statement: string;
  target_persona: string;
  strategic_narrative: string;
  deterministic_metrics_badge: {
    rice: number;
    wsjf: number;
    ice: number;
    moscow: MoscowTag;
    kano: KanoCategory;
    reach: number;
    arr_impact: number;
  };
  user_stories: GherkinScenario[];
  defensive_edge_cases: string[];
  telemetry_events: TelemetryEventSpec[];
  rollout_plan: string[];
  markdown_body: string;
  engine_used: string;
}

export interface UnitEconomicsInput {
  arpu_monthly: number;
  cac: number;
  monthly_churn_pct: number;
  tickets_per_tenant_month: number;
  prds_per_tenant_month: number;
  gemini_cost_per_1m_tokens: number;
  base_cloud_cogs_per_tenant: number;
}

export interface UnitEconomicsOutput {
  arpu_monthly: number;
  llm_inference_burn_monthly: number;
  total_cogs_monthly: number;
  blended_gross_margin_pct: number;
  gross_profit_monthly: number;
  ltv: number;
  ltv_cac_ratio: number;
  cac_payback_months: number;
  health_verdict: 'ELITE_SAAS' | 'HEALTHY' | 'MARGIN_ALERT';
}

const MOSCOW_ORDER: Record<MoscowTag, number> = {
  MUST: 4,
  SHOULD: 3,
  COULD: 2,
  WONT: 1,
};

const KANO_ORDER: Record<KanoCategory, number> = {
  'Must-Be': 4,
  'Performance Feature': 3,
  'Attractive / Delighter': 2,
  Indifferent: 1,
};

export function sanitizeFormulaInjection(value: string): string {
  return value.replace(/^[\=\+\-\@\t\r]+/, '').trim();
}

export function calculateRice(
  reach: number,
  impact: number,
  confidence: number,
  effort: number
): number {
  const safeReach = Math.max(Math.round(reach), 0);
  const safeImpact = Math.max(impact, 0);
  const safeConf = Math.min(Math.max(confidence, 0), 1);
  const safeEffort = Math.max(effort, 0.1);
  return Number(((safeReach * safeImpact * safeConf) / safeEffort).toFixed(2));
}

export function calculateWsjf(costOfDelay: number, jobDuration: number): number {
  const safeCod = Math.max(costOfDelay, 0);
  const safeDuration = Math.max(jobDuration, 1);
  return Number((safeCod / safeDuration).toFixed(2));
}

export function calculateIce(impact: number, confidence: number, ease: number): number {
  const impact10 = impact <= 3.0 ? impact * (10.0 / 3.0) : impact;
  const conf10 = confidence <= 1.0 ? confidence * 10.0 : confidence;
  const safeEase = Math.min(Math.max(ease, 1.0), 10.0);
  return Number(((impact10 * conf10 * safeEase) / 10.0).toFixed(2));
}

export function classifyMoscow(
  riceScore: number,
  impact: number,
  confidence: number
): MoscowTag {
  if (riceScore >= 10.0 || (impact >= 2.5 && confidence >= 0.85 && riceScore >= 6.0)) {
    return 'MUST';
  }
  if (riceScore >= 5.0) return 'SHOULD';
  if (riceScore >= 2.0) return 'COULD';
  return 'WONT';
}

export function recalculateAndSortClusters(
  clusters: FeedbackCluster[],
  framework: PrioritizationFramework
): FeedbackCluster[] {
  const updated = clusters.map((c) => {
    const rice = calculateRice(
      c.reach_count,
      c.impact_score,
      c.confidence_score,
      c.effort_score
    );
    const wsjf = calculateWsjf(c.wsjf_cod, c.wsjf_duration);
    const ice = calculateIce(c.impact_score, c.confidence_score, c.ice_ease);
    const moscow = classifyMoscow(rice, c.impact_score, c.confidence_score);
    return {
      ...c,
      computed_rice: rice,
      computed_wsjf: wsjf,
      computed_ice: ice,
      moscow_tag: moscow,
    };
  });

  return [...updated].sort((a, b) => {
    if (framework === 'WSJF') {
      return b.computed_wsjf - a.computed_wsjf || b.computed_rice - a.computed_rice;
    }
    if (framework === 'ICE') {
      return b.computed_ice - a.computed_ice || b.computed_rice - a.computed_rice;
    }
    if (framework === 'MOSCOW') {
      return (
        MOSCOW_ORDER[b.moscow_tag] - MOSCOW_ORDER[a.moscow_tag] ||
        b.computed_rice - a.computed_rice
      );
    }
    if (framework === 'KANO') {
      return (
        KANO_ORDER[b.kano_category] - KANO_ORDER[a.kano_category] ||
        b.computed_rice - a.computed_rice
      );
    }
    return b.computed_rice - a.computed_rice || b.computed_wsjf - a.computed_wsjf;
  });
}

export function calculateUnitEconomicsClient(
  input: UnitEconomicsInput
): UnitEconomicsOutput {
  const triageTokens = input.tickets_per_tenant_month * 420;
  const prdTokens = input.prds_per_tenant_month * 4500;
  const totalTokensMillions = (triageTokens + prdTokens) / 1_000_000;

  const llmBurn = Number(
    (totalTokensMillions * input.gemini_cost_per_1m_tokens).toFixed(2)
  );
  const totalCogs = Number((input.base_cloud_cogs_per_tenant + llmBurn).toFixed(2));
  const grossProfit = Number((input.arpu_monthly - totalCogs).toFixed(2));
  const marginPct = Number(
    ((grossProfit / Math.max(input.arpu_monthly, 0.01)) * 100).toFixed(2)
  );

  const churnDecimal = Math.max(input.monthly_churn_pct / 100, 0.001);
  const ltv = Number((Math.max(grossProfit, 0) / churnDecimal).toFixed(2));
  const ltvCac = Number((ltv / Math.max(input.cac, 1)).toFixed(2));
  const paybackMonths = Number((input.cac / Math.max(grossProfit, 0.01)).toFixed(2));

  let verdict: UnitEconomicsOutput['health_verdict'] = 'MARGIN_ALERT';
  if (marginPct >= 80 && ltvCac >= 3.0) {
    verdict = 'ELITE_SAAS';
  } else if (marginPct >= 65 && ltvCac >= 2.0) {
    verdict = 'HEALTHY';
  }

  return {
    arpu_monthly: input.arpu_monthly,
    llm_inference_burn_monthly: llmBurn,
    total_cogs_monthly: totalCogs,
    blended_gross_margin_pct: marginPct,
    gross_profit_monthly: grossProfit,
    ltv,
    ltv_cac_ratio: ltvCac,
    cac_payback_months: paybackMonths,
    health_verdict: verdict,
  };
}
