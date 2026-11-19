#!/usr/bin/env bash
# Sends a Telegram message describing the current GitHub event (PR or deploy workflow run).
# Needs: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (optional TELEGRAM_THREAD_ID), GITHUB_EVENT_PATH.
set -euo pipefail

if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_CHAT_ID:-}" ]; then
  echo "Telegram secrets not set; skipping."; exit 0
fi

ev="$GITHUB_EVENT_PATH"
esc() { sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }
j() { jq -r "$1 // empty" "$ev"; }
repo="$(printf '%s' "$GITHUB_REPOSITORY" | esc)"

case "$GITHUB_EVENT_NAME" in
  pull_request|pull_request_target)
    action="$(j .action)"; merged="$(j .pull_request.merged)"
    case "$action" in
      opened|reopened)   head="🆕 PR mới" ;;
      ready_for_review)  head="👀 PR sẵn sàng review" ;;
      closed) if [ "$merged" = true ]; then head="✅ PR đã merge"; else head="🚫 PR đã đóng (không merge)"; fi ;;
      *) echo "Ignoring action $action"; exit 0 ;;
    esac
    num="$(j .pull_request.number)"
    title="$(j .pull_request.title | esc)"
    url="$(j .pull_request.html_url)"
    author="$(j .pull_request.user.login | esc)"
    base="$(j .pull_request.base.ref | esc)"; headref="$(j .pull_request.head.ref | esc)"
    stats="+$(j .pull_request.additions) / -$(j .pull_request.deletions) · $(j .pull_request.changed_files) files"
    body="$(j .pull_request.body | sed '/^🤖 Generated with/d' | head -c 1500 | esc)"
    [ "$(j .pull_request.body | wc -c)" -gt 1500 ] && body="$body…"
    text="<b>$head</b> · <code>$repo</code>
<a href=\"$url\">#$num $title</a>
👤 $author · <code>$headref</code> → <code>$base</code>
📊 $stats"
    [ -n "$body" ] && text="$text

<blockquote expandable>$body</blockquote>"
    ;;
  workflow_run)
    name="$(j .workflow_run.name | esc)"; concl="$(j .workflow_run.conclusion)"
    url="$(j .workflow_run.html_url)"; branch="$(j .workflow_run.head_branch | esc)"
    sha="$(j .workflow_run.head_sha | cut -c1-7)"; actor="$(j .workflow_run.triggering_actor.login | esc)"
    msg="$(j .workflow_run.head_commit.message | head -n1 | esc)"
    case "$concl" in
      success) icon="🚀"; status="THÀNH CÔNG" ;;
      failure) icon="❌"; status="THẤT BẠI" ;;
      cancelled) icon="⚪"; status="bị huỷ" ;;
      *) echo "Ignoring conclusion $concl"; exit 0 ;;
    esac
    prs="$(jq -r '[.workflow_run.pull_requests[]?.number | "#\(.)"] | join(", ")' "$ev")"
    text="<b>$icon $name — $status</b> · <code>$repo</code>
🌿 <code>$branch</code> @ <code>$sha</code> · 👤 $actor
📝 $msg"
    [ -n "$prs" ] && text="$text
🔗 PR: $prs"
    text="$text
<a href=\"$url\">Xem run</a>"
    ;;
  *) echo "Unsupported event $GITHUB_EVENT_NAME"; exit 0 ;;
esac

args=(--data-urlencode "chat_id=$TELEGRAM_CHAT_ID" --data-urlencode "text=$text"
      --data-urlencode "parse_mode=HTML" --data-urlencode "disable_web_page_preview=true")
[ -n "${TELEGRAM_THREAD_ID:-}" ] && args+=(--data-urlencode "message_thread_id=$TELEGRAM_THREAD_ID")
curl -fsS -o /dev/null "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" "${args[@]}" \
  || { echo "::warning::Telegram notify failed"; exit 0; }
echo "Telegram notified."
