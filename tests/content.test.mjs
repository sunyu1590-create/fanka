import test from 'node:test';
import assert from 'node:assert/strict';
import {posts,deckFor,dayKey} from '../lib/content.ts';
test('演示内容不少于 30 条，覆盖所有兴趣',()=>{assert.ok(posts.length>=30);assert.equal(new Set(posts.map(p=>p.tag)).size,8)});
test('同一日期与兴趣生成固定且不重复的五张卡',()=>{const a=deckFor('2026-10-30',['摄影','设计','生活']);const b=deckFor('2026-10-30',['摄影','设计','生活']);assert.equal(a.length,5);assert.equal(new Set(a.map(p=>p.id)).size,5);assert.deepEqual(a,b)});
test('日期遵循指定时区',()=>{assert.equal(dayKey(new Date('2026-10-30T16:30:00Z'),'Asia/Shanghai'),'2026-10-31')});
