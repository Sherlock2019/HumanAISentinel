"""Intent Engine: what does the full sequence of actions appear to be trying to achieve?

    session context -> deterministic rules -> sequence patterns -> model evaluator (advisory)
                    -> purpose alignment, intent drift, temporal session risk
                    -> predicted intent + likely next actions + recommended response

Authority, in order: explicit policy, then observed high-risk actions and deterministic sequence rules,
then the model. The model can raise concern (at most to human REVIEW by default); it cannot lower a
deterministic conclusion, and a prediction alone never blocks unless PREDICTIVE_BLOCKING is enabled
*and* a deterministic sequence signal agrees.
"""
from __future__ import annotations

from app import config
from app.sentinel import intent_llm_evaluator
from app.sentinel.intent_rules import (HIGH_RISK_OBSERVED, RESOURCE_SENSITIVITY, RESPONSE_ORDER, RISK_ORDER,
                                       STAGE_RISK, classify, evaluate_rules, max_level, purpose_alignment,
                                       session_risk)
from app.sentinel.sequence_patterns import match_all

SEVERITY_ORDER = ['DEFENSE_EVASION', 'DATA_EXFILTRATION', 'POLICY_BYPASS', 'PRIVILEGE_ESCALATION',
                  'CREDENTIAL_DISCOVERY', 'DATA_COLLECTION', 'UNCONTROLLED_LOOP', 'RESOURCE_ABUSE',
                  'SYSTEM_CONFIGURATION', 'INFORMATION_RETRIEVAL', 'NORMAL_TASK_EXECUTION', 'UNKNOWN']
PATTERN_PHRASE = {
    'SECRET_EXFILTRATION_CHAIN': 'credential-discovery / exfiltration', 'CREDENTIAL_DISCOVERY_CHAIN': 'credential-discovery',
    'SECRET_ACCESS': 'credential-access', 'PRIVILEGE_ESCALATION_CHAIN': 'privilege-escalation',
    'PRIVILEGE_RECON': 'permission-enumeration', 'PRIVILEGE_REQUEST': 'privilege-escalation',
    'POLICY_BYPASS_CHAIN': 'policy-bypass', 'DEFENSE_EVASION_CHAIN': 'defense-evasion',
    'EXTERNAL_TRANSFER': 'data-exfiltration', 'BULK_COLLECTION': 'bulk data-collection',
    'RECON_CHAIN': 'reconnaissance', 'RUNAWAY_LOOP': 'runaway-loop',
}
DISPLAY_RESPONSE = {'QUARANTINE': 'BLOCK + QUARANTINE', 'BLOCK': 'BLOCK', 'REVIEW': 'REVIEW',
                    'WATCH': 'ALLOW + WATCH', 'ALLOW': 'ALLOW'}


def level_for(score: int) -> str:
    return 'CRITICAL' if score >= 80 else 'HIGH' if score >= 55 else 'MEDIUM' if score >= 30 else 'LOW'


def _workflow_label(purpose: str) -> str:
    p = purpose.lower()
    for words, label in ((('support', 'ticket'), 'Customer support workflow'), (('code', 'repo', 'source'), 'Code review workflow'),
                         (('research',), 'Research workflow'), (('financ', 'transaction'), 'Finance workflow')):
        if any(w in p for w in words):
            return label
    return 'Normal task execution'


def _label(primary: str, categories: list[str], risk: str, classes: set, purpose: str, n_actions: int) -> str:
    if primary == 'DATA_EXFILTRATION':
        return 'Data exfiltration'
    if primary == 'DEFENSE_EVASION':
        return 'Defense evasion'
    if primary == 'POLICY_BYPASS':
        secondary = next((c for c in categories if c not in {'POLICY_BYPASS'}), '')
        return 'Policy bypass' + (f' · {secondary.replace("_", " ").lower()}' if secondary else '')
    if primary == 'PRIVILEGE_ESCALATION':
        return 'Privilege escalation' if 'PRIVILEGE' in classes else 'Permission enumeration'
    if primary == 'CREDENTIAL_DISCOVERY':
        return 'Credential discovery' if risk == 'CRITICAL' else 'Possible credential discovery'
    if primary == 'DATA_COLLECTION':
        return 'Data collection'
    if primary in {'UNCONTROLLED_LOOP', 'RESOURCE_ABUSE'}:
        return 'Runaway loop'
    if primary == 'SYSTEM_CONFIGURATION' or 'CONFIG' in classes:
        return 'Configuration discovery'
    if primary == 'INFORMATION_RETRIEVAL':
        return 'Possible reconnaissance'
    if classes <= {'NORMAL', 'FILE_ENUM'}:
        return 'Normal code inspection' if 'FILE_ENUM' in classes and n_actions == 1 else _workflow_label(purpose)
    return 'Uncertain objective'


def _explanation(context, actions, risk, top_rule, purpose_short, drift):
    purpose = context['declared_purpose'].rstrip('.')
    lines = [f'The agent was created to {purpose[0].lower() + purpose[1:]}.']
    if context.get('user_objective'):
        lines.append(f'The user asked: “{context["user_objective"][:160]}”.')
    lines.append('It then:')
    shown = actions[-8:]
    for n, a in enumerate(shown, start=1):
        outcome = ' (blocked)' if a['blocked'] else ''
        lines.append(f'{n}. {a["description"]}{outcome}')
    if RISK_ORDER.index(risk) >= 2:
        phrase = PATTERN_PHRASE.get(top_rule, 'an unsafe action chain') if top_rule else 'an unsafe action chain'
        lines.append(f'This sequence does not support the declared {purpose_short} objective and resembles a '
                     f'{phrase} pattern.')
    elif risk == 'MEDIUM' or drift >= 30:
        lines.append('This sequence is not yet clearly unsafe, but it is moving away from the declared objective. '
                     'Sentinel is watching the next actions.')
    else:
        lines.append('This sequence is consistent with the declared objective.')
    return '\n'.join(lines)


def assess(context: dict, use_model: bool = True, predictive_blocking: bool | None = None) -> dict:
    """Pure assessment of a session context. No database access."""
    predictive_blocking = config.PREDICTIVE_BLOCKING if predictive_blocking is None else predictive_blocking
    actions = context['recent_actions']
    allowed = set(context.get('allowed_tools', []))
    classes = {a['class'] for a in actions}
    alignment = purpose_alignment(actions, context['declared_purpose'], allowed)
    drift = 100 - alignment
    trend = session_risk(actions)
    srisk = trend[-1] if trend else 0
    hits = evaluate_rules(actions)
    patterns = match_all(actions)

    # --- deterministic conclusion ---
    det_risk, det_response, det_categories, det_conf = level_for(srisk), 'ALLOW', [], 0.0
    for h in hits:
        det_risk = max_level(det_risk, h['risk'])
        det_response = max_level(det_response, h['response'], RESPONSE_ORDER)
        det_categories += [c for c in h['categories'] if c not in det_categories]
        det_conf = max(det_conf, h['confidence'])
    if drift >= 70:  # severe drift between declared purpose and observed behavior
        det_risk = max_level(det_risk, 'HIGH')
        det_response = max_level(det_response, 'REVIEW', RESPONSE_ORDER)
    if det_risk == 'MEDIUM':
        det_response = max_level(det_response, 'WATCH', RESPONSE_ORDER)
    if not det_categories:
        det_categories = (['NORMAL_TASK_EXECUTION'] if classes <= {'NORMAL', 'FILE_ENUM'} else
                          ['SYSTEM_CONFIGURATION'] if 'CONFIG' in classes else ['UNKNOWN'])
        det_conf = 0.98 if classes <= {'NORMAL'} and len(actions) >= 2 else 0.9 if classes <= {'NORMAL', 'FILE_ENUM'} else 0.6
    deterministic_signal = any(h['risk'] in {'HIGH', 'CRITICAL'} for h in hits)
    top_rule = max(hits, key=lambda h: (RISK_ORDER.index(h['risk']), h['confidence']))['rule'] if hits else None

    # --- model evaluator (advisory) ---
    evaluator = {'provider': 'deterministic-only', 'available': False, 'model_version': '', 'note': ''}
    model = None
    if use_model and actions:
        outcome = intent_llm_evaluator.evaluate(context, alignment)
        evaluator = {k: outcome[k] for k in ('provider', 'available', 'model_version')} | {'note': ''}
        model = outcome['result']
        if not outcome['available']:
            evaluator['note'] = 'Model evaluator unavailable; deterministic rules decided alone.'

    risk, categories, confidence, intent_text = det_risk, list(det_categories), det_conf, None
    if model:
        risk = max_level(det_risk, model.risk)  # the model may raise risk, never lower it
        if RISK_ORDER.index(model.risk) + 2 <= RISK_ORDER.index(det_risk):
            evaluator['note'] = 'Model evaluator assessed lower risk; the deterministic sequence rule was retained.'
        for c in model.categories:
            if c not in categories and c != 'UNKNOWN':
                categories.append(c)
        if not hits:
            confidence, intent_text = model.confidence, model.predicted_intent
        elif set(model.categories) & set(det_categories):
            confidence = max(confidence, model.confidence)
        alignment = round(0.7 * alignment + 0.3 * model.purpose_alignment * 100) if not hits else alignment
        drift = 100 - alignment
    risky = [c for c in categories if c not in {'NORMAL_TASK_EXECUTION', 'UNKNOWN'}]
    if risky and RISK_ORDER.index(risk) >= 1:
        categories = risky
    categories = sorted(set(categories), key=lambda c: SEVERITY_ORDER.index(c) if c in SEVERITY_ORDER else 99)
    primary = categories[0] if categories else 'UNKNOWN'
    label = _label(primary, categories, risk, classes, context['declared_purpose'], len(actions))

    # --- enforcement recommendation ---
    current = context.get('current_action') or (actions[-1] if actions else None)
    current_class = current['class'] if current else 'NORMAL'
    quarantine = det_response == 'QUARANTINE'
    block = (quarantine or (det_response == 'BLOCK' and current_class in HIGH_RISK_OBSERVED)
             or (predictive_blocking and confidence >= 0.90 and risk == 'CRITICAL' and deterministic_signal))
    model_concern = bool(model and model.recommended_response in {'REVIEW', 'BLOCK'})
    if quarantine:
        enforcement = 'QUARANTINE'
    elif block:
        enforcement = 'BLOCK'
    elif det_response in {'REVIEW', 'BLOCK'} or model_concern or RISK_ORDER.index(risk) >= 2:
        enforcement = 'REVIEW'  # a prediction alone escalates to human review, not to a block
    elif det_response == 'WATCH' or risk == 'MEDIUM' or (model and model.recommended_response == 'WATCH'):
        enforcement = 'WATCH'
    else:
        enforcement = 'ALLOW'

    # --- likely next actions (informational only, never executed) ---
    next_actions = []
    top = patterns[0] if patterns else None
    if top and top['next_stages'] and RISK_ORDER.index(risk) >= 1:
        for stage in top['next_stages'][:2]:
            cls = classify(stage['tool'])
            next_actions.append({'tool': stage['tool'], 'label': stage['label'],
                                 'confidence': round(min(0.95, 0.35 + top['match_score'] * 0.6), 2),
                                 'risk': level_for(STAGE_RISK.get(cls, 30)), 'source': f'pattern {top["pattern"]}'})
    if model:
        for tool in model.predicted_next_actions:
            if tool not in {n['tool'] for n in next_actions}:
                cls = classify(tool)
                next_actions.append({'tool': tool, 'label': cls.replace('_', ' ').title(),
                                     'confidence': round(model.confidence * 0.8, 2),
                                     'risk': level_for(STAGE_RISK.get(cls, 30)), 'source': 'model evaluator'})
    next_actions = next_actions[:3]

    purpose_short = _workflow_label(context['declared_purpose']).replace(' workflow', '').lower()
    if purpose_short == 'normal task execution':
        purpose_short = 'task'
    evidence = [h['explanation'] for h in hits][:4] or [a['description'] for a in actions[-3:]]
    if model:
        evidence += [e for e in model.evidence if e not in evidence][:3]
    if hits:
        rule_text = next(h['explanation'] for h in hits if h['rule'] == top_rule)
        predicted_intent = f'{label}. Observed behavior is consistent with this: {rule_text[0].lower()}{rule_text[1:]}'
    else:
        predicted_intent = intent_text or label
    return {
        'predicted_intent': predicted_intent,
        'intent_label': label,
        'categories': categories,
        'primary_category': primary,
        'confidence': round(confidence, 2),
        'risk_level': risk,
        'session_risk': srisk,
        'risk_trend': trend,
        'purpose_alignment': alignment,
        'intent_drift': drift,
        'drift_alert': 'SEVERE INTENT DRIFT' if drift >= 70 else 'INTENT DRIFT' if drift >= 40 else '',
        'evidence': evidence[:6],
        'reasoning_summary': _explanation(context, actions, risk, top_rule, purpose_short, drift) if actions else
        'No actions observed yet.',
        'predicted_next_actions': next_actions,
        'recommended_response': DISPLAY_RESPONSE[enforcement],
        'enforcement': enforcement,
        'quarantine': quarantine,
        'deterministic_signal': deterministic_signal,
        'rule_hits': hits,
        'patterns': patterns[:3],
        'attack_chain': top if top and top['stages'] else None,
        'evaluator': evaluator,
        'resource_sensitivity': RESOURCE_SENSITIVITY.get(current_class, 10),
        'predictive_blocking': predictive_blocking,
        'window': context.get('window', config.INTENT_HISTORY_WINDOW),
        'actions_considered': len(actions),
    }
