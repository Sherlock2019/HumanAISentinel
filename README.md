# AgentSentinel

The complete AI Agent Runtime Safety Guard POC lives in [agentsentinel](agentsentinel/README.md).

From this workspace in WSL:

```bash
./start.sh
```

Open http://localhost:5174 and start **How It Works** or **Run guided demo**. Mock mode uses only synthetic tools and requires no API keys. The backend uses port 8100, leaving ports 8000 and 5173 available for other projects.

For the GitHub commit demonstration, open **GitHub Integration** at http://localhost:5174/#commit. Choose a safe review, human-approved patch or prompt-injection attack, then run the mock GitHub Action. The GitHub activity is simulated; Sentinel decisions and audit evidence come from the backend.

To use your own repository, select **Real GitHub repository**, paste a public `https://github.com/owner/repo` URL, optionally choose a branch or commit SHA, and click **Fetch repository & run Sentinel**. The actual commit diff feeds the safety judge; agent planning, test execution and patch receipts remain synthetic. This is not a full-repository vulnerability scan or a real GitHub Actions run.

Running `./start.sh` again automatically stops the existing AgentSentinel instance and starts a fresh one, preserving demo data and audit evidence. Unrelated or untracked processes are never killed.

Optional custom ports: `SENTINEL_API_PORT=8200 SENTINEL_UI_PORT=5274 ./start.sh`.

Stop both services with Ctrl+C or `./stop.sh`.
