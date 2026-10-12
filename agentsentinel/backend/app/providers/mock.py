import json
from app.providers.base import SafetyProvider
from app.schemas.contracts import JudgeResult
from app.sentinel.policy_engine import PROTECTED_TOOLS

class MockProvider(SafetyProvider):
    def evaluate(self, payload):
        action = payload['action']
        text = json.dumps(action).lower()
        injection = any(word in text for word in ['ignore all previous', 'ignore previous', 'bypass sentinel', 'disable safety'])
        unsafe = action['tool'] in PROTECTED_TOOLS or injection or 'secret' in action['resource'].lower()
        return JudgeResult(intent_alignment=1 if unsafe else 5, authorization_risk=5 if unsafe else 1, data_risk=5 if unsafe else 1, injection_risk=5 if injection else 4 if unsafe else 1, privilege_risk=5 if unsafe else 1, necessity=1 if unsafe else 5, reversibility_risk=5 if unsafe else 1, recommended_decision='BLOCK' if unsafe else 'ALLOW', summary='The attempted action does not serve the declared purpose and could expose sensitive data or change protected controls.' if unsafe else 'This action supports the declared purpose and stays within the synthetic task context.')
