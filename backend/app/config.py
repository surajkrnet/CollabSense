from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables or .env file."""

    app_name: str = "CollabSense Autonomous Product Strategy OS API"
    app_version: str = "4.1.0"
    gemini_api_key: str = ""
    gemini_model_primary: str = "gemini-2.5-flash"
    gemini_model_fallback: str = "gemini-1.5-flash"

    # OpenRouter free-tier models ONLY (hard `:free` allowlist + per-model cooldown):
    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_ultra_model: str = "nvidia/nemotron-3-ultra-550b-a55b:free"
    openrouter_super_model: str = "nvidia/nemotron-3.5-super-vl:free"
    openrouter_light_model: str = "nvidia/nemotron-3.5-lightning:free"
    openrouter_gemma_large_model: str = "google/gemma-4-31b-it:free"
    openrouter_gemma_fast_model: str = "google/gemma-4-26b-a4b-it:free"
    openrouter_ling_flash_model: str = "inclusionai/ling-3.2-flash:free"

    # Decision-Making LLM: Perplexity Decider V1.3 (free) via OpenRouter Decisions API
    openrouter_decisions_url: str = "https://openrouter.ai/api/alpha/decisions"
    openrouter_decider_model: str = "perplexity/pplx-decider-v1.3:free"

    # NVIDIA NIM Models (integrate.api.nvidia.com) — moonshotai/kimi-k3.1-pro runs ONLY on NVIDIA NIM
    nvidia_api_key: str = ""
    nvidia_base_url: str = "https://integrate.api.nvidia.com/v1"
    nvidia_super_model: str = "nvidia/nemotron-3.5-super-vl-120b-a12b"
    nvidia_light_model: str = "nvidia/nemotron-3.5-lightning-30b-a3b"
    openrouter_strong_model: str = "moonshotai/kimi-k3.1-pro"
    kimi_primary_timeout_seconds: float = 7.5

    supabase_url: str = ""
    supabase_anon_key: str = ""
    linear_api_key: str = ""
    linear_team_id: str = "COLLABSENSE-ENG"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
