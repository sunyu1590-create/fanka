import { expect, test, type Page } from "@playwright/test";

const userId="11111111-1111-4111-8111-111111111111";
async function enter(page:Page, loggedIn=false) {
  await page.addInitScript(({loggedIn,userId})=>{
    localStorage.setItem("heika-demo-v1",JSON.stringify({onboardingDone:true}));
    if(loggedIn) localStorage.setItem(`heika-user-${userId}`,JSON.stringify({onboardingDone:true}));
    if(loggedIn) localStorage.setItem("sb-composer-auth-token",JSON.stringify({access_token:"e30.eyJzdWIiOiJjb21wb3NlciJ9.sig",token_type:"bearer",expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:"test",user:{id:userId,aud:"authenticated",role:"authenticated",email:"composer@example.test",app_metadata:{provider:"email",providers:["email"]},user_metadata:{},created_at:"2026-11-08T00:00:00Z"}}));
  },{loggedIn,userId});
  await page.route("**/api/client-config",route=>route.fulfill({json:{url:"https://composer.supabase.co",key:"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.signature"}}));
  await page.route("https://composer.supabase.co/**",route=>route.fulfill({json:{id:userId,aud:"authenticated",role:"authenticated",email:"composer@example.test",app_metadata:{provider:"email",providers:["email"]},user_metadata:{}}}));
  await page.route("**/api/v1/**",route=> {
    const path=new URL(route.request().url()).pathname;
    if(path.includes("categories")) return route.fulfill({json:{data:{items:[{id:1,name:path.includes("ai")?"AI 知识":"生活",kind:"category"}]}}});
    if(path.includes("topics")) return route.fulfill({json:{data:[{id:1,name:"生活"},{id:2,name:"科技"}]}});
    if(path.endsWith("library-state")) return route.fulfill({json:{data:{profile:{nickname:"测试创作者",role:"user"},own:[],prefs:null,bookmarks:[],interactions:[],interests:[]}}});
    return route.fulfill({json:{data:{items:[]}}});
  });
  await page.route("**/api/demo/cards**",route=>route.fulfill({json:{data:[]}}));
  await page.goto("/");
  if(loggedIn) await expect(page.locator(".demo-pill")).toHaveCount(0);
  const skip=page.getByRole("button",{name:/先随便看看/});
  if(await skip.isVisible()) await skip.click();
  await page.getByRole("button",{name:"发布内容",exact:true}).click();
  await expect(page.locator(".composer-modal")).toBeVisible();
}

test("editor preserves immediate exits, Markdown preview, channel drafts and responsive themes",async({page})=>{
  await enter(page);
  const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  await page.getByRole("textbox",{name:"标题",exact:true}).fill("长标题创作测试".repeat(8));
  await page.getByRole("textbox",{name:"正文",exact:true}).fill("## 真实预览\n\n一段**加粗文字**与正文。\n".repeat(12));
  await expect(page.getByRole("toolbar",{name:"Markdown 工具栏"})).toBeVisible();
  await page.getByRole("button",{name:"粗体",exact:true}).click();
  await expect(page.getByRole("textbox",{name:"正文",exact:true})).toBeFocused();
  await page.getByRole("textbox",{name:"正文",exact:true}).evaluate((el:HTMLTextAreaElement)=>{el.setSelectionRange(0,0);el.blur();});
  await page.locator(".composer-workspace").evaluate(el=>{el.scrollTop=0;});
  for(const width of [320,1280]) for(const theme of ["light","dark"]) {
    await page.setViewportSize({width,height:820});
    await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;},theme);
    await expect.poll(()=>page.locator(".composer-modal").evaluate(el=>{const sample=document.createElement("span");sample.style.cssText="background:var(--bg);transition:none";document.body.appendChild(sample);const color=getComputedStyle(sample).backgroundColor;sample.remove();return getComputedStyle(el).backgroundColor===color;})).toBeTruthy();
    await expect.poll(()=>page.getByRole("textbox",{name:"标题",exact:true}).evaluate(el=>el.scrollHeight<=el.clientHeight+1)).toBeTruthy();
    expect(await page.locator(".composer-modal").evaluate(el=>el.scrollWidth<=el.clientWidth)).toBeTruthy();
    const button=page.locator(".composer-footer>.primary-button");await expect(button).toBeInViewport();
    await expect(page.locator(".bottom-nav")).toBeHidden();
    await page.screenshot({path:`test-results/composer-${width}-${theme}.png`});
  }
  await page.getByRole("button",{name:"预览",exact:true}).click();
  await expect(page.getByRole("dialog",{name:"内容预览"}).locator("h2",{hasText:"真实预览"}).first()).toBeVisible();
  await page.getByRole("button",{name:"返回编辑，当前：内容预览"}).click();
  await page.getByRole("textbox",{name:"标题",exact:true}).fill("退出前最后输入");
  await page.locator(".composer-back").click();
  await expect(page.locator(".composer-modal")).toHaveCount(0);
  await page.getByRole("button",{name:"发布内容",exact:true}).click();
  await expect(page.getByRole("textbox",{name:"标题",exact:true})).toHaveValue("退出前最后输入");
  await page.getByRole("button",{name:"AI 空间",exact:true}).click();
  await page.getByRole("button",{name:"切换目标",exact:true}).click();
  await expect(page.getByRole("textbox",{name:"标题",exact:true})).toHaveValue("退出前最后输入");
  await expect(page.getByRole("combobox",{name:"AI 内容类型"})).toBeVisible();
  await page.getByRole("button",{name:/更多发布设置/}).click();
  await expect(page.getByRole("dialog",{name:"更多发布设置"})).toBeVisible();
  await page.getByRole("button",{name:"返回编辑，当前：更多发布设置"}).click();
  expect(errors).toEqual([]);
});

test("nine images retain cover and order through preview, replace, removal and recovery",async({page})=>{
  await enter(page);
  const png=await page.evaluate(()=>{const canvas=document.createElement("canvas");canvas.width=32;canvas.height=32;const ctx=canvas.getContext("2d")!;ctx.fillStyle="#b99a59";ctx.fillRect(0,0,32,32);return canvas.toDataURL("image/png").split(",")[1];});
  const files=Array.from({length:9},(_,i)=>({name:`image-${i}.png`,mimeType:"image/png",buffer:Buffer.from(png,"base64")}));
  await page.locator(".composer-media-choice input[type=file]").first().setInputFiles(files);
  await expect(page.locator(".composer-media-strip figure")).toHaveCount(9);
  await page.getByRole("button",{name:"预览第 3 张图片",exact:true}).click();
  const imageUrl=await page.locator(".composer-media-preview>img").getAttribute("src");
  await page.getByRole("button",{name:"设为封面",exact:true}).click();
  await page.getByRole("button",{name:"前移",exact:true}).click();
  await page.getByRole("button",{name:"返回编辑，当前：图片管理"}).click();
  await expect(page.locator(".composer-media-strip figure").nth(1).locator(".composer-cover-badge")).toBeVisible();
  const last=page.locator(".composer-media-strip figure").nth(3); const lastId=await last.getAttribute("data-composer-image");
  await last.dragTo(page.locator(".composer-media-strip figure").nth(2));
  await expect(page.locator(".composer-media-strip figure").nth(2)).toHaveAttribute("data-composer-image",lastId!);
  await page.getByRole("button",{name:"预览",exact:true}).click();
  await expect(page.locator(".composer-preview-media img").first()).toHaveAttribute("src",imageUrl!);
  await page.getByRole("button",{name:"返回编辑，当前：内容预览"}).click();
  await page.getByRole("button",{name:"预览第 1 张图片",exact:true}).click();
  const beforeReplace=await page.locator(".composer-media-preview>img").getAttribute("src");
  await page.locator(".composer-media-actions input").setInputFiles(files[0]);
  await expect(page.locator(".composer-media-preview>img")).not.toHaveAttribute("src",beforeReplace!);
  await page.getByRole("button",{name:"删除",exact:true}).click();
  await expect(page.locator(".composer-media-strip figure")).toHaveCount(8);
  await page.locator(".composer-back").click();
  await expect(page.locator(".composer-modal")).toHaveCount(0);
  await page.getByRole("button",{name:"发布内容",exact:true}).click();
  await expect(page.locator(".composer-media-strip figure")).toHaveCount(8);
});

test("cloud failure is distinct from local save, retries and serializes new snapshots",async({page})=>{
  await enter(page,true);
  let fail=true, active=0, maxActive=0;const saved:string[]=[];
  await page.route("**/api/v1/library-state",async route=>{
    if(route.request().method()!=="POST") return route.fallback();
    const payload=route.request().postDataJSON();active++;maxActive=Math.max(active,maxActive);
    await new Promise(resolve=>setTimeout(resolve,180));active--;
    if(fail) return route.fulfill({status:503,json:{error:"同步失败，本机草稿已保留"}});
    saved.push(payload.title);
    return route.fulfill({json:{data:{id:201,cloudId:"22222222-2222-4222-8222-222222222222",title:payload.title,body:payload.body,status:"draft",channel:"community",tag:"生活",topics:[],author:"测试创作者",date:"2026-11-08",cover:""}}});
  });
  await page.getByRole("textbox",{name:"标题",exact:true}).fill("离线保留");
  await page.getByRole("textbox",{name:"正文",exact:true}).fill("本机文字需要在同步失败后继续保留。");
  await expect(page.locator(".composer-save-retry")).toBeVisible();
  await expect.poll(()=>page.evaluate(id=>JSON.parse(localStorage.getItem(`heika-compose-community-${id}`)||"{}").title,userId)).toBe("离线保留");
  fail=false;await page.locator(".composer-save-retry").click();
  await expect(page.locator(".composer-footer")).toContainText("已同步至账号");
  await page.getByRole("textbox",{name:"标题",exact:true}).fill("最新快照");
  await expect.poll(()=>saved.at(-1)).toBe("最新快照");
  expect(maxActive).toBe(1);
});

test("submit sends the existing review action once and never claims public publication",async({page})=>{
  await enter(page,true);
  let submits=0;
  await page.route("**/api/v1/library-state",async route=>{
    if(route.request().method()!=="POST")return route.fallback();
    const payload=route.request().postDataJSON();
    if(payload.action==="publish") {submits++;await new Promise(resolve=>setTimeout(resolve,200));}
    return route.fulfill({json:{data:{id:301,cloudId:"33333333-3333-4333-8333-333333333333",status:payload.action==="publish"?"pending_review":"draft",title:payload.title,body:payload.body,tag:"生活",topics:[],author:"测试创作者",date:"2026-11-08",cover:"",channel:"community"}}});
  });
  await page.getByRole("textbox",{name:"标题",exact:true}).fill("正确提交审核");
  await page.getByRole("textbox",{name:"正文",exact:true}).fill("内容提交后仍需审核，不应被标记为公开发布成功。");
  const submit=page.locator(".composer-footer>.primary-button");
  await submit.click();
  await expect(page.locator(".composer-modal")).toHaveCount(0);
  await expect(page.getByText("内容已提交人工审核，通过后将公开展示",{exact:true})).toBeVisible();
  expect(submits).toBe(1);
});

test("topics, poll and AI resource fields remain functional behind progressive controls",async({page})=>{
  await enter(page);
  await page.getByRole("textbox",{name:"标题",exact:true}).fill("组合创作测试");
  await page.getByRole("textbox",{name:"正文",exact:true}).fill("Markdown 与资源信息将在真实内容预览中展示。");
  await page.getByRole("button",{name:/# 话题/}).click();
  const topics=page.getByRole("dialog",{name:"选择话题"});
  await topics.getByRole("button",{name:"#科技",exact:true}).click();
  await topics.getByRole("button",{name:"完成",exact:true}).click();
  await expect(page.getByRole("button",{name:/# 话题/})).toContainText("#科技");
  await page.getByRole("button",{name:/更多发布设置/}).click();
  await page.getByRole("textbox",{name:"投票问题",exact:true}).fill("你更喜欢哪种内容？");
  await page.getByRole("textbox",{name:"投票选项 1",exact:true}).fill("图文");
  await page.getByRole("textbox",{name:"投票选项 2",exact:true}).fill("教程");
  await page.getByRole("button",{name:/AI 创作工作台/}).click();
  await expect(page.getByRole("button",{name:"润色正文",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"返回编辑，当前：更多发布设置"}).click();
  await page.getByRole("button",{name:"预览",exact:true}).click();
  await expect(page.locator(".composer-preview-poll")).toContainText("图文");
  await page.getByRole("button",{name:"返回编辑，当前：内容预览"}).click();
  await page.getByRole("button",{name:"AI 空间",exact:true}).click();
  await page.getByRole("button",{name:"切换目标",exact:true}).click();
  await page.getByRole("combobox",{name:"AI 内容类型"}).click();
  await page.getByRole("option",{name:"Prompt 提示词",exact:true}).click();
  await page.getByRole("textbox",{name:/适用模型/}).fill("通用模型");
  await page.getByRole("textbox",{name:/应用场景/}).fill("内容创作");
  await page.getByRole("textbox",{name:/完整提示词/}).fill("请根据主题整理一份阅读提纲。");
  await page.getByRole("button",{name:"预览",exact:true}).click();
  await expect(page.locator(".composer-preview .ai-resource-detail")).toContainText("请根据主题整理一份阅读提纲。");
});

test("unavailable signed previews never remove persisted media associations",async({page})=>{
  await page.addInitScript(()=>localStorage.setItem("heika-compose-community-guest",JSON.stringify({title:"保留附件关联",body:"即使无法获取预览地址，也不能丢失已上传图片路径。",tag:"生活",topics:[],images:[{id:"restored-image",path:"owner/preserved.jpg"}],coverIndex:0})));
  await enter(page);
  await expect(page.locator(".composer-media-strip figure")).toHaveCount(1);
  await expect(page.locator(".composer-footer")).toContainText("已保存至此设备");
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem("heika-compose-community-guest")||"{}").images[0].path)).toBe("owner/preserved.jpg");
});
