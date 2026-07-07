/*
 * Cross-screen sync — the phone and the HUD are separate pages (separate tabs/
 * windows) that stay in lockstep over a BroadcastChannel on the same origin.
 *
 *   Sync.send("key:hover", { key: "a" })   // phone -> HUD
 *   Sync.on(msg => { ... })                 // HUD receives
 *
 * Message types (phone -> HUD):
 *   keyboard:open            keyboard surface opened
 *   keyboard:close           keyboard surface closed
 *   key:hover  {key|null}    finger is hovering a key (blue highlight)
 *   text:set   {text}        full current text (phone owns the text state)
 *   zoom       {dir:+1|-1}   zoom the HUD display in / out
 *   scroll     {dir:+1|-1}   scroll the HUD content
 *   back                     back / dismiss on the HUD
 *   hello                    a screen just connected (handshake)
 */
(function () {
  const CH = new BroadcastChannel("meta-glasses-sync");
  window.Sync = {
    send(type, data) { CH.postMessage(Object.assign({ type }, data || {})); },
    on(handler) { CH.addEventListener("message", (e) => handler(e.data)); },
  };
})();
