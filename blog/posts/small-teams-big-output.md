---
title: Make a small team move like a big one
date: 2026-06-15
dek: The repetitive work is a hidden tax on every team. Here is how I stop paying it.
tags: [automation, leverage]
---

Every team I've joined has the same hidden line item: the work nobody decided to do, but everybody does anyway. Copy this into that. Export the report. Chase the follow-up. It never shows up on a roadmap, and it quietly eats the week.

## Find the tax

Before automating anything, I write down the manual steps a person repeats more than twice a week. Not the interesting work — the glue. The list is always longer than people expect:

- Re-keying data from one system into another
- Manually assembling the same report
- Routing leads or tickets by hand
- Sending the same templated follow-up

Each of these is a function waiting to be written. The trick is seeing them as a system, not a chore.

## Replace it with a pipeline

The shape is almost always the same: one trigger, a few workers, an idempotent write at the end. Once it exists, it runs whether or not anyone is watching.

```js
// one trigger, many workers
queue.on("lead.created", async (lead) => {
  const enriched = await enrich(lead);   // 3rd-party + LLM
  const routed   = route(enriched);      // rules, not humans
  await crm.upsert(routed);              // idempotent
});
```

> Leverage isn't working harder. It's building the system that does the work once — then keeps doing it while you sleep.

Do this five or six times across a company and something changes. A two-person team starts shipping like a department, because the department is mostly software now.
