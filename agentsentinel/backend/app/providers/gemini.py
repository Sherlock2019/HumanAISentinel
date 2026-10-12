from app.providers.remote import RemoteProvider

class GeminiProvider(RemoteProvider):
    def __init__(self):
        super().__init__('gemini')
