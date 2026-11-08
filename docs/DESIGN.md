# MMAC Hub Design Spec (Launch)

This is the design source of truth for the launch build. It covers four pages: **Home** (`/`), **Our Programs** (`/programs`), **Get Involved** (`/get-involved`) and **Get Help**, the intake page (`/get-help`). Agents build to this spec and do not invent content. Anything not covered here goes to the roadmap's Parking lot.

**Site type:** a portfolio demo shared with MMAC and employers. The database holds test data only.

---

## Brand facts (from maconmovesanimalcare.com)

- **Name:** Macon Moves Animal Care (MMAC). Never "Animal Coalition."
- **Service area:** Macon, Jackson and Rabun Counties. Never Swain.
- **Services:**
  - Spay/neuter
  - Vaccines & preventatives
  - Basic care (e.g. nail trims)
  - TNR for community cats
  - Care and adoption of homeless animals
- **Phone:** 828-200-9686
- **Email:** Maconmovesanimalcare@gmail.com
- **Facebook:** https://www.facebook.com/profile.php?id=61576031116351
- **Donations:** Zeffy, https://www.zeffy.com/en-US/donation-form/sponsor-a-macon-moves-rescue. Open it in a new tab; the app has no payment code.
- **Fiscal sponsor:** Macon Moves Animal Care is a proud partner of Horse Tales Farm Inc., a 501(c)(3) nonprofit (EIN 45-3336241).

**Content rules:**

- **No invented statistics,** testimonials, partners, or claims.
- **No AI-generated people presented as real clients.**
- If copy isn't in this spec, mark it `TODO(copy)` and park it.

---

## Palette

Define these as CSS variables or Tailwind theme tokens. Never hard-code hex values in components.

| Token | Hex | Use |
|---|---|---|
| `primary` (Deep Teal/Navy) | `#1D3F5A` | Headings, primary buttons, dark sections, links |
| `secondary` (Sage Green) | `#5B8F72` | Icons, accents, large decorative elements |
| `accent` (Golden Ochre) | `#F4B13D` | Donate button, hero call to action, highlights |
| `sand` (Warm Sand) | `#E8E2D6` | Section backgrounds, cards |
| `text` (Charcoal) | `#2E2E2E` | Body text |
| `neutral` (Soft Gray) | `#F7F8F9` | Page background |
| `error` | `#B42318` | Validation errors only. This is an addition to the palette, chosen for accessible contrast. |

**Contrast rules (WCAG AA):**

- **Gold buttons use navy or charcoal text,** never white. White on gold fails.
- **Sage is not a text color** for normal-size text, because it fails AA on white. Use it for icons and large display elements only.
- White text is fine on `primary` and on dark photo overlays.

## Typography

Load both fonts with `next/font/google`, not a CSS link.

- **Headings:** Fraunces (serif), weight 600–700. This matches the mockups' sturdy serif headlines.
- **Body and UI:** Inter.
- **Eyebrow labels:** Inter, uppercase, letter-spaced, small, e.g. "PETS ARE FAMILY."

## Components

- **Buttons:** pill-shaped and fully rounded. Most carry a trailing →.
  - **Primary:** navy fill with white text.
  - **Accent:** gold fill with navy text.
  - **Secondary:** outline. Use white on dark backgrounds and navy on light ones.
- **Cards:** rounded corners (about 16px), soft shadow, with a sand or white background.
- **Icons:** simple line or solid icons in navy or sage. Use inline SVG, not an icon library, unless one is already installed.
- **"Coming soon" pattern:** a feature we aren't building renders as a **non-link**, with `aria-disabled="true"` and a small sand pill reading "Coming soon." Never use a dead link or a `#` href.

---

## Global elements (all pages)

### Demo banner (top of every page)

A slim navy bar with white text:

> Portfolio demo — please don't submit real personal or pet information.

### Header

- **Left:** the logo (`/images/logo.png`), linking to `/`.
- **Nav:**
  - **Home** → `/`
  - **Get Help** → `/get-help`
  - **Our Programs** → `/programs`
  - **Get Involved** → `/get-involved`
  - **Resources** → coming soon
- **Right:** a gold **Donate** button linking to Zeffy, opening in a new tab with `rel="noopener noreferrer"`.
- **Mobile:** a hamburger menu that is keyboard accessible and closes on Escape.

### Stats bar (above the footer, from Mockup B)

Three items on a light background, each with an icon:

- Families Supported and Growing
- 3 Counties Served
- Healthier Pets at Home

These are not numbers. Do not add figures.

### Footer

Navy background, white text.

- **Logo**, plus the line "Serving Macon, Jackson, and Rabun Counties."
  - Logo sits on a small sand (#E8E2D6) rounded badge — the logo's magenta text has poor contrast on navy.
- **Contact:**
  - phone (as a `tel:` link)
  - email (as a `mailto:` link)
  - Facebook link
- **Donate** link (Zeffy) and the fiscal sponsor line.
- **Bottom row:**
  - © 2026 Macon Moves Animal Care
  - "Portfolio demo built by Tracy Cross," linking to https://dev-portfolio-woad-seven.vercel.app/

---

## Landing page (`/`), in order

### 1. Hero (split layout, adapted from Mockup C)

`hero.jpg` is **portrait** (2000×2667), so a full-width photo would crop the kitten to half a face. The hero is a split instead:

- **Tablet and desktop (768px and up):** two columns, about 600px tall on desktop and 520px on tablet.
  - **Left (~55%):** a solid `primary` panel with the eyebrow, headline, body and buttons, vertically centered. No gradient over text.
  - **Right (~45%):** `hero.jpg` with `object-fit: cover` and `object-position` near the top (about `center 15%`), so the kitten shows from ears to paws.
  - A soft ~80px `primary`-to-transparent fade where the panel meets the photo.
- **Mobile:** the photo on top at about 4:3 (`object-position` about `center 10%`, so the face and ears are in frame), then the navy text block below.
- The headline breaks as "Real Care for / Real Life."

- **Eyebrow:** PETS ARE FAMILY. WE'RE HERE TO HELP.
- **Headline:** Real Care for Real Life.
- **Body:** Affordable veterinary care, resources, and support for families in Macon, Jackson, and Rabun Counties.
- **Buttons:**
  - **Get Help for Your Pet →** (gold) → `/get-help`
  - **How We Help** (white outline) → `/programs`

### 2. Action cards (from Mockup C)

Three compact cards fully below the hero (no overlap), 3 across on desktop and stacked on mobile. Each card: icon inline to the left of the title, the description below, then an arrow (link) or the "Coming soon" pill.

| Card | Icon | Text | Link |
|---|---|---|---|
| **Get Help** | paw | Start the intake process for veterinary assistance. | `/get-help` |
| **Find a Clinic Event** | calendar | Vaccines, clinics, and community services. | Coming soon |
| **Explore Resources** | book | Helpful information for pet health and care. | Coming soon |

Leave comfortable space below the cards so the stats bar doesn't sit tight against them.

### 3. Stats bar, then the footer

These are the global elements described above.

---

## Our Programs page (`/programs`)

It uses the same banner, header, stats bar and footer as the landing page.

### Header band

The same layout as the Get Involved page: a navy panel on the left and a photo on the right, stacked on mobile with text first.

- **Headline (the page's `h1`):** How We Help
- **Body:** Affordable veterinary care and support for families in Macon, Jackson, and Rabun Counties.
- **Photo:** `/images/programs.jpg` (not supplied yet). Until it exists, the navy panel spans the full width.

### Services

This section is an addition to the mockups. Five informational icon tiles, with no links:

1. Spay/Neuter
2. Vaccines & Preventatives
3. Basic Care
4. TNR / Community Cats
5. Homeless Animal Support

Below the tiles: **Get Help for Your Pet →** (gold) → `/get-help`.

---

## Get Involved page (`/get-involved`)

It uses the same banner, header, stats bar and footer as the landing page.

### Community section (from Mockup B's lower half)

A split layout: a navy panel on the left and the mountains photo (`/images/mountains.jpg`) on the right. On mobile they stack, text first. On desktop the section is about 480–560px tall so it reads as a page, not a strip.

- **Headline (the page's `h1`):** Local Pets. Lasting Change.
- **Body:** Healthier pets mean stronger families and a brighter community for generations to come.
- **Button:** **Support Our Work →** (gold) → Zeffy, in a new tab.

---

## Intake page (`/get-help`)

It uses the same banner, header, stats bar and footer as the landing page.

### Intro band

A short navy band with white text.

- **Headline:** Ask for Help
- **Body:** Tell us about yourself and your pet. It's okay if you aren't sure about some answers — Macon Moves will review your request and be in touch.
- **Saved-answers line:** If your connection drops, your answers are saved in this browser tab until your request goes through.
- **Note:** Requesting help doesn't guarantee services. Rabies vaccination is required for most veterinary care coordinated through MMAC. If your pet isn't current or you're unsure, it may be included as part of their care.

### Form

Keep the existing fields, validation and submission logic exactly as they are. **This is a visual change only.**

**Layout:**

- Each existing form section becomes a white card on the sand background.
- Labels sit above their inputs. Inputs are full width on mobile and use two columns on desktop where they already do.
- Inputs are at least 44px tall, with a visible focus ring in `primary`.

**Error states:**

- **Each field's error:** show it in the `error` color with a small icon. Set `aria-invalid="true"` and `aria-describedby` on the input.
- **Error summary on submit:** when a submit fails validation, show a summary box at the top listing each error as a link to its field. Move focus to the summary.

**Submit states:**

- **Submit button:** primary navy, full width on mobile. It is disabled and shows "Sending…" while submitting.
- **Success:** a green-tinted card (sage border) reading "Request received." with the existing confirmation text.
- **Failure or locked attempt:** a clear card with the existing message, plus:

> This is a portfolio demo. If you need real help, contact MMAC at 828-200-9686 or Maconmovesanimalcare@gmail.com.

---

## Images

| File | Description | Target |
|---|---|---|
| `public/images/logo.png` | Transparent background (pink removed from MMAC's 400×400 square; original file still preferred). | 275×314 (artwork cropped, no detail lost); fine for header/footer — MMAC original preferred for favicon/og-image. |
| `public/images/hero.jpg` | A kitten (no person). Subject placement and overlay per the image check. | About 2000px wide, under 500 KB |
| `public/images/mountains.jpg` | Wide landscape of the local mountains | About 1600px wide, under 400 KB |

**Image rules:**

- Use `next/image` for every image, with a real description in `alt`. The logo's alt text is "Macon Moves Animal Care."
- Generate the favicon and the link-preview image (`og-image`, 1200×630) from the logo and hero.

---

## Accessibility and responsive basics (launch level)

- **Structure:** semantic landmarks (`header`, `nav`, `main`, `footer`), one `h1` per page, and headings in order.
- **Keyboard:** everything works by keyboard, focus is always visible, and a "Skip to content" link comes first.
- **Contrast:** follow the contrast rules above.
- **Widths:** check the layout at 375px, 768px and 1280px. Never allow horizontal scroll.
- **Motion:** respect `prefers-reduced-motion` if anything animates.
