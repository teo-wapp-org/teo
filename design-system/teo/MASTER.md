# Design System Master File — Teo

> **Precedencia:** manual de marca (`TEO_Brand_Kit_v1.0/`) > este archivo > recomendaciones de ui-ux-pro-max. Paleta y tipografía de este archivo ya están alineadas a la marca.

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** Teo
**Generated:** 2026-11-20 17:11:30
**Category:** Micro SaaS

---

## Global Rules

### Color Palette (MARCA TEO — reemplaza la sugerencia de la skill)

| Role | Light | Dark | CSS Variable |
|------|-------|------|--------------|
| Primary (Azul Teo) | `#0B1F3A` | `#F5F8FC` | `--primary` |
| On Primary | `#FFFFFF` | `#0B1F3A` | `--primary-foreground` |
| Accent/CTA (Verde Inteligente) | `#00D97E` | `#00D97E` | `--accent` / `--cta` |
| On Accent/CTA | `#0B1F3A` | `#0B1F3A` | `--cta-foreground` |
| Secondary (Lila de Acento) | `#D9D6FF` | `#2A2F5A` | `--secondary` |
| On Secondary | `#0B1F3A` | `#E7E5FF` | `--secondary-foreground` |
| Background (Blanco Nube) | `#F5F8FC` | `#07152A` | `--background` |
| Foreground | `#0B1F3A` | `#F5F8FC` | `--foreground` |
| Card | `#FFFFFF` | `#0B1F3A` | `--card` |
| Muted | `#EEF2F8` | `#13294A` | `--muted` |
| Muted Foreground (Gris Interfaz) | `#64748B` | `#94A3B8` | `--muted-foreground` |
| Border | `#E2E8F0` | `#1E3A5F` | `--border` |
| Destructive | `#DC2626` | `#F87171` | `--destructive` |
| Warning (espera/cotización) | `#F59E0B` | `#FBBF24` | `--warning` |
| Info (pago por confirmar) | `#3B82F6` | `#60A5FA` | `--info` |
| Ring | `#00D97E` | `#00D97E` | `--ring` |

**Reglas de marca:** el verde `#00D97E` NUNCA se usa como color de texto sobre fondos claros (no cumple AA): solo como fondo de CTA con texto Azul Teo. El lila es para superficies, chips y sugerencias de IA. Sidebar del panel: Azul Teo. No recolorear el logo.

### Typography (MARCA TEO)

- **Heading / marca:** Plus Jakarta Sans (600–800)
- **Body / UI:** Inter (400–600)
- Cargar con `next/font/google` (no @import).

### Spacing Variables

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `4px` / `0.25rem` | Tight gaps |
| `--space-sm` | `8px` / `0.5rem` | Icon gaps, inline spacing |
| `--space-md` | `16px` / `1rem` | Standard padding |
| `--space-lg` | `24px` / `1.5rem` | Section padding |
| `--space-xl` | `32px` / `2rem` | Large gaps |
| `--space-2xl` | `48px` / `3rem` | Section margins |
| `--space-3xl` | `64px` / `4rem` | Hero padding |

### Shadow Depths

| Level | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Subtle lift |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.1)` | Cards, buttons |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` | Modals, dropdowns |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,0.15)` | Hero images, featured cards |

---

## Component Specs

### Buttons

```css
/* Primary Button */
.btn-primary {
  background: #059669;
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}

.btn-primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

/* Secondary Button */
.btn-secondary {
  background: transparent;
  color: #0B1F3A;
  border: 2px solid #0B1F3A;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}
```

### Cards

```css
.card {
  background: #FFFFFF;
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--shadow-md);
  transition: all 200ms ease;
  cursor: pointer;
}

.card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}
```

### Inputs

```css
.input {
  padding: 12px 16px;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  font-size: 16px;
  transition: border-color 200ms ease;
}

.input:focus {
  border-color: #00D97E;
  outline: none;
  box-shadow: 0 0 0 3px #00D97E33;
}
```

### Modals

```css
.modal-overlay {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.modal {
  background: white;
  border-radius: 16px;
  padding: 32px;
  box-shadow: var(--shadow-xl);
  max-width: 500px;
  width: 90%;
}
```

---

## Style Guidelines

**Style:** Motion-Driven

**Keywords:** Animation-heavy, microinteractions, smooth transitions, scroll effects, parallax, entrance anim, page transitions

**Best For:** Portfolio sites, storytelling platforms, interactive experiences, entertainment apps, creative, SaaS

**Key Effects:** Scroll anim (Intersection Observer), hover (300-400ms), entrance, parallax (3-5 layers), page transitions

### Page Pattern

**Pattern Name:** Trust & Authority + Conversion

- **Conversion Strategy:** Security badges. Case studies. Transparent pricing. Low-friction form. Provide pause/stop and stop the logo carousel on focus, hover, and reduced motion. Previous/next controls provide the keyboard equivalent; pause offscreen/hidden and render a static logo set under reduced motion.
- **CTA Placement:** Contact Sales / Get Quote (primary) + Nav
- **Section Order:** Hero (mission/credibility) > Proof (logos, certs, stats) > Solution overview > Clear CTA path

---

## Anti-Patterns (Do NOT Use)

- ❌ Static design
- ❌ No video
- ❌ Poor mobile

### Additional Forbidden Patterns

- ❌ **Emojis as icons** — Use SVG icons (Heroicons, Lucide, Simple Icons)
- ❌ **Missing cursor:pointer** — All clickable elements must have cursor:pointer
- ❌ **Layout-shifting hovers** — Avoid scale transforms that shift layout
- ❌ **Low contrast text** — Maintain 4.5:1 minimum contrast ratio
- ❌ **Instant state changes** — Always use transitions (150-300ms)
- ❌ **Invisible focus states** — Focus states must be visible for a11y

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent icon set (Heroicons/Lucide)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No content hidden behind fixed navbars
- [ ] No horizontal scroll on mobile
