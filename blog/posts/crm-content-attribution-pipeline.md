---
title: I let an LLM read a sales team's CRM notes. Then I refused to trust it.
date: 2026-07-30
dek: How I built a pipeline that surfaces which marketing assets show up in the deals that advance — and why the interesting engineering is all downstream of the model.
tags: [ai, llm, b2b-saas]
scene: machine
plate: cube-dots
---

Marketing makes hundreds of assets. Sales drops some of them into live deals. Almost nobody can answer which ones keep showing up in the deals that actually advance — because the answer isn't in a dashboard, it's in plain English inside CRM deal notes. I built a pipeline that reads those notes with an LLM and turns them into a content-performance report. The model was the easy part. Everything that made it trustworthy sits around it.

## The signal already existed

This was for a B2B sales-enablement product. In that market, "which asset pulls weight?" is the question customers ask first.

Reps already answer it, constantly, without knowing it. They write things like *"sent over the security one-pager"* or *"walked them through the ROI deck"* into deal notes and emails. There is no `asset_id` field. No schema. No dropdown anyone would fill in reliably even if it existed. Just sentences a person typed in a hurry between calls.

That's the exact shape of problem an LLM is good at — and the exact shape where it's dangerous.

::figure pipeline | The pipeline in seven stages. The model is one of them; the trust comes from what surrounds it.

## Step 1: own your own copy of the data

Before any of the interesting work: OAuth into the CRM, per-account app, store the access and refresh tokens, refresh them *before* expiry.

Boring, and it's where most integrations quietly rot. A token expires six weeks after launch, the pipeline goes dark, nobody gets an error, and the feature is dead for a month before someone notices the numbers stopped moving. Token lifecycle gets monitoring on day one, not day ninety.

Then ingest: pull deals and their associated engagements — notes, emails, the messages reps actually write — normalize them, and store them in our own tables.

> I don't query someone else's CRM live every time I need to think. I ingest, then operate on my own copy.

The CRM is the source of truth for *their* data. My pipeline owns its own state, its own retries, and its own history. That single boundary is what makes the rest of the system debuggable.

## Step 2: the LLM is the easy part

Now the extraction. Feed each deal's messages to the model, ask which assets were mentioned, get back structured references.

This works on the first try, which is the trap. It *looks* finished. It isn't, because the model doesn't return clean data — it returns **plausible** data. Sometimes it invents an asset that was never sent. Sometimes it returns a shape that doesn't parse. Sometimes it is confidently, fluently wrong in a way that reads exactly like being right.

If that output flows straight into your canonical tables, you haven't built an attribution feature. You've built a machine that generates convincing numbers.

## Step 3: treat the model as an unreliable function

This is the whole lesson, and it's the thing I'd keep if I had to throw away every other decision here.

An LLM is not an answer machine. It's an unreliable function — a network call to a service that will occasionally hand you garbage with total confidence. You already know how to program against those. You validate at the boundary and you fail loudly.

So: every response is schema-validated before it is allowed anywhere near the database.

::figure request-path | Who talks to whom. Dashed lanes are systems we don't own; the validator is the boundary every model response has to cross.

```ts
const parsed = AssetMentionSchema.safeParse(await model.extract(deal.messages));

if (!parsed.success) {
  await rejects.record(deal.id, parsed.error);  // visible, countable, reviewable
  return;                                       // nothing partial gets through
}

await mentions.insert(parsed.data);
```

No "mostly right" rows. No best-effort coercion into the shape you wanted. If it doesn't parse, it's rejected and *recorded* — because the reject log is a product signal: it tells you which deals confuse the model and where the prompt is weak.

## Step 4: one asset, ten names

The same asset gets named ten different ways across a hundred deals. "The ROI deck." "ROI deck." "that ROI presentation." "the ROI one." One real asset, ten strings.

::figure one-asset | Four strings, one asset. Counts are illustrative.

Ship without resolving this and your report double-counts everything. It's a chart wearing the costume of an insight.

So mentions resolve into **canonical asset records** — one row per real asset, every mention collapsing onto it, first-in-wins on the canonical name. Dedup isn't cleanup you do at the end. It's the difference between a number and noise.

## Step 5: make the uncertainty a column

Extraction is probabilistic, so I stopped hiding that and made it a first-class field: every extracted link carries a **confidence score**.

That one column changes how the feature behaves in front of a customer:

- the report can show high-confidence matches only, by default
- a human can review the gray zone instead of arguing with a black box
- nobody is asked to trust a number the system itself isn't sure about

You're not pretending the AI is certain. You're showing your work. In a feature whose entire value is credibility, that's not a nice-to-have — it's the product.

## What comes out the other end

A content-performance report: which assets keep showing up in the deals that advance, and — the part people react to — the ones that show up in deals constantly but never in the ones that move. Every figure carrying its confidence.

The architecture in one line:

- OAuth + token lifecycle monitoring
- deal + engagement ingestion into our own store
- LLM extraction of asset mentions
- schema validation at the boundary, rejects recorded
- dedup into canonical asset records
- confidence scoring
- the report

The LLM is one stage out of seven.

## The reframe

Most teams building their first AI feature spend their effort on the model — the prompt, the eval, the vendor. Then the feature ships and slowly loses everyone's trust, and nobody can point at the moment it broke, because it never broke. It just drifted.

The engineering that matters is downstream: validate at the boundary, resolve entities, surface uncertainty, monitor the boring integration underneath. Do that and the *system* is reliable even though the model isn't.

Which means a lean team gets to see which content actually moves deals — from signal their reps already create, with no new logging for sales and no data hire for marketing.
