import { test, expect } from "@playwright/test";

test("public GitHub URL fetches an actual commit and saves an honest runtime report", async ({
  page,
  request,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await request.post("/api/system/release-stop", {
    headers: { "X-Admin-Token": "local-demo-admin" },
  });
  await page.goto("/#commit");
  await page.getByRole("button", { name: /Real GitHub repository/ }).click();
  await expect(page.locator(".commit-demo-boundary")).toContainText(
    "Real repository. Real Sentinel checks. Synthetic tools.",
  );
  await page
    .getByRole("textbox", { name: "GitHub repository URL", exact: true })
    .fill("https://github.com/octocat/Hello-World");
  await page
    .getByRole("button", {
      name: "Fetch repository & run Sentinel",
      exact: true,
    })
    .click();
  await expect(page.locator(".commit-test-result")).toHaveText(
    "Runtime review: COMPLETE",
    { timeout: 35000 },
  );
  await expect(page.locator(".commit-run-meta")).toContainText(
    "octocat/Hello-World",
  );
  await expect(page.locator(".commit-run-meta")).toContainText(
    "Real commit · synthetic runner",
  );
  await expect(page.getByLabel("Real GitHub commit diff")).toContainText(
    "diff --git",
  );
  await expect(page.locator(".commit-console")).toContainText(
    "No repository code executed.",
  );
  await expect(page.locator(".commit-result")).toContainText(
    "Completion does not mean the repository is safe",
  );
  const downloadWait = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download evidence JSON" }).click();
  const download = await downloadWait;
  expect(download.suggestedFilename()).toMatch(
    /^sentinel-github-commit-.*\.json$/,
  );
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const report = JSON.parse(Buffer.concat(chunks).toString());
  expect(report.input_source).toBe("github");
  expect(report.simulation).toBe(true);
  expect(report.commit.fixture).toBe(false);
  expect(report.commit.sha).toMatch(/^[a-f0-9]{40}$/);
  expect(report.expected_met).toBeNull();
  expect(report.events).toHaveLength(3);
  expect(report.events[0].action.context.untrusted_diff).toBe(
    report.commit.diff,
  );
  await page.screenshot({
    path: "test-results/github-repository-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/github-repository-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.reload();
  await page.locator(".commit-history > button").first().click();
  await expect(page.locator(".commit-test-result")).toHaveText(
    "Runtime review: COMPLETE",
  );
  await expect(page.getByLabel("Real GitHub commit diff")).toContainText(
    "diff --git",
  );
  await page
    .getByRole("textbox", { name: "GitHub repository URL", exact: true })
    .fill("https://example.com/not-github");
  await page
    .getByRole("button", {
      name: "Fetch repository & run Sentinel",
      exact: true,
    })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Use an HTTPS github.com",
  );
  expect(errors).toEqual([]);
});
