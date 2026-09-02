#!/usr/bin/env bash
# PreToolUse (Bash) guard: block destructive database operations.
# Reason: on 2026-09 a cleanup script deleted real LINE customers/conversations
# from the shared Supabase (dev and prod share one DB). Claude must NEVER delete
# or destructively modify data. This is a hard backstop, not just a memory rule.
#
# Reads the hook JSON from stdin, greps the embedded command, and if it looks
# destructive, emits a PreToolUse "deny" decision. Safe commands print nothing
# (allow). Deliberately conservative — additive migrations (db:migrate) and
# `git --delete` are NOT blocked.
IN=$(cat)
# git never mutates the app database — skip git commands so commit messages that
# merely mention DELETE/DROP/etc. (like this guard's own commits) are not blocked.
if printf '%s' "$IN" | grep -qE '"command"[[:space:]]*:[[:space:]]*"git '; then
  exit 0
fi
if printf '%s' "$IN" | grep -iEq '(delete[[:space:]]+from|\.delete\(|drop[[:space:]]+(table|schema|database)|truncate[[:space:]]*\(|truncate[[:space:]]+table|drizzle-kit[[:space:]]+push|\bdb\.delete\()'; then
  printf '%s' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"BLOCKED by project guard: destructive database operation detected (DELETE FROM / DROP / TRUNCATE / .delete() / drizzle-kit push). Claude must never delete or destructively modify data (dev and prod share one Supabase). If this is truly needed, ask the user to run it manually."}}'
fi
