import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

const shotDir = "tests/e2e/screenshots";

test.beforeAll(() => {
  mkdirSync(shotDir, { recursive: true });
});

test("deployed Neon Runner smoke", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  await page.goto("/");
  await expect(page.locator("#game-canvas")).toBeVisible();
  await expect(page.locator(".brand h1")).toHaveText("NEON RUNNER");
  await expect(page.locator("#hud")).toBeVisible();

  const hasHook = await page.evaluate(() => Boolean(window.__NEON_RUNNER__));
  expect(hasHook).toBe(false);

  const webgl = await page.evaluate(() => {
    const el = document.getElementById("game-canvas");
    if (!(el instanceof HTMLCanvasElement)) return false;
    return Boolean(el.getContext("webgl2") || el.getContext("webgl"));
  });
  expect(webgl).toBe(true);

  await page.screenshot({ path: `${shotDir}/prod-start.png`, fullPage: true });

  for (const file of ["/audio/bgm.ogg", "/audio/jump.ogg", "/audio/collect.ogg", "/audio/crash.ogg"]) {
    const res = await page.request.get(file);
    expect(res.status(), file).toBe(200);
  }

  await page.locator("#btn-start").click();
  await expect(page.locator("#hud")).toHaveAttribute("data-mode", "running");
  await expect(page.locator("#hud")).toHaveAttribute("data-audio-unlocked", "true");

  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#hud")).toHaveAttribute("data-lane", "1");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#hud")).toHaveAttribute("data-lane", "1");
  await page.keyboard.press(" ");
  await expect.poll(async () => page.locator("#hud").getAttribute("data-last-sfx")).toBe("jump");
  await expect.poll(async () => page.locator("#hud").getAttribute("data-grounded"), {
    timeout: 4000,
  }).toBe("true");

  await page.locator("#btn-sound").click();
  await expect(page.locator("#btn-sound")).toHaveAttribute("data-sound", "off");
  await page.locator("#btn-sound").click();
  await expect(page.locator("#btn-sound")).toHaveAttribute("data-sound", "on");

  await expect.poll(async () => page.locator("#hud").getAttribute("data-mode"), {
    timeout: 45000,
  }).toBe("gameover");
  await expect(page.locator("#btn-again")).toBeVisible();
  await expect.poll(async () => Number(await page.locator("#hud").getAttribute("data-sfx-crash"))).toBeGreaterThan(0);
  await page.screenshot({ path: `${shotDir}/prod-gameover.png`, fullPage: true });

  await page.locator("#btn-again").click();
  await expect(page.locator("#hud")).toHaveAttribute("data-mode", "running");
  await expect(page.locator("#hud")).toHaveAttribute("data-energy", "0");
  await expect(page.locator("#hud")).toHaveAttribute("data-lane", "0");
  await expect(page.locator("#hud")).toHaveAttribute("data-audio-unlocked", "true");
  const restartedDistance = Number(await page.locator("#hud").getAttribute("data-distance"));
  expect(restartedDistance).toBeLessThan(25);

  expect(errors, errors.join("\n")).toEqual([]);
});

test("deployed Neon Runner static hardening", async ({ page }) => {
  const thirdParty: string[] = [];
  page.on("request", (req) => {
    const url = req.url();
    if (
      !url.startsWith("https://demo.johnwehland.com/") &&
      !url.startsWith("http://demo.johnwehland.com/") &&
      !url.startsWith("data:") &&
      !url.startsWith("blob:") &&
      !url.startsWith("about:")
    ) {
      thirdParty.push(url);
    }
  });

  await page.goto("/");
  await expect(page.locator("#game-canvas")).toBeVisible();
  expect(await page.evaluate(() => Boolean(window.__NEON_RUNNER__))).toBe(false);

  for (const path of ["/.env", "/.git/config", "/package.json", "/src/"]) {
    const res = await page.request.get(path);
    expect(res.status(), path).toBeGreaterThanOrEqual(400);
  }

  const options = await page.request.fetch("/", { method: "OPTIONS" });
  expect(options.status()).toBeGreaterThanOrEqual(400);

  await page.locator("#btn-start").click();
  await expect(page.locator("#hud")).toHaveAttribute("data-mode", "running");
  expect(thirdParty, thirdParty.join("\n")).toEqual([]);
});
