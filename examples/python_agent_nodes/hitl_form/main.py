"""
HITL Form Agent - Native Human-in-the-Loop PR Review Example

Demonstrates:
- Building a rich HITL form schema with agentfield.hitl builder
- Markdown rendering (fake diff inside a code fence)
- button_group as the primary decision widget (the money shot)
- Conditional visibility: 'comments' required when rejecting or requesting changes
- app.pause(form_schema=...) — native built-in portal, zero external services
- Handling the returned ApprovalResult (decision, raw form values)
"""

import os

from agentfield import Agent, AIConfig, ApprovalResult
from agentfield import hitl

FALLBACK_RISK_SUMMARY = (
    "Removes plaintext token storage in favour of AES-256-GCM envelope "
    "encryption — reduces blast radius on session store compromise but adds "
    "a crypto dependency to verify."
)
AI_KEY_ENV_VARS = (
    "OPENAI_API_KEY",
    "OPENROUTER_API_KEY",
    "ANTHROPIC_API_KEY",
    "AGENTFIELD_AI_KEY",
)

# ============= AGENT SETUP =============

app = Agent(
    node_id="pr-review-bot",
    agentfield_server=os.getenv("AGENTFIELD_URL", "http://localhost:8080"),
    ai_config=AIConfig(
        model=os.getenv("SMALL_MODEL", "openai/gpt-4o-mini"), temperature=0.3
    ),
)

# ============= SKILLS (DETERMINISTIC) =============


@app.skill()
def fetch_pr_details(pr_number: int) -> dict:
    """Simulates fetching PR metadata and a diff from a VCS system."""
    return {
        "pr_number": pr_number,
        "title": f"refactor: extract AuthMiddleware into standalone package (#{pr_number})",
        "author": "dev-bot",
        "base": "main",
        "head": "refactor/auth-middleware",
        "changed_files": 4,
        "additions": 87,
        "deletions": 112,
        "diff": """\
diff --git a/internal/middleware/auth.go b/internal/middleware/auth.go
index 3a7f1c2..9b84d05 100644
--- a/internal/middleware/auth.go
+++ b/internal/middleware/auth.go
@@ -12,14 +12,18 @@ import (
-// validateToken checks session store for a matching token.
-func validateToken(ctx context.Context, token string) (bool, error) {
-    stored, err := session.Store(ctx, token)
-    if err != nil {
-        return false, err
-    }
-    return stored == token, nil
+// validateToken checks session store for an encrypted token match.
+// Uses AES-256-GCM envelope encryption per the security RFC.
+func validateToken(ctx context.Context, token string) (bool, error) {
+    encrypted, err := session.StoreEncrypted(ctx, token)
+    if err != nil {
+        return false, fmt.Errorf("auth: encrypt token: %w", err)
+    }
+    return encrypted.Matches(token), nil
 }
+
+// Deprecated: Store is replaced by StoreEncrypted. Retained for migration only.
+var Store = session.Store
diff --git a/internal/middleware/auth_test.go b/internal/middleware/auth_test.go
index c4e9a11..7d02f38 100644
--- a/internal/middleware/auth_test.go
+++ b/internal/middleware/auth_test.go
@@ -28,6 +28,10 @@ func TestValidateToken(t *testing.T) {
+    t.Run("encrypted token round-trip", func(t *testing.T) {
+        token := "test-secret-abc"
+        ok, err := validateToken(ctx, token)
+        require.NoError(t, err)
+        require.True(t, ok)
+    })
 }""",
    }


# ============= REASONERS (AI-POWERED) =============


@app.reasoner()
async def review_pr(pr_number: int) -> dict:
    """
    Fetches a pull request, builds a rich HITL form, and pauses execution
    until a human reviewer submits their decision.

    The form showcases:
    - Markdown block with a real-looking Go diff (code fence inside description)
    - button_group for Approve / Request changes / Reject
    - Conditional textarea: visible and required only when blocking
    - Checkbox to hard-block the merge pipeline

    Flow:
    review_pr (entry point)
    ├─→ fetch_pr_details (skill)
    └─→ app.pause(form_schema=...) — suspends until human responds
    """
    # Step 1: Fetch PR details (deterministic skill)
    pr = fetch_pr_details(pr_number)

    # Step 2: Use AI to write a one-sentence risk summary
    risk_summary = FALLBACK_RISK_SUMMARY
    configured_ai_keys = [name for name in AI_KEY_ENV_VARS if os.getenv(name)]
    if not configured_ai_keys:
        print(
            "[hitl_form] No AI provider key configured "
            f"({', '.join(AI_KEY_ENV_VARS)}); using stubbed risk summary."
        )
    else:
        try:
            risk = await app.ai(
                system="You are a security-focused code reviewer. In one sentence, summarise the main risk or benefit of this diff.",
                user=f"PR title: {pr['title']}\n\nDiff:\n{pr['diff']}",
            )
            risk_summary = risk.text if hasattr(risk, "text") else str(risk)
        except Exception as exc:
            print(
                "[hitl_form] AI risk summary unavailable; "
                f"falling back to stubbed summary. Error: {exc}"
            )

    # Step 3: Build the HITL form schema
    #
    # The form combines markdown (with a fenced diff) and a button_group —
    # the flagship pattern for binary/ternary decisions.  Clicking a button
    # immediately submits the whole form, so no separate "Submit" button
    # is needed for the decision itself.
    description_md = f"""\
## PR #{pr['pr_number']} — {pr['title']}

**Author:** `{pr['author']}` &nbsp;·&nbsp; \
**{pr['base']} ← {pr['head']}** &nbsp;·&nbsp; \
+{pr['additions']} / -{pr['deletions']} across {pr['changed_files']} files

> **AI risk summary:** {risk_summary}

---

### Diff

```diff
{pr['diff']}
```
"""

    schema = hitl.Form(
        title=f"Review PR #{pr['pr_number']}",
        description=description_md,
        tags=["pr-review", "team:platform"],
        priority="normal",
        submit_label="Submit review",
        fields=[
            # Render the full markdown description (including fenced diff) as a
            # rich block above the decision controls.
            hitl.Markdown(description_md),

            # Divider between context and decision controls
            hitl.Divider(),

            hitl.Heading("Your decision"),

            # button_group: clicking a button sets `decision` and submits.
            # This is the money shot — large shadcn Buttons, no extra Submit step.
            hitl.ButtonGroup(
                name="decision",
                label="",
                required=True,
                options=[
                    hitl.Option("approve", "Approve", variant="default"),
                    hitl.Option(
                        "request_changes", "Request changes", variant="secondary"
                    ),
                    hitl.Option("reject", "Reject", variant="destructive"),
                ],
            ),

            # comments: visible (and required) only when the reviewer is NOT approving.
            # hidden_when uses flat equality — forward-compatible with all/any later.
            hitl.Textarea(
                name="comments",
                label="Comments",
                placeholder="What needs to change? Be specific — the author sees this.",
                rows=5,
                required=True,
                hidden_when={"field": "decision", "equals": "approve"},
            ),

            # Block the merge pipeline — a safety hard-stop independent of the decision.
            hitl.Checkbox(
                name="block_merge",
                label="Block merge until this review is resolved",
                default=False,
            ),
        ],
    ).to_dict()

    # Step 4: Pause execution — control plane transitions to "waiting".
    # The /hitl portal renders the form; the agent resumes when it's submitted.
    result: ApprovalResult = await app.pause(
        form_schema=schema,
        tags=["pr-review"],
        priority="normal",
        expires_in_hours=24,
    )

    # Step 5: Unpack the submitted form values from raw_response
    decision = result.raw_response.get("decision", "unknown") if result.raw_response else result.decision
    comments = result.raw_response.get("comments", "") if result.raw_response else ""
    block_merge = result.raw_response.get("block_merge", False) if result.raw_response else False

    print(f"\n=== PR Review Result ===")
    print(f"  PR:          #{pr['pr_number']} — {pr['title']}")
    print(f"  Decision:    {decision}")
    print(f"  Comments:    {comments or '(none)'}")
    print(f"  Block merge: {block_merge}")
    print(f"  Approved:    {result.approved}")
    print(f"========================\n")

    return {
        "pr_number": pr["pr_number"],
        "decision": decision,
        "comments": comments,
        "block_merge": block_merge,
        "approved": result.approved,
        "message": _outcome_message(decision),
    }


def _outcome_message(decision: str) -> str:
    return {
        "approve": "PR approved — ready to merge.",
        "request_changes": "Changes requested — author notified.",
        "reject": "PR rejected — branch will not be merged.",
    }.get(decision, f"Unknown decision: {decision}")


# ============= START SERVER OR CLI =============

if __name__ == "__main__":
    print("PR Review HITL Agent")
    print("Node: pr-review-bot")
    print("Control Plane: http://localhost:8080")
    print()
    print("Reasoners:")
    print("  - review_pr(pr_number): Fetch PR, render diff, pause for human decision")
    print()
    print("Once running, trigger a review:")
    print(
        "  curl -X POST http://localhost:8080/api/v1/execute/pr-review-bot.review_pr \\"
    )
    print('    -H "Content-Type: application/json" \\')
    print('    -d \'{"input": {"pr_number": 1138}}\'')
    print()
    print("Then open http://localhost:8080/hitl to see the form.")

    app.run(auto_port=True)
