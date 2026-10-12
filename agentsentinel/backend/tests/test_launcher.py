"""Exercise the real launchers with isolated fake services, without using demo ports."""

import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import time

import pytest


PROJECT = Path(__file__).resolve().parents[2]


@pytest.fixture
def launcher(tmp_path):
    root = tmp_path / "demo"
    root.mkdir()
    for name in ("start.sh", "stop.sh"):
        shutil.copy2(PROJECT / name, root / name)
    for name in (".run", "backend", "frontend", ".venv/bin", "bin"):
        (root / name).mkdir(parents=True, exist_ok=True)
    (root / ".env").touch()
    (root / ".venv/bin/activate").write_text(
        f'export PATH="{root}/.venv/bin:$PATH"\n'
    )
    (root / "backend/requirements.txt").touch()
    (root / ".run/python-deps.hash").write_text(hashlib.sha256(b"").hexdigest())
    for name in ("package.json", "package-lock.json"):
        (root / "frontend" / name).write_text("{}")
    (root / "frontend/node_modules").mkdir()
    npm_hash = subprocess.check_output(
        "sha256sum frontend/package.json frontend/package-lock.json | sha256sum | cut -d' ' -f1",
        shell=True,
        cwd=root,
        text=True,
    )
    (root / ".run/npm-deps.hash").write_text(npm_hash.strip())
    stubs = {
        "bin/python3": """#!/bin/bash
if [[ "$*" == *socket* && -n "${SENTINEL_TEST_BUSY_PORT:-}" && "$*" == *", $SENTINEL_TEST_BUSY_PORT)"* ]]; then exit 1; fi
exit 0
""",
        "bin/node": "#!/bin/bash\nexit 0\n",
        "bin/curl": "#!/bin/bash\nexit 0\n",
        "bin/npm": "#!/bin/bash\nprintf '%s' \"$SENTINEL_API_TARGET\" > .run/proxy-target\nexec -a npm sleep 300\n",
        ".venv/bin/python": """#!/bin/bash
if [[ "${1:-}" == scripts/seed_demo.py ]]; then exit 0; fi
exec -a uvicorn sleep 300
""",
    }
    for name, content in stubs.items():
        path = root / name
        path.write_text(content)
        path.chmod(0o755)
    env = {**os.environ, "PATH": f"{root}/bin:{os.environ['PATH']}",
           "SENTINEL_API_PORT": "8100", "SENTINEL_UI_PORT": "5174"}
    processes = []

    def start(**overrides):
        log = root / f"startup-{len(processes)}.log"
        with log.open("w") as output:
            process = subprocess.Popen(
                ["bash", str(root / "start.sh")], cwd=root, env={**env, **overrides},
                stdout=output, stderr=subprocess.STDOUT,
            )
        processes.append(process)
        deadline = time.monotonic() + 12
        while time.monotonic() < deadline:
            if process.poll() is not None:
                pytest.fail(log.read_text())
            if "AGENTSENTINEL IS RUNNING" in log.read_text():
                pids = [(root / f".run/{service}.pid").read_text().strip()
                        for service in ("backend", "frontend")]
                if all(Path(f"/proc/{pid}/cmdline").exists() for pid in pids):
                    # Wait until both stub shells have exec'd their owned service.
                    commands = [Path(f"/proc/{pid}/cmdline").read_bytes() for pid in pids]
                    if commands[0].startswith(b"uvicorn\0") and commands[1].startswith(b"npm\0"):
                        return process, pids
            time.sleep(0.05)
        pytest.fail(f"Launcher did not become ready: {log.read_text()}")

    yield root, env, start
    subprocess.run(["bash", str(root / "stop.sh")], env=env, check=True, timeout=15)
    for process in processes:
        if process.poll() is None:
            process.terminate()
        process.wait(timeout=10)


def test_start_replaces_existing_owned_services(launcher):
    root, _, start = launcher
    previous, old_pids = start()
    for _ in range(2):
        current, new_pids = start()
        previous.wait(timeout=10)
        assert old_pids != new_pids
        assert all(not Path(f"/proc/{pid}").exists() for pid in old_pids)
        assert all(Path(f"/proc/{pid}").exists() for pid in new_pids)
        assert [(root / f".run/{service}.pid").read_text().strip()
                for service in ("backend", "frontend")] == new_pids
        previous, old_pids = current, new_pids


def test_start_preserves_unrelated_process_and_refuses_busy_port(launcher, tmp_path):
    root, env, _ = launcher
    unrelated = subprocess.Popen(
        ["bash", "-c", "exec -a uvicorn sleep 300"], cwd=tmp_path
    )
    try:
        (root / ".run/backend.pid").write_text(f"{unrelated.pid}\n")
        result = subprocess.run(
            ["bash", str(root / "start.sh")], cwd=root,
            env={**env, "SENTINEL_TEST_BUSY_PORT": "8100"},
            capture_output=True, text=True, timeout=15,
        )
        assert result.returncode == 1
        assert "ownership check failed" in result.stdout
        assert "Port 8100 is occupied by an untracked or unrelated process" in result.stdout
        assert unrelated.poll() is None
        assert not (root / ".run/frontend.pid").exists()
    finally:
        unrelated.terminate()
        unrelated.wait(timeout=10)


def test_custom_ports_update_banner_and_frontend_proxy(launcher):
    root, _, start = launcher
    start(SENTINEL_API_PORT="08200", SENTINEL_UI_PORT="5274")
    output = (root / "startup-0.log").read_text()
    assert "Dashboard: http://localhost:5274" in output
    assert "FastAPI:   http://localhost:8200" in output
    assert "Health:    http://localhost:8200/health" in output
    assert (root / ".run/proxy-target").read_text() == "http://127.0.0.1:8200"


@pytest.mark.parametrize('overrides', [
    {'SENTINEL_API_PORT': 'not-a-port'}, {'SENTINEL_API_PORT': '0'},
    {'SENTINEL_API_PORT': '65536'}, {'SENTINEL_UI_PORT': '-1'},
    {'SENTINEL_UI_PORT': '8100'},
])
def test_invalid_ports_fail_before_stopping_the_running_instance(launcher, overrides):
    root, env, start = launcher
    current, pids = start()
    response = subprocess.run(["bash", str(root / "start.sh")], cwd=root,
                              env={**env, **overrides}, capture_output=True, text=True, timeout=5)
    assert response.returncode == 1
    assert "port" in response.stdout.lower()
    assert current.poll() is None
    assert all(Path(f"/proc/{pid}").exists() for pid in pids)
