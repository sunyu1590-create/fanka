import test from 'node:test';
import assert from 'node:assert/strict';
import {posts,deckFor} from '../lib/server/content-data.ts';
import {dayKey} from '../lib/content.ts';
import {dailyCandidates,openDailyCard,rankBalancedDailyCandidates} from '../lib/daily.ts';
test('Demo 内容至少 80 条，各话题不少于 10 条且 ID 唯一',()=>{assert.ok(posts.length>=80);assert.equal(new Set(posts.map(p=>p.id)).size,posts.length);for(const tag of ['生活','摄影','设计','科技','游戏','情感','知识','艺术'])assert.ok(posts.filter(p=>p.tag===tag).length>=10,tag)});
test('同一日期与兴趣生成固定且不重复的五张卡',()=>{const a=deckFor('2026-10-30',['摄影','设计','生活']);const b=deckFor('2026-10-30',['摄影','设计','生活']);assert.equal(a.length,5);assert.equal(new Set(a.map(p=>p.id)).size,5);assert.deepEqual(a,b)});
test('日期遵循指定时区',()=>{assert.equal(dayKey(new Date('2026-10-30T16:30:00Z'),'Asia/Shanghai'),'2026-10-31')});
test('每日瀑布流固定展示 50 张卡，保留已生成的卡组',()=>{const cards=dailyCandidates(posts,['摄影'],[3,1],50);assert.equal(cards.length,50);assert.deepEqual(cards.slice(0,2).map(p=>p.id),[3,1]);assert.equal(new Set(cards.map(p=>p.id)).size,cards.length)});
test('每日最多解锁五张，重复查看不扣额度',()=>{let opened=[];for(let id=1;id<=5;id++)opened=openDailyCard(opened,id);assert.deepEqual(openDailyCard(opened,3),opened);assert.deepEqual(openDailyCard(opened,6),opened);assert.equal(opened.length,5)});
test('每日候选按服务端排序保留旧卡组，不再在客户端打乱',()=>{const cards=[{...posts[3],id:41},{...posts[1],id:17},{...posts[2],id:29}];assert.deepEqual(dailyCandidates(cards,['摄影'],[29],3).map(item=>item.id),[29,41,17])});
test('每日卡池交替平衡精选与 AI，并优先避开近期阅读',()=>{
 const candidates=Array.from({length:8},(_,index)=>({id:index+1,channel:index%2?'ai':'community',tag:index<4?'摄影':'科技',createdAt:new Date(Date.now()-index*86_400_000).toISOString(),ratingAverage:index<4?4.9:3,ratingCount:20}));
 const ids=rankBalancedDailyCandidates(candidates,['摄影'],[1,2],6,'2026-11-19');
 assert.equal(ids.length,6);assert.equal(new Set(ids).size,6);assert.ok(!ids.includes(1)&&!ids.includes(2));
 const channels=ids.map(id=>candidates.find(item=>item.id===id).channel);
 assert.ok(Math.abs(channels.filter(channel=>channel==='ai').length-channels.filter(channel=>channel==='community').length)<=1);
});
test('候选不足时按平衡顺序回退到近期阅读内容',()=>{
 const ids=rankBalancedDailyCandidates([{id:1,channel:'community'},{id:2,channel:'ai'}],[],[1],5,'2026-11-19');
 assert.deepEqual(new Set(ids),new Set([1,2]));assert.equal(ids[0],2);
});
