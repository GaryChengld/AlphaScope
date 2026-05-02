import { StrategyContext } from '../strategy/strategyContext';
import { RuleResult } from './types';
import * as trend      from './trendRules';
import * as pullback   from './pullbackRules';
import * as trigger    from './triggerRules';
import * as market     from './marketRules';
import * as breakout   from './breakoutRules';
import * as range      from './rangeRules';
import * as meanRev    from './meanReversionRules';
import * as abc        from './abcRules';

export type RuleFn = (ctx: StrategyContext, params: Record<string, unknown>) => RuleResult;

export const RULES: Record<string, RuleFn> = {
  // Trend
  priceAboveEma:        trend.priceAboveEma,
  emaAlignment:         trend.emaAlignment,
  emaAlignmentSlope:    trend.emaAlignmentSlope,
  weeklyTrend:          trend.weeklyTrend,
  weeklyAboveEmaCount:  trend.weeklyAboveEmaCount,
  uptrendDuration:      trend.uptrendDuration,
  rsVsSpy:              trend.rsVsSpy,
  spyAboveEma:          trend.spyAboveEma,
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
  // Breakout
  consolidationDetected:     breakout.consolidationDetected,
  consolidationWidth:        breakout.consolidationWidth,
  consolidationDuration:     breakout.consolidationDuration,
  bbSqueeze:                 breakout.bbSqueeze,
  priorTrendBeforeBase:      breakout.priorTrendBeforeBase,
  breakoutConfirmed:         breakout.breakoutConfirmed,
  breakoutNotExtended:       breakout.breakoutNotExtended,
  consolidationVolumeSane:   breakout.consolidationVolumeSane,
  liquidityFloor:            breakout.liquidityFloor,
  breakoutCloseStrength:     breakout.breakoutCloseStrength,
  breakoutCandleSize:        breakout.breakoutCandleSize,
  largerStructurePosition:   breakout.largerStructurePosition,
  macdBullishCrossAboveZero: breakout.macdBullishCrossAboveZero,
  // Range (mean-reversion)
  rangeBound:              range.rangeBound,
  rangeTouchCount:         range.rangeTouchCount,
  rangeDuration:           range.rangeDuration,
  rangeWidth:              range.rangeWidth,
  nearRangeLow:            range.nearRangeLow,
  rangeFloorProximity:     range.rangeFloorProximity,
  rangeMidpointDistance:   range.rangeMidpointDistance,
  // Mean Reversion
  adxLevel:                meanRev.adxLevel,
  weeklyTrendNotDown:      meanRev.weeklyTrendNotDown,
  rsiOversoldEither:       meanRev.rsiOversoldEither,
  lowerBbTag:              meanRev.lowerBbTag,
  bbLowerPosition:         meanRev.bbLowerPosition,
  consecutiveRedBars:      meanRev.consecutiveRedBars,
  marketNotPanic:          meanRev.marketNotPanic,
  // ABC Pullback Continuation
  abcFibRetracement:       abc.abcFibRetracement,
  abcHHHL:                 abc.abcHHHL,
  abcImpulse:              abc.abcImpulse,
  abcStructure:            abc.abcStructure,
  abcNearSupport:          abc.abcNearSupport,
  abcNoDivergence:         abc.abcNoDivergence,
  abcImpulseQuality:       abc.abcImpulseQuality,
  abcCPointWick:           abc.abcCPointWick,
  abcPullbackBodyRatio:    abc.abcPullbackBodyRatio,
  abcDaysSinceC:           abc.abcDaysSinceC,
  abcMomentum:             abc.abcMomentum,
};
