import os
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / '.env')
DATABASE_URL = os.getenv('DATABASE_URL', f'sqlite:///{ROOT / "data" / "sentinel.db"}')
AI_PROVIDER = os.getenv('AI_PROVIDER', 'mock').lower()
ADMIN_TOKEN = os.getenv('ADMIN_TOKEN', 'local-demo-admin')
SIMULATION_ONLY = True

# Intent Sentinel
INTENT_HISTORY_WINDOW = int(os.getenv('INTENT_HISTORY_WINDOW', '20'))
# Prediction alone never blocks unless this is enabled (and even then a deterministic signal is required).
PREDICTIVE_BLOCKING = os.getenv('PREDICTIVE_BLOCKING', 'false').strip().lower() in {'1', 'true', 'yes', 'on'}
INTENT_ALERT_CONFIDENCE = float(os.getenv('INTENT_ALERT_CONFIDENCE', '0.80'))

def _weights(raw: str) -> dict:
    weights = {'policy': 0.35, 'behavior': 0.20, 'intent': 0.25, 'resource': 0.20}
    for part in filter(None, (p.strip() for p in raw.split(','))):
        key, _, value = part.partition('=')
        if key.strip() in weights:
            weights[key.strip()] = float(value)
    total = sum(weights.values()) or 1
    return {k: v / total for k, v in weights.items()}

# Weights for the non-hard-deny blend. An explicit DENY always wins regardless of weights.
INTENT_RISK_WEIGHTS = _weights(os.getenv('INTENT_RISK_WEIGHTS', ''))
