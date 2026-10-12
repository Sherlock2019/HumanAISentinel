from app.config import INTENT_RISK_WEIGHTS

def calculate(policy, judge, behavior, capability, action, intent=None):
    semantic = round(sum([6-judge['intent_alignment'], judge['authorization_risk'], judge['data_risk'], judge['injection_risk'], judge['privilege_risk'], 6-judge['necessity']]) / 30 * 100)
    sensitivity = 100 if policy['critical'] else 75 if capability['dangerous'] else 10
    reversibility = 80 if action.operation in {'DELETE', 'WRITE', 'EXECUTE'} else 10
    parts = {'policy': policy['score'], 'semantic': semantic, 'behavior': behavior['score'], 'resource': sensitivity, 'reversibility': reversibility}
    score = round(parts['policy']*.35 + parts['semantic']*.25 + parts['behavior']*.2 + parts['resource']*.15 + parts['reversibility']*.05)
    formula = '35% policy + 25% semantic + 20% behavior + 15% sensitivity + 5% irreversibility; critical rules impose a risk floor.'
    if intent is not None:
        # Session-aware blend. It can only raise the per-call score; a hard deny keeps its floor below.
        w = INTENT_RISK_WEIGHTS
        parts['intent'] = intent['session_risk']
        parts['resource'] = max(sensitivity, intent['resource_sensitivity'])
        blended = round(parts['policy']*w['policy'] + parts['behavior']*w['behavior'] + parts['intent']*w['intent'] + parts['resource']*w['resource'])
        parts['session_blend'] = blended
        score = max(score, blended)
        formula += (f' Session blend: {round(w["policy"]*100)}% policy + {round(w["behavior"]*100)}% behavior + '
                    f'{round(w["intent"]*100)}% intent + {round(w["resource"]*100)}% resource sensitivity (may only raise the score). '
                    'An explicit DENY always wins.')
    if policy['critical']:
        score = max(score, 98)
    if capability['dangerous'] or judge['injection_risk'] >= 4 or behavior['score'] >= 80:
        score = max(score, 90)
    severity = 'CRITICAL' if score >= 80 else 'HIGH' if score >= 55 else 'MEDIUM' if score >= 30 else 'LOW'
    return {'score': min(score, 100), 'severity': severity, 'components': parts, 'formula': formula}
