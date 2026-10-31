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
