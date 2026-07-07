/* Shared Gboard-style QWERTY layout + renderers, used by both the phone
 * (interactive) and the HUD (preview mirror). Same DOM shape so highlighting
 * and suggestions map 1:1. */
window.KB_ROWS = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["shift", "z", "x", "c", "v", "b", "n", "m", "back"],
  ["?123", ",", "space", ".", "return"],
];
const FN = ["shift", "back", "?123", "return"];

window.keyLabel = function (k) {
  const map = { shift: "⇧", back: "⌫", space: "", return: "↵", "?123": "?123" };
  if (k in map) return map[k];
  if (k.length === 1 && k >= "a" && k <= "z") return k.toUpperCase(); // Gboard shows caps
  return k;
};

window.renderKeyboard = function (el) {
  el.innerHTML = KB_ROWS.map((row) =>
    `<div class="kb-row">` + row.map((k) => {
      const cls = ["kb-key"];
      if (FN.includes(k)) cls.push("kb-key--fn");
      if (k === "space") cls.push("kb-key--space");
      if (k === "return") cls.push("kb-key--return");
      if (k === "?123") cls.push("kb-key--sym");
      if (k === "," || k === ".") cls.push("kb-key--punct");
      return `<div class="${cls.join(" ")}" data-key="${k}">${keyLabel(k)}</div>`;
    }).join("") + `</div>`
  ).join("");
};

// Gboard suggestion strip (first candidate is the bold/committed one)
window.renderSuggest = function (el, words) {
  el.innerHTML = (words || []).map((w, i) =>
    `<div class="sugg${i === 0 ? " strong" : ""}" data-idx="${i}">${w}</div>`
  ).join("");
};
