import requests


class AIProviderError(Exception):
    """Raised when a provider call fails (network, auth, or unexpected response shape)."""


class AIProvider:
    def complete(self, system_prompt: str, user_prompt: str, max_tokens: int = 500) -> str:
        raise NotImplementedError


class OllamaProvider(AIProvider):
    """Local model via Ollama's HTTP API. No API key, no data leaves the device."""

    def __init__(self, endpoint: str, model: str):
        self.endpoint = (endpoint or "http://localhost:11434").rstrip("/")
        self.model = model or "llama3.1"

    def complete(self, system_prompt: str, user_prompt: str, max_tokens: int = 500) -> str:
        try:
            resp = requests.post(
                f"{self.endpoint}/api/chat",
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    "stream": False,
                    "options": {"num_predict": max_tokens},
                },
                timeout=60,
            )
            resp.raise_for_status()
            return resp.json()["message"]["content"]
        except requests.RequestException as e:
            raise AIProviderError(f"Ollama request failed: {e}")
        except (KeyError, ValueError) as e:
            raise AIProviderError(f"Unexpected Ollama response: {e}")


class OpenAICompatibleProvider(AIProvider):
    """Covers OpenAI proper and any OpenAI-compatible chat/completions API."""

    def __init__(self, api_key: str, model: str, base_url: str = "https://api.openai.com/v1"):
        self.api_key = api_key
        self.model = model or "gpt-4o-mini"
        self.base_url = (base_url or "https://api.openai.com/v1").rstrip("/")

    def complete(self, system_prompt: str, user_prompt: str, max_tokens: int = 500) -> str:
        try:
            resp = requests.post(
                f"{self.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    "max_tokens": max_tokens,
                },
                timeout=60,
            )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]
        except requests.RequestException as e:
            raise AIProviderError(f"OpenAI-compatible request failed: {e}")
        except (KeyError, IndexError, ValueError) as e:
            raise AIProviderError(f"Unexpected response shape: {e}")


class AnthropicProvider(AIProvider):
    def __init__(self, api_key: str, model: str):
        self.api_key = api_key
        self.model = model or "claude-3-5-haiku-20241022"

    def complete(self, system_prompt: str, user_prompt: str, max_tokens: int = 500) -> str:
        try:
            resp = requests.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": self.api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": self.model,
                    "system": system_prompt,
                    "max_tokens": max_tokens,
                    "messages": [{"role": "user", "content": user_prompt}],
                },
                timeout=60,
            )
            resp.raise_for_status()
            return resp.json()["content"][0]["text"]
        except requests.RequestException as e:
            raise AIProviderError(f"Anthropic request failed: {e}")
        except (KeyError, IndexError, ValueError) as e:
            raise AIProviderError(f"Unexpected response shape: {e}")


def get_provider(config: dict) -> AIProvider:
    provider = (config.get("provider") or "none").lower()
    if provider == "ollama":
        return OllamaProvider(config.get("endpoint"), config.get("model"))
    if provider == "openai":
        return OpenAICompatibleProvider(config.get("api_key"), config.get("model"), config.get("endpoint") or "https://api.openai.com/v1")
    if provider == "anthropic":
        return AnthropicProvider(config.get("api_key"), config.get("model"))
    raise AIProviderError("No AI provider configured")
