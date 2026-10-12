from app.providers.remote import RemoteProvider

class OllamaProvider(RemoteProvider):
    def __init__(self):
        super().__init__('ollama')
