import { chromium } from '@playwright/test';
const b = await chromium.launch({ executablePath:'/usr/bin/chromium', args:['--no-sandbox'] });
const p = await b.newPage({ viewport:{width:400,height:300}, deviceScaleFactor:2 });
await p.goto('file:///tmp/blurtest2.html'); await p.waitForTimeout(400);
await p.screenshot({path:'/root/.codebuddy/artifact/heika/shots/blurtest2.png'});
await b.close();
