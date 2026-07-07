# Integrated Interactions — Snap Spectacles (Silent AR)

A concept demo where a **Snap Spectacles full-FOV AR view** is driven by a
**BCI** (Neurosity Crown) and the **phone as a touch controller**. The phone and
the glasses are **separate screens that sync live**.

Unlike Ray-Ban **Display** glasses, Spectacles have no separate in-lens panel —
the whole lens *is* the display. So there's no corner window: **object boxes are
drawn straight onto the world across the full field of view**, and Snap AI UI
**floats as a glass card anchored in space**.

## Interface

- **Glasses** (`hud.html`) — the full-FOV lens view:
  - **Browse** — look around the world; detected objects get a box + label drawn
    right on them. **BCI head-aim reticle + dwell** picks an object.
  - **Action card** — a floating glass card of AI context actions for the picked
    object + a query row. **BCI = SSVEP flicker targets (1–4)**.
  - **Snap AI** (assistant/chat) — the home card; **BCI back = tongue
    double-tap**.
- **Phone** (`phone.html`) — a floating Snap control; tap to open the control
  surface: **NAVIGATE d-pad** (swipe = move · tap = select) + **Gboard keyboard**
  (touch-drag to hover a key → release to select).

Sync is over a `BroadcastChannel` (`sync.js`) — same origin, two tabs/windows.

## Run

```
node server.js        # serves the app + /api (Gemini vision) on http://localhost:8000
```

Set `GEMINI_API_KEY` in `.env` for live vision actions; without it the card
falls back to Search / Describe / Photo. Open `index.html` for the glasses +
docked phone, or `hud.html` and `phone.html` in two windows side by side.

The world defaults to a pannable 360° **street demo** (drag to look around);
toggle to the live webcam bottom-left or with **V**.
