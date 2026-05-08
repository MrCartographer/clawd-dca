# Carta-Inspired Visual Style Guide

> **Purpose:** A reference document for agents and product teams to apply Carta's visual design language when building products, interfaces, and marketing materials. Based on analysis of Carta's public-facing website, their Ink design system (ink.carta.com), and their brand evolution documented via Figma and Dribbble.

---

## 1. Brand Essence

Carta's visual identity communicates **trust, clarity, and modern professionalism** in the fintech/equity management space. The design language balances authority (deep, dark color palettes) with approachability (rounded elements, generous spacing, friendly illustrations). Every visual choice reinforces the idea: *complex financial data made simple and transparent*.

**Core design principles:**

- **Clarity over complexity** -- minimalist layouts that let content breathe
- **Professional warmth** -- dark, serious palettes softened by rounded shapes and friendly illustration
- **Data-forward** -- typography and layout designed to present financial information cleanly
- **Scalable consistency** -- token-based system (Ink) ensuring uniformity across all touchpoints

---

## 2. Color Palette (from Ink Design System — ink.carta.com)

### Primitive Tokens (key neutrals)

| Token | Hex | Usage |
|-------|-----|-------|
| White | `#FFFFFF` | Default background, card surfaces |
| Black | `#1A1A1A` | Primary text |
| Gray 10 | `#F1F1F1` | Underlay backgrounds, light surfaces |
| Gray 20 | `#EDEDEDED` | Disabled surfaces |
| Gray 30 | `#E9EAEA` | Hover states on light surfaces |
| Gray 40 | `#DEDFDF` | Subtle borders, disabled borders |
| Gray 50 | `#CECFCF` | Active states on light surfaces |
| Gray 60 | `#A7AAAA` | Default borders, disabled text |
| Gray 70 | `#9C9F9F` | Very subtle text |
| Gray 80 | `#656B6B` | Subtle text, neutral feedback strong |
| Gray 90 | `#394040` | Dark gray text |
| Gray 100 | `#2C3030` | Darkest gray surface |
| Brown 10 | `#FBFAF9` | Warm surface default |

### Primitive Tokens (key hues)

| Token | Hex | Usage |
|-------|-----|-------|
| Blue 50 | `#4176BC` | Mid-blue |
| Blue 60 | `#2C67B5` | Strong blue |
| Blue 70 | `#285DA3` | Primary accent (links, CTAs, focus, info) |
| Blue 80 | `#235291` | Deep blue |
| Blue 90 | `#1A3E6D` | Link hover |
| Blue 100 | `#122948` | Link active |
| Blue 10 | `#EAF0F8` | Blue surface default, info subtle |
| Blue 30 | `#C0D1E9` | Focus halo, blue surface active |

### Product Semantic Tokens — Surface

| Token | Hex | Maps to |
|-------|-----|---------|
| Background Default | `#FFFFFF` | White |
| Background Underlay | `#F1F1F1` | Gray 10 |
| Surface Brown Default | `#FBFAF9` | Brown 10 |
| Surface Disabled | `#EDEDEDED` | Gray 20 |
| Surface LightGray Default | `#F1F1F1` | Gray 10 |
| Surface LightGray Hover | `#E9EAEA` | Gray 30 |
| Surface LightGray Active | `#CECFCF` | Gray 50 |
| Surface DarkGray Default | `#2C3030` | Gray 100 |
| Surface Blue Default | `#EAF0F8` | Blue 10 |
| Surface Blue Strong | `#285DA3` | Blue 70 |

### Product Semantic Tokens — Text

| Token | Hex | Maps to |
|-------|-----|---------|
| Text Default | `#1A1A1A` | Black |
| Text Subtle | `#656B6B` | Gray 80 |
| Text Very Subtle | `#9C9F9F` | Gray 70 |
| Text Disabled | `#A7AAAA` | Gray 60 |
| Text Inverse | `#FFFFFF` | White |
| Link Default | `#285DA3` | Blue 70 |
| Link Hover | `#1A3E6D` | Blue 90 |
| Link Active | `#122948` | Blue 100 |

### Product Semantic Tokens — Border

| Token | Hex | Maps to |
|-------|-----|---------|
| Border Default | `#A7AAAA` | Gray 60 |
| Border Hover | `#656B6B` | Gray 80 |
| Border Active | `#1A1A1A` | Black |
| Border Subtle | `#DEDFDF` | Gray 40 |
| Border Accent Blue | `#285DA3` | Blue 70 |
| Border Disabled | `#DEDFDF` | Gray 40 |
| Border Focus Default | `#285DA3` | Blue 70 |
| Border Focus Halo | `#C0D1E9` | Blue 30 |

### Product Semantic Tokens — Feedback

| Token | Hex | Maps to |
|-------|-----|---------|
| Feedback Negative Subtle | `#FFEEEF` | Red 10 |
| Feedback Negative Strong | `#E52431` | Red 70 |
| Feedback Positive Subtle | `#EBF7F6` | Green 10 |
| Feedback Positive Strong | `#2D9E90` | Green 70 |
| Feedback Warning Subtle | `#FFFCED` | Yellow 20 |
| Feedback Warning Strong | `#F8D648` | Yellow 60 |
| Feedback Info Subtle | `#EAF0F8` | Blue 10 |
| Feedback Info Strong | `#285DA3` | Blue 70 |
| Feedback Neutral Subtle | `#EDEDEDED` | Gray 20 |
| Feedback Neutral Strong | `#656B6B` | Gray 80 |
| Highlight Subtle | `#FFF7F5` | Orange 10 |
| Highlight Strong | `#FF7D55` | Orange 60 |

### Color Usage Rules

- **Light-first approach:** Backgrounds use white (`#FFFFFF`) or gray underlay (`#F1F1F1`). Brown 10 (`#FBFAF9`) adds warmth. Dark surfaces are only used for specialized components like dark cards, never as primary page backgrounds.
- **Blue as the activator:** Blue 70 (`#285DA3`) is the primary accent — for links, CTAs, focus rings, info feedback, and accent borders. Used sparingly for maximum impact.
- **Contrast and accessibility:** Dark text (`#1A1A1A`) on light backgrounds, white text on strong-color surfaces. Minimum 4.5:1 contrast ratio for body text, 3:1 for large text.
- **No gradients for backgrounds:** Keep surfaces flat and clean. Depth comes from elevation (shadows) and border hierarchy, not color gradients.

---

## 3. Typography

### Font Stack

Carta uses a clean geometric sans-serif typeface optimized for both UI readability and marketing impact. Their Ink design system defines three text components: **Heading**, **Text**, and **CustomText**.

**Recommended font stack (closest public equivalents):**

```
Primary:     "Inter", "SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif
Monospace:   "SF Mono", "Fira Code", "Consolas", monospace
```

*Note: Carta may use a licensed/custom typeface internally. Inter closely matches their geometric, highly-legible style and is freely available.*

### Type Scale

| Level | Size | Weight | Line Height | Letter Spacing | Usage |
|-------|------|--------|-------------|----------------|-------|
| Display | 56px / 3.5rem | 700 (Bold) | 1.1 | -0.02em | Hero headlines |
| H1 | 40px / 2.5rem | 700 (Bold) | 1.2 | -0.015em | Page titles |
| H2 | 32px / 2rem | 600 (Semi) | 1.25 | -0.01em | Section headers |
| H3 | 24px / 1.5rem | 600 (Semi) | 1.3 | -0.005em | Subsection headers |
| H4 | 20px / 1.25rem | 600 (Semi) | 1.35 | 0 | Card titles, labels |
| Body Large | 18px / 1.125rem | 400 (Regular) | 1.6 | 0 | Lead paragraphs |
| Body | 16px / 1rem | 400 (Regular) | 1.6 | 0 | Standard body text |
| Body Small | 14px / 0.875rem | 400 (Regular) | 1.5 | 0.005em | Captions, meta |
| Caption | 12px / 0.75rem | 500 (Medium) | 1.4 | 0.01em | Labels, fine print |

### Typography Rules

- **Headlines are bold and tight:** Large headings use negative letter-spacing to feel confident and punchy. They never feel light or airy.
- **Body text is generous:** 1.6 line-height for comfortable reading. Paragraphs are constrained to ~65-75 characters per line.
- **Weight hierarchy:** Bold (700) for headlines only. Semibold (600) for subheads and emphasis. Regular (400) for body. Medium (500) for UI labels and buttons.
- **No decorative fonts:** Everything is the same sans-serif family. Hierarchy comes from size, weight, and color -- not from mixing typefaces.

---

## 4. Spacing System

Carta's Ink design system uses a consistent spacing scale to define rhythm, structure, and layout.

### Base Unit: 4px

| Token | Value | Usage |
|-------|-------|-------|
| `space-1` | 4px | Tight internal spacing (icon-to-text gaps) |
| `space-2` | 8px | Compact spacing (inline elements, small gaps) |
| `space-3` | 12px | Default internal padding (buttons, form fields) |
| `space-4` | 16px | Standard component padding |
| `space-5` | 20px | Medium separation between related elements |
| `space-6` | 24px | Default gap between components |
| `space-8` | 32px | Section sub-spacing |
| `space-10` | 40px | Large spacing between content blocks |
| `space-12` | 48px | Section spacing |
| `space-16` | 64px | Major section breaks |
| `space-20` | 80px | Page-level section separation |
| `space-24` | 96px | Hero and top-level section padding |

### Spacing Rules

- **Generous whitespace:** Carta's design breathes. Don't crowd elements. When in doubt, add more space.
- **Consistent rhythm:** Always use the spacing scale. Avoid arbitrary pixel values.
- **Content maxwidth:** Primary content areas max out at ~1200px. Text blocks max at ~680px for readability.
- **Asymmetric padding:** Sections often have more vertical padding (96-120px) than horizontal (24-48px), creating a vertical scroll rhythm.

---

## 5. Layout Patterns

### Grid System

- **12-column grid** for page layouts
- **Max container width:** 1200px, centered
- **Gutter width:** 24px
- **Responsive breakpoints:**
  - Mobile: 0-767px
  - Tablet: 768-1023px
  - Desktop: 1024-1279px
  - Wide: 1280px+

### Common Layout Patterns

**Hero Section:**
White or warm off-white (`#FBFAF9`) background with left-aligned headline, supporting text, and a CTA button. Often paired with a product screenshot or illustration floating on the right. Generous vertical padding (120-160px).

**Feature Grid:**
2-3 column layout on desktop, stacking to single column on mobile. Each feature card has an icon or small illustration, a heading, and a short description. White cards on gray underlay (`#F1F1F1`) background.

**Data Showcase:**
Product screenshots or UI mockups displayed in clean device frames on light backgrounds with subtle drop shadows. These are the "hero" visuals that show the product in action.

**Alternating Sections:**
Content sections alternate between white (`#FFFFFF`) and gray underlay (`#F1F1F1`) to create visual rhythm. Brown 10 (`#FBFAF9`) can be used as a third warm surface option.

---

## 6. Component Styles

### Buttons

```
Primary Button:
  Background:    #285DA3 (Blue 70 — Surface Blue Strong)
  Text:          #FFFFFF
  Font weight:   600
  Padding:       12px 24px
  Border radius: 8px
  Hover:         #1A3E6D (Blue 90)
  Transition:    150ms ease

Secondary Button:
  Background:    transparent
  Border:        1.5px solid #285DA3
  Text:          #285DA3 (on light bg)
  Padding:       12px 24px
  Border radius: 8px
  Hover:         #EAF0F8 background (Surface Blue Default)

Ghost Button:
  Background:    transparent
  Text:          #285DA3
  Padding:       12px 24px
  Hover:         underline or subtle background shift
```

### Cards

```
Default Card (light surface):
  Background:    #FFFFFF (Background Default)
  Border:        1px solid #DEDFDF (Border Subtle)
  Border radius: 12px
  Padding:       24px
  Shadow:        0 1px 3px rgba(0, 0, 0, 0.08)
  Hover shadow:  0 4px 12px rgba(0, 0, 0, 0.12)

Card on Underlay:
  Background:    #FFFFFF (Background Default)
  Border:        1px solid #DEDFDF (Border Subtle)
  Border radius: 12px
  Padding:       24px
  (Used when card sits on #F1F1F1 underlay background)
```

### Form Elements

```
Input Field:
  Background:    #FFFFFF
  Border:        1px solid #E1E5EB
  Border radius: 8px
  Padding:       12px 16px
  Font size:     16px
  Focus border:  #285DA3 (Border Focus Default)
  Focus shadow:  0 0 0 3px #C0D1E9 (Border Focus Halo)

Select / Dropdown:
  Same as input, with chevron icon right-aligned
  
Checkbox / Radio:
  Accent color:  #285DA3
  Border radius: 4px (checkbox), 50% (radio)
```

### Navigation

```
Top Nav:
  Background:    #FFFFFF (Background Default)
  Text:          #656B6B (Text Subtle)
  Active text:   #1A1A1A (Text Default)
  Height:        64-72px
  Logo:          Left-aligned, dark wordmark
  Border bottom: 1px solid #DEDFDF (Border Subtle)

Hover state:     Text darkens to #1A1A1A
Active indicator: Blue underline #285DA3 (Border Accent Blue)
```

---

## 7. Illustration & Imagery Style

### Illustration Approach

Carta uses **isometric, line-based illustrations** with a distinctive style:

- **Isometric perspective:** 3D-feeling objects drawn at consistent isometric angles
- **Line art with color fills:** Clean outlines with flat or subtly shaded color fills
- **Limited palette:** Illustrations use the brand palette (navy, teal, white, with occasional warm accent)
- **Conceptual, not literal:** Illustrations represent abstract concepts (growth, equity, collaboration) rather than photorealistic scenes
- **Component-based:** Built from reusable components in Figma, allowing consistency across all illustrations

### Photography (when used)

- Professional, naturally lit
- Diverse, modern workplace settings
- Slightly desaturated / cool-toned color grading to match the brand palette
- Never stock-photo-generic -- feels candid and authentic

### Product Screenshots

- Displayed in clean device or browser mockup frames
- Placed on dark navy backgrounds for contrast
- Often with subtle shadow or glow effects
- Screenshots show real product UI, reinforcing credibility

---

## 8. Motion & Interaction

- **Subtle and purposeful:** Animations serve function, not flair
- **Transition duration:** 150-300ms for micro-interactions, 400-600ms for page-level transitions
- **Easing:** `ease-out` for entrances, `ease-in-out` for state changes
- **Scroll animations:** Content fades in gently as it enters the viewport -- opacity 0 to 1 with a slight upward slide (8-16px)
- **Hover effects:** Buttons brighten/darken, cards lift with shadow, links shift color smoothly
- **No bounce, no elastic:** The motion style is calm and professional, never playful or springy

---

## 9. Tone & Voice (Visual Implications)

Carta's visual tone is:

- **Authoritative but not cold** -- dark palettes convey seriousness, rounded elements and illustrations add warmth
- **Precise but not clinical** -- clean layouts and data-forward design, softened by generous spacing and approachable type
- **Modern but not trendy** -- timeless geometric sans-serif, restrained color usage, no gimmicky effects
- **Confident but not loud** -- the design lets content lead; visual embellishment is minimal

---

## 10. Quick Reference: CSS Custom Properties (Ink tokens)

```css
:root {
  /* Primitive — Neutrals */
  --ink-white: #FFFFFF;
  --ink-black: #1A1A1A;
  --ink-gray-10: #F1F1F1;
  --ink-gray-20: #EDEDEDED;
  --ink-gray-30: #E9EAEA;
  --ink-gray-40: #DEDFDF;
  --ink-gray-50: #CECFCF;
  --ink-gray-60: #A7AAAA;
  --ink-gray-70: #9C9F9F;
  --ink-gray-80: #656B6B;
  --ink-gray-90: #394040;
  --ink-gray-100: #2C3030;
  --ink-brown-10: #FBFAF9;

  /* Primitive — Blue (primary accent) */
  --ink-blue-10: #EAF0F8;
  --ink-blue-30: #C0D1E9;
  --ink-blue-50: #4176BC;
  --ink-blue-70: #285DA3;
  --ink-blue-90: #1A3E6D;
  --ink-blue-100: #122948;

  /* Semantic — Surface */
  --background-default: #FFFFFF;
  --background-underlay: #F1F1F1;
  --surface-brown-default: #FBFAF9;
  --surface-lightgray-default: #F1F1F1;
  --surface-blue-default: #EAF0F8;
  --surface-blue-strong: #285DA3;

  /* Semantic — Text */
  --text-default: #1A1A1A;
  --text-subtle: #656B6B;
  --text-very-subtle: #9C9F9F;
  --text-disabled: #A7AAAA;
  --text-inverse: #FFFFFF;
  --link-default: #285DA3;
  --link-hover: #1A3E6D;

  /* Semantic — Border */
  --border-default: #A7AAAA;
  --border-subtle: #DEDFDF;
  --border-accent-blue: #285DA3;
  --border-focus-default: #285DA3;
  --border-focus-halo: #C0D1E9;

  /* Semantic — Feedback */
  --feedback-negative-strong: #E52431;
  --feedback-positive-strong: #2D9E90;
  --feedback-warning-strong: #F8D648;
  --feedback-info-strong: #285DA3;

  /* Typography */
  --font-sans: "Inter", "SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: "SF Mono", "Fira Code", "Consolas", monospace;

  /* Spacing */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
  --space-20: 80px;
  --space-24: 96px;

  /* Radii */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-full: 9999px;

  /* Shadows */
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.08);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.12);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.16);

  /* Transitions */
  --transition-fast: 150ms ease;
  --transition-base: 250ms ease;
  --transition-slow: 400ms ease;
}
```

---

## 11. Do's and Don'ts

**Do:**
- Use white (`#FFFFFF`) or gray underlay (`#F1F1F1`) as your dominant backgrounds -- light-first approach
- Apply Blue 70 (`#285DA3`) accents sparingly for links, CTAs, and key highlights
- Maintain generous whitespace throughout all layouts
- Use a single sans-serif font family (Inter) with weight variations for hierarchy
- Keep illustrations consistent in perspective (isometric) and palette
- Design data-heavy interfaces with clear hierarchy and breathing room
- Use Border Subtle (`#DEDFDF`) for card edges and dividers
- Use Brown 10 (`#FBFAF9`) for warm surface sections

**Don't:**
- Use dark navy or teal as page backgrounds -- the Ink palette is light-first
- Mix multiple typefaces or use decorative/serif fonts
- Apply gradients to backgrounds -- keep surfaces flat and clean
- Use heavy drop shadows or 3D effects on UI components
- Add unnecessary animation or visual complexity
- Use Blue 70 for large background areas -- it's an accent, not a surface color (use Blue 10 `#EAF0F8` for blue surfaces)

---

*This style guide is based on publicly available information about Carta's visual design as of April 2026, including their Ink design system documentation, Figma case studies, Dribbble portfolio, and brand analysis. For production use, verify specific values against the live carta.com and ink.carta.com when possible.*
