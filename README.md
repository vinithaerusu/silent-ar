# Integrated Interactions — Meta Glasses (Silent AR)

A concept demo where a **Ray-Ban Display HUD** is driven by three input methods:
the **Neural Band**, a **BCI** (Neurosity Crown), and the **phone as a touch
controller**. The phone and the HUD are **separate screens that sync live**.

## Slice 1 (current)

The **phone control surface + Meta keyboard driving the HUD**:

- **Phone** (`phone.html`) — a floating Meta control icon; tap it to open the
  control surface: **ZOOM / SCROLL / BACK** buttons + the **Meta keyboard**.
  - Keyboard: **touch-drag to hover** a key (blue highlight) → **release to
    select**. Tap outside to close.
  - **ZOOM** = vertical swipe on the button · **SCROLL** = horizontal swipe ·
    **BACK** = tap.
- **HUD** (`hud.html`) — the glasses view with a square display that mirrors the
  phone: **keyboard preview**, **typed text**, the **blue key highlight**, and
  reacts to zoom / scroll / back.

Sync is over a `BroadcastChannel` (`sync.js`) — same origin, two tabs/windows.

## Run

```
python3 -m http.server 8003
```

Open `index.html` and launch both screens (or open `hud.html` and `phone.html`
in two windows), place them side by side, and drive the HUD from the phone.

## Later slices

- Camera view (object detection) — opened via the camera button left of the
  text input; Neural Band scroll-left+select; **BCI = SSVEP button**.
- Meta AI (assistant/chat) — Neural Band hand gesture; **BCI = tongue prolonged
  press**; **BCI back = tongue double-tap**.
- Swipe-to-type (glide), scrollable content views.
