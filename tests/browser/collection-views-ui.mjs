// Isolated static build with synthetic activity and reward records.
import assert from "node:assert/strict";
import {pathToFileURL} from "node:url";

const base=process.env.SMOKE_BASE_URL;
assert.equal(base,"https://127.0.0.1:3443");
const engines=await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href);
const browser=await engines[process.env.SMOKE_BROWSER].launch({headless:true});
try {
  const page=await browser.newPage({ignoreHTTPSErrors:true,isMobile:true,hasTouch:true,
    viewport:{width:390,height:844},colorScheme:process.env.SMOKE_COLOR_SCHEME||"light"});
  const viewer={id:"11111111-1111-4111-8111-111111111111",name:"模拟孩子",role:"child"};
  const rules=["写字练习","较长的模拟学校课外阅读活动"].map((title,i)=>({key:"activity-"+i,title,enabled:true,frequency:"daily",description:"练习记录和说明",points:i+1}));
  const rewards=["家庭电影","周末选择一个喜欢的活动"].map((title,i)=>({id:"reward-"+i,title,active:true,cost:i+1,description:"模拟约定",expiresOn:"2027-01-09"}));
  const state={viewer,today:"2026-11-26",activities:{rules,claims:[],startOn:"2026-01-01"},rewards,growth:{balance:10,earned:10,ledger:[]},
    books:[],logs:[],wishes:[],redemptions:[],calendar:[],stats:{currentStreak:0,bestStreak:0,days:0,booksFinished:0},rules:{dailyPoints:2,milestones:[]},reviewBudget:{used:0,limit:10}};
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/assistant-api/**",route=>{
    assert.equal(route.request().method(),"GET");
    const path=new URL(route.request().url()).pathname;
    return route.fulfill({json:path.endsWith("/status")?{authenticated:true,available:true,accounts:true,viewer}:
      path.endsWith("/reading/state")?state:path.endsWith("/memories")?{items:[]}:{pending:false,uploads:[],dates:[],report:null}});
  });
  const scenarios=[
    {view:"growth",name:"成长活动显示方式",grid:".economy-grid",list:".activity-list",action:"记录完成"},
    {view:"mall",name:"商城显示方式",grid:".mall-grid",list:".shop-list",action:"查看家庭电影详情"},
  ];
  for(const {view,name,grid,list,action} of scenarios){
    await page.goto(base+"/reading/?view="+view);
    const toggle=page.getByRole("group",{name});
    const toList=toggle.getByRole("button",{name:"列表视图"});
    const toGrid=toggle.getByRole("button",{name:"方块视图"});
    await toGrid.waitFor();assert.equal(await toGrid.getAttribute("aria-pressed"),"true");
    for(const width of [320,390,768]){
      await page.setViewportSize({width,height:844});
      const cards=page.locator(grid+" > article");
      await cards.first().waitFor();
      const a=await cards.nth(0).boundingBox(),b=await cards.nth(1).boundingBox();
      assert.ok(b.x>a.x && Math.abs(a.y-b.y)<1);
      await toList.click();
      const rows=page.locator(list+" > article");
      const first=await rows.first().boundingBox(),second=await rows.nth(1).boundingBox();
      assert.ok(second.y>=first.y+first.height-1 && first.height<100 && first.width>2*first.height,JSON.stringify(first));
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await rows.first().getByRole("button",{name:action}).click();
      await page.getByRole("dialog").waitFor();
      await page.keyboard.press("Escape");
      await toGrid.click();
    }
    await toList.click();await page.reload();
    await page.locator(list+" > article").first().waitFor();
    assert.equal(await toList.getAttribute("aria-pressed"),"true");
  }
  await page.getByRole("button",{name:"方块视图"}).click();
  await page.goto(base+"/reading/?view=growth");
  await page.locator(".activity-list").waitFor();
  assert.deepEqual(errors,[]);
  console.log("COLLECTION_VIEWS_OK");
} finally {await browser.close();}
