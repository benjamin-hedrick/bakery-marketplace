# Runbook: <scenario>

> **Status:** Template · copy to `<scenario>.md` and fill in every heading; delete this line. A runbook is Current only when its "Last tested" section names a real run recorded in `docs/evidence/`. Say what was observed and what was only read in the code, and mark which is which.

## Symptom

What a person sees or what an alert says. One or two sentences.

## How it is detected

The signals that exist today (a log line, a metric, a health check) and the ones that do not. Do not describe an alert that is not built.

## Customer impact

What a customer experiences, and what they do not.

## Steps

Numbered, each with the exact command or place to look and what a good result is.

## Verify recovery

How to confirm the system is back, with a command and the expected output.

## What not to do

The tempting actions that make it worse.

## Escalate when

The conditions under which this is more than the runbook covers, and to whom (a role, not a name).

## Last tested

Date, the environment (local stack, not deployed), the commands, the result and the evidence record. If never tested, say so.
