import { StrategyContext } from '../strategy/strategyContext';
import { RuleResult } from './types';
import * as trend    from './trendRules';
import * as pullback from './pullbackRules';
import * as trigger  from './triggerRules';
import * as market   from './marketRules';

export type RuleFn = (ctx: StrategyContext, params: Record<string, unknown>) => RuleResult;

export const RULES: Record<string, RuleFn> = {
  // Trend
  priceAboveEma:       trend.priceAboveEma,
  emaAlignment:        trend.emaAlignment,
  emaAlignmentSlope:   trend.emaAlignmentSlope,
  weeklyTrend:         trend.weeklyTrend,
  uptrendDuration:     trend.uptrendDuration,
  rsVsSpy:             trend.rsVsSpy,
  spyAboveEma:         trend.spyAboveEma,
  // Pullback
  validPullback:       pullback.validPullback,
  pullbackToSupport:   pullback.pullbackToSupport,
  pullbackAtrDepth:    pullback.pullbackAtrDepth,
  fibRetracement:      pullback.fibRetracement,
  pullbackVolume:      pullback.pullbackVolume,
  pullbackDuration:    pullback.pullbackDuration,
  supportProximity:    pullback.supportProximity,
  swingHighPolarity:   pullback.swingHighPolarity,
  supportConfluence:   pullback.supportConfluence,
  rsiLevel:            pullback.rsiLevel,
  rsiStructure:        pullback.rsiStructure,
  // Trigger
  hourlyEmaCrossover:    trigger.hourlyEmaCrossover,
  hourlyStructureBreak:  trigger.hourlyStructureBreak,
  bullishReversalCandle: trigger.bullishReversalCandle,
  triggerVolume:       trigger.triggerVolume,
  triggerTiming:       trigger.triggerTiming,
  triggerTimeOfDay:    trigger.triggerTimeOfDay,
  // Market
  noNearEarnings:      market.noNearEarnings,
  sectorStrength:      market.sectorStrength,
  marketRegime:        market.marketRegime,
  manualReview:        market.manualReview,
};
