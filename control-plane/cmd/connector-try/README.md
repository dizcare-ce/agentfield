# connector-try

Tiny CLI for invoking AgentField connectors from your terminal. Three modes:

- **list** — see every connector and operation embedded in this binary
- **describe** — show the signature of one operation (inputs, output, auth env var)
- **invoke** — actually run an op (live, dry-run, or routed at a mock base)

## Install

```bash
cd control-plane && go install ./cmd/connector-try
# binary lands in $GOPATH/bin (typically ~/go/bin)
```

Or run without installing:

```bash
cd control-plane && go run ./cmd/connector-try ...
```

## List & describe (no setup required)

```bash
connector-try list
connector-try describe slack chat_post_message
connector-try describe notion query_database
```

`describe` shows the exact env var to set, what fields the op accepts, what it returns, and a copy-pasteable example input.

## Dry-run (no API key, no network)

```bash
connector-try slack chat_post_message \
  --input '{"channel":"C123","text":"hello world"}' \
  --dry-run
```

Output shows the **exact** HTTP request the executor would have built —
URL with path templating, query string with defaults applied, headers
(auth redacted), JSON body. Use this to sanity-check a manifest.

```text
POST https://slack.com/api/chat.postMessage
Authorization: Bearer <REDACTED>
Content-Type: application/json

{
  "channel": "C123",
  "text": "hello world"
}
```

Add `-v` to also see the equivalent `curl` command.

## Live invocation (real API)

Set the auth env var and go:

```bash
export SLACK_BOT_TOKEN="xoxb-..."
connector-try slack chat_post_message --input '{"channel":"C123","text":"hi"}'
```

Or load from a dotenv file:

```bash
connector-try slack chat_post_message \
  --input '{"channel":"C123","text":"hi"}' \
  --env-file ~/.config/agentfield/.env
```

## Mock backend (Prism, ngrok, your own server)

```bash
# In one shell — start a Prism mock from the Slack OpenAPI spec
prism mock https://raw.githubusercontent.com/slackapi/slack-api-specs/master/web-api/slack_web_openapi_v2.json --port 4010

# In another shell — point connector-try at the mock
connector-try slack chat_post_message \
  --input '{"channel":"C123","text":"hi"}' \
  --base http://localhost:4010
```

`--base` rewrites the `scheme://host` portion of every op URL in the
connector. Path stays intact, so the mock just needs to honor the same
path the real API would.

## Input formats

- Inline JSON: `--input '{"key":"value"}'`
- File: `--input @path/to/inputs.json`
- Stdin: `--input -`

## Connector → env var quick reference

| Connector | Env var | Token type |
|---|---|---|
| `airtable` | `AIRTABLE_PAT` | Personal Access Token |
| `github` | `GITHUB_PAT` | Personal Access Token |
| `gitlab` | `GITLAB_TOKEN` | Personal/project access token |
| `gmail` | `GOOGLE_OAUTH_TOKEN` | OAuth access token (not refresh token) |
| `google_calendar` | `GOOGLE_OAUTH_TOKEN` | OAuth access token |
| `hubspot` | `HUBSPOT_PRIVATE_APP_TOKEN` | Private app token |
| `notion` | `NOTION_TOKEN` | Internal integration secret |
| `slack` | `SLACK_BOT_TOKEN` | Bot token (`xoxb-...`) |

`connector-try describe <name> <op>` always shows the right env var if
this table drifts.

## Exit codes

- `0` — success
- `1` — CLI usage error
- `2` — connector or operation not found
- `3` — invocation failed (network, auth, validation, upstream error)
