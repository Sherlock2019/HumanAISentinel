import json
import urllib.request
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / '.env')
api_base = f"http://127.0.0.1:{os.getenv('SENTINEL_API_PORT', '8100')}"
scenarios = json.load(urllib.request.urlopen(f'{api_base}/api/redteam/scenarios'))
failed = False
for scenario in scenarios:
    id = scenario['id']
    request = urllib.request.Request(f'{api_base}/api/redteam/run', data=json.dumps({'scenario_id': id, 'reset_agent': True}).encode(), headers={'Content-Type': 'application/json', 'X-Admin-Token': os.getenv('ADMIN_TOKEN', 'local-demo-admin')})
    result = json.load(urllib.request.urlopen(request))
    print(id, result['result']['decision'], 'PASS' if result['expected_met'] else 'FAIL')
    failed = failed or not result['expected_met']
raise SystemExit(1 if failed else 0)
