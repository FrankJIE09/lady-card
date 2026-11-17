import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require("playwright");
} catch (error) {
  if (process.env.PLAYWRIGHT_MODULE) {
    try {
      playwright = require(process.env.PLAYWRIGHT_MODULE);
    } catch (fallbackError) {
      throw new Error(
        "PLAYWRIGHT_MODULE 未指向可用的 Playwright 包。请修正路径，或运行 npm install 后重试。",
        { cause: fallbackError },
      );
    }
  } else {
    throw new Error(
      "缺少 Playwright。请运行 npm install，再运行 npx playwright install chromium；也可设置 PLAYWRIGHT_MODULE 指向已有安装。",
      { cause: error },
    );
  }
}
const base = process.env.TEST_URL || "http://localhost:5178/";
const production = process.env.TEST_PRODUCTION === "1";
const output = path.resolve(
  process.env.TEST_OUTPUT_DIR ||
    (production ? "test-results/production" : "test-results"),
);
await fs.mkdir(output, { recursive: true });
const browser = await playwright.chromium.launch({
  headless: true,
  ...(process.env.BROWSER_CHANNEL
    ? { channel: process.env.BROWSER_CHANNEL }
    : {}),
});
const failures = [];
const checks = [];
const errors = [];
const watch = (page) =>
  page.on("pageerror", (error) => errors.push(error.message));
const idle = (page) => page.waitForLoadState("networkidle");
const shot = async (page, name) => {
  await page.waitForTimeout(2000); // GSAP entry sequence must settle before visual review.
  return page.screenshot({
    path: path.join(output, `${name}.png`),
    fullPage: true,
  });
};
const check = async (name, test) => {
  try {
    await test();
    checks.push(name);
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push({ name, error: error.message });
    console.error(`FAIL ${name}: ${error.message}`);
  }
};
async function noOverflow(page, name) {
  const size = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  assert.ok(
    size.document <= size.viewport + 1,
    `${name}: horizontal overflow ${JSON.stringify(size)}`,
  );
}
async function leave(page) {
  await page.getByRole("button", { name: "离开牌桌", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "离开牌桌", exact: true })
    .click();
  await page.locator(".home-main").waitFor();
}
async function draw(page, count) {
  const button = page.getByRole("button", { name: "抽一张牌", exact: true });
  await button.waitFor();
  await button.click();
  await page.getByText(`已揭晓 ${count} / 52 张`, { exact: true }).waitFor();
  await page.waitForFunction(() => {
    const control = document.querySelector(".draw-button");
    return (
      control &&
      !control.textContent.includes("好戏正在揭晓") &&
      !control.querySelector(".spinning")
    );
  });
}

try {
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await desktop.newPage();
  watch(page);
  await page.goto(base);
  await idle(page);
  await page.locator(".fan-center").waitFor();
  await check("desktop home layout", async () => {
    await noOverflow(page, "desktop home");
    await shot(page, "desktop-home");
  });

  await check("music enable, volume, mute", async () => {
    assert.equal(
      await page
        .getByRole("button", { name: "开启音乐", exact: true })
        .getAttribute("aria-pressed"),
      "false",
    );
    if (!production) {
      const initial = await page.evaluate(
        async () => (await import("/src/lib/audio.ts")).audio.ctx === null,
      );
      assert.ok(initial, "AudioContext must not exist before explicit enable");
    }
    await page.getByRole("button", { name: "开启音乐", exact: true }).click();
    await page.getByRole("button", { name: "关闭音乐", exact: true }).waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "关闭音乐", exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    const volume = page.getByRole("slider", { name: "音乐音量" });
    await volume.focus();
    await volume.press("Home");
    await volume.press("ArrowRight");
    await volume.press("ArrowRight");
    assert.equal(await volume.inputValue(), "0.1");
    if (!production) {
      const active = await page.evaluate(async () => {
        const { audio } = await import("/src/lib/audio.ts");
        return {
          state: audio.ctx.state,
          enabled: audio.enabled,
          volume: audio.volume,
        };
      });
      assert.equal(active.state, "running");
      assert.equal(active.volume, 0.1);
      assert.ok(active.enabled);
    }
    await page.getByRole("button", { name: "关闭音乐", exact: true }).click();
    await page.getByRole("button", { name: "开启音乐", exact: true }).waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "开启音乐", exact: true })
        .getAttribute("aria-pressed"),
      "false",
    );
    assert.equal(
      await page.getByRole("slider", { name: "音乐音量" }).count(),
      0,
    );
    if (!production) {
      const disabled = await page.evaluate(async () => {
        const { audio } = await import("/src/lib/audio.ts");
        return {
          enabled: audio.enabled,
          voices: audio.sources.size,
          timer: audio.timer,
        };
      });
      assert.equal(disabled.enabled, false);
      assert.equal(disabled.voices, 0);
      assert.equal(disabled.timer, null);
    }
  });

  await check("edit and persist rules", async () => {
    await page.getByRole("button", { name: "玩法说明", exact: true }).click();
    await page
      .getByRole("textbox", { name: "A 牌名称", exact: true })
      .fill("测试开心牌");
    await page
      .getByRole("textbox", { name: "A 牌玩法", exact: true })
      .fill("说一件今天值得开心的小事。");
    await page.getByRole("button", { name: "保存玩法", exact: true }).click();
    await page.reload();
    await idle(page);
    await page.getByRole("button", { name: "玩法说明", exact: true }).click();
    assert.equal(
      await page
        .getByRole("textbox", { name: "A 牌名称", exact: true })
        .inputValue(),
      "测试开心牌",
    );
    await page.getByRole("button", { name: "关闭", exact: true }).click();
  });

  for (const [mode, name] of [
    ["lady", "小姐牌"],
    ["queen", "大姐牌"],
    ["gentleman", "少爷牌"],
  ]) {
    await check(`${name} local game and three consecutive draws`, async () => {
      await page
        .getByRole("group", { name: "选择玩法" })
        .getByRole("button", { name: new RegExp(name) })
        .click();
      await page
        .getByRole("button", { name: "朋友就在身边？同屏开一局", exact: false })
        .click();
      await page
        .getByRole("textbox", { name: "今晚的朋友" })
        .fill("小夏, 阿圆, 小陈");
      await page
        .getByRole("button", { name: "洗牌，开始今晚的故事", exact: true })
        .click();
      await page.locator(".game-main").waitFor();
      assert.equal(await page.locator(".player").count(), 3);
      for (let count = 1; count <= 3; count++) await draw(page, count);
      assert.equal(
        (await page.locator(".turn-label").innerText()).trim(),
        "小陈 抽到了",
      );
      await page.getByRole("button", { name: /今晚的故事/ }).click();
      assert.equal(await page.locator(".history-panel li").count(), 3);
      assert.ok(
        (await page.locator(".history-panel li").first().innerText()).includes(
          "小陈",
        ),
      );
      await noOverflow(page, `desktop ${mode} game`);
      await shot(page, `desktop-game-${mode}`);
      await leave(page);
    });
  }

  for (const [width, height] of [
    [390, 844],
    [320, 740],
  ]) {
    await check(`mobile ${width} home, modal, and game layout`, async () => {
      const mobile = await browser.newContext({
        viewport: { width, height },
        isMobile: true,
        deviceScaleFactor: 1,
        hasTouch: true,
      });
      const tab = await mobile.newPage();
      watch(tab);
      await tab.goto(base);
      await idle(tab);
      await noOverflow(tab, `${width} home`);
      await shot(tab, `mobile-${width}-home`);
      const geometry = await tab.evaluate(() => {
        const heading = document
          .querySelector(".hero h1")
          .getBoundingClientRect();
        const selector = document
          .querySelector(".theme-selector")
          .getBoundingClientRect();
        const cards = [...document.querySelectorAll(".fan-card")].map((card) =>
          card.getBoundingClientRect(),
        );
        return {
          heading: { left: heading.left, right: heading.right },
          selectorTop: selector.top,
          cardsBottom: Math.max(...cards.map((card) => card.bottom)),
          width: innerWidth,
        };
      });
      assert.ok(
        geometry.heading.left >= 0 && geometry.heading.right <= width,
        `${width} clipped title: ${JSON.stringify(geometry)}`,
      );
      assert.ok(
        geometry.cardsBottom <= geometry.selectorTop,
        `${width} cards cover selector: ${JSON.stringify(geometry)}`,
      );
      await tab
        .getByRole("button", { name: "朋友就在身边？同屏开一局", exact: false })
        .click();
      await noOverflow(tab, `${width} local dialog`);
      await shot(tab, `mobile-${width}-dialog`);
      await tab.getByRole("textbox", { name: "今晚的朋友" }).fill("小夏, 阿圆");
      await tab
        .getByRole("button", { name: "洗牌，开始今晚的故事", exact: true })
        .click();
      await draw(tab, 1);
      await noOverflow(tab, `${width} game`);
      await shot(tab, `mobile-${width}-game`);
      await mobile.close();
    });
  }

  await check(
    "online room, late mobile join, sync, refresh, host transfer",
    async () => {
      const hostContext = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      });
      const guestContext = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      const lateContext = await browser.newContext({
        viewport: { width: 320, height: 740 },
        isMobile: true,
        hasTouch: true,
      });
      const host = await hostContext.newPage(),
        guest = await guestContext.newPage(),
        late = await lateContext.newPage();
      watch(host);
      watch(guest);
      watch(late);
      await host.goto(base);
      await idle(host);
      await host
        .getByRole("textbox", { name: "你的昵称", exact: true })
        .fill("房主测试");
      await host.getByRole("button", { name: "创建房间", exact: true }).click();
      await host.locator(".lobby-code").waitFor();
      const code = (await host.locator(".lobby-code").innerText()).trim();
      assert.match(code, /^\d{6}$/);
      await host.getByRole("button", { name: "邀请朋友", exact: true }).click();
      await host
        .getByRole("img", { name: `加入房间 ${code} 的二维码` })
        .waitFor();
      assert.match(
        await host
          .getByRole("img", { name: `加入房间 ${code} 的二维码` })
          .getAttribute("src"),
        /^data:image\/png;base64,/,
      );
      const invite = await host.locator(".invite-url").getAttribute("href");
      assert.equal(new URL(invite).searchParams.get("room"), code);
      if (!production) {
        assert.equal(new URL(invite).port, new URL(base).port);
        assert.notEqual(new URL(invite).hostname, "localhost");
      }
      await shot(host, "desktop-online-invite");
      await host.getByRole("button", { name: "关闭", exact: true }).click();

      const guestUrl = new URL(base);
      guestUrl.searchParams.set("room", code);
      await guest.goto(guestUrl.toString());
      await idle(guest);
      await guest
        .getByRole("dialog")
        .getByRole("textbox", { name: "你的昵称", exact: true })
        .fill("好友测试");
      assert.equal(
        await guest
          .getByRole("dialog")
          .getByRole("textbox", { name: "房间号", exact: true })
          .inputValue(),
        code,
      );
      await guest
        .getByRole("button", { name: "加入这桌", exact: true })
        .click();
      await guest.locator(".lobby").waitFor();
      await host.waitForFunction(
        () => document.querySelectorAll(".player").length === 2,
      );
      assert.ok(
        await guest
          .getByRole("button", { name: "等待房主开始", exact: true })
          .isDisabled(),
      );
      await host
        .getByRole("button", { name: "调整本局玩法", exact: true })
        .click();
      await host
        .getByRole("textbox", { name: "A 牌名称", exact: true })
        .fill("房间专属牌");
      await host.getByRole("button", { name: "保存玩法", exact: true }).click();
      await host
        .getByRole("button", { name: "人齐了，开始游戏", exact: true })
        .click();
      await guest.getByText("已揭晓 0 / 52 张", { exact: true }).waitFor();
      await draw(host, 1);
      await guest.getByText("已揭晓 1 / 52 张", { exact: true }).waitFor();
      await late.goto(guestUrl.toString());
      await idle(late);
      await late
        .getByRole("dialog")
        .getByRole("textbox", { name: "你的昵称", exact: true })
        .fill("迟到的好友");
      await late.getByRole("button", { name: "加入这桌", exact: true }).click();
      await late.getByText("已揭晓 1 / 52 张", { exact: true }).waitFor();
      assert.equal(await late.locator(".player").count(), 3);
      await noOverflow(late, "late mobile join");
      await guest.waitForFunction(
        () => document.querySelectorAll(".player").length === 3,
      );
      await draw(guest, 2);
      await late.getByText("已揭晓 2 / 52 张", { exact: true }).waitFor();
      await draw(late, 3);
      await host.getByText("已揭晓 3 / 52 张", { exact: true }).waitFor();
      await shot(late, "mobile-late-join-game");
      await leave(late);
      await host.waitForFunction(
        () => document.querySelectorAll(".player").length === 2,
      );
      const guestCard = await guest
        .locator(".flip-front .card-inner")
        .innerText();
      assert.equal(
        await host.locator(".flip-front .card-inner").innerText(),
        guestCard,
      );
      await guest.reload();
      await idle(guest);
      await guest.getByText("已揭晓 3 / 52 张", { exact: true }).waitFor();
      assert.equal(
        await guest.locator(".flip-front .card-inner").innerText(),
        guestCard,
      );
      await noOverflow(guest, "mobile online game");
      await shot(host, "desktop-online-game");
      await shot(guest, "mobile-online-game");
      await leave(host);
      await guest.waitForFunction(
        () => document.querySelectorAll(".player").length === 1,
      );
      await guest
        .getByRole("button", { name: "抽一张牌", exact: true })
        .waitFor();
      assert.equal(await guest.locator(".player svg.lucide-crown").count(), 1);
      await draw(guest, 4);
      await leave(guest);
      await hostContext.close();
      await guestContext.close();
      await lateContext.close();
    },
  );
  await desktop.close();
  await check("no browser page errors", () => assert.deepEqual(errors, []));
} finally {
  await browser.close();
  const result = {
    base,
    production,
    checks,
    failures,
    errors,
    createdAt: new Date().toISOString(),
  };
  await fs.writeFile(
    path.join(output, "browser-smoke.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
}
if (failures.length) process.exitCode = 1;
