import json
import urllib.request
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / '.env')
scenarios = json.load(urllib.request.urlopen('http://127.0.0.1:8000/api/redteam/scenarios'))
failed = False
for scenario in scenarios:
    id = scenario['id']
    request = urllib.request.Request('http://127.0.0.1:8000/api/redteam/run', data=json.dumps({'scenario_id': id, 'reset_agent': True}).encode(), headers={'Content-Type': 'application/json', 'X-Admin-Token': os.getenv('ADMIN_TOKEN', 'local-demo-admin')})
    result = json.load(urllib.request.urlopen(request))
    print(id, result['result']['decision'], 'PASS' if result['expected_met'] else 'FAIL')
    failed = failed or not result['expected_met']
raise SystemExit(1 if failed else 0)
