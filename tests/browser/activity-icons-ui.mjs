// Run against the isolated synthetic family and the real activity endpoints.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const base = process.env.SMOKE_BASE_URL;
assert.equal(base, "https://127.0.0.1:3443");
const directory = process.env.PRACTICE_QA_DIRECTORY;
assert.ok(directory.endsWith("/xiaobu-practice-qa"));
const playwright = await import(pathToFileURL(process.env.SMOKE_PLAYWRIGHT_PACKAGE).href);
const browser = await playwright[process.env.SMOKE_BROWSER].launch({headless:true});
try {
  const options = {viewport:{width:320,height:760},isMobile:true,hasTouch:true,ignoreHTTPSErrors:true,
    colorScheme:process.env.SMOKE_COLOR_SCHEME || "light"};
  const page = await browser.newPage(options);
  const post = async (client,path,data) => {
    const res = await client.request.post(base+"/assistant-api/"+path,{headers:{Origin:base},data});
    assert.equal(res.status(),200,path);
  };
  const password = "Synthetic-activity-2026";
  const setupCode = (await readFile(directory+"/parent-setup-code","utf8")).trim();
  await post(page,"parent-setup",{setupCode,username:"qa-parent",name:"模拟家长",password});
  await post(page,"admin/accounts",{username:"qa-child",name:"模拟孩子",role:"child",password});
  await page.goto(base+"/reading/?view=manage");
  await page.getByRole("button",{name:"成长活动",exact:true}).click();
  const panel = page.locator(".activity-management");
  await panel.getByRole("button",{name:"新增活动"}).tap();
  const add = page.getByRole("dialog",{name:"新增活动"});
  await add.getByLabel("活动名称").fill("模拟写字课");
  await add.getByRole("button",{name:/活动图标.*星光/}).tap();
  await add.getByRole("button",{name:"书写",exact:true}).tap();
  await add.getByRole("button",{name:"保存活动"}).tap();
  await add.waitFor({state:"hidden"});
  const editButton = panel.getByRole("button",{name:"编辑模拟写字课"});
  const edit = page.getByRole("dialog",{name:"编辑活动"});
  await editButton.tap();
  await edit.getByRole("button",{name:/活动图标.*书写/}).tap();
  assert.equal(await edit.getByRole("button",{name:"书写",exact:true}).getAttribute("aria-pressed"),"true");
  assert.ok(await edit.evaluate(el=>el.scrollWidth <= el.clientWidth+1));
  await edit.screenshot({path:process.env.SMOKE_OUTPUT_DIR+"/icons.png"});
  await edit.getByRole("button",{name:"音乐",exact:true}).tap();
  await edit.getByRole("button",{name:"取消",exact:true}).tap();
  await editButton.tap();
  await edit.getByRole("button",{name:/活动图标.*书写/}).tap();
  await edit.getByRole("button",{name:"绘画",exact:true}).tap();
  await edit.getByRole("button",{name:"保存活动"}).tap();
  await edit.waitFor({state:"hidden"});

  await page.reload();
  await page.getByRole("button",{name:"成长活动",exact:true}).click();
  await editButton.tap();
  await edit.getByRole("button",{name:/活动图标.*绘画/}).waitFor();
  await edit.getByRole("button",{name:"取消",exact:true}).tap();
  // An existing rule without an explicit icon can also acquire one.
  await panel.getByRole("button",{name:"编辑家庭小帮手",exact:true}).tap();
  await edit.getByRole("button",{name:/活动图标/}).tap();
  await edit.getByRole("button",{name:"书写",exact:true}).tap();
  await edit.getByRole("button",{name:"保存活动",exact:true}).tap();
  await edit.waitFor({state:"hidden"});

  const child = await browser.newPage(options);
  await post(child,"session",{username:"qa-child",password});
  await child.goto(base+"/reading/?view=growth");
  const card = child.locator(".growth-activities article").filter({hasText:"模拟写字课"});
  await card.locator(".journal-tile-icon .lucide-palette").waitFor();
  const preset = child.locator(".growth-activities article").filter({hasText:"家庭小帮手"});
  await preset.locator(".journal-tile-icon .lucide-pencil").waitFor();
  console.log("ACTIVITY_ICON_CREATE_EDIT_CANCEL_CHILD_OK",process.env.SMOKE_BROWSER);
} finally {
  await browser.close();
}
