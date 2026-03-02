from __future__ import annotations

import asyncio
import random
import time
from typing import Any, Dict, Optional

from agentfield.harness._result import HarnessResult, RawResult
from agentfield.harness._schema import (
    build_prompt_suffix,
    cleanup_temp_files,
    get_output_path,
    parse_and_validate,
)
from agentfield.harness.providers._base import HarnessProvider
from agentfield.harness.providers._factory import build_provider

TRANSIENT_PATTERNS = {
    "rate limit",
    "rate_limit",
    "overloaded",
    "timeout",
    "timed out",
    "connection reset",
    "connection refused",
    "temporarily unavailable",
    "service unavailable",
    "503",
    "502",
    "504",
    "internal server error",
    "500",
}


def _is_transient(error_str: str) -> bool:
    lower = error_str.lower()
    return any(pattern in lower for pattern in TRANSIENT_PATTERNS)


def _resolve_options(
    config: Optional[Any], overrides: Dict[str, Any]
) -> Dict[str, Any]:
    options: Dict[str, Any] = {}
    if config is not None:
        for field_name in [
            "provider",
            "model",
            "max_turns",
            "max_budget_usd",
            "max_retries",
            "initial_delay",
            "max_delay",
            "backoff_factor",
            "tools",
            "permission_mode",
            "system_prompt",
            "env",
            "cwd",
            "codex_bin",
            "gemini_bin",
            "opencode_bin",
        ]:
            val = getattr(config, field_name, None)
            if val is not None:
                options[field_name] = val

    for key, val in overrides.items():
        if val is not None:
            options[key] = val
    return options


class HarnessRunner:
    def __init__(self, config: Optional[Any] = None):
        self._config = config

    async def run(
        self,
        prompt: str,
        *,
        schema: Any = None,
        provider: Optional[str] = None,
        model: Optional[str] = None,
        max_turns: Optional[int] = None,
        max_budget_usd: Optional[float] = None,
        tools: Optional[list[str]] = None,
        permission_mode: Optional[str] = None,
        system_prompt: Optional[str] = None,
        env: Optional[Dict[str, str]] = None,
        cwd: Optional[str] = None,
        **kwargs: Any,
    ) -> HarnessResult:
        overrides = {
            "provider": provider,
            "model": model,
            "max_turns": max_turns,
            "max_budget_usd": max_budget_usd,
            "tools": tools,
            "permission_mode": permission_mode,
            "system_prompt": system_prompt,
            "env": env,
            "cwd": cwd,
            **kwargs,
        }
        options = _resolve_options(self._config, overrides)

        resolved_provider = options.get("provider")
        if not resolved_provider:
            raise ValueError(
                "No harness provider specified. Set 'provider' in HarnessConfig "
                "or pass it to .harness() call."
            )

        resolved_cwd = str(options.get("cwd", "."))
        provider_instance = self._build_provider(str(resolved_provider), options)

        effective_prompt = prompt
        if schema is not None:
            effective_prompt = prompt + build_prompt_suffix(schema, resolved_cwd)

        start_time = time.monotonic()
        try:
            raw = await self._execute_with_retry(
                provider_instance, effective_prompt, options
            )

            if schema is not None:
                return self._handle_schema_output(
                    raw,
                    schema,
                    resolved_cwd,
                    start_time,
                )

            elapsed = int((time.monotonic() - start_time) * 1000)
            return HarnessResult(
                result=raw.result,
                parsed=None,
                is_error=raw.is_error,
                error_message=raw.error_message,
                cost_usd=raw.metrics.total_cost_usd,
                num_turns=raw.metrics.num_turns,
                duration_ms=elapsed,
                session_id=raw.metrics.session_id,
                messages=raw.messages,
            )
        finally:
            if schema is not None:
                cleanup_temp_files(resolved_cwd)

    def _build_provider(
        self, provider_name: str, options: Dict[str, Any]
    ) -> HarnessProvider:
        from types import SimpleNamespace

        provider_options = dict(options)
        provider_options["provider"] = provider_name
        config_ns = SimpleNamespace(**provider_options)
        config_for_factory: Any = config_ns
        return build_provider(config_for_factory)

    async def _execute_with_retry(
        self,
        provider: HarnessProvider,
        prompt: str,
        options: Dict[str, Any],
    ) -> RawResult:
        max_retries = int(options.get("max_retries", 3))
        initial_delay = float(options.get("initial_delay", 1.0))
        max_delay = float(options.get("max_delay", 30.0))
        backoff_factor = float(options.get("backoff_factor", 2.0))

        last_error: Optional[Exception] = None

        for attempt in range(max_retries + 1):
            try:
                result = await provider.execute(prompt, options)
                if not result.is_error:
                    return result

                error_msg = result.error_message or ""
                if _is_transient(error_msg) and attempt < max_retries:
                    delay = min(initial_delay * (backoff_factor**attempt), max_delay)
                    delay += random.uniform(-delay * 0.25, delay * 0.25)
                    await asyncio.sleep(delay)
                    continue
                return result
            except Exception as exc:
                last_error = exc
                if _is_transient(str(exc)) and attempt < max_retries:
                    delay = min(initial_delay * (backoff_factor**attempt), max_delay)
                    delay += random.uniform(-delay * 0.25, delay * 0.25)
                    await asyncio.sleep(delay)
                    continue
                raise

        if last_error is not None:
            raise last_error
        return RawResult(is_error=True, error_message="Max retries exceeded")

    def _handle_schema_output(
        self,
        raw: RawResult,
        schema: Any,
        cwd: str,
        start_time: float,
    ) -> HarnessResult:
        output_path = get_output_path(cwd)
        validated = parse_and_validate(output_path, schema)
        elapsed = int((time.monotonic() - start_time) * 1000)

        if validated is not None:
            return HarnessResult(
                result=raw.result,
                parsed=validated,
                is_error=False,
                cost_usd=raw.metrics.total_cost_usd,
                num_turns=raw.metrics.num_turns,
                duration_ms=elapsed,
                session_id=raw.metrics.session_id,
                messages=raw.messages,
            )

        return HarnessResult(
            result=raw.result,
            parsed=None,
            is_error=True,
            error_message="Schema validation failed after parse and cosmetic repair attempts.",
            cost_usd=raw.metrics.total_cost_usd,
            num_turns=raw.metrics.num_turns,
            duration_ms=elapsed,
            session_id=raw.metrics.session_id,
            messages=raw.messages,
        )
