# Mintlify Documentation

## Goal

- Produce and maintain high-quality documentation for the platform using Mintlify.
- Ensure consistency in tone, structure, and factual accuracy across all pages.
- **Every statement in the documentation must be verified against the actual codebase.**

## How it works

- Documentation lives in the `mintlify/` directory with configuration in `docs.json`.
- Pages are MDX files organised by system: `core-platform/`, `mobile-apps/`, `partner-hub/`.
- Other tabs (API Reference, Partner API Reference, Webhook Reference, Releases) are auto-generated and not part of this workflow but may be referenced/linked to.

---

## Purpose & Audience

### Purpose

This documentation serves as a **quick reference** to help users:
- Look up functionality and confirm what features and options are available.
- Understand how features work and how they relate to one another.
- Find guidance on how features might be used.

It is **not** a marketing resource or sales pitch — it represents the actual platform.

### Target Audience

- **New users** learning the platform for the first time.
- **Existing users** confirming functionality or exploring unfamiliar features.

Users are expected to understand domain terminology (e.g. "timeslots", "sale items", "access control") but should not need deep technical knowledge.

---

## Task Choice

Establish which page/sections to work on & what our focus is going to be:
- **Initial Draft** — Create first-pass content for a placeholder or empty page.
- **Flesh Out** — Expand existing content with additional detail, examples, or coverage.
- **Refinement** — Improve readability, flow, and presentation of existing content.
- **Gap Analysis** — Identify missing information, inaccuracies, or areas needing clarification.

---

## Research First — This Is Non-Negotiable

**Documentation is written from codebase research, not from assumptions or general knowledge.**

Before writing a single line of documentation, you must thoroughly investigate the feature in the codebase. This is not optional. This is not "nice to have". This is the foundation of accurate documentation.

### What "Research" Means

Research is **deep exploration** of the codebase to understand:
- What the feature actually does (not what you think it does)
- Every configuration option, field, and setting
- How the feature behaves in different contexts
- What other parts of the platform interact with it
- Edge cases, conditional logic, and feature flags
- The exact terminology used in the UI

### Where to Look

You must investigate **all** of the following:

1. **Backend code**
   - Models/entities — field definitions, relationships, validations
   - Services — business logic, rules, constraints
   - Controllers/resolvers — API behaviour, permissions
   - Migrations — to understand data structure evolution
   - Enums and constants — valid values, states

2. **Frontend code**
   - Vue components — UI structure, form fields, conditional rendering
   - Pages — user flows, available actions
   - Composables/stores — state management, computed behaviours
   - Form validation — client-side rules and constraints

3. **Language files (`lang/`)**
   - **Critical**: These contain the exact labels, tooltips, and descriptions shown to users
   - Match documentation terminology to what users actually see
   - Check for help text that explains features

4. **Related features**
   - Features rarely exist in isolation — trace all connections
   - If documenting "timeslots", also understand how they interact with access control, capacity, seating, etc.
   - Follow foreign keys, imports, and service dependencies

### Research Depth

**Surface-level investigation is not sufficient.**

- Don't stop at the first file you find — a feature may be implemented across multiple services, controllers, and components.
- **Trace the full chain of operations.** A feature's logic is often distributed across multiple actions, services, or middleware. For example, eligibility validation might be split across a validation action and a separate guard action that runs later — stopping at the first file means you document half the rules. Follow the call chain: if Action A calls Action B, read both. If a controller delegates to a service that delegates to another service, read all three.
- Search for the feature name, related terms, and entity names across the entire codebase.
- Read the actual implementation, not just type definitions or interfaces.
- Look for feature flags that may alter behaviour.
- Check for role-based or permission-based variations.
- Understand what happens in edge cases (empty states, limits, errors).
- **Read exception classes.** Exception classes often enumerate every distinct way a feature can fail, each mapped to a lang key with the exact user-facing error message. These are a goldmine for documenting eligibility rules, validation errors, and blockers.

<Note>
**Never assume, guess, or extrapolate.** If you haven't seen it in the code, don't document it. Don't guess at field names — read the actual form components and lang files. Don't document what logically "should" exist — document what does exist. Don't fill gaps from memory of similar systems — this platform has its own implementation.
</Note>

---

## Writing

### Quality Standard

These rules define what good documentation looks like. They are not bonus criteria — they are the baseline. Follow them strictly.

**Write for someone trying to do something, not someone studying a schema.**
Every page should feel like a knowledgeable colleague walking you through a feature. The reader has a task — help them complete it. Don't describe the data model and call it documentation.

**Open with context, not abstraction.**
The overview should answer: what does this feature do, who is it for, and when/why would someone use it? Ground the reader before diving into configuration or detail.

- Bad: "Customer records are managed from the admin customer area."
- Good: "Event approvals add a review step to the event publishing workflow. Users who can create events but cannot publish them must request approval before their events can go live."

The bad example describes a system. The good example describes an experience. Always write the good version.

**Structure sections around user tasks, not data categories.**
Section headings should be actions or questions a user has, not abstract labels.

- Bad: "What You Can Update", "Operational Context"
- Good: "Requesting Approval", "Finding Events Awaiting Approval", "Reviewing Approval Requests"

Ask: "Would a user search for this heading?" If not, rewrite it.

**Be concrete — name the actual UI elements.**
Reference exact button labels, field names, badges, statuses, and navigation paths. The reader should be able to follow along in the product.

- Bad: "Submit the form to proceed."
- Good: "Click **Request Publishing Approval**. The event remains in **Draft** status with an **Awaiting approval** badge."

**Use exact UI text to anchor scenario tables.**
When documenting different outcomes (payment scenarios, error states, status changes), use the precise text users see in the product as the anchor. Don't describe a scenario abstractly — root it in the actual label or message the user is looking at.

- Bad: "If the new total is lower, the user sees the remaining balance."
- Good: "The basket shows **Remaining amount to spend before checkout** with the difference. Checkout is blocked until items are added to bring the total up."

When a user encounters specific text in the product and comes to the docs, they should find an immediate match. This is especially important for tables that map scenarios to outcomes — the left column should contain what the user *sees*, not an abstract description of the situation.

**Anticipate follow-up questions.**
After explaining the main flow, consider what a user would ask next. Address edge cases, "what if" scenarios, and non-obvious behaviours using `<Note>` blocks so they don't clutter the main flow but are still covered.

Examples of good anticipation:
- "What if it was rejected before?" → Explain that the button text changes
- "What if I don't configure email notifications?" → Explain the workflow still functions
- "Can I see past approvals?" → Include an approval history section

**Document the full lifecycle, not just start and end.**
Users spend most of their time in the middle of a workflow — editing, reviewing, waiting. Don't jump from "how to initiate" to "what happens when it completes." Document what the user sees and can do while the process is in progress: changed button labels, info banners, restricted actions, timeout behaviour. If a basket header changes from **Order summary** to **Modifying order**, that's worth documenting. If certain actions are temporarily blocked while a process is in flight, say so.

**Connect sections into a narrative.**
The page should have a logical flow where each section follows naturally from the previous one. A reader going top-to-bottom should feel like they're following a journey, not reading disconnected index cards.

**Depth earns its place — thin pages are worse than no pages.**
A 30-line page that lists field names without explaining how to use them is not helpful documentation. Every page should be substantive enough that a user learns something they couldn't have guessed. If you can't write substantive content, you haven't researched enough — go back to the codebase.

**Factual, not promotional.**
State what features do, not why they're great. Avoid marketing language, superlatives, and persuasive framing.

**Use platform terminology naturally.**
Use domain language without over-explaining common concepts. Write from the user's perspective — don't expose internal terminology, database column names, or architectural patterns.

### Page Structure

A documentation page is not a random collection of sections — it tells a story. The following framework describes the sections a complete page might contain. Not every page needs every section; choose the sections the feature demands.

1. **Overview** — Contextual framing: what the feature does, who it's for, and why they'd use it. Ground the reader in purpose before any detail.

2. **Use Cases** — For foundational features (core building blocks like timeslots, sale item groups, customer groups). Concrete, real-world scenarios that show *why* and *when* to use the feature. Use accordions to keep the page scannable. Skip this for narrow, self-explanatory features.

3. **How It Works / Workflow** — The mechanism or process. How the feature operates, what the steps are, what roles are involved. Tables, diagrams, or numbered steps as appropriate.

4. **Configuration** — Settings, fields, and options. Explain what each setting controls and its effect — don't just list field names. For toggle settings, describe the behaviour in **both** states (enabled and disabled). Users configuring a setting need to understand the consequences of each choice, not just one side.

5. **User Tasks** — Action-oriented sections named after what users actually do: "Requesting Approval", "Adding Members", "Configuring Notifications". These are the core of most pages.

6. **Reference** — Statuses, notifications, restrictions, edge cases. Structured information users look up rather than read sequentially.

7. **Related pages** — Links to connected features and further reading.

The key test: can a reader go top-to-bottom and feel like they followed a coherent journey from "what is this?" through "how do I use it?" to "what else should I know?" If the page reads like disconnected index cards, restructure it.

### Reference Example

`core-platform/event-management/event-approvals.mdx` is the gold standard for a complete documentation page. Study it before writing. What makes it work:

- **Overview grounds the reader in purpose** — "Event approvals add a review step to the event publishing workflow" tells you what, who, and why in one sentence. It doesn't start with abstraction.
- **Sections are named as user tasks** — "Requesting Approval", "Finding Events Awaiting Approval", "Reviewing Approval Requests" map directly to things users do.
- **Tables compare roles, statuses, and permissions** — Structured information is presented in the format that makes it easiest to scan and compare.
- **Notes handle edge cases without cluttering the main flow** — "If an approval request was previously rejected, the button changes to Request Publishing Approval Again" is tucked into a Note, not buried in prose.
- **The page reads top-to-bottom as a narrative journey** — From understanding the feature, through how it works, to performing each task, to reference information. A reader never has to jump around.

### Anti-Pattern Example

The following is an example of **what not to write**. It is thin, clinical, and unhelpful:

```markdown
## Overview

- Customer records are managed from the admin customer area.
- Editing covers core identity/contact data and selected profile attributes.
- Customer screens also expose related orders, transactions, wallets, and item history.

## What You Can Update

| Area | Examples |
|---|---|
| Profile identity | Name, email, phone, title, DOB |
| Address details | Address lines, city, postcode, country |
| Data capture answers | Configured customer question responses |

## Operational Context

Customer pages also provide visibility into:

- purchased tickets/products/guest-list entries
- donation and top-up history
- wallet balances and refundable values
```

What's wrong with this:
- **No user task orientation** — "What You Can Update" and "Operational Context" are abstract labels, not things a user is trying to do.
- **No guidance on how** — Lists field names but never explains how to actually edit anything, where to navigate, or what buttons to click.
- **No depth** — A table of field category names tells the user nothing they couldn't guess. What are the constraints? What happens after editing? Are there side effects?
- **Circular descriptions** — "Integration-linked customer profile data where enabled" explains nothing.
- **No anticipation** — Doesn't address any "what if" questions or edge cases.

A page like this should be rewritten to walk the user through the actual editing experience: how to find a customer, what each section of the edit screen contains, what validation exists, what side effects editing can have, and how it connects to other features.

### User-Facing Language

Write from the user's perspective, not from the implementation's perspective. Avoid exposing internal terminology, database column names, or architectural patterns that would confuse a non-technical reader.

- **Avoid:** "Related groups across a schedule are linked via a parent-child relationship"
- **Prefer:** "Groups created across a schedule are automatically linked, so future bulk updates can target all related groups at once"

If an internal concept has no user-facing equivalent, describe the *behaviour* the user experiences rather than the *mechanism* behind it.

### UI Terminology Precedence (Non-Negotiable)

This rule prevents confusion between "user-facing language" and "accurate terminology":

- **Always use exact UI terminology** when the user can actually see it (button labels, field labels, status names, setting names, navigation names).
- **Never use internal-only identifiers** that are not user-visible (DB column names, model/action/class names, constants, feature-flag slugs, route names, migration details).
- If a term appears both internally and in the UI, it is allowed **because it is UI-visible**.
- Before publishing, do a pass to remove code-like tokens unless they are confirmed user-visible in UI or language files.

### Use Cases

For foundational features — those that represent a core building block of the platform (e.g. timeslots, sale item groups, customer groups) — include a **Use Cases** section early on the page, after the overview. Use cases ground abstract functionality in concrete, real-world scenarios that help users understand *why* and *when* they would use the feature.

**When to include use cases:**
- The feature is a building block that supports many different workflows.
- The feature's value is not immediately obvious from its configuration alone.
- The feature combines multiple capabilities (e.g. stock limits + sale periods + display controls) that are best understood through examples.

**When to skip use cases:**
- The feature is narrow and self-explanatory (e.g. a single toggle or setting).
- The page is documenting a sub-feature that is already contextualised by its parent page.

**Format:** Use accordions to keep the page scannable. Each use case should be a short paragraph (2–3 sentences) that names a scenario and explains which feature capabilities make it work.

```markdown
## Use Cases

<Accordion title="Short scenario name">
  Describe the real-world scenario and explain which capabilities of the feature
  address it. Link to related features where relevant.
</Accordion>
```

**Guidelines:**
- Ground each use case in a specific, believable scenario — not generic descriptions.
- Highlight different capabilities of the feature across the use cases (don't repeat the same aspect).
- Link to related features where the use case involves cross-feature interaction.
- Keep it factual — describe what *can* be done, not what *should* be done.

### API Cross-References

When a feature has a public API, reference it at the **point of relevance** — not as a separate "API" section. The goal is to leave a breadcrumb for users who need programmatic access, without shifting the page's focus away from the product experience.

**Good:** Mentioning the API inline where it solves a specific problem (e.g. bulk operations).
```markdown
- For bulk operations, use the API to [add](/api-reference/customer-groups/add-customers-to-group)
  or [remove](/api-reference/customer-groups/remove-customers-from-group) multiple customers at once.
```

**Bad:** Adding a standalone "API" section that duplicates what's already in the API reference.

**Building API endpoint links:** The API reference pages are auto-generated from the OpenAPI schema at `mintlify/api-reference/openapi.json`. The link-building logic is defined in `mintlify/generate-api-docs.js` — refer to this if the pattern is unclear.

**Verification is non-negotiable.** Before referencing any API endpoint in documentation, confirm that:
- The endpoint exists in the OpenAPI schema (`mintlify/api-reference/openapi.json`).
- The endpoint is implemented in the actual API code — read the controller/route to verify it does what you claim.
- The behaviour you describe (e.g. "add customers to a group") matches the real implementation, not just the schema summary.

### Formatting & Components

Choose the format best suited to the content:

- **Tables** → comparing things (roles, statuses, permissions, field definitions)
- **Numbered lists** → sequential steps the user follows
- **Callouts** → edge cases, warnings, non-obvious behaviour
- **Prose paragraphs** → explaining concepts, workflows, relationships
- **Bullets** → independent facts, lists of options
- **Code blocks** → API examples, configuration snippets, technical values
- **Accordions** → optional/advanced details that shouldn't clutter the main flow
- **Tabs** → showing variations (e.g. different user roles, different platforms)
- **Cards** → navigation or linking to related topics

Mintlify provides a rich set of MDX components beyond standard markdown. Use the **Mintlify MCP server** to look up available components, their syntax, and formatting options:

- MCP endpoint: `https://mintlify.com/docs/mcp`

Query the MCP server when you need to find the right component, check syntax, or discover components that might better present your content.

### Common Patterns

These are starting points for syntax reference, not templates to fill in. A page built by slotting content into these skeletons will be thin and unhelpful. Write the page the feature needs, then use these patterns for the mechanics.

**Introducing a concept (prose):**
```markdown
## Overview

[Feature] provides [capability] for [audience]. It integrates with [related features]
to enable [workflow]. Configuration is managed through [location].
```

**Configuration options (table):**
```markdown
## Configuration

| Field | Description | Options |
|-------|-------------|---------|
| Field Name | What this field controls | `option1`, `option2` |
| Another Field | Effect of this setting | Default: `value` |
```

**Step-by-step process:**
```markdown
## How to [Action]

1. Navigate to **Settings > Feature**.
2. Select the desired option from the dropdown.
3. Click **Save** to apply changes.

<Note>Changes take effect immediately.</Note>
```

**Important warnings:**
```markdown
<Warning>
  Enabling this setting will affect all existing records. This action cannot be undone.
</Warning>
```

**Conditional behaviour:**
```markdown
<Tabs>
  <Tab title="Admin Users">
    Admin users see all options and can modify settings.
  </Tab>
  <Tab title="Standard Users">
    Standard users see a limited view based on their permissions.
  </Tab>
</Tabs>
```

---

## Checklist

### Selection Phase

- [ ] Select the documentation system (core-platform, mobile-apps, partner-hub).
- [ ] Select the specific page to work on.
- [ ] Select the task type (initial draft, flesh out, refinement, gap analysis).
- [ ] Read the current state of the target page.

### Research Phase

- [ ] Identify the core entities — what models/tables are involved?
- [ ] Trace backend services, controllers, and business logic.
- [ ] Examine frontend components and pages — what fields exist, what's conditional?
- [ ] Read the lang files — extract exact UI labels, tooltips, and help text.
- [ ] Map relationships — what other features connect to this?
- [ ] Check for feature flags, role-based behaviour, and permission gates.

### Writing Phase

- [ ] Does the overview ground the reader in purpose, not abstraction?
- [ ] Does the page read like a colleague explaining the feature, not a schema description?
- [ ] Would a user learn something they couldn't have guessed from field names alone?
- [ ] Are sections named as user tasks, not abstract data categories?
- [ ] Does the page have narrative flow from top to bottom?
- [ ] Is the full lifecycle covered — not just initiation and completion, but the in-progress state?
- [ ] Are edge cases and follow-up questions addressed in Notes?
- [ ] Does the page use the format best suited to each type of content?
- [ ] Are all statements verified against the codebase?
- [ ] Does terminology match the platform UI exactly (checked against lang files)?

### Review Phase

- [ ] Every statement can be traced back to code you read.
- [ ] Terminology matches the platform UI exactly.
- [ ] All internal links point to existing pages.
- [ ] No assumptions or generalisations made without code evidence.
- [ ] The page meets the Quality Standard — reread it and check.
- [ ] Present changes for human review before committing.
