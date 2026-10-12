# POC verification

Validated locally in Ubuntu WSL with Python 3.12 and Node.js 24, using `AI_PROVIDER=mock`.

| Check | Result |
| --- | --- |
| Backend enforcement suite | 28 passing tests |
| TypeScript + Vite production build | Passed |
| Browser jury journey | Passed |
| Browser policy / lab / mobile journey | Passed |
| Jury explanation at phone / tablet / desktop widths | Passed |
| Scenario runner | All eleven synthetic scenarios match the expected decision |
| `start.sh` readiness | Health and homepage return HTTP 200 |
| Ctrl+C cleanup | Both services stop, PID files removed, ports free |
| Docker Compose configuration | Validated |

The browser journey checks the default explanation page, first navigation item, six-stage workflow, 15-row component table, optional eleven-node architecture, clickable explanations, path selection, all guided-demo stages, blocked secret evidence, capability paths, on-demand technical evidence, human approval, global stop/recovery and audit verification. Another journey checks invalid and valid YAML, a transitive attack, metrics, alerts, the registration dialog and keyboard dismissal. A dedicated explanation check covers 390-, 768- and 1280-pixel viewports without document overflow.

Screenshots from these tests are in `frontend/test-results/`: jury landing, workflow, component table, mobile workflow and AI component, dashboard, optional architecture, secret demo and event inspector. Representative desktop and mobile screenshots were inspected visually during development. Generated screenshots and test artifacts are excluded from source control.

The launcher lifecycle test is reproducible:

```bash
# Services must be stopped first.
.venv/bin/python scripts/verify_lifecycle.py
```

Optional live AI adapters have not been exercised with real credentials. Docker Compose syntax was checked; container image builds and PostgreSQL were not part of the local mock verification. No real infrastructure, secrets, payments or outbound notification channels were used.
