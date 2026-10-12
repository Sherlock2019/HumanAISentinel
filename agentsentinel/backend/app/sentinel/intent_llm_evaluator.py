"""Model-based intent evaluation through the existing provider abstraction.

The evaluator is advisory. Its output is validated against a controlled schema, and the Intent Engine
uses it only to *add* risk; it can never lower a deterministic conclusion or grant a permission.
If the provider is unavailable, the engine continues on deterministic rules alone.
"""
from __future__ import annotations

import os

from app.config import AI_PROVIDER
from app.sentinel import llm_safety_judge

MODEL_VERSION = {
    'mock': 'mock-intent-v1', 'openai': os.getenv('OPENAI_MODEL', 'gpt-4o-mini'),
    'anthropic': os.getenv('ANTHROPIC_MODEL', ''), 'gemini': os.getenv('GEMINI_MODEL', 'gemini-2.5-flash'),
    'ollama': os.getenv('OLLAMA_MODEL', 'llama3.2'),
}


def payload_for(context: dict, purpose_alignment: int) -> dict:
    """Only observable facts go to the model. Task text is labelled as untrusted data."""
    return {
        'declared_agent_purpose': context['declared_purpose'],
        'user_objective_untrusted': context.get('user_objective', '')[:500],
        'recent_actions': [{k: a.get(k) for k in ('index', 'tool', 'resource', 'operation', 'class', 'decision',
                                                    'policy_decision', 'blocked', 'description', 'current')}
                           for a in context['recent_actions']],
        'policy_decisions': context['policy_history'],
        'current_proposed_action': context.get('current_action'),
        'resource_sensitivity': {a['resource']: a['class'] for a in context['recent_actions']},
        'purpose_alignment': purpose_alignment,
    }


def evaluate(context: dict, purpose_alignment: int) -> dict:
    provider = llm_safety_judge.provider
    try:
        result = provider.predict_intent(payload_for(context, purpose_alignment))
        return {'result': result, 'available': True, 'provider': AI_PROVIDER,
                'model_version': MODEL_VERSION.get(AI_PROVIDER, AI_PROVIDER)}
    except Exception:
        # No provider error details or credentials enter evidence.
        return {'result': None, 'available': False, 'provider': AI_PROVIDER,
                'model_version': MODEL_VERSION.get(AI_PROVIDER, AI_PROVIDER)}
