import fs   from 'fs';
import path from 'path';
import { buildStrategyContext } from './strategyContext';
import { evaluateStrategy, StrategyDefinition, StrategyResult, SectionResult } from './strategyEngine';
import { RULES } from '../rules/ruleRegistry';

const STRATEGIES_DIR = process.env.STRATEGIES_DIR
  ?? path.resolve(__dirname, '../../../../specs/strategies');

interface StrategyEntry {
  id:      string;
  name:    string;
  version: string;
  file:    string;
  enabled: boolean;
}

function readIndex(): StrategyEntry[] {
  const indexPath = path.join(STRATEGIES_DIR, 'index.json');
  return JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as StrategyEntry[];
}

export function listStrategies(): { id: string; name: string; version: string }[] {
  return readIndex()
    .filter(e => e.enabled)
    .map(({ id, name, version }) => ({ id, name, version }));
}

export function loadStrategy(id: string): StrategyDefinition {
  const entry = readIndex().find(e => e.id === id && e.enabled);
  if (!entry) throw new Error('STRATEGY_NOT_FOUND');
  const filePath = path.join(STRATEGIES_DIR, entry.file);
  if (!fs.existsSync(filePath)) throw new Error('STRATEGY_NOT_FOUND');
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as StrategyDefinition;
  validateStrategy(parsed, entry.file);
  return parsed;
}

// ─── Validation ──────────────────────────────────────────────────────────────
// Surface malformed strategy JSON at load time with a descriptive error rather
// than letting it fail deep inside rule evaluation.

const VALID_PICKS = new Set(['tiered', 'best_trigger', 'additive']);

function validateStrategy(s: StrategyDefinition, fileName: string): void {
  const fail = (msg: string): never => {
    throw new Error(`Invalid strategy "${fileName}": ${msg}`);
  };

  for (const k of ['id', 'name', 'version', 'requires', 'mandatory', 'sections'] as const) {
    if (s[k] == null) fail(`missing required field "${k}"`);
  }
  if (!s.requires?.timeframes || typeof s.requires.timeframes !== 'object') {
    fail('"requires.timeframes" must be an object');
  }
  if (!Array.isArray(s.mandatory)) fail('"mandatory" must be an array');
  if (!Array.isArray(s.sections) || s.sections.length === 0) {
    fail('"sections" must be a non-empty array');
  }

  for (const m of s.mandatory) {
    if (!RULES[m.rule]) fail(`mandatory rule "${m.rule}" is not registered`);
  }

  for (let i = 0; i < s.sections.length; i++) {
    const sec = s.sections[i];
    const tag = `sections[${i}] "${sec.name ?? '?'}"`;
    if (typeof sec.maxPoints !== 'number') fail(`${tag}: "maxPoints" must be a number`);
    if (!Array.isArray(sec.groups) || sec.groups.length === 0) {
      fail(`${tag}: must have at least one group`);
    }
    for (let j = 0; j < sec.groups.length; j++) {
      const g = sec.groups[j];
      const gtag = `${tag} groups[${j}] "${g.label ?? '?'}"`;
      if (!VALID_PICKS.has(g.pick)) fail(`${gtag}: "pick" must be tiered|best_trigger|additive`);
      if (!Array.isArray(g.conditions) || g.conditions.length === 0) {
        fail(`${gtag}: must have at least one condition`);
      }
      for (const c of g.conditions) {
        if (!RULES[c.rule]) fail(`${gtag}: rule "${c.rule}" is not registered`);
      }
    }
  }

  // Total max points check — sections must sum to the declared total (default 100).
  const declaredTotal = (s as StrategyDefinition & { totalMaxPoints?: number }).totalMaxPoints ?? 100;
  const summed = s.sections.reduce((acc, sec) => acc + sec.maxPoints, 0);
  if (summed !== declaredTotal) {
    fail(`section maxPoints sum to ${summed}, expected totalMaxPoints=${declaredTotal}`);
  }
}

export async function runStrategy(ticker: string, strategyId: string): Promise<StrategyResult> {
  const strategy = loadStrategy(strategyId);
  const ctx = await buildStrategyContext(ticker, strategy.requires);
  return evaluateStrategy(ctx, strategy);
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

function scoreDecision(score: number): string {
  if (score >= 80) return '🟢 EXCELLENT SETUP — Full position size (risk 1.5–2% of account)';
  if (score >= 70) return '🟢 STRONG SETUP — Standard position size (risk 1% of account)';
  if (score >= 60) return '🟡 ACCEPTABLE SETUP — Reduced position size (risk 0.5–0.75% of account)';
  if (score >= 50) return '🔴 MARGINAL SETUP — DO NOT ENTER, wait for improvement or skip';
  return '🔴 WEAK SETUP — DO NOT ENTER';
}

export function toMarkdown(result: StrategyResult): string {
  const lines: string[] = [
    `# ${result.strategyName} — ${result.ticker}`,
    '',
    '## Mandatory Conditions',
  ];

  for (const m of result.mandatory) {
    const check = m.pass ? '✅' : '❌';
    lines.push(`- ${check} ${m.label} — ${m.detail}`);
  }
  lines.push('');

  if (!result.mandatoryPass) {
    lines.push('❌ One or more mandatory conditions failed.');
    lines.push('');
    lines.push('**DO NOT ENTER — mandatory gate not cleared.**');
    return lines.join('\n');
  }

  lines.push('✅ All mandatory conditions met. Proceeding to score...');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Score Summary');
  lines.push('');
  lines.push('| Section | Max | Score |');
  lines.push('|---------|-----|-------|');

  for (let i = 0; i < result.sections.length; i++) {
    const s = result.sections[i];
    lines.push(`| ${i + 1}. ${s.name} | ${s.maxPoints} | ${s.score} |`);
  }

  const totalMax = result.sections.reduce((s, sec) => s + sec.maxPoints, 0);
  lines.push(`| **TOTAL** | **${totalMax}** | **${result.totalScore}** |`);
  lines.push('');
  lines.push(`### ${scoreDecision(result.totalScore)}`);
  lines.push('');
  lines.push('---');

  for (let i = 0; i < result.sections.length; i++) {
    const section = result.sections[i];
    lines.push('');
    lines.push(`## Section ${i + 1}: ${section.name} — ${section.score}/${section.maxPoints}`);
    lines.push('');
    renderSection(section, lines);
  }

  return lines.join('\n');
}

function renderSection(section: SectionResult, lines: string[]): void {
  for (const group of section.groups) {
    if (group.winner) {
      // tiered / best_trigger — single winner
      lines.push(`**${group.label}** → ${group.winner.label} **+${group.winner.points} pts**`);
      lines.push(`  *${group.winner.detail}*`);
    } else {
      // No winner field — either additive (sum of passing) or no condition met
      const passing = group.evaluated.filter(e => e.pass);
      if (passing.length > 0) {
        // additive: list each passing condition
        lines.push(`**${group.label}** → **+${group.score} pts**`);
        for (const c of passing) {
          lines.push(`  - ${c.label} **+${c.points} pts** — *${c.detail}*`);
        }
      } else {
        lines.push(`**${group.label}** → *(no condition met — 0 pts)*`);
      }
    }

    // Show warnings for all evaluated conditions
    for (const c of group.evaluated) {
      if (c.warning && !c.pass) {
        lines.push(`  ⚠️ ${c.label} — ${c.warning}`);
      }
    }
  }
}
