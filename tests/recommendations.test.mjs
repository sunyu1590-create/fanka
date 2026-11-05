import test from 'node:test';
import assert from 'node:assert/strict';
import { rankRecommendations } from '../lib/recommendations.ts';

const post = (id, tag) => ({ id, tag, title: '', body: '', cover: '', author: '', date: '' });

test('high community scores gently improve content ranking with confidence weighting', () => {
  const items = [post(1, '生活'), post(2, '生活')];
  const ranked = rankRecommendations(items, [], [], {}, {
    1: { average: 5, count: 50 },
    2: { average: 2, count: 1 },
  });
  assert.deepEqual(ranked.map((item) => item.id), [1, 2]);
});

test('the reader’s own high ratings improve recommendations in the same topic', () => {
  const items = [post(1, '摄影'), post(2, '生活'), post(3, '摄影')];
  const ranked = rankRecommendations(items, [], [], { 1: 5 }, {});
  assert.deepEqual(ranked.map((item) => item.id), [1, 3, 2]);
});

test('selected interests remain a stronger recommendation signal than sparse ratings', () => {
  const items = [post(1, '生活'), post(2, '摄影')];
  const ranked = rankRecommendations(items, ['生活'], [], { 2: 5 }, {});
  assert.deepEqual(ranked.map((item) => item.id), [1, 2]);
});

test('recently viewed posts receive an exposure penalty on a fresh recommendation pass', () => {
  const items = [post(4, '生活'), post(2, '生活'), post(8, '摄影')];
  const before = rankRecommendations(items, [], [], {}, {});
  const afterOpening = rankRecommendations(items, [], [2], {}, {});
  assert.deepEqual(before.map((item) => item.id), [2, 8, 4]);
  assert.deepEqual(afterOpening.map((item) => item.id), [4, 8, 2]);
});

test('freshness improves new content and topic diversity avoids repetitive runs', () => {
  const today = new Date().toISOString().slice(0, 10);
  const old = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10);
  const items = [
    { ...post(1, '生活'), date: today },
    { ...post(2, '生活'), date: old },
    { ...post(3, '摄影'), date: old },
  ];
  assert.deepEqual(rankRecommendations(items, [], [], {}, {}).map((item) => item.id), [1, 3, 2]);
});
