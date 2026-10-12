"""Verify cached launcher readiness and SIGINT cleanup. Run with services stopped."""
from pathlib import Path
import os
import signal
import socket
import subprocess
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
API_PORT = int(os.getenv('SENTINEL_API_PORT', '8100'))
UI_PORT = int(os.getenv('SENTINEL_UI_PORT', '5174'))
PORTS = [API_PORT, UI_PORT]

def port_free(port):
    with socket.socket() as probe:
        probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            probe.bind(('127.0.0.1', port))
            return True
        except OSError:
            return False

assert all(port_free(p) for p in PORTS), 'Stop AgentSentinel before lifecycle verification'
process = subprocess.Popen([str(ROOT / 'start.sh')], cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
try:
    deadline = time.monotonic() + 90
    ready = False
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(process.stdout.read())
        try:
            for url in [f'http://127.0.0.1:{API_PORT}/health', f'http://127.0.0.1:{UI_PORT}']:
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
while time.monotonic()<deadline and not all(port_free(p) for p in PORTS):
    time.sleep(.1)
assert all(port_free(p) for p in PORTS), 'A service was left running after SIGINT'
assert not (ROOT/'.run/backend.pid').exists() and not (ROOT/'.run/frontend.pid').exists()
print('PASS: SIGINT stops both services, removes PID files and leaves no listening ports')
