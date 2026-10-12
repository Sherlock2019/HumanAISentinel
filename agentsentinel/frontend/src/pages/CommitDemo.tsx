import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Bell,
  Bot,
  CheckCircle2,
  Circle,
  Download,
  FileCode2,
  GitBranch,
  GitCommitHorizontal,
  Github,
  Info,
  LoaderCircle,
  Lock,
  Play,
  ShieldCheck,
  Terminal,
  UserCheck,
} from "lucide-react";
import { api, post, time } from "../api/client";
import { Badge, Panel } from "../components/ui";
import type { CommitExample, CommitRun, SentinelEvent } from "../types";

export default function CommitDemo({
  onInspect,
  onRefresh,
}: {
  onInspect: (event: SentinelEvent) => void;
  onRefresh: () => void;
}) {
  const [examples, setExamples] = useState<CommitExample[]>([]);
  const [selected, setSelected] = useState("injection");
  const [source, setSource] = useState<"fixture" | "github">("fixture");
  const [repoUrl, setRepoUrl] = useState(
    "https://github.com/Sherlock2019/HumanAISentinel",
  );
  const [ref, setRef] = useState("");
  const [url, setUrl] = useState("");
  const [trigger, setTrigger] = useState("push");
  const [confirm, setConfirm] = useState(true);
  const [run, setRun] = useState<CommitRun | null>(null);
  const [history, setHistory] = useState<CommitRun[]>([]);
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState("");
  const [loading, setLoading] = useState(true);
  const active = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    Promise.all([
      api<CommitExample[]>("/api/commit-demo/examples"),
      api<CommitRun[]>("/api/commit-demo/runs"),
    ])
      .then(([choices, runs]) => {
        if (!mounted.current) return;
        setExamples(choices);
        setHistory(runs);
        setUrl(
          choices.find((choice) => choice.id === "injection")?.commit.url || "",
        );
      })
      .catch((e) => {
        if (mounted.current) setIssue((e as Error).message);
      })
      .finally(() => {
        if (mounted.current) setLoading(false);
      });
    return () => {
      mounted.current = false;
    };
  }, []);
  const example = examples.find((choice) => choice.id === selected);
  const real = run ? run.input_source === "github" : source === "github";
  const commit = run?.commit || (real ? undefined : example?.commit);
  const plan = run?.plan || example?.plan || [];
  const critical = run?.events.find(
    (event) =>
      event.decision === "BLOCK" && event.action.tool === "read_prod_secret",
  );
  const pending = run?.events.find(
    (event) => event.review_status === "PENDING",
  );
  function choose(choice: CommitExample) {
    setSource("fixture");
    setSelected(choice.id);
    setUrl(choice.commit.url);
    setRun(null);
    setIssue("");
  }
  async function refreshHistory() {
    const runs = await api<CommitRun[]>("/api/commit-demo/runs");
    if (mounted.current) setHistory(runs);
  }
  async function execute(resume = false) {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    setIssue("");
    try {
      let current =
        resume && run
          ? await api<CommitRun>(`/api/commit-demo/runs/${run.id}`)
          : await post<CommitRun>("/api/commit-demo/runs", {
              example_id: selected,
              ...(source === "github"
                ? { example_id: "github", repo_url: repoUrl, ref }
                : {}),
              commit_url: url,
              trigger: source === "github" ? "workflow_dispatch" : trigger,
              reset_agent: confirm,
            });
      if (!mounted.current) return;
      setRun(current);
      while (
        mounted.current &&
        current.cursor < current.plan.length &&
        current.workflow_status === "RUNNING"
      ) {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        if (!mounted.current) break;
        current = await post<CommitRun>(
          `/api/commit-demo/runs/${current.id}/advance`,
          { expected_step: current.cursor },
        );
        if (mounted.current) setRun(current);
      }
      await onRefresh();
      if (mounted.current) await refreshHistory();
    } catch (e) {
      if (mounted.current) setIssue((e as Error).message);
    } finally {
      active.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function review(choice: "APPROVE" | "REJECT") {
    if (!pending || !run || active.current) return;
    active.current = true;
    setBusy(true);
    setIssue("");
    try {
      await post(`/api/events/${pending.id}/review`, { decision: choice });
      const updated = await api<CommitRun>(`/api/commit-demo/runs/${run.id}`);
      if (mounted.current) setRun(updated);
      await onRefresh();
      await refreshHistory();
    } catch (e) {
      setIssue((e as Error).message);
    } finally {
      active.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function selectHistory(item: CommitRun) {
    setIssue("");
    try {
      const updated = await api<CommitRun>(`/api/commit-demo/runs/${item.id}`);
      setRun(updated);
      setSource(updated.input_source === "github" ? "github" : "fixture");
      setSelected(
        updated.example_id === "github" ? "safe" : updated.example_id,
      );
      if (updated.input_source === "github") {
        setRepoUrl(
          updated.commit.repo_url ||
            `https://github.com/${updated.commit.repository}`,
        );
        setRef(updated.commit.sha);
      }
      setUrl(updated.commit.url);
      setTrigger(updated.trigger);
    } catch (e) {
      setIssue((e as Error).message);
    }
  }
  async function download() {
    if (!run) return;
    try {
      const report = await api<CommitRun>(`/api/commit-demo/runs/${run.id}`);
      setRun(report);
      const blobUrl = URL.createObjectURL(
        new Blob([JSON.stringify(report, null, 2)], {
          type: "application/json",
        }),
      );
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = `sentinel-${report.input_source}-commit-${report.commit.sha.slice(0, 7)}-${report.id.slice(0, 8)}.json`;
      anchor.click();
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      setIssue((e as Error).message);
    }
  }
  const resultTitle =
    run?.workflow_status === "WAITING_APPROVAL"
      ? real
        ? "Action held for human approval"
        : "Patch held for human approval"
      : run?.workflow_status === "SUPERSEDED"
        ? "Run superseded by a new sandbox session"
        : run?.test_status === "FAIL"
          ? "Demo expectation differs from current policy"
          : run?.contained
            ? real
              ? "Repository input flagged. Agent contained."
              : "Attack blocked. Agent contained."
            : run?.workflow_status === "CANCELLED"
              ? "Pending action cancelled"
              : run?.test_status === "COMPLETE"
                ? "Repository runtime review complete"
                : run?.test_status === "PASS"
                  ? "Safety checks passed"
                  : "Sentinel is checking the agent’s actions";
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            GITHUB COMMIT → AGENT ACTIONS → SAFETY EVIDENCE
          </div>
          <h1>GitHub Integration</h1>
          <p>
            Test with a real public repository or explore three guided demo
            scenarios.
          </p>
        </div>
        <span className="sandbox-pill commit-mock-label">
          <Github size={16} />{" "}
          {real
            ? "Real GitHub input · sandbox tools"
            : "Mock GitHub integration"}
        </span>
      </div>
      <div className="commit-demo-boundary">
        <Info size={20} />
        <p>
          {real ? (
            <>
              <strong>
                Real repository. Real Sentinel checks. Synthetic tools.
              </strong>{" "}
              Fetches the latest commit diff from public GitHub (or a chosen
              branch / SHA). The diff is sent to your configured safety judge.
              No clone, repository code execution, actual GitHub Actions run or
              GitHub writes. This is a runtime review, not a full-repo security
              scan.
            </>
          ) : (
            <>
              <strong>Mock GitHub. Real Sentinel checks.</strong> Commit URLs
              are labels; code comes from the selected fixture. No GitHub fetch,
              actual Actions run, shell execution or merge occurs. The agent is
              scripted and tools are synthetic.
            </>
          )}
        </p>
      </div>
      <ol
        className="commit-story"
        aria-label="GitHub integration demo workflow"
      >
        {[
          [GitCommitHorizontal, "Commit submitted"],
          [Github, real ? "Real diff fetched" : "Mock Action triggered"],
          [Bot, "Agent proposes tools"],
          [ShieldCheck, "Sentinel checks"],
          [FileCode2, "Evidence saved"],
        ].map(([Icon, title], i) => {
          const I = Icon as typeof Bot;
          return (
            <li key={String(title)}>
              <I size={19} />
              <span>{String(title)}</span>
              {i < 4 && <ArrowRight size={15} className="commit-story-arrow" />}
            </li>
          );
        })}
      </ol>
      {issue && (
        <div className="offline-banner" role="alert">
          <Info size={20} />
          <div>
            <strong>Could not complete the demo</strong>
            <p>{issue}</p>
          </div>
        </div>
      )}
      {loading && (
        <p className="commit-loading" role="status">
          <LoaderCircle className="spinning" size={18} /> Loading commit
          fixtures…
        </p>
      )}
      {!loading && example && (
        <div
          className="commit-source-switch"
          role="group"
          aria-label="GitHub input source"
        >
          <button
            type="button"
            aria-pressed={source === "fixture"}
            disabled={busy}
            onClick={() => {
              setSource("fixture");
              setRun(null);
              setIssue("");
            }}
          >
            <Play size={18} />
            <span>
              <strong>Guided demo</strong>
              <small>Three predictable scenarios · offline</small>
            </span>
          </button>
          <button
            type="button"
            aria-pressed={source === "github"}
            disabled={busy}
            onClick={() => {
              setSource("github");
              setSelected("safe");
              setRun(null);
              setIssue("");
            }}
          >
            <Github size={18} />
            <span>
              <strong>Real GitHub repository</strong>
              <small>Fetch a public commit · internet required</small>
            </span>
          </button>
        </div>
      )}
      {!loading && example && (
        <div className="commit-demo-layout">
          <div className="commit-composer">
            <Panel
              title={
                real
                  ? "1 · Enter a public GitHub repository"
                  : "1 · Choose a commit scenario"
              }
              subtitle={
                real
                  ? "Read-only GitHub access. No account or API key needed."
                  : "Three outcomes. No GitHub account or API key needed."
              }
            >
              <div className="commit-form">
                {!real && (
                  <div
                    className="commit-examples"
                    role="radiogroup"
                    aria-label="Commit scenario"
                  >
                    {examples.map((choice) => {
                      const I =
                        choice.id === "injection"
                          ? Lock
                          : choice.id === "approval"
                            ? UserCheck
                            : CheckCircle2;
                      return (
                        <button
                          key={choice.id}
                          type="button"
                          role="radio"
                          aria-checked={selected === choice.id}
                          disabled={busy}
                          className={selected === choice.id ? "selected" : ""}
                          onClick={() => choose(choice)}
                        >
                          <I size={19} />
                          <span>
                            <strong>{choice.title}</strong>
                            <small>
                              {choice.id === "injection"
                                ? "Block + quarantine + blocked retry"
                                : choice.id === "approval"
                                  ? "Hold the write until a person decides"
                                  : "Allow authorized sandbox actions"}
                            </small>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <p className="commit-scenario-description">
                  {real
                    ? "Fetch real changed-file patches, then evaluate a fixed read / sandbox-test / patch-proposal plan through Sentinel. Test and patch receipts remain synthetic."
                    : example.description}
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void execute();
                  }}
                >
                  {real ? (
                    <>
                      <label htmlFor="repo-url">GitHub repository URL</label>
                      <input
                        id="repo-url"
                        type="url"
                        required
                        value={repoUrl}
                        disabled={busy}
                        onChange={(e) => {
                          setRepoUrl(e.target.value);
                          setRun(null);
                        }}
                        placeholder="https://github.com/owner/repository"
                      />
                      <label htmlFor="repo-ref">
                        Branch or commit SHA <small>optional</small>
                      </label>
                      <input
                        id="repo-ref"
                        type="text"
                        value={ref}
                        disabled={busy}
                        maxLength={200}
                        onChange={(e) => {
                          setRef(e.target.value);
                          setRun(null);
                        }}
                        placeholder="Leave blank for latest commit on default branch"
                      />
                      <small className="commit-footnote">
                        Public repos only. Reads up to 30 changed files and
                        20,000 diff characters; omissions are shown. Public code
                        is passed to the configured judge (mock by default).
                      </small>
                    </>
                  ) : (
                    <>
                      <label htmlFor="commit-url">
                        GitHub commit URL <small>demo label only</small>
                      </label>
                      <input
                        id="commit-url"
                        type="url"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        disabled={busy}
                        placeholder="https://github.com/owner/repo/commit/SHA"
                      />
                      <label htmlFor="commit-trigger">Simulated trigger</label>
                      <select
                        id="commit-trigger"
                        value={trigger}
                        onChange={(e) => setTrigger(e.target.value)}
                        disabled={busy}
                      >
                        <option value="push">Push a commit</option>
                        <option value="pull_request">
                          Open / update a pull request
                        </option>
                        <option value="workflow_dispatch">
                          Run workflow manually
                        </option>
                      </select>
                    </>
                  )}
                  <label className="commit-reset">
                    <input
                      type="checkbox"
                      checked={confirm}
                      onChange={(e) => setConfirm(e.target.checked)}
                      disabled={busy}
                    />
                    <span>
                      Reset only CodingAgent’s demo session and active behavior
                      window; cancel its pending reviews. Preserve all event and
                      audit evidence.
                    </span>
                  </label>
                  <button
                    className="primary commit-run-button"
                    type="submit"
                    disabled={busy || !confirm}
                  >
                    {busy ? (
                      <LoaderCircle size={17} className="spinning" />
                    ) : (
                      <Play size={17} />
                    )}
                    {busy
                      ? "Running Sentinel checks…"
                      : real
                        ? "Fetch repository & run Sentinel"
                        : "Run mock GitHub Action"}
                  </button>
                </form>
                <small className="commit-footnote">
                  Your policies stay unchanged. A global emergency stop is never
                  released automatically.
                </small>
              </div>
            </Panel>
            <Panel
              title={
                real
                  ? "2 · Real GitHub commit content"
                  : "2 · Commit content (fixture)"
              }
              subtitle="Untrusted input, displayed as text—not executed."
            >
              <div className="commit-file-heading">
                <FileCode2 size={17} />
                <strong>{commit?.file || "Repository not fetched yet"}</strong>
                <span>{real ? "GitHub API diff" : "mock diff"}</span>
              </div>
              {commit?.notices && commit.notices.length > 0 && (
                <div className="commit-coverage" role="status">
                  <strong>Limited coverage — not a full repository scan</strong>
                  {commit.notices.map((notice) => (
                    <p key={notice}>{notice}</p>
                  ))}
                </div>
              )}
              {real && commit?.files && (
                <p className="commit-coverage">
                  {commit.files.length} changed files included · commit{" "}
                  {commit.sha.slice(0, 7)} · fetched from GitHub
                </p>
              )}
              <pre
                className="commit-diff"
                aria-label={
                  real ? "Real GitHub commit diff" : "Mock commit diff"
                }
              >
                <code>
                  {!commit &&
                    "Enter a public repository URL and click Fetch repository & run Sentinel to load its latest commit."}
                  {commit?.diff.split("\n").map((line, i) => (
                    <span
                      key={i}
                      className={
                        line.startsWith("+") && !line.startsWith("+++")
                          ? "diff-added"
                          : line.startsWith("-") && !line.startsWith("---")
                            ? "diff-removed"
                            : ""
                      }
                    >
                      {line || " "}
                      {"\n"}
                    </span>
                  ))}
                </code>
              </pre>
            </Panel>
          </div>
          <div className="commit-runner">
            <Panel
              title={
                real ? "3 · Real-input runtime review" : "3 · Mock workflow run"
              }
              subtitle="Each proposed action is evaluated by the backend gateway."
              action={
                <span className={`commit-status ${busy ? "running" : ""}`}>
                  {busy ? (
                    <LoaderCircle className="spinning" size={14} />
                  ) : run ? (
                    <CheckCircle2 size={14} />
                  ) : (
                    <Circle size={14} />
                  )}
                  {busy
                    ? "Running"
                    : run?.workflow_status.replaceAll("_", " ").toLowerCase() ||
                      "Ready to run"}
                </span>
              }
            >
              <div className="commit-run-meta">
                <strong>
                  <Github size={19} />
                  {commit?.repository || "Waiting for repository fetch"}
                </strong>
                <h3>{commit?.message}</h3>
                <div>
                  <span>
                    <GitBranch size={14} />
                    {commit?.branch}
                  </span>
                  <code>{commit?.sha.slice(0, 7)}</code>
                  <span className="subtle-tag">
                    {real ? "Real commit · synthetic runner" : "Mock commit"}
                  </span>
                  {run && (
                    <span className="subtle-tag">Judge: {run.ai_provider}</span>
                  )}
                </div>
              </div>
              <div className="commit-job-steps">
                {[
                  {
                    title: real
                      ? "Fetch public GitHub commit"
                      : "Receive simulated GitHub event",
                    done: Boolean(run),
                    active: false,
                    detail: run
                      ? `${run.trigger} · run ${run.id.slice(0, 8)}`
                      : real
                        ? "Waiting for repository URL"
                        : "Waiting for you to submit a fixture",
                  },
                  ...plan.map((step, i) => ({
                    title: step.title,
                    done: Boolean(run?.events[i]),
                    active: busy && run?.cursor === i,
                    detail: `${step.tool} → ${step.resource}`,
                    event: run?.events[i],
                  })),
                  {
                    title: "Save local evidence report",
                    done: Boolean(run && run.cursor === plan.length),
                    active: false,
                    detail: "Persisted in this POC—not uploaded to GitHub",
                  },
                ].map((step, i) => (
                  <div
                    className={`commit-job-step ${step.active ? "active" : ""}`}
                    key={step.title}
                  >
                    <span className="commit-step-icon">
                      {step.active ? (
                        <LoaderCircle size={19} className="spinning" />
                      ) : step.done ? (
                        <CheckCircle2 size={19} />
                      ) : (
                        <Circle size={19} />
                      )}
                    </span>
                    <div>
                      <strong>{step.title}</strong>
                      <small>{step.detail}</small>
                    </div>
                    {"event" in step && step.event ? (
                      <Badge value={step.event.decision} />
                    ) : (
                      <span className="commit-step-number">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              {!busy && run?.workflow_status === "RUNNING" && (
                <div className="commit-resume">
                  <p>This run is incomplete. Continue from its saved step.</p>
                  <button className="secondary" onClick={() => execute(true)}>
                    <Play size={15} /> Resume{" "}
                    {real ? "runtime review" : "mock workflow"}
                  </button>
                </div>
              )}
              <div className="commit-console">
                <div>
                  <Terminal size={15} />
                  <span>Sentinel gateway log</span>
                  <small>Local evidence</small>
                </div>
                <pre>
                  {run
                    ? [
                        real
                          ? `[github] Public commit ${run.commit.sha.slice(0, 7)} fetched via read-only API`
                          : `[mock] ${run.trigger} event received for ${run.commit.sha.slice(0, 7)}`,
                        real
                          ? "[boundary] Real diff supplied to the judge. Fixed agent plan; synthetic tests and patch receipts. No repository code executed."
                          : "[fixture] No remote checkout. No submitted code executed.",
                        ...run.events.map(
                          (event) =>
                            `[sentinel] ${event.action.tool} → ${event.decision} · risk ${event.risk_score}/100\n           ${event.executed ? `Sandbox receipt: ${event.tool_result?.receipt || "available"}` : "No tool execution"}${event.quarantine_state === "QUARANTINED" ? " · session revoked" : ""}`,
                        ),
                      ].join("\n")
                    : real
                      ? "Ready. Fetch a public repository commit to evaluate it through Sentinel."
                      : "Ready. Submit a mock commit to see the gateway check each tool call."}
                </pre>
              </div>
            </Panel>
            {run && (
              <section
                className={`commit-result ${run.test_status === "FAIL" ? "failed" : run.contained ? "contained" : pending ? "waiting" : ""}`}
                aria-labelledby="commit-result-heading"
              >
                <div className="commit-result-heading">
                  <ShieldCheck size={25} />
                  <div>
                    <span className="eyebrow">4 · THE PROOF</span>
                    <h2 id="commit-result-heading">{resultTitle}</h2>
                  </div>
                  <span
                    className={`commit-test-result ${run.test_status.toLowerCase()}`}
                    role="status"
                  >
                    {real ? "Runtime review" : "Safety test"}: {run.test_status}
                  </span>
                </div>
                <p>
                  {real
                    ? "The real commit diff was evaluated with a fixed synthetic agent plan. Inspect the ALLOW / REVIEW / BLOCK decisions below. Completion does not mean the repository is safe, its tests passed, or it is ready to merge."
                    : run.contained
                      ? "The attack test passes because Sentinel stopped the unsafe call and its retry. This is not a verdict that the submitted code is safe."
                      : pending
                        ? "The safety test passes because the write is held. The mock workflow waits for your decision; no patch has been applied."
                        : run.test_status === "FAIL"
                          ? "Observed decisions differ from the fixture’s expected outcomes. Current policy and provider behavior were not overridden."
                          : run.test_status === "PASS"
                            ? "The scripted actions matched expected boundaries. This demonstrates runtime enforcement, not vulnerability scanning."
                            : "The report updates after each gateway decision."}
                </p>
                <div className="commit-result-stats">
                  {[
                    ["Proposed", run.summary.actions],
                    ["Executed", run.summary.executed],
                    ["Blocked", run.summary.blocked],
                    ["Peak risk", `${run.summary.max_risk}/100`],
                  ].map(([label, value]) => (
                    <div key={String(label)}>
                      <span>{label}</span>
                      <strong>{value}</strong>
                    </div>
                  ))}
                </div>
                <div className="commit-evidence-list">
                  {run.events.map((event) => (
                    <button
                      key={event.id}
                      onClick={() => onInspect(event)}
                      aria-label={`Inspect ${event.action.tool} action`}
                    >
                      <code>{event.action.tool}()</code>
                      <Badge value={event.decision} />
                      <span>
                        {event.executed
                          ? "Receipt recorded"
                          : event.review_status === "PENDING"
                            ? "Held for approval"
                            : "Not executed"}
                      </span>
                      <ArrowRight size={15} />
                    </button>
                  ))}
                </div>
                {run.contained && (
                  <div className="commit-containment">
                    <Lock size={18} />
                    <span>
                      Automatic kill switch: quarantined session,{" "}
                      {real ? "subsequent actions blocked" : "blocked retry"}.
                    </span>
                    <Bell size={18} />
                    <span>Alerts + audit evidence recorded.</span>
                  </div>
                )}
                {pending && (
                  <div className="commit-approval">
                    <UserCheck size={21} />
                    <p>
                      Recheck current permissions, then approve or reject the
                      synthetic {real ? "action" : "patch"}.
                    </p>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => review("REJECT")}
                    >
                      Reject {real ? "action" : "patch"}
                    </button>
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() => review("APPROVE")}
                    >
                      Approve synthetic {real ? "action" : "patch"}
                    </button>
                  </div>
                )}
                {run.events.some(
                  (event) =>
                    event.review_status === "APPROVED" ||
                    event.review_status === "REJECTED",
                ) && (
                  <p className="commit-review-result" role="status">
                    Human decision:{" "}
                    {
                      run.events.find(
                        (event) =>
                          event.review_status === "APPROVED" ||
                          event.review_status === "REJECTED",
                      )?.review_status
                    }
                    .{" "}
                    {run.events.some(
                      (event) => event.review_status === "APPROVED",
                    )
                      ? `Synthetic ${real ? "action" : "patch"} receipt recorded.`
                      : `${real ? "Action" : "Patch"} did not execute.`}
                  </p>
                )}
                <div className="button-row">
                  {critical && (
                    <button
                      className="secondary"
                      onClick={() => onInspect(critical)}
                    >
                      Inspect blocked secret access <ArrowRight size={15} />
                    </button>
                  )}
                  <button className="secondary" onClick={download}>
                    <Download size={15} /> Download evidence JSON
                  </button>
                </div>
              </section>
            )}
          </div>
        </div>
      )}
      {history.length > 0 && (
        <Panel
          title="Recent GitHub integration runs"
          subtitle="Runs and their events survive page navigation and reloads."
        >
          <div className="commit-history">
            {history.map((item) => (
              <button
                key={item.id}
                disabled={busy}
                onClick={() => selectHistory(item)}
              >
                <GitCommitHorizontal size={19} />
                <div>
                  <strong>{item.title}</strong>
                  <small>
                    {item.commit.repository} · {item.commit.sha.slice(0, 7)} ·{" "}
                    {time(item.timestamp)}
                  </small>
                </div>
                <span>
                  {item.input_source === "github"
                    ? "Runtime review"
                    : "Safety test"}
                  : {item.test_status}
                </span>
                {item.final_decision && <Badge value={item.final_decision} />}
                <ArrowRight size={16} />
              </button>
            ))}
          </div>
        </Panel>
      )}
      <div className="commit-next-step">
        <Info size={19} />
        <p>
          <strong>What is connected?</strong> Real-repository mode reads public
          GitHub commits. Agent plans and tool execution are still synthetic. A
          future sandboxed runner could execute tests and publish checks. This
          POC does not install a workflow or change merge rules.
        </p>
      </div>
    </>
  );
}
