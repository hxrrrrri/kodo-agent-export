---
name: eng-runbook
description: Engineering runbook for operational procedures, incident response, deployment guides, and on-call reference. Structured for clarity under pressure with clear prerequisites, steps, and rollback paths.
---

# Engineering Runbook

Use this skill to produce operational runbooks, incident response playbooks, deployment guides, and on-call reference documents. Runbooks are read under pressure — clarity and scannability are paramount.

## Runbook Types

| Type | Purpose |
|------|---------|
| `deployment` | How to deploy the service to an environment |
| `incident-response` | How to triage and resolve a specific class of incident |
| `rollback` | How to revert a deployment or migration |
| `on-call-primer` | What to know as the on-call engineer |
| `database-ops` | Backup, restore, migration procedures |
| `scaling-ops` | How to scale up/down, handle traffic spikes |
| `access-management` | How to grant/revoke access to systems |

## Document Header

Every runbook must start with:

```markdown
# [Service/Procedure Name] Runbook

**Status**: Active | Deprecated | Draft
**Last tested**: YYYY-MM-DD
**Owner**: @team-or-person
**Escalation**: @on-call-lead, #incident-channel

## When to Use This Runbook
[2–3 sentences: what triggers running this, who should run it]
```

## Prerequisites Section

List everything the operator needs BEFORE starting:

```markdown
## Prerequisites

- [ ] Access to production AWS console (IAM role: `prod-ops-rw`)
- [ ] VPN connected to production network
- [ ] `kubectl` configured for `prod-us-east-1` context
- [ ] PagerDuty incident open and you are assigned
- [ ] `git clone https://github.com/org/repo` at latest `main`
```

Anything that requires setup is a prerequisite, not step 1.

## Steps Format

Numbered, atomic steps. Each step is one action with a clear expected outcome:

```markdown
## Steps

1. **Check service health**
   ```bash
   kubectl get pods -n production | grep api-server
   ```
   Expected: All pods in `Running` state.
   If not: Proceed to step 4 (Pod crash loop diagnosis).

2. **Identify affected traffic**
   ```bash
   kubectl logs -n production -l app=api-server --tail=100 | grep ERROR
   ```
   Expected: Error messages with trace IDs.

3. **Scale up replicas if overloaded**
   ```bash
   kubectl scale deployment api-server --replicas=10 -n production
   ```
   Expected: New pods start within 90 seconds.
```

## Rollback Section

Every deployment and migration runbook needs a rollback:

```markdown
## Rollback

If any step fails or the service does not recover within [time limit]:

1. Stop the current procedure
2. Notify #incidents channel: "Initiating rollback for [service] at [timestamp]"
3. [Rollback step 1 with command]
4. [Rollback step 2 with command]
5. Verify service health: [health check command]
6. Update PD incident status
```

## Verification Steps

After the main procedure:

```markdown
## Verification

- [ ] Service health endpoint returns 200: `curl https://api.example.com/health`
- [ ] Error rate below 0.1%: [link to dashboard]
- [ ] Latency p99 below 500ms: [link to dashboard]
- [ ] No new alerts firing in Datadog/PagerDuty
```

## Escalation Path

```markdown
## Escalation

If this runbook does not resolve the issue within 30 minutes:

1. Escalate to on-call lead: @lead-engineer
2. If data at risk: page @DBA immediately
3. If customer-facing impact >5 min: notify @customer-success
4. Open war room in #incident-live channel
```

## Writing Standards

- All commands must be copy-pasteable (no `<placeholders>` without instructions)
- Include expected output for every command
- Provide "what to do if this fails" for any step that could fail
- No steps that require judgment without decision criteria
- Time estimates: "This step takes approximately 3–5 minutes"
