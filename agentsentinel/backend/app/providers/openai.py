from app.providers.remote import RemoteProvider

class OpenAIProvider(RemoteProvider):
    def __init__(self):
        super().__init__('openai')
