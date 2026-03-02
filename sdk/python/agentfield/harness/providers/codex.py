"""Codex provider using CLI subprocess (codex exec --json)."""

from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

from agentfield.harness._cli import extract_final_text, parse_jsonl, run_cli
from agentfield.harness._result import Metrics, RawResult


class CodexProvider:
    """Codex CLI provider. Invokes `codex exec --json` subprocess."""

    def __init__(self, bin_path: str = "codex"):
        self._bin = bin_path

    async def execute(self, prompt: str, options: dict[str, object]) -> RawResult:
        cmd = [self._bin, "exec", "--json"]

        if options.get("cwd"):
            cmd.extend(["-C", str(options["cwd"])])
        if options.get("permission_mode") == "auto":
            cmd.append("--full-auto")

        cmd.append(prompt)

        env: Dict[str, str] = {}
        env_value = options.get("env")
        if isinstance(env_value, dict):
            env = {
                str(key): str(value)
                for key, value in env_value.items()
                if isinstance(key, str) and isinstance(value, str)
            }

        cwd: Optional[str] = None
        cwd_value = options.get("cwd")
        if isinstance(cwd_value, str):
            cwd = cwd_value
        start_api = time.monotonic()

        try:
            stdout, stderr, returncode = await run_cli(cmd, env=env, cwd=cwd)
        except FileNotFoundError:
            return RawResult(
                is_error=True,
                error_message=(
                    f"Codex binary not found at '{self._bin}'. "
                    "Install Codex CLI: https://github.com/openai/codex"
                ),
                metrics=Metrics(),
            )
        except TimeoutError as exc:
            return RawResult(
                is_error=True,
                error_message=str(exc),
                metrics=Metrics(),
            )

        api_ms = int((time.monotonic() - start_api) * 1000)
        events = parse_jsonl(stdout)
        result_text = extract_final_text(events)

        num_turns = 0
        total_cost: Optional[float] = None
        session_id = ""
        messages: List[Dict[str, Any]] = events

        for event in events:
            if event.get("type") == "turn.completed":
                num_turns += 1
            elif event.get("type") == "thread.started":
                session_id = str(event.get("thread_id", ""))

        is_error = returncode != 0 and result_text is None

        return RawResult(
            result=result_text,
            messages=messages,
            metrics=Metrics(
                duration_api_ms=api_ms,
                num_turns=num_turns,
                total_cost_usd=total_cost,
                session_id=session_id,
            ),
            is_error=is_error,
            error_message=stderr.strip() if is_error else None,
        )
