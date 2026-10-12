Demo definitions are maintained in backend/app/database/seed.py and backend/app/simulator/scenarios.py.
The seed is idempotent. Scenario reset is explicit and audited; it preserves action events and audit evidence.
