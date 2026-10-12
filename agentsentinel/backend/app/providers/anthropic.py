from app.providers.remote import RemoteProvider

class AnthropicProvider(RemoteProvider):
    def __init__(self):
        super().__init__('anthropic')
