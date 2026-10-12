def decide(policy, judge, behavior, capability, risk, settings):
    # Model advice can only restrict a deterministic permission, never expand it.
    if policy['decision'] == 'BLOCK' or capability['dangerous'] or judge['recommended_decision'] == 'BLOCK' or risk['score'] >= settings['critical_threshold']:
        return 'BLOCK'
    if policy['decision'] == 'REVIEW' or judge['recommended_decision'] == 'REVIEW' or risk['score'] >= settings['review_threshold'] or settings['global_policy_mode'] == 'strict' and risk['score'] >= 30:
        return 'REVIEW'
    return 'ALLOW'
