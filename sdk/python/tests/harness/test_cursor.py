import asyncio
import json
import pytest
from unittest.mock import AsyncMock, patch

from agentfield.harness._result import RawResult, FailureType
from agentfield.harness.providers.cursor import CursorProvider


@pytest.fixture
def mock_subprocess_exec():
    with patch("asyncio.create_subprocess_exec", new_callable=AsyncMock) as mock_exec:
        yield mock_exec


@pytest.mark.asyncio
async def test_cursor_provider_initialization():
    provider = CursorProvider()
    assert provider._bin_path == "cursor"
    assert provider._server_url is None

    provider_with_args = CursorProvider(
        bin_path="/usr/local/bin/cursor", server_url="http://localhost:9000"
    )
    assert provider_with_args._bin_path == "/usr/local/bin/cursor"
    assert provider_with_args._server_url == "http://localhost:9000"


@pytest.mark.asyncio
async def test_cursor_provider_execute_success_json(mock_subprocess_exec):
    mock_process = AsyncMock()
    mock_process.returncode = 0
    mock_process.communicate.return_value = (
        json.dumps({"messages": [{"role": "assistant", "content": "success"}]}).encode(
            "utf-8"
        ),
        b"",
    )
    mock_subprocess_exec.return_value = mock_process

    provider = CursorProvider()
    prompt = "test prompt"
    options = {"some_option": "value"}
    result = await provider.execute(prompt, options)

    mock_subprocess_exec.assert_called_once_with(
        "cursor",
        "run",
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    mock_process.communicate.assert_called_once_with(input=prompt.encode("utf-8"))
    assert isinstance(result, RawResult)
    assert result.returncode == 0
    assert result.is_error is False
    assert result.failure_type == FailureType.NONE
    assert result.messages == [{"role": "assistant", "content": "success"}]
    assert result.result is not None


@pytest.mark.asyncio
async def test_cursor_provider_execute_success_text(mock_subprocess_exec):
    mock_process = AsyncMock()
    mock_process.returncode = 0
    mock_process.communicate.return_value = (b"plain text output", b"")
    mock_subprocess_exec.return_value = mock_process

    provider = CursorProvider()
    prompt = "test prompt"
    options = {"some_option": "value"}
    result = await provider.execute(prompt, options)

    assert isinstance(result, RawResult)
    assert result.returncode == 0
    assert result.is_error is False
    assert result.failure_type == FailureType.NONE
    assert result.result == "plain text output"
    assert result.messages == []


@pytest.mark.asyncio
async def test_cursor_provider_execute_failure(mock_subprocess_exec):
    mock_process = AsyncMock()
    mock_process.returncode = 1
    mock_process.communicate.return_value = (b"", b"error output")
    mock_subprocess_exec.return_value = mock_process

    provider = CursorProvider()
    prompt = "test prompt"
    options = {"some_option": "value"}
    result = await provider.execute(prompt, options)

    assert isinstance(result, RawResult)
    assert result.returncode == 1
    assert result.is_error is True
    assert result.failure_type == FailureType.CRASH
    assert result.error_message == "error output"
    assert result.result == ""


@pytest.mark.asyncio
async def test_cursor_provider_execute_with_server_url(mock_subprocess_exec):
    mock_process = AsyncMock()
    mock_process.returncode = 0
    mock_process.communicate.return_value = (
        json.dumps({"messages": []}).encode("utf-8"),
        b"",
    )
    mock_subprocess_exec.return_value = mock_process

    provider = CursorProvider(server_url="http://localhost:9000")
    prompt = "test prompt"
    options = {"some_option": "value"}
    await provider.execute(prompt, options)

    mock_subprocess_exec.assert_called_once_with(
        "cursor",
        "run",
        "--server",
        "http://localhost:9000",
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
