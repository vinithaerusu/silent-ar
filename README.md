# Integrated Interactions: Silent AR (Snap Spectacles + Meta Ray-Ban Display)

A concept demo where an **AR glasses view** is driven by a **BCI** (Neurosity Crown)
and the **phone as a touch controller**. The phone and the glasses are **separate
screens that sync live**.

It ships as **two platform builds you switch between live** with the segmented
**Snap / Meta** control at the top of `index.html`. Both builds share the same
interaction model, the same `/api`, and the same sync channel; only the rendering
target changes.

## Two platforms, one interaction model

- **Snap Spectacles** (root build): the **whole lens is the display** (full field
  of view). There's no corner window, so **object boxes are drawn straight onto the
  world**, and the Snap AI UI **floats as a glass card anchored in space**.
- **Meta Ray-Ban Display** (`meta/` build): a **small in-lens panel in one
  corner**. Object detection and the AI action list live inside that **compact
  corner HUD**, not across the world. Same look → choose → type flow, rendered into
  a single-corner display.

## Interface

- **Glasses** (`hud.html`, or `meta/hud.html`), the lens view:
  - **Browse:** look around the world; detected objects get a box + label. **BCI
    head-aim reticle + dwell** picks an object.
  - **Action card:** AI context actions for the picked object + a query row.
    **BCI = SSVEP flicker targets (1-4)**.
  - **Snap AI / Meta AI** (assistant/chat): the home card; **BCI back = tongue
    double-tap**.
- **Phone** (`phone.html`, or `meta/phone.html`): a floating control; tap to open
  the control surface: **NAVIGATE d-pad** (swipe = move, tap = select) + **Gboard
  keyboard** (touch-drag to hover a key → release to select).

Sync is over a `BroadcastChannel` (`sync.js`): same origin, two tabs/windows.

## Run

```
node server.js        # serves the app + /api (Gemini vision) on http://localhost:8000
```

Set `GEMINI_API_KEY` in `.env` for live vision actions; without it the card falls
back to Search / Describe / Photo. Open `index.html` for the glasses + docked phone
(with the Snap / Meta switch), or open `hud.html` and `phone.html` in two windows
side by side.

The world defaults to a pannable 360° **street demo** (drag to look around); toggle
to the live webcam bottom-left or with **V**.
