/**
 * The Law → Simulator (5-layer stack)
 * A origin · R personal relocate · B company · C MiCA · D banking
 * Graphical report aligned with The Law UI.
 */
/* global lawData, LAW_RELOCATE_BROWSER, LAW_RELOCATE_HUBS, lawEsc, lawEl, lawSetPanel,
   lawBreadcrumb, lawSetPath, lawLoad, lawAttachGlossary, lawStatusBadge */

const LAW_SIM_NONE = "__none__";
const LAW_SIM_SAME_ORIGIN = "__same_origin__";
const LAW_SIM_SAME_COMPANY = "__same_company__";
const LAW_SIM_DISCLAIMER =
  "This is a strategic simulation based on publicly available regulatory and market information as of August 2026. It is not legal, tax, immigration or banking advice. Outcomes depend on individual circumstances, regulator discretion and bank risk appetite. Always engage qualified local counsel, tax advisors, immigration specialists and compliance professionals before taking any action.";

const LAW_SIM_HIGH_RISK_ORIGIN = new Set(["cuba", "north-korea", "iran", "syria", "russia"]);
const LAW_SIM_MICA_STATES = new Set([
  "austria", "belgium", "bulgaria", "croatia", "cyprus", "czech-republic", "denmark", "estonia",
  "finland", "france", "germany", "greece", "hungary", "ireland", "italy", "latvia", "lithuania",
  "luxembourg", "malta", "netherlands", "poland", "portugal", "romania", "slovakia", "slovenia",
  "spain", "sweden", "european-union",
]);
const LAW_SIM_STRONG_BANKS = new Set([
  "switzerland", "singapore", "hong-kong", "united-kingdom", "luxembourg", "germany",
  "netherlands", "ireland", "united-arab-emirates", "united-states", "canada", "japan",
]);
const LAW_SIM_EASY_MOVE = new Set([
  "georgia", "paraguay", "el-salvador", "portugal", "spain", "united-arab-emirates",
  "thailand", "costa-rica", "panama", "uruguay", "malaysia",
]);

function lawSimJ(id) {
  if (!id || id === LAW_SIM_NONE || id === LAW_SIM_SAME_ORIGIN || id === LAW_SIM_SAME_COMPANY) return null;
  return (lawData?.jurisdictions || []).find((j) => j.id === id) || null;
}

function lawSimName(id) {
  if (!id || id === LAW_SIM_NONE) return "None – not applicable";
  if (id === LAW_SIM_SAME_ORIGIN) return "Same as origin (no move)";
  if (id === LAW_SIM_SAME_COMPANY) return "Same as company seat";
  const j = lawSimJ(id);
  if (j) return j.name;
  const b = (typeof LAW_RELOCATE_BROWSER !== "undefined" ? LAW_RELOCATE_BROWSER : []).find(
    (c) => c.id === id || c.lawId === id,
  );
  return b?.name || id;
}

function lawSimNameCompany(id) {
  if (!id || id === LAW_SIM_NONE) return "None – personal / online job only";
  return lawSimName(id);
}

function lawSimNameMica(id) {
  if (!id || id === LAW_SIM_NONE) return "None – no CASP / white-paper home";
  return lawSimName(id);
}

function lawSimHub(id) {
  if (!id || id === LAW_SIM_NONE) return null;
  const b = (typeof LAW_RELOCATE_BROWSER !== "undefined" ? LAW_RELOCATE_BROWSER : []).find(
    (c) => c.lawId === id || c.id === id,
  );
  return (typeof LAW_RELOCATE_HUBS !== "undefined" ? LAW_RELOCATE_HUBS[b?.id || id] : null) || null;
}

function lawSimIsMica(id) {
  return LAW_SIM_MICA_STATES.has(id) || lawSimJ(id)?.region === "eu-mica" || (lawSimJ(id)?.tags || []).includes("mica");
}

function lawSimIsHighRiskOrigin(id) {
  if (!id) return false;
  if (LAW_SIM_HIGH_RISK_ORIGIN.has(id)) return true;
  const j = lawSimJ(id);
  return j?.status === "banned";
}

function lawSimBankFriendliness(id) {
  if (!id || id === LAW_SIM_NONE) return 0.15;
  if (LAW_SIM_STRONG_BANKS.has(id)) return 0.72;
  const j = lawSimJ(id);
  if (!j) return 0.4;
  if (j.status === "banned") return 0.05;
  if (j.status === "restricted") return 0.28;
  if (j.status === "legal") return 0.48;
  return 0.35;
}

function lawSimScoreLabel(score) {
  if (score < 18) return "Impossible";
  if (score < 35) return "Extremely Difficult";
  if (score < 55) return "Challenging but Viable";
  if (score < 75) return "Viable";
  return "Optimal";
}

function lawSimScoreClass(score) {
  if (score < 18) return "impossible";
  if (score < 35) return "extreme";
  if (score < 55) return "challenging";
  if (score < 75) return "viable";
  return "optimal";
}

function lawSimSevClass(sev) {
  if (sev === "critical") return "crit";
  if (sev === "high") return "high";
  if (sev === "medium") return "med";
  return "low";
}

function lawSimResolveRelocate(relocateId, originId, companyId) {
  if (!relocateId || relocateId === LAW_SIM_SAME_ORIGIN) return originId;
  if (relocateId === LAW_SIM_SAME_COMPANY) {
    if (companyId && companyId !== LAW_SIM_NONE) return companyId;
    return originId;
  }
  return relocateId;
}

function lawSimCountrySelectOptions(includeNone, noneLabel) {
  const js = [...(lawData?.jurisdictions || [])].filter((j) => j.id !== "european-union");
  js.sort((a, b) => a.name.localeCompare(b.name));
  let html = includeNone
    ? `<option value="${LAW_SIM_NONE}">${lawEsc(noneLabel || "None – personal / online job only")}</option>`
    : `<option value="">Select…</option>`;
  for (const j of js) {
    const risk = lawSimIsHighRiskOrigin(j.id) ? " ⚠" : "";
    html += `<option value="${lawEsc(j.id)}">${lawEsc(j.name)}${risk}</option>`;
  }
  return html;
}

function lawSimRelocateSelectOptions() {
  const js = [...(lawData?.jurisdictions || [])].filter((j) => j.id !== "european-union");
  js.sort((a, b) => a.name.localeCompare(b.name));
  let html = `
    <option value="${LAW_SIM_SAME_ORIGIN}">Same as origin (no move)</option>
    <option value="${LAW_SIM_SAME_COMPANY}">Same as company seat</option>`;
  for (const j of js) {
    html += `<option value="${lawEsc(j.id)}">${lawEsc(j.name)}</option>`;
  }
  return html;
}

function lawSimMicaSelectOptions() {
  const js = [...(lawData?.jurisdictions || [])].filter(
    (j) =>
      lawSimIsMica(j.id) ||
      ["united-kingdom", "switzerland", "united-arab-emirates", "singapore", "united-states"].includes(j.id),
  );
  js.sort((a, b) => {
    const am = lawSimIsMica(a.id) ? 0 : 1;
    const bm = lawSimIsMica(b.id) ? 0 : 1;
    if (am !== bm) return am - bm;
    return a.name.localeCompare(b.name);
  });
  // Optional: pure personal migration / remote employment needs no CASP home
  let html = `<option value="${LAW_SIM_NONE}">None – no CASP / white-paper home (online job / personal only)</option>`;
  for (const j of js) {
    const tag = lawSimIsMica(j.id) ? " · MiCA NCA" : " · non-EU / special";
    html += `<option value="${lawEsc(j.id)}">${lawEsc(j.name)}${tag}</option>`;
  }
  return html;
}

/**
 * @returns {{ md: string, model: object }}
 */
function lawSimGenerate({ originId, relocateId, companyId, micaId, bankId }) {
  const personalOnly = !companyId || companyId === LAW_SIM_NONE;
  const noMica = !micaId || micaId === LAW_SIM_NONE;
  // Individual path: no company, and typically no CASP home (online job / remote employee / pure personal move)
  const individualPath = personalOnly;
  const A = originId;
  const B = personalOnly ? LAW_SIM_NONE : companyId;
  const C = noMica ? LAW_SIM_NONE : micaId;
  const D = bankId;
  const R = lawSimResolveRelocate(relocateId, A, B);
  const moving = R && A && R !== A;

  const nA = lawSimName(A);
  const nR = lawSimName(R);
  const nB = lawSimNameCompany(B);
  const nC = lawSimNameMica(C);
  const nD = lawSimName(D);

  const jA = lawSimJ(A);
  const jR = lawSimJ(R);
  const jB = lawSimJ(B);
  const jC = lawSimJ(C);
  const jD = lawSimJ(D);
  const hB = lawSimHub(B);

  const highRiskOrigin = lawSimIsHighRiskOrigin(A);
  const highRiskResident = lawSimIsHighRiskOrigin(R);
  const cuba = A === "cuba" || R === "cuba";
  const micaOk = !noMica && lawSimIsMica(C);
  const bankScore = lawSimBankFriendliness(D);

  // Effective risk for banks: nationality (A) still bites even after move; residency (R) helps SOF
  const originBankPenalty = highRiskOrigin ? 0.5 : jA?.status === "restricted" ? 0.2 : 0.06;
  const residentBoost = moving && !highRiskResident && LAW_SIM_STRONG_BANKS.has(R) ? 0.12 : moving && !highRiskResident ? 0.08 : 0;
  const residentPenalty = highRiskResident ? 0.35 : 0;
  const splitPenalty = !personalOnly && B && D && B !== D ? 0.1 : 0;
  const micaSplitPenalty = !personalOnly && !noMica && B && C && B !== C && micaOk ? 0.1 : 0;
  const lifeVsCoPenalty = !personalOnly && R && B && R !== B ? 0.08 : 0;
  // Only penalise non-MiCA C when a company/product path actually selected C
  const nonMicaForEu = !personalOnly && !noMica && C && !micaOk ? 0.18 : 0;
  // Company without MiCA home when building regulated EU product is incomplete
  const coWithoutMica = !personalOnly && noMica ? 0.12 : 0;

  let score = 78;
  // Pure individual migration + online job is simpler than CASP — do not punish like a failed licence stack
  if (individualPath && noMica) score += 6;
  else if (personalOnly) score -= 4;
  if (highRiskOrigin) score -= 38;
  if (highRiskResident) score -= 20;
  if (cuba) score -= 10;
  if (moving && !highRiskOrigin) score += 4;
  if (moving && highRiskOrigin && !highRiskResident) score += 14;
  if (!moving && highRiskOrigin) score -= 8;
  if (jA?.status === "banned") score -= 20;
  if (!micaOk && !noMica && C) score -= 14;
  if (jD?.status === "banned" || jD?.status === "restricted") score -= 12;
  score -= Math.round(originBankPenalty * 35);
  score -= Math.round(residentPenalty * 40);
  score += Math.round(residentBoost * 40);
  score -= Math.round(splitPenalty * 40);
  score -= Math.round(micaSplitPenalty * 30);
  score -= Math.round(lifeVsCoPenalty * 30);
  score -= Math.round(nonMicaForEu * 40);
  score -= Math.round(coWithoutMica * 40);
  if (LAW_SIM_EASY_MOVE.has(R) && moving) score += 5;
  if (LAW_SIM_STRONG_BANKS.has(D) && !highRiskOrigin && !highRiskResident) score += 8;
  if (!personalOnly && B === C && micaOk) score += 10;
  if (!personalOnly && R === B) score += 5;
  if (!personalOnly && !noMica && D === C && micaOk) score += 5;
  // Personal banking odds better than corporate crypto banking
  if (individualPath && !highRiskOrigin && !highRiskResident) score += 4;
  score = Math.max(5, Math.min(96, score));

  const rating = lawSimScoreLabel(score);
  const bankProb = Math.max(
    0.03,
    Math.min(
      0.92,
      bankScore *
        (1 - originBankPenalty) *
        (1 - residentPenalty) *
        (1 + residentBoost) *
        (individualPath ? 0.92 : 0.95),
    ),
  );

  let bottleneck =
    "Coordinating personal tax residence, company substance, MiCA home, and banking SOF/SOW in one story.";
  if (individualPath && noMica) {
    bottleneck = moving
      ? `Personal relocation ${nA} → ${nR} with online/remote work: immigration + tax residence + personal banking are the whole stack (no CASP).`
      : `Personal tax base stays in ${nA}; banking and day-count discipline are the main frictions (no company / no MiCA home).`;
  } else if (highRiskOrigin && (!moving || highRiskResident)) {
    bottleneck = `Founder origin (${nA}) still drives banking friction — a real move of tax residence to a bankable country is usually required first.`;
  } else if (moving && highRiskOrigin && !highRiskResident) {
    bottleneck = `Sequencing: exit ${nA} cleanly into ${nR}, then personal banking${personalOnly ? "" : " and licence"} — the move is the critical path.`;
  } else if (!personalOnly && noMica) {
    bottleneck = `Company in ${nB} without a regulatory home (C): fine for pure software/consulting; a company is required (and C becomes mandatory) if you later offer regulated crypto services to EU retail.`;
  } else if (!micaOk && !noMica && C) {
    bottleneck = `${nC} is not a MiCA NCA path for EU retail CASP passporting.`;
  } else if (personalOnly && !noMica) {
    bottleneck = "CASP/regulatory home selected without a company — a legal entity is usually required for full MiCA authorisation; flag as upgrade path.";
  } else if (R && B && R !== B && !personalOnly) {
    bottleneck = `Life base (${nR}) ≠ company seat (${nB}) — PE / mind-and-management / dual-counsel overhead.`;
  } else if (!personalOnly && B !== C && micaOk) {
    bottleneck = `Company seat (${nB}) ≠ MiCA home (${nC}) — dual substance expected.`;
  } else if (bankProb < 0.25) {
    bottleneck = `Banking in ${nD} is unlikely for this founder profile without a cleaner residence/nationality story.`;
  }

  const faults = [];
  /** When true, later report flags that a company (+ optional C) is required for regulated product */
  let companyRequiredLater = false;

  if (highRiskOrigin) {
    faults.push({
      sev: "critical",
      text: `Nationality/origin profile from ${nA} triggers enhanced due diligence and frequent bank refusal${personalOnly ? "" : " / CASP friction"} even after paperwork elsewhere.`,
    });
  }
  if (cuba) {
    faults.push({
      sev: "critical",
      text: "Cuban nationality/residence: most institutional bank stacks (and any future EU CASP) are near-impossible until a lawful bankable personal residence exists and SOF is rebuildable.",
    });
  }
  if (!moving && highRiskOrigin) {
    faults.push({
      sev: "critical",
      text: `No personal relocation selected — founder remains tax-resident/linked to high-risk origin ${nA}. Change layer R (relocate) before banking or any licence spend.`,
    });
  }
  if (moving && R && B && R !== B && !personalOnly) {
    faults.push({
      sev: "medium",
      text: `Personal residence ${nR} differs from company seat ${nB}: PE risk if you manage the co from ${nR}; dual immigration/tax calendars.`,
    });
  }
  if (individualPath && noMica) {
    // Not a fault — intentional online-job / personal path. Note limits only.
    companyRequiredLater = true; // if they later want regulated crypto services
    faults.push({
      sev: "medium",
      text: "Individual / online-job path: no OpCo and no MiCA home. Fine for remote employment, consulting invoices (where immigration allows), and personal BTC holding. A company (+ layer C) is required later if you offer regulated crypto services, custody, exchange, or EU retail token platforms.",
    });
  } else if (personalOnly && !noMica) {
    companyRequiredLater = true;
    faults.push({
      sev: "high",
      text: `Regulatory home ${nC} was selected without a company (B). Full MiCA CASP authorisation almost always needs a legal entity — add B or set C to None for pure personal migration.`,
    });
  } else if (!personalOnly && noMica) {
    companyRequiredLater = false;
    faults.push({
      sev: "medium",
      text: `Company in ${nB} without MiCA/regulatory home (C): coherent for software, SaaS, or non-regulated consulting. Flag: add layer C (EU NCA) before marketing regulated crypto services to EU retail.`,
    });
  }
  if (!personalOnly && !noMica && B && C && B !== C && micaOk) {
    faults.push({
      sev: "high",
      text: `OpCo in ${nB} vs MiCA home ${nC}: supervisors expect local mind-and-management in the authorisation state.`,
    });
  }
  if (!noMica && C && !micaOk) {
    faults.push({
      sev: "high",
      text: `${nC} is not framed as EU MiCA NCA for CASP passporting — use an EU partner or move regulatory home.`,
    });
  }
  if (jD?.status === "restricted" || jD?.status === "banned") {
    faults.push({
      sev: "high",
      text: `Banking jurisdiction ${nD} has weak crypto posture in the dataset — harder for crypto-linked personal SOF too.`,
    });
  }

  const alternatives = [];
  if (individualPath && noMica && !highRiskOrigin && score >= 55) {
    // Optional upgrade path only — not because setup is broken
    alternatives.push({
      title: "Stay individual now · add EU OpCo + MiCA later if product needs it",
      whyBad: "Current path is fine for online job / personal migration — not flawed.",
      whyBetter:
        "Only if you later need custody, exchange, brokerage, or EU retail token services: incorporate in one MiCA state (e.g. IE/NL/DE), set C to that state, align R when substance requires presence.",
      score: Math.min(88, score + 5),
      timeline: "Defer 12–24 months until product/capital ready",
      costDelta: "€0 now; later €45k–€220k+ for corp+CASP",
      companyRequired: true,
      setup: { origin: A, relocate: R, company: "ireland", mica: "ireland", bank: D || "ireland" },
    });
  }
  if (highRiskOrigin || cuba || score < 55 || faults.some((f) => f.sev === "critical")) {
    alternatives.push({
      title: "Relocate person first → personal banking (no company yet)",
      whyBad: "Banking/licence work on a high-risk origin profile usually fails at UBO/EDD.",
      whyBetter: "Personal tax residence in a bankable state first; keep B and C as None until you truly need a regulated product.",
      score: highRiskOrigin ? 58 : 68,
      timeline: "6–14 months personal",
      costDelta: "Move cost only; no wasted licence fees",
      companyRequired: false,
      setup: { origin: A, relocate: "portugal", company: LAW_SIM_NONE, mica: LAW_SIM_NONE, bank: "portugal" },
    });
    alternatives.push({
      title: "Relocate person → then EU OpCo + MiCA (only if building regulated product)",
      whyBad: "Jumping to CASP from high-risk origin wastes capital.",
      whyBetter: "After bankable residence, align company + MiCA + bank in one EU state.",
      score: highRiskOrigin ? 60 : 72,
      timeline: "12–24 months",
      costDelta: "Higher once company starts",
      companyRequired: true,
      setup: { origin: A, relocate: "ireland", company: "ireland", mica: "ireland", bank: "ireland" },
    });
    alternatives.push({
      title: "Lean personal move (Georgia) · online job · no CASP",
      whyBad: "Regulated crypto business without a clean personal base fails at banking first.",
      whyBetter: "Cheapest personal tax-residence narrative for remote work; company only if needed later.",
      score: highRiskOrigin ? 52 : 66,
      timeline: "6–12 months personal",
      costDelta: "Lowest burn",
      companyRequired: false,
      setup: { origin: A, relocate: "georgia", company: LAW_SIM_NONE, mica: LAW_SIM_NONE, bank: "georgia" },
    });
  } else if (!personalOnly && !noMica && B !== C && micaOk) {
    alternatives.push({
      title: `Align life + co + MiCA in ${nC}`,
      whyBad: "Split layers multiply substance and travel cost.",
      whyBetter: "Single-state mind-and-management story.",
      score: Math.min(92, score + 12),
      timeline: "Saves 3–9 months",
      costDelta: "Lower dual-office burn",
      companyRequired: true,
      setup: { origin: A, relocate: C, company: C, mica: C, bank: D === B ? C : D },
    });
  } else if (!personalOnly && R !== B) {
    alternatives.push({
      title: `Live where the company sits (${nB})`,
      whyBad: `Remote management from ${nR} risks PE and weak substance${noMica ? "" : ` for ${nC}`}.`,
      whyBetter: "Cleaner tax and supervisory narrative.",
      score: Math.min(90, score + 8),
      timeline: "Immigration lag 3–12 months",
      costDelta: "CoL change vs PE risk reduction",
      companyRequired: true,
      setup: { origin: A, relocate: B, company: B, mica: noMica ? LAW_SIM_NONE : C, bank: D },
    });
  } else if (!personalOnly && noMica) {
    alternatives.push({
      title: "Add MiCA home only if EU regulated crypto services are planned",
      whyBad: "Not a fault if the company is pure software/consulting.",
      whyBetter: "Set C to an EU NCA (and capital/substance) before any custody/exchange/token retail offer.",
      score: Math.min(88, score + 6),
      timeline: "9–18 months if activated",
      costDelta: "CASP capital when you need it",
      companyRequired: true,
      setup: { origin: A, relocate: R, company: B, mica: "netherlands", bank: D },
    });
  }

  const costsPersonal = { oneTime: "€8k–€45k", ongoing: "€3k–€18k / yr", note: "Visa, tax memos, move, personal EDD" };
  const costsCorp = {
    oneTime: highRiskOrigin ? "€80k–€350k+" : "€45k–€220k",
    ongoing: highRiskOrigin ? "€40k–€180k / yr" : "€25k–€120k / yr",
    note: "Incorporate, CASP capital, substance, AML, dual counsel",
  };

  const phases = [];
  if (highRiskOrigin && (!moving || highRiskResident)) {
    phases.push({
      t: "Before month 0",
      d: individualPath
        ? `Design lawful personal exit from high-risk origin (${nA}) before relying on banks in ${nD}.`
        : `Do not burn CASP capital yet — design lawful personal exit from high-risk origin profile (${nA}).`,
    });
  }
  if (moving) {
    phases.push({ t: "0–3 mo", d: `Tax exit model ${nA} → entry model ${nR}; SOF vault; immigration file; remote-job contract review (right to work).` });
    phases.push({ t: "3–6 mo", d: `Residence permit path in ${nR}; personal banking in ${nD}; day-count discipline.` });
    phases.push({
      t: "6–12 mo",
      d: individualPath
        ? `Tax residency docs in ${nR}; personal bank live; keep activity as employee/contractor only — no unlicensed CASP claims.`
        : `Tax residency in ${nR}; personal bank live; then accelerate company/${noMica ? "product" : "CASP"}.`,
    });
  } else {
    phases.push({ t: "0–3 mo", d: `Residency confirmation in ${nA}; personal tax hygiene; bank pre-clear in ${nD}.` });
    phases.push({
      t: "3–6 mo",
      d: individualPath
        ? `Deepen personal rails; remote work compliance; avoid holding out as a regulated crypto platform.`
        : `Incorporate ${nB}; substance plan${noMica ? " (no CASP yet)" : ` for ${nC}`}.`,
    });
  }
  if (individualPath) {
    phases.push({ t: "12–18 mo", d: `Stable personal base + online income; reassess only if product requires a licensed entity.` });
    phases.push({
      t: "18+ mo",
      d: companyRequiredLater
        ? `If building regulated crypto services: then add company (B) + MiCA home (C) — not before.`
        : `Maintain personal compliance; optional OpCo only with clear need.`,
    });
  } else if (!noMica) {
    phases.push({ t: "6–12 mo", d: `CASP application path in ${nC}; corporate banking; policies & capital.` });
    phases.push({ t: "12–18 mo", d: `Authorisation trajectory; controlled EU marketing; audits.` });
    phases.push({ t: "18+ mo", d: `Passporting / scale; continuous compliance.` });
  } else {
    phases.push({ t: "6–12 mo", d: `Operate company in ${nB} as non-CASP (software/consulting); document perimeter.` });
    phases.push({ t: "12–18 mo", d: `If EU regulated crypto services appear: open layer C and capital plan.` });
    phases.push({ t: "18+ mo", d: `Optional CASP build or stay non-regulated product.` });
  }

  const steps = [];
  let n = 1;
  const add = (s) => steps.push({ n: n++, t: s });
  if (highRiskOrigin && !moving) {
    add(`Set layer R (personal relocate) to a bankable country — staying only in ${nA} blocks most personal banking.`);
  }
  if (moving) {
    add(`Commission exit tax memo (${nA}) + arrival tax memo (${nR}); freeze large disposals until sequenced.`);
    add(`File immigration/residence for ${nR}; confirm remote-work is allowed on that visa; never treat tourist status as tax residence.`);
  } else {
    add(`Confirm you remain tax-resident in ${nA} on purpose; document days and centre of interests.`);
  }
  add(`Build SOF/SOW vault (exchange CSV, wallets, tax returns, employment contract) before bank applications in ${nD}.`);
  if (individualPath) {
    add(`Open personal/EMI rails in ${nD} as a private individual / remote worker — not as an unlicensed exchange.`);
    add(`Keep activity inside employment/consulting boundaries; if you later offer custody, brokerage, or EU retail tokens, you will need a company (B) and usually a MiCA home (C).`);
    add(`Personal token experiments: MiCA Title II can still bind an identifiable offeror marketing to EU retail — even without a CASP entity.`);
  } else if (noMica) {
    add(`Incorporate OpCo in ${nB}; define a written perimeter: software/consulting only until C is set.`);
    add(`Corporate bank in ${nD}; do not market regulated crypto services without a CASP path.`);
  } else {
    add(`Lock MiCA activity list; incorporate OpCo in ${nB}; align substance with ${nC}.`);
    add(`CASP / white-paper workstream in ${nC}; parallel corporate bank process in ${nD}.`);
    add(`Geo-fence marketing; document reverse solicitation if claimed (high residual risk).`);
  }
  add(`Monitor days, CRS self-certs, sanctions lists, bank policy${individualPath ? ", visa conditions" : ", MiCA Level-2 updates"}.`);

  const bankNames = [];
  if (highRiskOrigin && !moving) bankNames.push("Most Tier-1 banks: expect refusal until personal residence risk drops");
  if (D === "switzerland") bankNames.push("Select Swiss private / crypto banks", "International PB — invitation only");
  else if (D === "singapore") bankNames.push("Local banks for clean cos", "Licensed DPT ramps");
  else if (D === "united-arab-emirates") bankNames.push("Free-zone banks post-substance", "International banks with DIFC/ADGM presence");
  else if (lawSimIsMica(D)) bankNames.push("Domestic universal banks (low crypto appetite)", "EU EMIs for float", "Specialist CASP-friendly banks if any");
  else bankNames.push("Local universal banks (EDD)", "Regional EMI", "Licensed exchange fiat ramps");

  const taxPersonal = moving
    ? `Exit ${nA} (${jA?.taxHeadline || "worldwide/territorial — confirm"}) → enter ${nR} (${jR?.taxHeadline || "confirm arrival rules"}). Remote salary/contractor income is usually taxed in the new residence once you are resident. Day-one residency can also tax future BTC disposals.`
    : `Remain in ${nA}: ${jA?.taxHeadline || "confirm local rules"}. ${jA?.taxNote || ""} Online-job income is generally taxed there if you stay resident.`;
  const taxCorp = personalOnly
    ? "No OpCo — corporate tax N/A. You are taxed as an individual (employment / self-employment). A company is only needed later if you incorporate a product business or seek a CASP."
    : `OpCo ${nB}: CIT + PE if managed from ${nR}. CFC may apply while still tied to ${nA}.`;

  const risks = [
    { layer: "Origin", name: nA, risk: highRiskOrigin ? "Bank refusal cascade" : "Standard EDD", sev: highRiskOrigin ? "critical" : "medium" },
    { layer: "Relocate", name: nR, risk: moving ? (highRiskResident ? "Target still high-risk" : "Immigration + tax timing") : "No move — origin risk stays", sev: !moving && highRiskOrigin ? "critical" : highRiskResident ? "high" : "medium" },
    {
      layer: "Company",
      name: nB,
      risk: personalOnly ? "None — individual path" : "Substance / PE / CFC",
      sev: personalOnly ? "low" : !noMica && B !== C ? "high" : "medium",
    },
    {
      layer: "MiCA",
      name: nC,
      risk: noMica
        ? individualPath
          ? "Not selected — OK for online job"
          : "Not selected — add before regulated services"
        : micaOk
          ? "Authorisation capital & time"
          : "No EU passport path",
      sev: noMica ? (individualPath ? "low" : "medium") : micaOk ? "medium" : "high",
    },
    { layer: "Banking", name: nD, risk: individualPath ? "Personal account EDD" : "Corporate onboarding refusal", sev: bankProb < 0.25 ? "critical" : bankProb < 0.5 ? "high" : "medium" },
  ];

  const model = {
    score,
    rating,
    scoreClass: lawSimScoreClass(score),
    bottleneck,
    personalOnly,
    individualPath,
    noMica,
    companyRequiredLater: Boolean(companyRequiredLater),
    moving,
    highRiskOrigin,
    cuba,
    layers: [
      { key: "A", label: "Origin", id: A, name: nA, hint: "Nationality / current tax base" },
      { key: "R", label: "Relocate", id: R, name: nR, hint: moving ? "New personal tax residence" : "No move" },
      { key: "B", label: "Company", id: B, name: nB, hint: personalOnly ? "None · individual" : "OpCo seat" },
      {
        key: "C",
        label: "MiCA / reg",
        id: C,
        name: nC,
        hint: noMica ? "None · no CASP" : micaOk ? "EU NCA path" : "Non-MiCA",
      },
      { key: "D", label: "Banking", id: D, name: nD, hint: `${Math.round(bankProb * 100)}% bank odds` },
    ],
    faults,
    alternatives,
    phases,
    steps,
    bankProb,
    bankNames,
    costsPersonal,
    costsCorp,
    taxPersonal,
    taxCorp,
    risks,
    jA,
    jR,
    originNote: jA?.summary || "",
    relocateNote: jR?.summary || "",
    companyNote: hB?.company || jB?.summary || "",
  };

  // Markdown for copy
  let md = `#### 1. Executive Feasibility Score\n\n`;
  md += `- **Rating:** ${rating} (~${score}/100)\n- **Bottleneck:** ${bottleneck}\n`;
  md += `- **Type:** ${individualPath && noMica ? "Individual · personal migration / online job" : personalOnly ? "Personal migration (CASP home selected without company)" : "Corporate + regulatory"}${moving ? " · relocating person" : " · no personal move"}\n`;
  md += `- **Layers:** A ${nA} · R ${nR} · B ${nB} · C ${nC} · D ${nD}\n`;
  if (companyRequiredLater) md += `- **Flag:** A company (and usually a MiCA home) is required later if you offer regulated crypto services.\n`;
  md += `\n`;
  md += `#### 2. Founder origin\n\n${model.originNote}\n\nHigh-risk origin: ${highRiskOrigin ? "YES" : "no"}. Moving to ${nR}: ${moving ? "YES" : "no"}.\n\n`;
  md += `#### 3. Setup type\n\n${personalOnly ? "Personal only — no CASP as individual." : `Corporate OpCo ${nB}, MiCA ${nC}, bank ${nD}, life ${nR}.`}\n\n`;
  md += `#### 4. Roadmap\n\n${steps.map((s) => `${s.n}. ${s.t}`).join("\n")}\n\n`;
  md += `#### 5. Timeline\n\n${phases.map((p) => `- **${p.t}:** ${p.d}`).join("\n")}\n\n`;
  md += `#### 6. Costs\n\nPersonal ${costsPersonal.oneTime} / ${costsPersonal.ongoing}. Corp ${costsCorp.oneTime} / ${costsCorp.ongoing}.\n\n`;
  md += `#### 7. Tax\n\n${taxPersonal}\n\n${taxCorp}\n\n`;
  md += `#### 8. Conflicts\n\n${faults.map((f) => `- [${f.sev}] ${f.text}`).join("\n")}\n\n`;
  md += `#### 9. Alternatives\n\n`;
  if (!alternatives.length) md += `No material faults — setup coherent.\n\n`;
  else {
    alternatives.forEach((a, i) => {
      md += `**Alt ${i + 1}: ${a.title}** — ${a.whyBetter} Score ${lawSimScoreLabel(a.score)}. ${a.timeline}.\n`;
        if (a.setup) {
          md += `Layers: A ${lawSimName(a.setup.origin)} · R ${lawSimName(a.setup.relocate)} · B ${lawSimNameCompany(a.setup.company)} · C ${lawSimNameMica(a.setup.mica)} · D ${lawSimName(a.setup.bank)}\n`;
          if (a.companyRequired) md += `Requires company: YES\n`;
          md += `\n`;
        }
    });
  }
  md += `#### 10. Banking\n\n~${Math.round(bankProb * 100)}% · ${bankNames.join("; ")}\n\n`;
  md += `#### 11. Residual risks\n\nSupervisory rejection; bank de-risking; marketing perimeter; tax residence challenge; sanctions freezes.\n\n`;
  md += `#### 12. This week\n\n1. Perimeter one-pager 2. SOF vault 3. Tax counsel ${nA}/${nR} 4. ${moving || highRiskOrigin ? "Immigration" : "Bank pre-clear"} 5. Freeze token marketing\n\n`;
  md += `#### 13. Chart\n\nA ${nA} → R ${nR} → B ${nB} → C ${nC} → D ${nD}\n\n---\n\n*${LAW_SIM_DISCLAIMER}*\n`;

  return { md, model };
}

function lawSimRenderHtml(model) {
  const m = model;
  const ring = Math.round((m.score / 100) * 100);
  const layerCards = m.layers
    .map(
      (L) => `<div class="law-sim-layer-card" data-layer="${lawEsc(L.key)}">
      <span class="law-sim-layer-card__key">${lawEsc(L.key)}</span>
      <span class="law-sim-layer-card__label">${lawEsc(L.label)}</span>
      <span class="law-sim-layer-card__name">${lawEsc(L.name)}</span>
      <span class="law-sim-layer-card__hint">${lawEsc(L.hint)}</span>
    </div>`,
    )
    .join("");

  const flow = m.layers
    .map(
      (L, i) =>
        `${i ? '<span class="law-sim-flow__arrow" aria-hidden="true">→</span>' : ""}<span class="law-sim-flow__node"><b>${lawEsc(L.key)}</b> ${lawEsc(L.name)}</span>`,
    )
    .join("");

  const faultCards = m.faults.length
    ? m.faults
        .map(
          (f) => `<div class="law-sim-fault law-sim-fault--${lawSimSevClass(f.sev)}">
      <span class="law-sim-fault__sev">${lawEsc(f.sev)}</span>
      <p>${lawEsc(f.text)}</p>
    </div>`,
        )
        .join("")
    : `<div class="law-sim-ok">No material structural faults detected — setup is coherent.</div>`;

  const altCards = m.alternatives.length
    ? m.alternatives
        .slice(0, 3)
        .map((a, i) => {
          const setup = a.setup
            ? `<div class="law-sim-mini-layers">
            <span>A ${lawEsc(lawSimName(a.setup.origin))}</span>
            <span>R ${lawEsc(lawSimName(a.setup.relocate))}</span>
            <span>B ${lawEsc(lawSimName(a.setup.company))}</span>
            <span>C ${lawEsc(lawSimName(a.setup.mica))}</span>
            <span>D ${lawEsc(lawSimName(a.setup.bank))}</span>
          </div>`
            : "";
          return `<article class="law-sim-alt">
        <header><span class="law-sim-alt__n">Alt ${i + 1}</span><h4>${lawEsc(a.title)}</h4>
        <span class="law-sim-badge law-sim-badge--${lawSimScoreClass(a.score)}">${lawEsc(lawSimScoreLabel(a.score))}</span></header>
        ${a.companyRequired ? `<p class="law-sim-flag law-sim-flag--warn">Requires a company (B) — and usually a MiCA home (C)</p>` : `<p class="law-sim-flag">Stays individual / no CASP required</p>`}
        <p><strong>Why original is weak or incomplete:</strong> ${lawEsc(a.whyBad)}</p>
        <p><strong>Why better:</strong> ${lawEsc(a.whyBetter)}</p>
        <p class="law-sim-alt__meta">${lawEsc(a.timeline)} · ${lawEsc(a.costDelta)}</p>
        ${setup}
      </article>`;
        })
        .join("")
    : "";

  const phaseHtml = m.phases
    .map(
      (p, i) => `<div class="law-sim-phase">
      <div class="law-sim-phase__dot">${i + 1}</div>
      <div class="law-sim-phase__body"><h4>${lawEsc(p.t)}</h4><p>${lawEsc(p.d)}</p></div>
    </div>`,
    )
    .join("");

  const stepHtml = m.steps.map((s) => `<li><span class="law-sim-step-n">${s.n}</span>${lawEsc(s.t)}</li>`).join("");

  const riskHtml = m.risks
    .map(
      (r) => `<div class="law-sim-risk law-sim-risk--${lawSimSevClass(r.sev)}">
      <span class="law-sim-risk__layer">${lawEsc(r.layer)}</span>
      <span class="law-sim-risk__name">${lawEsc(r.name)}</span>
      <span class="law-sim-risk__text">${lawEsc(r.risk)}</span>
      <span class="law-sim-risk__sev">${lawEsc(r.sev)}</span>
    </div>`,
    )
    .join("");

  const bankBar = Math.round(m.bankProb * 100);

  return `
  <div class="law-sim-report">
    <section class="law-sim-hero law-sim-hero--${lawEsc(m.scoreClass)}">
      <div class="law-sim-score" style="--p:${ring}">
        <div class="law-sim-score__ring">
          <span class="law-sim-score__num">${m.score}</span>
          <span class="law-sim-score__den">/100</span>
        </div>
        <div class="law-sim-score__meta">
          <span class="law-sim-badge law-sim-badge--${lawEsc(m.scoreClass)}">${lawEsc(m.rating)}</span>
          <span class="law-sim-hero__type">${
            m.individualPath && m.noMica
              ? "Individual · online job / personal only"
              : m.personalOnly
                ? "Personal migration"
                : "Corporate + licence"
          }${m.moving ? " · relocating" : ""}</span>
        </div>
      </div>
      <div class="law-sim-hero__copy">
        <h3>1 · Executive feasibility</h3>
        <p class="law-sim-bottleneck"><strong>Biggest bottleneck</strong> — ${lawEsc(m.bottleneck)}</p>
        ${
          m.individualPath && m.noMica
            ? `<p class="law-sim-flag">Individual path — no company, no CASP home. Report focuses on tax residence, visas, remote work, and personal banking.</p>`
            : m.personalOnly
              ? `<p class="law-sim-flag">No company selected — full CASP as an individual is generally not available.</p>`
              : ""
        }
        ${m.companyRequiredLater ? `<p class="law-sim-flag law-sim-flag--warn"><strong>Company required later</strong> if you offer regulated crypto services (custody, exchange, brokerage, EU retail tokens). Alternatives below show when to add B + C.</p>` : ""}
        ${m.highRiskOrigin ? `<p class="law-sim-flag law-sim-flag--warn">High-risk founder origin — banks cascade from this first.</p>` : ""}
      </div>
    </section>

    <section class="law-sim-section">
      <h3>Stack · five layers</h3>
      <div class="law-sim-layers">${layerCards}</div>
      <div class="law-sim-flow" aria-label="Layer flow">${flow}</div>
    </section>

    <section class="law-sim-section law-sim-section--split">
      <div class="law-sim-card">
        <h3>2 · Origin impact</h3>
        <p>${lawEsc(m.originNote || "Confirm origin jurisdiction facts with counsel.")}</p>
        <p>${m.highRiskOrigin ? "Expect systematic banking refusal, UBO cascade, visa friction, and CASP fit-and-proper stress until personal residence risk is reduced." : "Origin risk is manageable but non-zero: prepare SOF packs and clean tax filings."}</p>
        ${m.cuba ? `<p class="law-sim-flag law-sim-flag--warn"><strong>Cuba:</strong> Most EU company + MiCA + Tier-1 bank fantasies fail until a lawful bankable residence exists. Sequence: personal move → banking → only then OpCo/licence.</p>` : ""}
      </div>
      <div class="law-sim-card">
        <h3>3 · Setup type</h3>
        ${
          m.individualPath && m.noMica
            ? `<p><strong>Individual · personal migration / online job.</strong> No OpCo, no MiCA home. This path is about where you live and bank as a person while earning remotely.</p>
               <p><strong>Still possible:</strong> change tax residence, personal/EMI banking, hold BTC, remote employment or consulting (if the visa allows), simple personal tax compliance.</p>
               <p><strong>Not available as a pure individual:</strong> full MiCA CASP, passporting regulated services, most institutional crypto banking for “exchange/broker” activity.</p>
               <p>Life base: <strong>${lawEsc(m.layers[1].name)}</strong>${m.moving ? ` (from ${lawEsc(m.layers[0].name)})` : " (no move)"} · Banks: <strong>${lawEsc(m.layers[4].name)}</strong>.</p>
               ${m.companyRequiredLater ? `<p class="law-sim-flag law-sim-flag--warn">If your product later needs custody, exchange, brokerage, or EU retail token offers — <strong>you will need a company (B)</strong> and usually a MiCA home (C). See alternatives.</p>` : ""}`
            : m.personalOnly
              ? `<p><strong>Personal path with a regulatory home selected.</strong> Without a company, CASP authorisation is usually blocked — either add B or set C to None for a pure online-job move.</p>
                 <p>Life: <strong>${lawEsc(m.layers[1].name)}</strong> · C: <strong>${lawEsc(m.layers[3].name)}</strong> · Bank: <strong>${lawEsc(m.layers[4].name)}</strong>.</p>`
              : `<p><strong>Corporate path.</strong> Life in <strong>${lawEsc(m.layers[1].name)}</strong>, OpCo in <strong>${lawEsc(m.layers[2].name)}</strong>, MiCA home <strong>${lawEsc(m.layers[3].name)}</strong>, banks in <strong>${lawEsc(m.layers[4].name)}</strong>.</p>
               <p class="law-muted">${lawEsc(m.companyNote || "")}</p>
               <p>${m.moving ? `Relocating person from origin to ${lawEsc(m.layers[1].name)} is part of the plan — immigration and tax exit/entry must complete before hard banking.` : `Founder stays linked to origin residence — ensure that is intentional.`}</p>
               ${m.noMica ? `<p class="law-sim-flag">No MiCA home: fine for non-regulated software/consulting co. Add C before EU regulated crypto services.</p>` : ""}`
        }
      </div>
    </section>

    <section class="law-sim-section">
      <h3>4 · Step-by-step roadmap</h3>
      <ol class="law-sim-steps">${stepHtml}</ol>
    </section>

    <section class="law-sim-section">
      <h3>5 · Timeline</h3>
      <div class="law-sim-timeline">${phaseHtml}</div>
    </section>

    <section class="law-sim-section law-sim-section--split">
      <div class="law-sim-card">
        <h3>6 · Estimated costs (EUR)</h3>
        <div class="law-sim-cost-grid">
          <div><span class="law-sim-cost-label">Personal move</span><strong>${lawEsc(m.costsPersonal.oneTime)}</strong><span>${lawEsc(m.costsPersonal.ongoing)}</span><em>${lawEsc(m.costsPersonal.note)}</em></div>
          <div><span class="law-sim-cost-label">Corp + CASP path</span><strong>${lawEsc(m.costsCorp.oneTime)}</strong><span>${lawEsc(m.costsCorp.ongoing)}</span><em>${lawEsc(m.costsCorp.note)}</em></div>
        </div>
      </div>
      <div class="law-sim-card">
        <h3>7 · Tax &amp; cash-flow</h3>
        <p><strong>Personal:</strong> ${lawEsc(m.taxPersonal)}</p>
        <p><strong>Corporate:</strong> ${lawEsc(m.taxCorp)}</p>
        <p class="law-muted">Expect 6–18 months negative cash flow on CASP-class builds. Sequence Italy/EU exit-year crypto disposals with day-one residency in the relocate state.</p>
      </div>
    </section>

    <section class="law-sim-section">
      <h3>8 · Conflicts &amp; friction</h3>
      <div class="law-sim-faults">${faultCards}</div>
    </section>

    <section class="law-sim-section">
      <h3>9 · Fault engine &amp; alternatives</h3>
      ${
        m.alternatives.length
          ? `<p class="law-sim-flag law-sim-flag--warn">⚠ Faults detected — recommended alternatives</p><div class="law-sim-alts">${altCards}</div>`
          : `<div class="law-sim-ok">No material faults detected — setup is coherent. Optional: document mind-and-management and geo-fenced marketing quarterly.</div>`
      }
    </section>

    <section class="law-sim-section law-sim-section--split">
      <div class="law-sim-card">
        <h3>10 · Banking success</h3>
        <div class="law-sim-meter" style="--pct:${bankBar}">
          <div class="law-sim-meter__bar"></div>
          <span class="law-sim-meter__label">${bankBar}% estimated (12 mo, complete pack)</span>
        </div>
        <ul class="law-sim-bank-list">${m.bankNames.map((b) => `<li>${lawEsc(b)}</li>`).join("")}</ul>
        ${bankBar < 30 ? `<p class="law-sim-flag law-sim-flag--warn">Under 30%: fix personal residence/origin risk before CASP capital.</p>` : ""}
      </div>
      <div class="law-sim-card">
        <h3>11 · Residual risks</h3>
        <ul class="law-guide-ul">
          <li>Supervisory rejection or expensive conditions</li>
          <li>Bank de-risking after account opening</li>
          <li>Marketing / influencer perimeter breaches</li>
          <li>Tax residence challenge (exit or arrival state)</li>
          <li>Sanctions false positives; director AML liability</li>
          ${m.personalOnly ? "<li>Mistaking personal migration for a regulated business passport</li>" : ""}
        </ul>
      </div>
    </section>

    <section class="law-sim-section">
      <h3>12 · This week &amp; advisors</h3>
      <div class="law-sim-checklist">
        <div class="law-sim-check">1 · One-page activity perimeter</div>
        <div class="law-sim-check">2 · Export exchanges · label wallets (SOF v0)</div>
        <div class="law-sim-check">3 · Tax counsel origin + relocate state</div>
        <div class="law-sim-check">4 · ${m.moving || m.highRiskOrigin ? "Immigration path for relocate state" : "Warm bank intro in banking state"}</div>
        <div class="law-sim-check">5 · Freeze public token marketing</div>
      </div>
      <p class="law-muted">Advisors: immigration · tax (exit+entry) · corporate/MiCA counsel · AML · optional banking introducer. Monitor: day counts, CRS, licence conditions, bank TOR, sanctions, MiCA Level-2, geo marketing.</p>
    </section>

    <section class="law-sim-section">
      <h3>13 · Risk matrix</h3>
      <div class="law-sim-risks">${riskHtml}</div>
    </section>

    <p class="law-sim-disclaimer">${lawEsc(LAW_SIM_DISCLAIMER)}</p>
  </div>`;
}

function lawShowSimulator() {
  const util = lawEl("law-panel-utility");
  if (!util) return;
  if (!lawData) {
    void lawLoad("simulator");
    return;
  }
  if (typeof lawSyncLegalRelocateDestinations === "function") {
    try {
      lawSyncLegalRelocateDestinations();
    } catch (_) {}
  }

  lawView = "simulator";
  lawSetPanel("utility");
  util.hidden = false;
  lawBreadcrumb([
    { label: "The Law", action: "overview" },
    { label: "Simulator" },
  ]);
  lawSetPath("/law/simulator");
  try {
    if (window.MenuController?.l1 === "law") {
      localStorage.setItem("btc-menu-l2", "simulator");
      window.MenuController.l2 = "simulator";
      document.querySelectorAll("#menu-l2-slot .dash-tab--l2").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.menuId === "simulator");
      });
    }
  } catch (_) {}

  util.innerHTML = `
    <section class="panel law-sim-panel">
      <div class="panel-header">
        <h2>Simulator</h2>
        <span class="panel-meta">5 layers · origin · relocate · company · MiCA (optional) · banking</span>
      </div>
      <div class="law-panel-body">
        <p class="law-muted">Model a founder stack. <strong>B</strong> and <strong>C</strong> can be <em>None</em> for pure personal migration / remote online work — the report stays individual-focused and only flags a company when regulated crypto services would require one. <strong>Not legal advice.</strong></p>

        <div class="law-sim-form law-sim-form--5">
          <label class="law-sim-field">
            <span class="law-sim-label"><span class="law-sim-key">A</span> Origin · nationality · current tax base</span>
            <select id="law-sim-a" class="law-select">${lawSimCountrySelectOptions(false)}</select>
          </label>
          <label class="law-sim-field">
            <span class="law-sim-label"><span class="law-sim-key">R</span> Personal relocate · new tax residence</span>
            <select id="law-sim-r" class="law-select">${lawSimRelocateSelectOptions()}</select>
          </label>
          <label class="law-sim-field">
            <span class="law-sim-label"><span class="law-sim-key">B</span> Corporate incorporation</span>
            <select id="law-sim-b" class="law-select">${lawSimCountrySelectOptions(true, "None – personal / online job only")}</select>
          </label>
          <label class="law-sim-field">
            <span class="law-sim-label"><span class="law-sim-key">C</span> Regulatory home · MiCA (optional)</span>
            <select id="law-sim-c" class="law-select">${lawSimMicaSelectOptions()}</select>
          </label>
          <label class="law-sim-field">
            <span class="law-sim-label"><span class="law-sim-key">D</span> Primary banking &amp; fiat rails</span>
            <select id="law-sim-d" class="law-select">${lawSimCountrySelectOptions(false)}</select>
          </label>
          <div class="law-sim-actions">
            <button type="button" class="law-btn" id="law-sim-run">Run simulation</button>
            <button type="button" class="law-btn law-btn--ghost" id="law-sim-preset-it" title="Full corporate stack">Preset: IT → EE life · EE co · DE MiCA · NL bank</button>
            <button type="button" class="law-btn law-btn--ghost" id="law-sim-preset-personal" title="Personal move + online job, no company, no CASP">Preset: IT → PT · online job · no co · no MiCA</button>
            <button type="button" class="law-btn law-btn--ghost" id="law-sim-preset-align">Preset: IT → IE aligned stack</button>
            <button type="button" class="law-btn law-btn--ghost" id="law-sim-copy" hidden>Copy Markdown</button>
          </div>
        </div>

        <div id="law-sim-out" class="law-sim-out" hidden></div>
        <p style="margin-top:1rem"><button type="button" class="law-btn law-btn--ghost" data-law-back>← Overview</button></p>
      </div>
    </section>`;

  const run = () => {
    const originId = lawEl("law-sim-a")?.value || "";
    const relocateId = lawEl("law-sim-r")?.value || LAW_SIM_SAME_ORIGIN;
    const companyId = lawEl("law-sim-b")?.value || LAW_SIM_NONE;
    const micaId = lawEl("law-sim-c")?.value || LAW_SIM_NONE;
    const bankId = lawEl("law-sim-d")?.value || "";
    if (!originId || !bankId) {
      alert("Select A (origin) and D (banking). B and C may be “None” for personal migration / online job.");
      return;
    }
    const { md, model } = lawSimGenerate({ originId, relocateId, companyId, micaId, bankId });
    const out = lawEl("law-sim-out");
    if (!out) return;
    out.hidden = false;
    out.innerHTML = lawSimRenderHtml(model);
    out.dataset.rawMd = md;
    const copyBtn = lawEl("law-sim-copy");
    if (copyBtn) copyBtn.hidden = false;
    if (typeof lawAttachGlossary === "function") lawAttachGlossary(out);
    out.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const set = (id, val) => {
    const el = lawEl(id);
    if (el) el.value = val;
  };

  lawEl("law-sim-run")?.addEventListener("click", run);
  lawEl("law-sim-preset-it")?.addEventListener("click", () => {
    set("law-sim-a", "italy");
    set("law-sim-r", "estonia");
    set("law-sim-b", "estonia");
    set("law-sim-c", "germany");
    set("law-sim-d", "netherlands");
    run();
  });
  lawEl("law-sim-preset-personal")?.addEventListener("click", () => {
    set("law-sim-a", "italy");
    set("law-sim-r", "portugal");
    set("law-sim-b", LAW_SIM_NONE);
    set("law-sim-c", LAW_SIM_NONE);
    set("law-sim-d", "portugal");
    run();
  });
  lawEl("law-sim-preset-align")?.addEventListener("click", () => {
    set("law-sim-a", "italy");
    set("law-sim-r", "ireland");
    set("law-sim-b", "ireland");
    set("law-sim-c", "ireland");
    set("law-sim-d", "ireland");
    run();
  });
  lawEl("law-sim-copy")?.addEventListener("click", async () => {
    const md = lawEl("law-sim-out")?.dataset?.rawMd || "";
    try {
      await navigator.clipboard.writeText(md);
      alert("Markdown copied.");
    } catch (_) {
      alert("Could not copy.");
    }
  });
  util.querySelector("[data-law-back]")?.addEventListener("click", () => {
    if (typeof window.lawShowOverview === "function") window.lawShowOverview();
    else if (typeof window.initLaw === "function") window.initLaw("overview");
  });
}

window.lawShowSimulator = lawShowSimulator;
window.lawSimGenerate = lawSimGenerate;
