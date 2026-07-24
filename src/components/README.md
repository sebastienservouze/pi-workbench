# Shared components

## Tooltip

A portal-based tooltip that renders outside the normal DOM hierarchy to avoid clipping by overflow containers. Use it instead of native HTML `title` attributes for consistent styling and behavior.

### When to use

- Interactive elements (buttons, links) that need a descriptive label on hover
- Truncated text where the full content should appear on hover
- Any element where a native browser tooltip would be insufficient (styling, timing, positioning)

### When not to use

- Non-interactive decorative elements that don't need additional context
- Elements where the visible text already conveys the full meaning

### Usage

```tsx
import { Tooltip } from '../../components/Tooltip.tsx'

<Tooltip label="Full description here">
  <button>Short</button>
</Tooltip>
```

The tooltip appears after a short delay (400ms) to avoid flickering during quick pointer movements. It fades in/out with a subtle slide animation. Both the delay and animation respect the user's `prefers-reduced-motion` setting.

### Implementation notes

- Renders via `createPortal` to `document.body`, so sidebar or modal overflow won't clip it
- Position recalculates on scroll and resize
- Automatically flips below the trigger if there's insufficient space above
