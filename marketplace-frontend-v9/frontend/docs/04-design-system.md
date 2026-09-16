# Design system

## Direction
A quiet, product-first storefront. The palette is one spruce green against warm-neutral greys; colour is reserved for actions and status so products carry the visual weight. One typeface (Manrope) at three weights; numbers use tabular figures so prices and totals align.

## Tokens (`src/styles/tokens.css`)
- **Primary** `#1F6F4F` (spruce), hover `#195B41`, tint `#E7F2EC`
- **Ink** `#1E2523`, **Muted** `#66716D`, **Line** `#E1E6E3`
- **Canvas** `#F6F7F6`, **Surface** `#FFFFFF`
- **Danger** `#B4322A`, **Warning** `#9A6B12`, **Info** `#2C5F9E`, **Success** = primary
- Radii: 6 / 10 / 14 px by hierarchy (controls / cards / sheets). Not one radius everywhere.
- Shadows: only on floating layers (menus, modals, toasts). Cards use a 1px line, not a shadow.
- Motion: 120–180 ms ease-out, only in response to user action. `prefers-reduced-motion` respected.

## Components (`src/components/ui`)
Button (primary / secondary / ghost / danger; sm / md / lg; loading), FormField + Input / Select / Textarea, Badge, Card, Alert, Modal, ConfirmDialog, Dropdown, Tabs, Pagination, SearchBar, StatCard, Skeleton, EmptyState, ErrorState, Toast, OtpInput, QuantityStepper, ImageUploader, ResponsiveTable.

## Accessibility floor
Semantic landmarks, labelled controls, visible 2px focus ring, status conveyed with text + icon (never colour alone), `aria-live` for toasts and async status, dialogs trap focus and close on Escape, 44px minimum touch targets on mobile.
