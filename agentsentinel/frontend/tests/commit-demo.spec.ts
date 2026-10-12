import { test, expect } from "@playwright/test";

test("mock commit action proves safe execution, approval, containment, reports and mobile layout", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const admin = { "X-Admin-Token": "local-demo-admin" };
  await request.post("/api/system/release-stop", { headers: admin });
  await page.goto("/#commit");
  await expect(
    page.getByRole("heading", { name: "GitHub Integration", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".commit-demo-boundary")).toContainText(
    "Mock GitHub. Real Sentinel checks.",
  );
  await expect(
    page.getByRole("radio", { name: /Prompt-injection attack/ }),
  ).toBeChecked();
  await page.screenshot({
    path: "test-results/commit-demo-ready.png",
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Run mock GitHub Action", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Attack blocked. Agent contained.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".commit-test-result")).toHaveText(
    "Safety test: PASS",
  );
  await expect(page.locator(".commit-result-stats")).toContainText("98/100");
  await expect(page.locator(".commit-evidence-list > button")).toHaveCount(3);
  await expect(page.locator(".commit-console")).toContainText(
    "read_prod_secret → BLOCK",
  );
  await expect(page.locator(".commit-containment")).toContainText(
    "blocked retry",
  );
  await expect(page.locator(".commit-status")).toHaveText("completed");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    path: "test-results/commit-demo-contained.png",
    fullPage: true,
    animations: "disabled",
  });
  const downloadWait = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download evidence JSON" }).click();
  const download = await downloadWait;
  expect(download.suggestedFilename()).toMatch(
    /^sentinel-fixture-commit-.*\.json$/,
  );
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const report = JSON.parse(Buffer.concat(chunks).toString());
  expect(report.simulation).toBe(true);
  expect(
    report.events.map((event: { decision: string }) => event.decision),
  ).toEqual(["ALLOW", "BLOCK", "BLOCK"]);
  expect(report.summary.executed).toBe(1);
  await page
    .getByRole("button", { name: "Inspect blocked secret access", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Why was this action blocked?" }),
  ).toBeVisible();
  await expect(page.locator(".tool-call")).toContainText("read_prod_secret");
  await page
    .getByRole("button", { name: "GitHub Integration", exact: true })
    .click();
  await page.locator(".commit-history > button").first().click();
  await expect(
    page.getByRole("heading", { name: "Attack blocked. Agent contained." }),
  ).toBeVisible();
  await page.getByRole("radio", { name: /Safe code review/ }).click();
  await page
    .getByRole("button", { name: "Run mock GitHub Action", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Safety checks passed", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".commit-test-result")).toHaveText(
    "Safety test: PASS",
  );
  await expect(page.locator(".commit-console")).toContainText(
    "generate_patch → ALLOW",
  );
  await page.getByRole("radio", { name: /Patch needs approval/ }).click();
  await page
    .getByRole("button", { name: "Run mock GitHub Action", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Patch held for human approval",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".commit-evidence-list")).toContainText(
    "Held for approval",
  );
  await page
    .getByRole("button", { name: "Approve synthetic patch", exact: true })
    .click();
  await expect(page.locator(".commit-review-result")).toContainText("APPROVED");
  await expect(page.locator(".commit-status")).toHaveText("completed");
  await page.getByRole("radio", { name: /Patch needs approval/ }).click();
  await page
    .getByRole("button", { name: "Run mock GitHub Action", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Reject patch", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reject patch", exact: true }).click();
  await expect(page.locator(".commit-review-result")).toContainText("REJECTED");
  await page.getByRole("radio", { name: /Safe code review/ }).click();
  await page
    .getByRole("textbox", { name: "GitHub commit URL" })
    .fill("https://example.com/not-github");
  await page
    .getByRole("button", { name: "Run mock GitHub Action", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Use an HTTPS github.com",
  );
  await page.getByRole("radio", { name: /Prompt-injection attack/ }).click();
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "Run mock GitHub Action", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Attack blocked. Agent contained.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".commit-status")).toHaveText("completed");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".commit-result").screenshot({
    path: "test-results/commit-demo-mobile-proof.png",
    animations: "disabled",
  });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    path: "test-results/commit-demo-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});
