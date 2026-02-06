# Mintlify Documentation

## Goal

- Produce and maintain high-quality documentation for the platform using Mintlify.
- Ensure consistency in tone, structure, and factual accuracy across all pages.
- **Every statement in the documentation must be verified against the actual codebase.**

## How it works

- Documentation lives in the `mintlify/` directory with configuration in `docs.json`.
- Pages are MDX files organised by system: `core-platform/`, `mobile-apps/`, `partner-hub/`.
- Other tabs (API Reference, Partner API Reference, Webhook Reference, Releases) are auto-generated and not part of this workflow.

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
- Search for the feature name, related terms, and entity names across the entire codebase.
- Read the actual implementation, not just type definitions or interfaces.
- Look for feature flags that may alter behaviour.
- Check for role-based or permission-based variations.
- Understand what happens in edge cases (empty states, limits, errors).

### What Not To Do

- **Never assume** — if you haven't seen it in the code, don't document it.
- **Never guess at field names or options** — read the actual form components and lang files.
- **Never extrapolate** — document what exists, not what logically "should" exist.
- **Never document from memory of similar systems** — this platform has its own implementation.

---

## Interactive Selection

### Step 1: Select System

Present the user with a choice of which documentation system to work on:
- **Core Platform** — Main platform documentation covering events, tickets, access control, reporting, etc.
- **Mobile Apps** — Documentation for mobile applications (Access Control Pro, EPOS Pro, Box Office Pro).
- **Partner Hub** — Documentation for partners and resellers.

### Step 2: Select Page

After selecting a system, scan `mintlify/docs.json` and present all pages within the chosen system's tab. Display them grouped by their navigation groups (e.g. "Event Management", "Sale Items", "Access Control").

### Step 3: Select Task

Present the user with a choice of documentation task:
- **Initial Draft** — Create first-pass content for a placeholder or empty page.
- **Flesh Out** — Expand existing content with additional detail, examples, or coverage.
- **Refinement** — Improve readability, flow, and presentation of existing content.
- **Gap Analysis** — Identify missing information, inaccuracies, or areas needing clarification.

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

## Writing Style

### Principles

- **Factual, not promotional** — State what features do, not why they're great. Avoid marketing language, superlatives, and persuasive framing.
- **Clear and concise** — Get to the point. Short sentences. No filler words.
- **Domain language** — Use platform terminology naturally. Don't over-explain common concepts.
- **Best format for the content** — Choose the formatting that conveys information most clearly (see Formatting below).
- **Interconnected** — Link to related pages where relevant to help users navigate.

### Formatting

**Documentation is not limited to bullet points.** Use rich formatting to present information as clearly as possible. Choose the format best suited to the content:

- **Bullet points** — Good for lists of independent facts, options, or items.
- **Tables** — Ideal for comparing options, listing field definitions, or showing structured data.
- **Numbered lists** — Use for sequential steps or ordered processes.
- **Prose paragraphs** — Appropriate for explanatory context, workflows, or concepts that benefit from narrative flow.
- **Code blocks** — For API examples, configuration snippets, or technical values.
- **Callouts/Admonitions** — Warnings, tips, notes, and important information.
- **Accordions** — For optional/advanced details that shouldn't clutter the main flow.
- **Tabs** — When showing variations (e.g., different user roles, different platforms).
- **Cards** — For navigation or linking to related topics.

### Mintlify Components

Mintlify provides a rich set of MDX components beyond standard markdown. Use the **Mintlify MCP server** to look up available components, their syntax, and formatting options:

- MCP endpoint: `https://mintlify.com/docs/mcp`

Query the MCP server when you need to:
- Find the right component for a specific use case
- Check the correct syntax for a component
- Discover new components that might better present your content

### Reference Example

The overview section from `core-platform/event-management/introduction.mdx` demonstrates the target style:

```markdown
## Overview

- Events can either be standalone or form part of a [schedule](/core-platform/event-scheduling/event-discovery). Both types of events can be [manually copied](/core-platform/event-management/copying-events) to create a replica standalone event.
- Event pages can be customised, see [event page customisations](/core-platform/event-management/event-page-customisations) for more details.
- An event has a single start and end date, however, entrance times can be divided up into [timeslots](/core-platform/event-management/timeslots) within the bounds of the event's overall start & end date.
- All dates associated with an event [...] are set in the event's [timezone](/core-platform/core/timezones).
- [Seating plans](/core-platform/event-management/seating-plans) may optionally be attached to an event, promoting it to a seated event.
```

Key observations:
- Each bullet is a self-contained fact.
- Internal links connect related concepts.
- No fluff — just what, how, and where to learn more.
- Domain terms used without excessive explanation.

Note: This example uses bullet points, but other formats (tables, prose, callouts, etc.) may be more appropriate depending on the content. Choose the format that best serves clarity.

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

### User-Facing Language

Write from the user's perspective, not from the implementation's perspective. Avoid exposing internal terminology, database column names, or architectural patterns that would confuse a non-technical reader.

- **Avoid:** "Related groups across a schedule are linked via a parent-child relationship"
- **Prefer:** "Groups created across a schedule are automatically linked, so future bulk updates can target all related groups at once"

If an internal concept has no user-facing equivalent, describe the *behaviour* the user experiences rather than the *mechanism* behind it.

### Common Patterns

**Introducing a concept (bullets):**
```markdown
## Overview

- [Feature] allows [who] to [do what].
- [Feature] is configured via [location/method].
- Related: [link to related pages].
```

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

**Configuration options (list):**
```markdown
## Configuration

- **Field Name**: Description of what this field controls and its effect.
- **Another Field**: Description. Options: `value1`, `value2`, `value3`.
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

## Checklist

### Selection Phase

- [ ] Select the documentation system (core-platform, mobile-apps, partner-hub).
- [ ] Select the specific page to work on.
- [ ] Select the task type (initial draft, flesh out, refinement, gap analysis).
- [ ] Read the current state of the target page.

### Research Phase (Required for ALL tasks)

- [ ] **Identify the core entities** — What models/tables are involved? Read their definitions.
- [ ] **Trace the backend** — Find services, controllers, and business logic. Understand the rules.
- [ ] **Examine the frontend** — Find the Vue components and pages. What fields exist? What's conditional?
- [ ] **Read the lang files** — Extract exact UI labels, tooltips, and help text.
- [ ] **Map relationships** — What other features connect to this? Follow the dependencies.
- [ ] **Search broadly** — Don't stop at the first result. Search for related terms across the codebase.
- [ ] **Check for variations** — Feature flags, role-based behaviour, permission gates.
- [ ] **Document your findings** — Keep notes of what you discovered and where.

### Writing Phase

- [ ] For **Initial Draft**:
  - Structure content based on research findings.
  - Cover all discovered functionality — don't leave gaps.
  - Use exact terminology from lang files.
  - Link to related documentation pages.

- [ ] For **Flesh Out**:
  - Identify sections that lack detail.
  - Research specific gaps in the codebase.
  - Add missing configuration options, edge cases, or relationships.
  - Verify existing content is still accurate.

- [ ] For **Refinement**:
  - Review for clarity — remove fluff, tighten sentences.
  - Ensure structure aids scanning (headings, bullets, tables).
  - Verify terminology consistency with lang files.
  - Check all internal links are valid.

- [ ] For **Gap Analysis**:
  - Compare every documented statement against the codebase.
  - Flag anything that cannot be verified.
  - Note missing features that should be documented.
  - Identify outdated information.

### Review Phase

- [ ] Every statement can be traced back to code you read.
- [ ] Terminology matches the platform UI exactly.
- [ ] All internal links point to existing pages.
- [ ] No assumptions or generalisations made without code evidence.
- [ ] Present changes for human review before committing.
