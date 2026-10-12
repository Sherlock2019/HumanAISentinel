def calculate(policy, judge, behavior, capability, action):
    semantic = round(sum([6-judge['intent_alignment'], judge['authorization_risk'], judge['data_risk'], judge['injection_risk'], judge['privilege_risk'], 6-judge['necessity']]) / 30 * 100)
    sensitivity = 100 if policy['critical'] else 75 if capability['dangerous'] else 10
    reversibility = 80 if action.operation in {'DELETE', 'WRITE', 'EXECUTE'} else 10
    parts = {'policy': policy['score'], 'semantic': semantic, 'behavior': behavior['score'], 'resource': sensitivity, 'reversibility': reversibility}
    score = round(parts['policy']*.35 + parts['semantic']*.25 + parts['behavior']*.2 + parts['resource']*.15 + parts['reversibility']*.05)
    if policy['critical']:
        score = max(score, 98)
    if capability['dangerous'] or judge['injection_risk'] >= 4 or behavior['score'] >= 80:
        score = max(score, 90)
    severity = 'CRITICAL' if score >= 80 else 'HIGH' if score >= 55 else 'MEDIUM' if score >= 30 else 'LOW'
    return {'score': min(score, 100), 'severity': severity, 'components': parts, 'formula': '35% policy + 25% semantic + 20% behavior + 15% sensitivity + 5% irreversibility; critical rules impose a risk floor.'}
