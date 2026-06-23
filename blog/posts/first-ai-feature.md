---
title: Shipping your first AI feature without losing the plot
date: 2026-05-15
dek: Extraction, not magic. Treat the model like an unreliable function and wrap it accordingly.
tags: [ai, llm]
---

The fastest way to ruin an AI feature is to treat the model like magic. It isn't. It's an unreliable function: useful, occasionally wrong, and best wrapped in the same guardrails you'd give any external call.

## Extraction, not intelligence

Most "AI features" that actually ship are extraction. Pull structured fields out of messy text, validate them, and fail loudly when the shape is wrong.

```js
const fields = await llm.extract(deal.notes, schema);
if (!schema.safeParse(fields).success) {
  return queue.retry();   // treat it as an unreliable function
}
```

Schema-validate the output. Retry on failure. Log the rejects so you can see where the model struggles. None of this is glamorous, and all of it is what makes the feature trustworthy.

> Ship the boring version that works before the clever version that sometimes does.
