"""Verify cached launcher readiness and SIGINT cleanup. Run with services stopped."""
from pathlib import Path
import signal
import socket
import subprocess
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]

def port_free(port):
    with socket.socket() as probe:
        probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            probe.bind(('127.0.0.1', port))
            return True
        except OSError:
            return False

assert all(port_free(p) for p in [8000, 5173]), 'Stop AgentSentinel before lifecycle verification'
process = subprocess.Popen([str(ROOT / 'start.sh')], cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
try:
    deadline = time.monotonic() + 90
    ready = False
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(process.stdout.read())
        try:
            for url in ['http://127.0.0.1:8000/health', 'http://127.0.0.1:5173']:
                with urllib.request.urlopen(url, timeout=1) as response:
                    assert response.status == 200
            ready = True
            break
        except OSError:
            time.sleep(.2)
    assert ready, 'Launcher readiness timed out'
    print('PASS: start.sh serves health and homepage')
finally:
    process.send_signal(signal.SIGINT)
    output, _ = process.communicate(timeout=20)
    print(output[-1000:])
deadline = time.monotonic()+10
while time.monotonic()<deadline and not all(port_free(p) for p in [8000, 5173]):
    time.sleep(.1)
assert all(port_free(p) for p in [8000, 5173]), 'A service was left running after SIGINT'
assert not (ROOT/'.run/backend.pid').exists() and not (ROOT/'.run/frontend.pid').exists()
print('PASS: SIGINT stops both services, removes PID files and leaves no listening ports')
