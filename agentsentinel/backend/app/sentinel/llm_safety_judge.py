from app.config import AI_PROVIDER
from app.providers.mock import MockProvider
from app.providers.ollama import OllamaProvider
from app.providers.openai import OpenAIProvider
from app.providers.gemini import GeminiProvider
from app.providers.anthropic import AnthropicProvider
from app.providers.remote import RemoteProvider

PROVIDERS = {'mock': MockProvider, 'ollama': OllamaProvider, 'openai': OpenAIProvider, 'gemini': GeminiProvider, 'anthropic': AnthropicProvider}
provider = PROVIDERS[AI_PROVIDER]() if AI_PROVIDER in PROVIDERS else RemoteProvider(AI_PROVIDER)

def evaluate(agent, action, policy, history):
    try:
        result = provider.evaluate({'purpose': agent.purpose, 'action': action.model_dump(), 'policy': policy, 'recent_history': history}).model_dump()
        return {**result, 'available': True, 'provider': AI_PROVIDER}
    except Exception:
        # No exception details or provider credentials enter audit evidence.
        return {'intent_alignment': 1, 'authorization_risk': 4, 'data_risk': 4, 'injection_risk': 1, 'privilege_risk': 4, 'necessity': 1, 'reversibility_risk': 4, 'recommended_decision': 'REVIEW', 'summary': 'Safety evaluator unavailable. Human review is required; the action was not executed.', 'available': False, 'provider': AI_PROVIDER}
