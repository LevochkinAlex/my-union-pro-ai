# Design System Strategy: The Fluid Architect

## 1. Overview & Creative North Star
The Creative North Star for this design system is **"The Fluid Architect."** 

In a world of cluttered, boxy chat interfaces, this system rejects the "template" look in favor of an environment that feels engineered yet organic. We achieve this by blending the structural rigor of a professional workspace with the kinetic fluidity of a high-end messaging tool. 

To move beyond "standard" UI, we utilize **intentional asymmetry**—such as offset headers and staggered message groupings—and **tonal depth**. Instead of rigid grids and borders, we use the "Depth-First" approach, where the UI is treated as a series of stacked, semi-transparent layers that breathe and react to user movement. This creates a "tech-forward" atmosphere that feels fast, premium, and inherently intentional.

---

## 2. Colors & Surface Logic

Our palette is rooted in the depth of `surface` (#0b1326) and the energy of `primary` (#c3c0ff). We do not use color merely for decoration; we use it to define the physics of the interface.

### The "No-Line" Rule
**Explicit Instruction:** Designers are prohibited from using 1px solid borders for sectioning. Boundaries must be defined solely through background color shifts.
*   *Implementation:* Use `surface-container-low` for the main background and `surface-container` for nested elements like message threads. The distinction should be felt through the shift in value, not a line.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers. 
*   **Base Layer:** `surface` (#0b1326)
*   **The Workspace:** `surface-container-low` (#131b2e) for the main chat feed.
*   **The Component:** `surface-container-high` (#222a3d) for active message bubbles or search bars.
*   **The Elevation:** `surface-bright` (#31394d) only for active states or pinned content.

### The "Glass & Gradient" Rule
To achieve a "signature" feel, floating elements (like the compose bar or "New Message" FABs) must use **Glassmorphism**. Apply `surface_variant` at 60% opacity with a 20px backdrop-blur. 

### Signature Textures
Main CTAs (Send button, Start Chat) must use a subtle linear gradient: 
*   From `primary_container` (#4f46e5) to `primary` (#c3c0ff) at a 135-degree angle. This adds "visual soul" and mimics the refraction of light on high-end glass.

---

## 3. Typography

The system utilizes a dual-font strategy to balance professional authority with modern approachability.

*   **Display & Headlines (Manrope):** We use Manrope for `display-lg` through `headline-sm`. Its geometric construction feels "tech-forward" and architecturally sound.
*   **Body & Labels (Inter):** We use Inter for all messaging and functional text. Inter’s high x-height ensures maximum readability during rapid-fire conversations.

**Hierarchy as Identity:**
*   **The Message Bubble:** Use `body-md` (Inter, 0.875rem) with a tighter tracking (-0.01em) to keep conversations compact and fast.
*   **The Context Label:** Use `label-sm` (Inter, 0.6875rem) in `on_surface_variant` for timestamps. The extreme scale contrast between the headline and the timestamp creates an editorial, high-end feel.

---

## 4. Elevation & Depth

We convey importance through **Tonal Layering** rather than structural lines.

### The Layering Principle
Never use a shadow where a color shift will suffice. Place a `surface-container-lowest` card on a `surface-container-low` section to create a soft, natural lift.

### Ambient Shadows
When an element must "float" (e.g., a context menu):
*   **Blur:** 32px to 48px.
*   **Opacity:** 6% - 8%.
*   **Color:** Use a tinted version of `on_surface` (deep indigo-tinted shadow) rather than pure black. This mimics natural light.

### The "Ghost Border" Fallback
If a border is required for accessibility (e.g., input fields), use the `outline_variant` token at **15% opacity**. 100% opaque, high-contrast borders are strictly forbidden as they "break" the fluid aesthetic.

---

## 5. Components

### Message Bubbles
*   **Incoming:** `surface-container-high` (#222a3d) with `md` (0.75rem) roundedness. 
*   **Outgoing:** `primary_container` (#4f46e5) with `md` roundedness. 
*   **Spacing:** Use `spacing-2` (0.4rem) between messages from the same user, and `spacing-4` (0.9rem) between different users.

### Buttons & Chips
*   **Primary Button:** Gradient fill (Primary to Primary Container). Roundedness: `full`.
*   **Secondary/Ghost Button:** No background. `label-md` weight. Uses `primary` text color.
*   **Chips:** Use `surface-container-highest` for the background. Forbid dividers; use `spacing-3` for clear separation.

### Input Fields (The Compose Bar)
*   **Style:** A single "pill" shape using `surface-container-high`. 
*   **Interaction:** On focus, the `outline` token glows at 20% opacity. 
*   **Icons:** Use `tertiary` (#4cd7f6) for action icons (attach, voice) to provide a "vibrant violet/cyan" tech-forward accent against the deep indigo.

### Floating Action Button (FAB)
*   **Design:** `xl` roundedness. Use `secondary_container` (#571bc1) to differentiate "Action" from "Navigation."

---

## 6. Do’s and Don’ts

### Do:
*   **Use Vertical White Space:** Use the `16` (3.5rem) spacing token to separate major sections rather than a divider line.
*   **Embrace Asymmetry:** Align user avatars to the far left, but allow message timestamps to float subtly to the right of the bubble to create a rhythmic, non-linear flow.
*   **Prioritize Kinetic Motion:** When a user scrolls, use the `surface-container` shifts to make the background feel like it has "weight."

### Don’t:
*   **Don't use 100% Black:** Even in Dark Mode, our darkest value is `surface` (#0b1326). True black kills the "indigo" brand depth.
*   **Don't use Standard Shadows:** Avoid "drop shadows" that look like stickers. If it doesn't look like a soft glow or a natural lift, it’s too heavy.
*   **Don't use Dividers in Lists:** Forbid 1px lines between chat threads. Use `spacing-2.5` and a slight `surface` hover state to define rows.

### Accessibility Note:
While we use soft tonal shifts, ensure the contrast ratio between `on_surface` and `surface-container` always meets WCAG AA standards. The "Ghost Border" should be used for focus states to ensure keyboard navigability is never sacrificed for aesthetics.