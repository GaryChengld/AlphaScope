import fs   from 'fs';
import path from 'path';
import { buildStrategyContext, IndicatorRequirements } from './strategyContext';
import { evaluateStrategy, StrategyDefinition, StrategyResult, SectionResult } from './strategyEngine';

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
  const entry = readIndex().find(e => e.id === id);
  if (!entry || !entry.enabled) throw new Error('STRATEGY_NOT_FOUND');
  const filePath = path.join(STRATEGIES_DIR, entry.file);
  if (!fs.existsSync(filePath)) throw new Error('STRATEGY_NOT_FOUND');
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as StrategyDefinition;
}

export async function runStrategy(ticker: string, strategyId: string): Promise<StrategyResult> {
  const strategy = loadStrategy(strategyId);
  const requires: IndicatorRequirements = { timeframes: strategy.requires.timeframes };
  const ctx = await buildStrategyContext(ticker, requires);
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
  const dt = new Date(result.generatedAt);
  const dateStr = dt.toLocaleString('en-US', {
    timeZone: 'America/New_York', month: 'short', day: 'numeric',
    year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const lines: string[] = [
    `# ${result.strategyName} — ${result.ticker}`,
    `*Generated: ${dateStr} ET · Strategy v${result.strategyVersion}*`,
    '',
    '## Mandatory Conditions',
  ];

  for (const m of result.mandatory) {
    const check = m.pass ? '[x]' : '[ ]';
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

  lines.push(`| **TOTAL** | **100** | **${result.totalScore}** |`);
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
      lines.push(`**${group.label}** → ${group.winner.label} **+${group.winner.points} pts**`);
      lines.push(`  *${group.winner.detail}*`);
    } else {
      lines.push(`**${group.label}** → *(no condition met — 0 pts)*`);
    }

    // Show warnings for all evaluated conditions
    for (const c of group.evaluated) {
      if (c.warning && !c.pass) {
        lines.push(`  ⚠️ ${c.label} — ${c.warning}`);
      }
    }
  }
}
