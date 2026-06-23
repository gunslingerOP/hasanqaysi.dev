---
title: Event-driven on AWS serverless, from zero
date: 2026-04-15
dek: SQS, Lambda, DynamoDB — a mental model that scales without babysitting.
tags: [aws, backend]
---

Serverless gets a reputation for being fiddly. Most of that pain comes from skipping the mental model and reaching straight for the console.

## Queues are your shock absorber

A queue between producers and workers turns a spike into a steady drip. SQS in front of Lambda means a flood of events becomes a manageable stream, and a failed message retries instead of vanishing.

- SQS to absorb and retry
- Lambda to do one thing well
- DynamoDB for fast, predictable writes
- SNS to fan out without coupling

Keep each function single-purpose and idempotent. The system gets boring to operate, which is exactly the goal.

> Boring infrastructure is a feature. You want to forget it's running.
