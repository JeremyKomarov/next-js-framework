# Component template

The whole component kit in one read. Copy the blocks you need into
`components/<Name>/`, rename `SummaryCard` throughout, and delete what the component does not have.
Rules: `02 §1`–§3.

The last three files — `*.const.ts`, `*.types.ts`, `*.keys.const.ts` — are added when the
component actually has enum-like props, named props, or strings. Not upfront.

---

### `index.tsx`

```tsx
"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/shared/utils/cn";
import { summaryCardClasses } from "./SummaryCard.classes";
import { SUMMARY_CARD_NAMESPACE, summaryCardKeys } from "./SummaryCard.keys.const";
import { SUMMARY_CARD_TONES, type SummaryCardTone } from "./SummaryCard.const";
import type { SummaryCardProps } from "./SummaryCard.types";

export function SummaryCard({ tone = SUMMARY_CARD_TONES.neutral, isActive, children }: SummaryCardProps) {
  const t = useTranslations(SUMMARY_CARD_NAMESPACE);

  return (
    <div className={cn(summaryCardClasses.root, summaryCardClasses.tone[tone], isActive && summaryCardClasses.active)}>
      <span className={summaryCardClasses.label}>{t(summaryCardKeys.label)}</span>
      {children}
    </div>
  );
}

export { SUMMARY_CARD_TONES, type SummaryCardTone };
```

### `SummaryCard.classes.ts`

The only importer of the stylesheet. `classMap` throws in development if a name has no rule, and
`npm run guard` checks it statically. A modifier that deliberately has no rule is `NO_CLASS`, so
"intentionally nothing" and "misspelled" stop looking identical.

```ts
import styles from "./SummaryCard.module.scss";
import { classMap } from "@/shared/utils/classMap";

export const summaryCardClasses = classMap("SummaryCard", {
  root: styles["summary-card"],
  label: styles["summary-card__label"],
  active: styles["summary-card--active"],
  tone: {
    neutral: styles["summary-card--neutral"],
    warning: styles["summary-card--warning"],
  },
});
```

### `SummaryCard.module.scss`

BEM inside the module: one block, elements `__`, modifiers `--`. Every value is a token — a hex
here fails the guard. Breakpoint blocks go at the end.

```scss
.summary-card {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  background: var(--surface-card);
  color: var(--text-primary);
  transition: background-color var(--duration-fast) var(--ease-standard);

  &__label {
    font-size: var(--text-xs);
    font-weight: 650;
    color: var(--text-secondary);
  }

  &--active { border-color: var(--border-strong); }
  &--neutral { background: var(--surface-card); }

  &--warning {
    background: var(--warning-surface);
    border-color: var(--warning-border);
    color: var(--warning-text);
  }
}

@media (max-width: 36rem) {
  .summary-card { padding: var(--space-2) var(--space-3); }
}
```

### `SummaryCard.const.ts`

The object *is* the source of truth; the union is derived. A caller writes
`tone={SUMMARY_CARD_TONES.warning}`, never `tone="warning"`.

```ts
export const SUMMARY_CARD_TONES = {
  neutral: "neutral",
  warning: "warning",
} as const;

export type SummaryCardTone = (typeof SUMMARY_CARD_TONES)[keyof typeof SUMMARY_CARD_TONES];
```

### `SummaryCard.strings.ts`

A plain object, assembled into the dictionary by `core/i18n/messages.ts`. No prose lives in a
component (`02 §9`).

```ts
export const summaryCardStrings = {
  label: "SummaryCard",
};
```

### `SummaryCard.keys.const.ts`

Keys are **derived**, so they cannot drift from the strings they name. Never hand-type a key.

```ts
import { keysOf } from "@/shared/utils/keysOf";
import { summaryCardStrings } from "./SummaryCard.strings";

export const SUMMARY_CARD_NAMESPACE = "summary-card";
export const summaryCardKeys = keysOf(summaryCardStrings);
```

### `SummaryCard.types.ts`

```ts
import type { ReactNode } from "react";
import type { SummaryCardTone } from "./SummaryCard.const";

export interface SummaryCardProps {
  tone?: SummaryCardTone;
  isActive?: boolean;
  children?: ReactNode;
}
```

---

**Then add its row** to the directory's `AGENTS.md`, in the same change — shape in
`.agents/templates/index.md`.
