import { StrategyContext, IndicatorRequirements } from './strategyContext';
import { RULES } from '../rules/ruleRegistry';

// ─── Strategy JSON schema types ───────────────────────────────────────────────

export interface ConditionDef {
  rule:    string;
  params:  Record<string, unknown>;
  label:   string;
  points?: number;
  warning?: string;
}

export interface GroupDef {
  label:      string;
  pick:       'tiered' | 'best_trigger' | 'additive';
  conditions: ConditionDef[];
}

export interface SectionDef {
  name:       string;
  maxPoints:  number;
  cap?:       number;
  note?:      string;
  groups:     GroupDef[];
}

export interface StrategyDefinition {
  id:        string;
  name:      string;
  version:   string;
  requires:  { timeframes: IndicatorRequirements['timeframes'] };
  mandatory: ConditionDef[];
  sections:  SectionDef[];
}

// ─── Result types ─────────────────────────────────────────────────────────────

export interface ConditionResult {
  label:   string;
  pass:    boolean;
  points:  number;
  detail:  string;
  warning?: string;
}

export interface GroupResult {
  label:    string;
  score:    number;
  winner?:  ConditionResult;
  evaluated: ConditionResult[];
}

export interface SectionResult {
  name:      string;
  maxPoints: number;
  score:     number;
  groups:    GroupResult[];
}

export interface MandatoryResult {
  label:   string;
  pass:    boolean;
  detail:  string;
  warning?: string;
}

export interface StrategyResult {
  ticker:        string;
  strategyId:    string;
  strategyName:  string;
  strategyVersion: string;
  generatedAt:   string;
  mandatoryPass: boolean;
  mandatory:     MandatoryResult[];
  sections:      SectionResult[];
  totalScore:    number;
}

// ─── Engine ───────────────────────────────────────────────────────────────────

function runCondition(def: ConditionDef, ctx: StrategyContext): ConditionResult {
  const ruleFn = RULES[def.rule];
  if (!ruleFn) {
    return { label: def.label, pass: false, points: def.points ?? 0, detail: `Unknown rule: ${def.rule}` };
  }
  const result = ruleFn(ctx, def.params ?? {});
  return {
    label:   def.label,
    pass:    result.pass,
    points:  def.points ?? 0,
    detail:  result.detail,
    warning: def.warning ?? result.warning,
  };
}

function evaluateGroup(group: GroupDef, ctx: StrategyContext): GroupResult {
  const evaluated = group.conditions.map(c => runCondition(c, ctx));

  if (group.pick === 'tiered') {
    const winner = evaluated.find(e => e.pass);
    return { label: group.label, score: winner?.points ?? 0, winner, evaluated };
  }

  if (group.pick === 'best_trigger') {
    const passing = evaluated.filter(e => e.pass).sort((a, b) => b.points - a.points);
    const winner  = passing[0];
    return { label: group.label, score: winner?.points ?? 0, winner, evaluated };
  }

  // additive
  const total = evaluated.filter(e => e.pass).reduce((s, e) => s + e.points, 0);
  return { label: group.label, score: total, evaluated };
}

export function evaluateStrategy(ctx: StrategyContext, strategy: StrategyDefinition): StrategyResult {
  const generatedAt = new Date().toISOString();

  // Mandatory gate
  const mandatory: MandatoryResult[] = strategy.mandatory.map(c => {
    const r = runCondition(c, ctx);
    return { label: c.label, pass: r.pass, detail: r.detail, warning: r.warning };
  });
  const mandatoryPass = mandatory.every(m => m.pass);

  if (!mandatoryPass) {
    return {
      ticker: ctx.ticker, strategyId: strategy.id, strategyName: strategy.name,
      strategyVersion: strategy.version, generatedAt, mandatoryPass,
      mandatory, sections: [], totalScore: 0,
    };
  }

  // Scoring sections
  let sections1to4Score = 0;
  const sections: SectionResult[] = [];

  for (const section of strategy.sections) {
    // Section 5 (1H Trigger) is only evaluated if sections 1–4 total ≥ 40
    if (section.note?.includes('40') && sections1to4Score < 40) {
      sections.push({ name: section.name, maxPoints: section.maxPoints, score: 0, groups: [] });
      continue;
    }

    const groups     = section.groups.map(g => evaluateGroup(g, ctx));
    const rawScore   = groups.reduce((s, g) => s + g.score, 0);
    const score      = section.cap != null ? Math.min(rawScore, section.cap) : rawScore;
    sections.push({ name: section.name, maxPoints: section.maxPoints, score, groups });

    if (sections.length <= 4) sections1to4Score += score;
  }

  const totalScore = sections.reduce((s, sec) => s + sec.score, 0);

  return {
    ticker: ctx.ticker, strategyId: strategy.id, strategyName: strategy.name,
    strategyVersion: strategy.version, generatedAt, mandatoryPass,
    mandatory, sections, totalScore,
  };
}
