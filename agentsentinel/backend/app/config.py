import os
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / '.env')
DATABASE_URL = os.getenv('DATABASE_URL', f'sqlite:///{ROOT / "data" / "sentinel.db"}')
AI_PROVIDER = os.getenv('AI_PROVIDER', 'mock').lower()
ADMIN_TOKEN = os.getenv('ADMIN_TOKEN', 'local-demo-admin')
SIMULATION_ONLY = True
