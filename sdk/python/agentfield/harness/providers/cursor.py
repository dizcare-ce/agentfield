from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Dict, Optional

from agentfield.harness._result import RawResult, FailureType
from agentfield.harness.providers._base import HarnessProvider

logger = logging.getLogger(__name__)


class CursorProvider(HarnessProvider):
    def __init__(self, bin_path: str = "cursor", server_url: Optional[str] = None):
        self._bin_path = bin_path
        self._server_url = server_url

    async def execute(self, prompt: str, options: Dict[str, Any]) -> RawResult:
        cmd = [self._bin_path, "run"]
        if self._server_url:
            cmd.extend(["--server", self._server_url])

        logger.debug("Executing cursor command: %s", " ".join(cmd))
        logger.debug("Cursor input prompt: %s", prompt)

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            text=True,
        )

        stdout, stderr = await process.communicate(input=prompt)
        return_code = process.returncode

        if return_code != 0:
            logger.error(
                "Cursor command failed with code %d. Stderr: %s", return_code, stderr
            )
            return RawResult(
                result=stdout,
                error_message=stderr,
                is_error=True,
                failure_type=FailureType.CRASH,
                returncode=return_code,
            )

        try:
            parsed_output = json.loads(stdout)
            return RawResult(
                result=stdout,
                messages=parsed_output.get("messages", []),
                is_error=False,
                failure_type=FailureType.NONE,
                returncode=return_code,
            )
        except json.JSONDecodeError:
            logger.warning("Cursor output is not valid JSON. Stdout: %s", stdout)
            return RawResult(
                result=stdout,
                is_error=False,  # Consider if non-JSON output should be an error
                failure_type=FailureType.NONE,
                returncode=return_code,
            )

        # Assume cursor outputs JSON to stdout
        try:
            parsed_output = json.loads(stdout)
            return {
                "stdout": stdout,
                "stderr": stderr,
                "code": return_code,
                "result": parsed_output,
            }
        except json.JSONDecodeError:
            logger.warning("Cursor output is not valid JSON. Stdout: %s", stdout)
            return {
                "stdout": stdout,
                "stderr": stderr,
                "code": return_code,
                "result": stdout,  # Return raw stdout if not JSON
            }
