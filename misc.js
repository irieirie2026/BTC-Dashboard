/** Misc — parking lot for work-in-progress dashboard ideas. */

const MISC_SLOTS = [
  { id: "berth-a", label: "Berth A", status: "open" },
  { id: "berth-b", label: "Berth B", status: "open" },
  { id: "berth-c", label: "Berth C", status: "open" },
  { id: "berth-d", label: "Berth D", status: "open" },
  { id: "berth-e", label: "Berth E", status: "open" },
  { id: "berth-f", label: "Berth F", status: "open" },
];

const MISC_PARKED = [];

function miscSlotMarkup(slot, parked) {
  if (!parked) {
    return `
      <article class="misc-slot misc-slot--open" data-slot="${slot.id}">
        <span class="misc-slot-tag">Open</span>
        <h3 class="misc-slot-title">${slot.label}</h3>
        <p class="misc-slot-copy">Drop the next experiment here while it’s still on the hardtop.</p>
        <span class="misc-slot-lines" aria-hidden="true"></span>
      </article>`;
  }

  const navAttr = parked.navL2 ? ` data-misc-nav="${parked.navL2}" role="button" tabindex="0"` : "";
  const navCls = parked.navL2 ? " misc-slot--link" : "";
  return `
    <article class="misc-slot misc-slot--occupied${navCls}" data-slot="${slot.id}"${navAttr}>
      <span class="misc-slot-tag">${parked.status || "WIP"}</span>
      <h3 class="misc-slot-title">${parked.title}</h3>
      <p class="misc-slot-copy">${parked.blurb || "Under construction."}</p>
      ${parked.note ? `<p class="misc-slot-note">${parked.note}</p>` : ""}
    </article>`;
}

function renderMiscParkingLot() {
  const grid = document.getElementById("misc-slot-grid");
  if (!grid) return;

  const parkedBySlot = Object.fromEntries(
    MISC_PARKED.filter((item) => item.slot).map((item) => [item.slot, item]),
  );

  grid.innerHTML = MISC_SLOTS.map((slot) =>
    miscSlotMarkup(slot, parkedBySlot[slot.id]),
  ).join("");

  grid.querySelectorAll("[data-misc-nav]").forEach((card) => {
    const go = () => window.MenuController?.setLevel2(card.dataset.miscNav);
    card.addEventListener("click", go);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        go();
      }
    });
  });

  const occupied = MISC_PARKED.length;
  const open = MISC_SLOTS.length - occupied;
  const counter = document.getElementById("misc-slot-counter");
  if (counter) {
    counter.textContent = `${occupied} parked · ${open} open berths`;
  }
}

function initMiscPage() {
  renderMiscParkingLot();
}

window.initMiscPage = initMiscPage;