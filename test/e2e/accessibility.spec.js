import fs from "node:fs";
import { createRequire } from "node:module";
import { expect, test } from "@playwright/test";

const require = createRequire(import.meta.url);
const axeSource = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

test("all main views have no serious or critical automated accessibility violations", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Persönlicher Zugangscode").fill("synthetic-access-code");
  await page.getByRole("button", { name: "Kompass öffnen" }).click();
  await expect(page.locator(".next-card")).toBeVisible();
  await page.evaluate(axeSource);
  const contrastRatios = await page.locator(".chip.active, .button[data-task-action=done]").evaluateAll(elements => {
    function rgb(value) {
      return value.match(/[\d.]+/g).slice(0, 3).map(Number);
    }
    function luminance(color) {
      const channels = rgb(color).map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
      return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
    }
    return elements.map(element => {
      const style = globalThis.getComputedStyle(element);
      const foreground = luminance(style.color);
      const background = luminance(style.backgroundColor);
      return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05);
    });
  });
  expect(contrastRatios.every(value => value >= 4.5)).toBe(true);
  for (const route of ["heute", "kalender", "listen", "tagebuch", "dokumente", "coach", "mehr"]) {
    await page.evaluate(name => { globalThis.location.hash = `#/${name}`; }, route);
    await expect(page.locator(`[data-view="${route}"]`)).toHaveClass(/active/);
    const result = await page.evaluate(async () => globalThis.axe.run(globalThis.document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
      rules: { "color-contrast": { enabled: false } }
    }));
    const blocking = result.violations.filter(item => ["serious", "critical"].includes(item.impact));
    expect(blocking, `${route}: ${blocking.map(item => `${item.id}: ${item.help}`).join("\n")}`).toEqual([]);
  }
});
