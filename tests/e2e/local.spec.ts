import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

const shotDir = "tests/e2e/screenshots";

test.beforeAll(() => {
  mkdirSync(shotDir, { recursive: true });
});

test("Neon Runner local gate", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  await page.goto("/");
  const canvas = page.locator("#game-canvas");
  await expect(canvas).toBeVisible();
  await expect(page.locator(".brand h1")).toHaveText("NEON RUNNER");
  await expect(page.locator("#hud")).toBeVisible();
  await expect(page.locator("#btn-start")).toBeVisible();
  await expect(page.locator("#btn-sound")).toHaveAttribute("data-sound", "on");

  for (const file of ["/audio/bgm.ogg", "/audio/jump.ogg", "/audio/collect.ogg", "/audio/crash.ogg"]) {
    const res = await page.request.get(file);
    expect(res.status(), file).toBe(200);
  }

  const webgl = await page.evaluate(() => {
    const el = document.getElementById("game-canvas");
    if (!(el instanceof HTMLCanvasElement)) return false;
    return Boolean(el.getContext("webgl2") || el.getContext("webgl"));
  });
  expect(webgl).toBe(true);

  await page.screenshot({ path: `${shotDir}/local-start.png`, fullPage: true });

  await page.locator("#btn-start").click();
  await expect(page.locator("#hud")).toHaveAttribute("data-mode", "running");
  await expect(page.locator("#hud")).toHaveAttribute("data-audio-unlocked", "true");
  await expect(page.locator("#hud")).toHaveAttribute("data-heading", /^-?\d/);
  await expect(page.locator("#hud")).toHaveAttribute("data-elev", /^-?\d/);
  await expect(page.locator("#hud")).toHaveAttribute("data-break-ahead", /^(true|false)$/);

  const apiReady = await page.evaluate(() => Boolean(window.__NEON_RUNNER__));
  expect(apiReady).toBe(true);

  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#hud")).toHaveAttribute("data-lane", "1");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#hud")).toHaveAttribute("data-lane", "1");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator("#hud")).toHaveAttribute("data-lane", "-1");
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator("#hud")).toHaveAttribute("data-lane", "-1");
  await page.keyboard.press("d");
  await page.keyboard.press("d");
  await expect(page.locator("#hud")).toHaveAttribute("data-lane", "1");

  await page.evaluate(() => window.__NEON_RUNNER__?.setLane(0));
  await page.keyboard.press(" ");
  await expect(page.locator("#hud")).toHaveAttribute("data-grounded", "false");
  await expect(page.locator("#hud")).toHaveAttribute("data-last-sfx", "jump");
  await page.evaluate(() => window.__NEON_RUNNER__?.airborneMove("left"));
  await expect(page.locator("#hud")).toHaveAttribute("data-lane", "-1");
  await page.evaluate(() => window.__NEON_RUNNER__?.setLane(0));
  const jumpCount = await page.locator("#hud").getAttribute("data-sfx-jump");
  const doubleJump = await page.evaluate(() => {
    const api = window.__NEON_RUNNER__;
    if (!api) throw new Error("missing test api");
    const before = api.getState().vy;
    api.jump();
    const after = api.getState();
    return { before, afterVy: after.vy, grounded: after.grounded };
  });
  expect(doubleJump.grounded).toBe(false);
  expect(doubleJump.afterVy).toBe(doubleJump.before);
  await expect(page.locator("#hud")).toHaveAttribute("data-sfx-jump", jumpCount ?? "1");
  await expect.poll(async () => page.locator("#hud").getAttribute("data-grounded")).toBe("true");

  await page.evaluate(() => {
    const api = window.__NEON_RUNNER__;
    if (!api) throw new Error("missing test api");
    for (let i = 0; i < 90; i++) api.tick(0.05);
    api.forceSpawn("obstacle", 1, "tall");
    api.forceSpawn("orb", -1);
  });
  const afterSpawn = await page.evaluate(() => window.__NEON_RUNNER__?.getPoolCounts());
  expect(afterSpawn?.obstaclesActive).toBeGreaterThan(0);
  expect(afterSpawn?.orbsActive).toBeGreaterThan(0);
  expect(afterSpawn?.segments).toBe(18);
  expect(afterSpawn?.obstaclesCapacity).toBe(20);
  expect(afterSpawn?.orbsCapacity).toBe(20);

  await page.evaluate(() => {
    const api = window.__NEON_RUNNER__;
    if (!api) throw new Error("missing test api");
    for (let i = 0; i < 400; i++) api.tick(0.05);
  });
  const afterLong = await page.evaluate(() => window.__NEON_RUNNER__?.getPoolCounts());
  expect(afterLong?.segments).toBe(18);
  expect(afterLong?.obstaclesCapacity).toBe(20);
  expect(afterLong?.orbsCapacity).toBe(20);
  expect(afterLong?.children).toBe(afterSpawn?.children);

  await page.evaluate(() => {
    const api = window.__NEON_RUNNER__;
    if (!api) throw new Error("missing test api");
    api.pause();
    api.reset();
    api.forceSpawn("orb", 0);
    api.forceCollect();
  });
  await expect(page.locator("#hud")).toHaveAttribute("data-energy", "1");
  await expect(page.locator("#hud")).toHaveAttribute("data-last-sfx", "collect");

  await page.evaluate(() => window.__NEON_RUNNER__?.forceCrash());
  await expect(page.locator("#hud")).toHaveAttribute("data-mode", "gameover");
  await expect(page.locator("#hud")).toHaveAttribute("data-last-sfx", "crash");
  const crashCount = await page.locator("#hud").getAttribute("data-sfx-crash");
  expect(Number(crashCount)).toBeGreaterThan(0);
  await page.evaluate(() => window.__NEON_RUNNER__?.forceCrash());
  await expect(page.locator("#hud")).toHaveAttribute("data-sfx-crash", crashCount ?? "1");
  await expect(page.locator("#btn-again")).toBeVisible();
  await page.screenshot({ path: `${shotDir}/local-gameover.png`, fullPage: true });

  await page.evaluate(() => window.__NEON_RUNNER__?.pause());
  await page.locator("#btn-sound").click();
  await expect(page.locator("#btn-sound")).toHaveAttribute("data-sound", "off");
  await expect(page.locator("#hud")).toHaveAttribute("data-muted", "true");
  await page.locator("#btn-sound").click();
  await expect(page.locator("#btn-sound")).toHaveAttribute("data-sound", "on");
  await expect(page.locator("#hud")).toHaveAttribute("data-muted", "false");

  await page.locator("#btn-again").click();
  await expect(page.locator("#hud")).toHaveAttribute("data-mode", "running");
  await expect(page.locator("#hud")).toHaveAttribute("data-audio-unlocked", "true");
  await expect(page.locator("#hud")).toHaveAttribute("data-energy", "0");
  await expect(page.locator("#hud")).toHaveAttribute("data-distance", "0");
  await expect(page.locator("#hud")).toHaveAttribute("data-lane", "0");
  await page.evaluate(() => window.__NEON_RUNNER__?.resume());

  const size = page.viewportSize();
  await page.setViewportSize({ width: 900, height: 700 });
  await page.waitForTimeout(150);
  const stillWebgl = await page.evaluate(() => {
    const el = document.getElementById("game-canvas");
    if (!(el instanceof HTMLCanvasElement)) return false;
    return el.width > 0 && el.height > 0;
  });
  expect(stillWebgl).toBe(true);
  if (size) await page.setViewportSize(size);

  await page.evaluate(() => {
    const api = window.__NEON_RUNNER__;
    if (!api) throw new Error("missing test api");
    for (let i = 0; i < 400; i++) api.tick(0.05);
  });
  const extended = await page.evaluate(() => window.__NEON_RUNNER__?.getPoolCounts());
  expect(extended?.segments).toBe(18);
  expect(extended?.obstaclesCapacity).toBe(20);

  expect(errors, errors.join("\n")).toEqual([]);
});
