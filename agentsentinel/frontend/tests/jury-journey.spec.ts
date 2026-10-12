import { test, expect } from "@playwright/test";
test("jury journey: explanation first, components, guided demo, review, containment, kill and recovery", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const admin = { "X-Admin-Token": "local-demo-admin" };
  await request.post("/api/system/release-stop", { headers: admin });
  for (const id of [
    "support-agent",
    "research-agent",
    "coding-agent",
    "finance-agent",
  ])
    await request.post(`/api/agents/${id}/resume`, { headers: admin });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "How AgentSentinel protects AI agents" }),
  ).toBeVisible();
  await expect(page.locator("nav button").first()).toHaveAccessibleName(
    "How It Works",
  );
  await expect(
    page.getByRole("button", { name: "Recruiter mode" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Engineer mode" })).toHaveCount(
    0,
  );
  await expect(page.locator(".jury-pipeline > li")).toHaveCount(6);
  await expect(page.locator(".jury-workflows article")).toHaveCount(3);
  await expect(page.locator(".component-table tbody tr")).toHaveCount(15);
  await expect(page.locator(".poc-boundary")).toContainText(
    "Configured evaluator: MOCK",
  );
  await page.screenshot({
    path: "test-results/jury-landing.png",
    animations: "disabled",
  });
  await page
    .locator("#jury-workflow")
    .screenshot({ path: "test-results/jury-workflow.png" });
  await page
    .locator("#jury-components")
    .screenshot({ path: "test-results/jury-components.png" });
  await page
    .getByRole("button", { name: "Security Operations", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Security operations", exact: true }),
  ).toBeVisible();
  await expect(page.locator("table tbody tr")).toHaveCount(4);
  await expect(page.locator(".gauge .recharts-pie-sector")).toHaveCount(2);
  await page.screenshot({ path: "test-results/dashboard.png", fullPage: true });
  await page.getByRole("button", { name: "How It Works", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "How AgentSentinel protects AI agents" }),
  ).toBeVisible();
  await page
    .getByText("Explore the technical architecture", { exact: true })
    .click();
  await expect(page.locator(".react-flow__node")).toHaveCount(11);
  await page.locator('.react-flow__node[data-id="policy"]').click();
  await expect(page.locator(".node-explanation h3")).toHaveText(
    "Policy Engine",
  );
  await expect(page.locator(".node-explanation")).toContainText(
    "DENY always wins",
  );
  await page.getByRole("button", { name: "BLOCK", exact: true }).click();
  await page.screenshot({
    path: "test-results/how-it-works.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "See it in action" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Start demo" }).click();
  await expect(
    dialog.getByRole("heading", { name: "A safe support search" }),
  ).toBeVisible();
  await expect(dialog).toContainText("ALLOWED");
  await dialog.getByRole("button", { name: "Continue" }).click();
  await expect(dialog).toContainText("HUMAN REVIEW");
  await dialog.getByRole("button", { name: "Continue" }).click();
  await expect(dialog).toContainText("BLOCKED");
  await expect(dialog).toContainText("98/100");
  await page.screenshot({ path: "test-results/secret-demo.png" });
  await dialog.getByRole("button", { name: "Continue" }).click();
  await expect(dialog).toContainText("Session revoked");
  await dialog.getByRole("button", { name: "Continue" }).click();
  await expect(
    dialog.getByRole("heading", { name: "Inspect the evidence" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Continue" }).click();
  await expect(dialog).toContainText("AWS_PRODUCTION_TOKEN");
  await dialog
    .getByRole("button", { name: "Keep quarantined", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Finish demo" }).click();
  await expect(
    dialog.getByRole("heading", { name: "Demo complete" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Explore the evidence" }).click();
  await expect(
    page.locator('.react-flow__node[data-id="AWS_PRODUCTION_TOKEN"]'),
  ).toBeVisible();
  await expect(page.locator(".path-chain").last()).toContainText(
    "read_prod_secret",
  );
  await page
    .getByRole("button", { name: "Event Inspector", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Why was this action blocked?" }),
  ).toBeVisible();
  await expect(page.locator(".decision-banner")).toContainText(
    "did not execute",
  );
  await page
    .getByRole("button", { name: "Show technical evidence", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Technical evidence" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/event-inspector.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Hide technical evidence", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Technical evidence" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Live Monitor", exact: true }).click();
  await page
    .locator(".timeline-row")
    .filter({ hasText: "create_payment_request" })
    .first()
    .click();
  await page.getByRole("button", { name: "Approve synthetic action" }).click();
  await expect(page.locator(".review-outcome")).toContainText("APPROVED");
  await page
    .getByRole("button", { name: "Emergency stop", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Emergency stop all agents", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Global emergency stop is engaged" }),
  ).toBeVisible();
  const agents = await (await request.get("/api/agents")).json();
  expect(agents.every((a: { status: string }) => a.status === "DISABLED")).toBe(
    true,
  );
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Release global stop" }).click();
  await expect(
    page.getByRole("heading", { name: "Global emergency stop is engaged" }),
  ).toHaveCount(0);
  for (const id of [
    "support-agent",
    "research-agent",
    "coding-agent",
    "finance-agent",
  ])
    await request.post(`/api/agents/${id}/resume`, { headers: admin });
  await page.getByRole("button", { name: "Audit Trail", exact: true }).click();
  await page.getByRole("button", { name: "Verify chain" }).click();
  await expect(page.locator(".info-callout")).toContainText("Verified");
  expect(errors).toEqual([]);
});

test("jury explanation stays readable on mobile and tablet without mode switches", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator(".component-table tbody tr")).toHaveCount(15);
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(
      page.getByRole("heading", { name: "What Makes It Work" }),
    ).toBeVisible();
    const layout = await page.evaluate(() => ({
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      overflowing: Array.from(document.querySelectorAll("main *"))
        .filter(
          (element) =>
            element.getBoundingClientRect().right > window.innerWidth + 1,
        )
        .slice(0, 8)
        .map((element) => element.className),
    }));
    expect(layout.scrollWidth, JSON.stringify(layout)).toBeLessThanOrEqual(
      layout.width,
    );
    await expect(page.locator(".jury-pipeline")).toContainText(
      "Automatic Kill Switch",
    );
    if (width === 390) {
      await page.locator("#jury-workflow").screenshot({
        path: "test-results/mobile-workflow.png",
        animations: "disabled",
      });
      await page
        .locator(".component-table tbody tr")
        .nth(3)
        .screenshot({ path: "test-results/mobile-ai-component.png" });
    }
  }
  expect(errors).toEqual([]);
});

test("policy editor validation, red team, all pages and mobile layout", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/#policies");
  await page.getByRole("button", { name: "YAML mode" }).click();
  const editor = page.getByRole("textbox", { name: "Policy YAML" });
  const previous = await editor.inputValue();
  await editor.fill("allow: [broken");
  await page.getByRole("button", { name: "Validate & save" }).click();
  await expect(page.getByRole("status")).toContainText("Invalid policy");
  await editor.fill(previous);
  await page.getByRole("button", { name: "Validate & save" }).click();
  await expect(page.locator(".success-message")).toContainText(
    "Validated policy saved",
  );
  await page.getByRole("button", { name: "Red Team Lab", exact: true }).click();
  await page
    .locator(".scenario-grid .panel")
    .filter({ has: page.getByRole("heading", { name: "Tool-chain escape" }) })
    .getByRole("button", { name: "Run scenario" })
    .click();
  await expect(page.locator(".lab-result")).toContainText(
    "Expected outcome confirmed",
  );
  await page.getByRole("button", { name: "Metrics", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Runtime metrics" }),
  ).toBeVisible();
  await expect(page.locator(".metrics-grid .panel")).toHaveCount(6);
  await page.getByRole("button", { name: "Alerts", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Alert center" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Agents", exact: true }).click();
  await expect(page.locator(".agent-cards .panel")).toHaveCount(4);
  await page
    .getByRole("button", { name: "Register agent", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("button", { name: "Security Operations", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Security operations", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/mobile-dashboard.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});
