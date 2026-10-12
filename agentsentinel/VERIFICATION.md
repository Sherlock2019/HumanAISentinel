# POC verification

Validated locally in Ubuntu WSL with Python 3.12 and Node.js 24, using `AI_PROVIDER=mock`.

| Check | Result |
| --- | --- |
| Backend and launcher suite | 82 passing tests |
| TypeScript + Vite production build | Passed |
| Browser jury journey | Passed |
| Browser policy / lab / mobile journey | Passed |
| Jury explanation at phone / tablet / desktop widths | Passed |
| Mock GitHub commit journey | Passed |
| Real public GitHub repository journey | Passed; live `octocat/Hello-World` commit fetched, gateway checked, report exported and reloaded |
| Scenario runner | All eleven synthetic scenarios match the expected decision |
| `start.sh` readiness | Health and homepage return HTTP 200 on API 8100 / dashboard 5174 |
| Ctrl+C cleanup | Both services stop, PID files removed, ports free |
| Automatic restart safety | Repeated restarts replace owned services; unrelated processes survive (isolated fake services) |
| Docker Compose configuration | Validated |

The browser journey checks the default explanation page, first navigation item, six-stage workflow, 15-row component table, optional eleven-node architecture, clickable explanations, path selection, all guided-demo stages, blocked secret evidence, capability paths, on-demand technical evidence, human approval, global stop/recovery and audit verification. Another journey checks invalid and valid YAML, a transitive attack, metrics, alerts, the registration dialog and keyboard dismissal. A dedicated explanation check covers 390-, 768- and 1280-pixel viewports without document overflow.

The mock commit journey checks three scenarios, approval and rejection, blocked secret access and retry, an exported JSON report, event-inspector navigation, persisted history, invalid commit URL handling and responsive layout. Backend tests additionally check admin/confirmation requirements, step retry idempotency, session supersession, pending-approval cancellation, current-policy enforcement and global-stop behavior. These are local mocked GitHub runs, not actual Actions executions.

The real-repository browser journey fetched a public commit through the actual GitHub API, verified the real diff and SHA in exported evidence, exercised all three gateway steps, reloaded persisted history, rejected a non-GitHub URL and checked 390-, 768- and 1280-pixel layouts. All five browser journeys passed on isolated local ports with a separate QA database. Desktop and mobile screenshots were visually inspected. No repository code or GitHub Actions were executed; the judge remained `mock` and tool receipts remained synthetic.

The 28 GitHub intake backend tests use a mocked HTTP transport to cover read-only requests, actual-diff propagation, prompt-injection containment, SSRF/path validation, branch encoding, admin/reset/global-stop gates, GitHub error statuses, refusal to follow redirects, response/diff/file limits, omitted patches, private repositories and approval holds on earlier workflow steps.

Screenshots from these tests are in `frontend/test-results/`: jury landing, workflow, component table, mobile workflow and AI component, dashboard, optional architecture, secret demo and event inspector. Representative desktop and mobile screenshots were inspected visually during development. Generated screenshots and test artifacts are excluded from source control.

The launcher lifecycle test is reproducible:

```bash
# Services must be stopped first.
.venv/bin/python scripts/verify_lifecycle.py
```

Restart regression tests run without binding demo ports:

```bash
.venv/bin/pytest backend/tests/test_launcher.py -q
```

These tests execute the real launchers against isolated fake services, check two consecutive replacements and PID-file ownership, and verify that a stale PID belonging to another directory is not stopped. They also check custom port normalization, frontend proxy propagation and invalid-port rejection before stopping an existing run. The separate `AIsentinelbyclaude` copy on ports 8000 and 5173 is left untouched. This workspace now defaults to 8100 and 5174; live startup readiness and SIGINT cleanup passed on those ports.

Optional live AI adapters have not been exercised with real credentials. Docker Compose syntax was checked; container image builds and PostgreSQL were not part of the local mock verification. Real public GitHub data was fetched read-only. No real infrastructure mutations, secret access, payments or outbound notification channels were used.
