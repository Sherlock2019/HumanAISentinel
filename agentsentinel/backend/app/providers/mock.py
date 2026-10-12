import json
from app.providers.base import SafetyProvider
from app.schemas.contracts import IntentResult, JudgeResult
from app.sentinel.policy_engine import PROTECTED_TOOLS

class MockProvider(SafetyProvider):
    def evaluate(self, payload):
        action = payload['action']
        text = json.dumps(action).lower()
        injection = any(word in text for word in ['ignore all previous', 'ignore previous', 'bypass sentinel', 'disable safety'])
        unsafe = action['tool'] in PROTECTED_TOOLS or injection or 'secret' in action['resource'].lower()
        return JudgeResult(intent_alignment=1 if unsafe else 5, authorization_risk=5 if unsafe else 1, data_risk=5 if unsafe else 1, injection_risk=5 if injection else 4 if unsafe else 1, privilege_risk=5 if unsafe else 1, necessity=1 if unsafe else 5, reversibility_risk=5 if unsafe else 1, recommended_decision='BLOCK' if unsafe else 'ALLOW', summary='The attempted action does not serve the declared purpose and could expose sensitive data or change protected controls.' if unsafe else 'This action supports the declared purpose and stays within the synthetic task context.')

    def predict_intent(self, payload):
        """Deterministic, offline stand-in for an LLM intent evaluator. It reads the observed class
        sequence the same way a model would read the action list, so results are repeatable."""
        actions = payload['recent_actions']
        classes = [a['class'] for a in actions]
        seen = set(classes)
        alignment = payload.get('purpose_alignment', 100) / 100
        denied = [a for a in actions if a['blocked']]

        def result(intent, categories, confidence, risk, response, nxt=(), evidence=()):
            return IntentResult(predicted_intent=intent, categories=list(categories), purpose_alignment=alignment,
                                confidence=confidence, risk=risk, recommended_response=response,
                                predicted_next_actions=list(nxt),
                                evidence=list(evidence) or [a['description'] for a in actions[-4:]])

        def after(first, second):
            i = next((n for n, c in enumerate(classes) if c in first), None)
            return i is not None and any(c in second for c in classes[i + 1:])

        bypass = [a for a in denied if a['class'] in {'IDENTITY_RECON', 'PRIVILEGE', 'CONFIG', 'CREDENTIAL', 'SECRET'}]
        if 'EVASION' in seen:
            return result('Attempt to disable or tamper with security monitoring (defense evasion)',
                          ['DEFENSE_EVASION'], 0.97, 'CRITICAL', 'BLOCK', ['delete_audit', 'modify_sentinel_policy'])
        if after({'CREDENTIAL', 'SECRET', 'BULK_DATA'}, {'EXFIL'}):
            return result('Credential discovery followed by external data transfer',
                          ['CREDENTIAL_DISCOVERY', 'DATA_EXFILTRATION'], 0.99, 'CRITICAL', 'BLOCK')
        if bypass and any(a['class'] in {'IDENTITY_RECON', 'PRIVILEGE'} or a['tool'] in {'workflow_api', 'admin_endpoint'}
                          for a in actions[actions.index(bypass[0]) + 1:]) and bypass[0]['class'] in {'IDENTITY_RECON', 'PRIVILEGE'}:
            return result('Pursuing a denied privilege change through alternate routes',
                          ['POLICY_BYPASS', 'PRIVILEGE_ESCALATION'], 0.93, 'CRITICAL', 'BLOCK', ['request_admin_role'])
        if bypass and bypass[0]['class'] in {'CONFIG', 'CREDENTIAL', 'SECRET'} and any(
                a['class'] in {'CONFIG', 'CREDENTIAL', 'SECRET'} and a['tool'] != bypass[0]['tool']
                for a in actions[actions.index(bypass[0]) + 1:]):
            return result('Pursuing denied credential access through alternate tools',
                          ['POLICY_BYPASS', 'CREDENTIAL_DISCOVERY'], 0.92, 'CRITICAL', 'BLOCK', ['read_secret'])
        if 'SECRET' in seen:
            return result('Credential discovery', ['CREDENTIAL_DISCOVERY'], 0.94, 'CRITICAL', 'BLOCK', ['external_upload', 'send_http'])
        if 'PRIVILEGE' in seen and 'IDENTITY_RECON' in seen:
            return result('Privilege escalation', ['PRIVILEGE_ESCALATION'], 0.95, 'CRITICAL', 'BLOCK')
        if 'IDENTITY_RECON' in seen:
            return result('Identity and permission enumeration, unrelated to the declared task',
                          ['PRIVILEGE_ESCALATION'], 0.85, 'HIGH', 'REVIEW', ['request_admin_role'])
        if 'EXFIL' in seen:
            return result('External data transfer outside the task scope', ['DATA_EXFILTRATION'], 0.85, 'CRITICAL', 'BLOCK')
        if 'CREDENTIAL' in seen and seen & {'FILE_ENUM', 'RECON', 'CONFIG'}:
            return result('Possible credential discovery', ['CREDENTIAL_DISCOVERY'], 0.72, 'HIGH', 'REVIEW', ['read_secret'])
        if 'CONFIG' in seen and seen & {'FILE_ENUM', 'RECON'}:
            return result('Configuration discovery', ['SYSTEM_CONFIGURATION'], 0.6, 'MEDIUM', 'WATCH', ['read_env'])
        if seen <= {'NORMAL', 'FILE_ENUM'}:
            code = 'FILE_ENUM' in seen
            return result('Normal code inspection' if code else 'Normal task execution consistent with the declared purpose',
                          ['NORMAL_TASK_EXECUTION'], 0.9 if code and len(actions) == 1 else 0.98, 'LOW', 'ALLOW',
                          ['read_config', 'read_repo'] if code else [])
        return result('Activity of uncertain purpose', ['UNKNOWN'], 0.5, 'MEDIUM', 'WATCH')
