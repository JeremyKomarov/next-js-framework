---
name: new-form
description: Build a form with react-hook-form and zodResolver, sharing its input schema with the Route Handler. Use when adding any form that submits data.
argument-hint: [form-name]
arguments: [form]
---

# new-form

Enforces `03 §4` and `03 §1`.

**Input:** `$form` — what the form creates or edits.

## Steps

1. **Find the input schema. Do not write a new one.** It lives in the resource's `*.dto.ts` and
   is the same export the Route Handler parses with. If there is no API call yet, run
   `new-api-call` first — the schema comes from there, not from the form.
   Where the form genuinely needs a field the server never sees (a confirm-password), `.extend()`
   the shared schema rather than restating it.
2. Wire it up:
   ```tsx
   const form = useForm({ resolver: zodResolver(Create<Form>InputSchema) });
   ```
3. Compose from the shared `Field` primitives. Never a raw `<input>` with feature-owned styling.
4. Submit calls the mutation hook from `hooks/`, never a bare `fetch`.
5. **Errors:** the schema decides *which* field is invalid; the strings layer decides what the
   person reads. No English prose in the schema. Server failures arrive as codes and are mapped
   through the strings layer — never rendered from `ApiError.message`.
6. Narrow any untrusted value (a reason from a URL parameter) to a known key before it reaches
   `t()`, or someone already stuck sees `MISSING_MESSAGE` on top of it.

## Done when

Submitting invalid data is rejected identically by the form and by the handler — because there is
one schema. Test that by posting to the route directly with the field the form blocks.
