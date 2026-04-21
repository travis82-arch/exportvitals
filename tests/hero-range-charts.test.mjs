import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/mpa-entry.js', import.meta.url), 'utf8');

function section(start, end) {
  const s = source.indexOf(start);
  const e = source.indexOf(end, s + start.length);
  assert.notEqual(s, -1, `missing ${start}`);
  assert.notEqual(e, -1, `missing ${end}`);
  return source.slice(s, e);
}

test('shared hero range chart helper exists', () => {
  assert.equal(source.includes('function renderHeroRangeChart'), true);
  assert.equal(source.includes('trend: !range.isSingleDay ? renderHeroRangeChart'), true);
  assert.equal(source.includes('hero-trend-axis'), true);
  assert.equal(source.includes('hero-trend-label-x'), true);
  assert.equal(source.includes('hero-trend-label-y'), true);
});

test('multi-day hero charts are wired across all health tabs', () => {
  const home = section('function renderHome(', 'function renderDomainPage(');
  const readiness = section('function renderReadinessPage(', 'function sleepContributorRows(');
  const sleep = section('function renderSleepPage(', 'function renderActivityPage(');
  const activity = section('function renderActivityPage(', 'function renderPreviewCard(');
  const heartRate = section('function renderHeartRatePage(', 'function renderStressPage(');
  const stress = section('function renderStressPage(', 'function buildPageWarnings(');

  assert.equal(home.includes("!range.isSingleDay ? renderHeroRangeChart({ title: 'Daily readiness score', series: homeHeroTrend }) : ''"), true);
  assert.equal(readiness.includes("trend: !range.isSingleDay ? renderHeroRangeChart({ title: 'Daily readiness score', series: readinessRangeSeries }) : ''"), true);
  assert.equal(sleep.includes("trend: !range.isSingleDay ? renderHeroRangeChart({ title: 'Daily sleep score', series: sleepScoreTrend, tone: 'calm' }) : ''"), true);
  assert.equal(activity.includes("trend: !range.isSingleDay ? renderHeroRangeChart({ title: 'Daily activity score', series: activityScoreTrend }) : ''"), true);
  assert.equal(heartRate.includes("trend: !range.isSingleDay ? renderHeroRangeChart({ title: heroTrendConfig.title, series: heroTrendConfig.series }) : ''"), true);
  assert.equal(stress.includes("trend: !range.isSingleDay ? renderHeroRangeChart({ title: 'Daily high stress minutes', series: highStressTrend, tone: 'stress' }) : ''"), true);
});

test('single-day mode remains chart-free in heroes via explicit range guard', () => {
  const guardCount = (source.match(/trend: !range\.isSingleDay \? renderHeroRangeChart/g) || []).length;
  assert.equal(guardCount >= 5, true);
});
