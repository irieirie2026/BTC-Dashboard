/**
 * Extend Global / Relocate hubs to every map-green jurisdiction
 * (status === "legal" / "Legal / regulated" in The Law dataset).
 * Loaded after law.js; call lawSyncLegalRelocateDestinations() once lawData is available.
 */
/* global LAW_RELOCATE_BROWSER, LAW_RELOCATE_HUBS, LAW_LAUNCH_EASE */

const LAW_LEGAL_SKIP_IDS = new Set(["european-union"]); // overview row, not a place to live

/** ISO2 → flag emoji (legal jurisdictions + common hubs) */
const LAW_ISO_FLAG = {
  US: "🇺🇸", CA: "🇨🇦", GB: "🇬🇧", CH: "🇨🇭", NO: "🇳🇴", UA: "🇺🇦", GE: "🇬🇪",
  AU: "🇦🇺", NZ: "🇳🇿", JP: "🇯🇵", KR: "🇰🇷", SG: "🇸🇬", HK: "🇭🇰", TW: "🇹🇼",
  TH: "🇹🇭", MY: "🇲🇾", ID: "🇮🇩", PH: "🇵🇭", KZ: "🇰🇿",
  AE: "🇦🇪", IL: "🇮🇱", ZA: "🇿🇦", MU: "🇲🇺", SC: "🇸🇨", KE: "🇰🇪", GH: "🇬🇭",
  NG: "🇳🇬", RW: "🇷🇼", UG: "🇺🇬", ZM: "🇿🇲", BW: "🇧🇼", SN: "🇸🇳", CI: "🇨🇮",
  BJ: "🇧🇯", TG: "🇹🇬", CV: "🇨🇻",
  BR: "🇧🇷", AR: "🇦🇷", CL: "🇨🇱", CO: "🇨🇴", PE: "🇵🇪", UY: "🇺🇾", PA: "🇵🇦",
  CR: "🇨🇷", SV: "🇸🇻", GT: "🇬🇹", PY: "🇵🇾", BZ: "🇧🇿", JM: "🇯🇲", NI: "🇳🇮", TT: "🇹🇹",
  MX: "🇲🇽", CU: "🇨🇺",
  DE: "🇩🇪", FR: "🇫🇷", IT: "🇮🇹", ES: "🇪🇸", PT: "🇵🇹", NL: "🇳🇱", BE: "🇧🇪",
  AT: "🇦🇹", IE: "🇮🇪", LU: "🇱🇺", SE: "🇸🇪", DK: "🇩🇰", FI: "🇫🇮", PL: "🇵🇱",
  CZ: "🇨🇿", GR: "🇬🇷", EE: "🇪🇪",
  EU: "🇪🇺",
};

/** Browser region label from law_data region id */
function lawRegionLabel(regionId) {
  const m = {
    "north-america": "N. America",
    "latin-america": "LatAm",
    europe: "Europe-non-EU",
    "eu-mica": "EU",
    "middle-east-africa": "Africa / MENA",
    "asia-pacific": "Asia",
  };
  return m[regionId] || regionId || "Other";
}

/**
 * Curated local / locally authorized crypto service landscape.
 * Keys: law jurisdiction id (preferred) or browser relocate id.
 * Educational snapshots — brand lists are illustrative, not endorsements; verify live registers.
 */
const LAW_LOCAL_SERVICES = {
  // ── North America ──
  "united-states": {
    exchanges: "Spot trading via federal/state-compliant platforms (FinCEN MSB + state money-transmitter where required). Major licensed venues (e.g. Coinbase, Kraken, Gemini-class) dominate retail; many offshore books block or limit US persons. Broker/dealer and futures perimeters separate.",
    banks: "Most large banks do not custody retail BTC; crypto-native banks and fintech rails (e.g. Silvergate-era successors, banking-as-a-service partners) are selective. Corporate accounts for VASPs need MTL/BSA narrative. Expect enhanced SOF questions.",
    atm: "Bitcoin ATMs widespread in many metros via operators under MSB rules — high fees, ID thresholds, and local zoning vary by city/state.",
    merchants: "Voluntary merchant acceptance (Strike, BTCPay, BitPay-style processors in places); USD remains legal tender. Not mass retail.",
    rails: "ACH/wire fiat on-off via licensed platforms; Travel Rule between US VASPs; state bitlicense-style regimes (e.g. NY) add friction for operators.",
    summary: "Deep licensed exchange market · weak bank crypto custody · many ATMs · voluntary merchants",
  },
  usa: null, // alias filled at runtime from united-states
  canada: {
    exchanges: "Provincial securities registration for many platforms + FINTRAC MSB. Major registered exchanges serve CAD pairs; verify CSA/CIRO-related registration before using a venue.",
    banks: "Big-5 banks historically cautious on crypto; some fintechs and credit unions experiment. Corporate VASP banking needs clean FINTRAC + securities story.",
    atm: "Bitcoin ATMs present in larger cities; fees high; AML thresholds apply.",
    merchants: "Voluntary acceptance only; CAD legal tender. Niche tourism/tech corridors.",
    rails: "EFT/Interac on-off via registered platforms; Travel Rule for VASPs.",
    summary: "Registered platforms · cautious banks · some ATMs · voluntary merchants",
  },
  // ── Europe / UK / CH ──
  "united-kingdom": {
    exchanges: "FCA-registered cryptoasset firms under MLRs; check the FCA register. Unregistered overseas books often cannot market to UK retail under financial-promotions rules.",
    banks: "High-street banks mixed; many close or restrict crypto-linked accounts. Challenger banks and EMI partners used with strong SOF. FCA registration helps but does not guarantee banking.",
    atm: "Limited BTC ATMs vs US; sparse coverage outside London.",
    merchants: "Voluntary only; GBP legal tender. Processor niches exist.",
    rails: "Faster Payments / SEPA-adjacent via EMIs; Travel Rule for registered firms; promotions regime constrains apps and influencers.",
    summary: "FCA-registered exchanges · hard banking · few ATMs · voluntary merchants",
  },
  uk: null,
  switzerland: {
    exchanges: "FINMA-supervised banks/securities firms and self-regulated association members historically; licensed trading/custody venues in Zug/Zurich ecosystem. Verify FINMA registers.",
    banks: "Selective but world-class once accepted — SEBA/Sygnum-class crypto banks and private banks with crypto desks. Extreme DD and minimums common.",
    atm: "Sparse; not a primary on-ramp.",
    merchants: "Voluntary; CHF legal tender. Tourism/tech pockets.",
    rails: "CHF/EUR rails via banks and licensed intermediaries; Travel Rule for VASPs.",
    summary: "Licensed venues + crypto banks · sparse ATMs · voluntary merchants",
  },
  norway: {
    exchanges: "EEA-aligned crypto service rules; local and EU-passported CASPs may serve NO clients under applicable regimes. Verify national register / ESMA.",
    banks: "Mainstream banks cautious; fintechs used for on-off ramps. High SOF bar.",
    atm: "Very limited.",
    merchants: "Voluntary; NOK legal tender.",
    rails: "Domestic payments + EU CASP partners; wealth-tax context shapes long-term holding rails.",
    summary: "EEA/CASP access · cautious banks · limited ATMs · voluntary merchants",
  },
  georgia: {
    exchanges: "Local and regional exchanges historically active; VASP/tax rules evolve — verify current registration. Global platforms used by residents when available.",
    banks: "Selective for crypto SOF; some local banks more familiar with mining/crypto histories than EU peers. EMI multi-rail common.",
    atm: "Some BTC ATMs in Tbilisi historically; coverage changes often.",
    merchants: "Niche acceptance in crypto-tourist pockets; GEL legal tender.",
    rails: "Local bank + foreign exchange stacks; not MiCA passport.",
    summary: "Active local trading culture · selective banks · some ATMs · niche merchants",
  },
  ukraine: {
    exchanges: "Virtual Asset Law framework exists; wartime implementation and capital controls affect which platforms operate. Prefer counsel + live official lists.",
    banks: "Wartime controls and risk appetite dominate; many residents use foreign platforms carefully.",
    atm: "Unreliable / limited under wartime conditions.",
    merchants: "Niche; not mass market.",
    rails: "Capital controls may constrain on/off ramps more than formal VASP law.",
    summary: "Framework on paper · wartime banking limits · thin ATMs/merchants",
  },
  // ── EU MiCA (shared pattern + national notes) ──
  germany: {
    exchanges: "Trade via MiCA-authorized CASPs under BaFin (and ESMA CASP register). Transitional national firms winding down. Avoid unlicensed offshore apps marketed to DE retail.",
    banks: "Large banks rarely custody retail crypto; some partner with licensed CASPs. GmbH crypto cos need BaFin/CASP story for accounts. SEPA via banks/EMIs for fiat.",
    atm: "Sparse BTC ATMs in large cities; high fees; KYC.",
    merchants: "Voluntary only; euro legal tender. Lightning/BTCPay niches.",
    rails: "SEPA on/off via CASPs; TFR Travel Rule between VASPs; BaFin consumer warnings common.",
    summary: "BaFin/MiCA CASPs · SEPA · sparse ATMs · voluntary merchants",
  },
  france: {
    exchanges: "MiCA CASP via AMF/ACPR path (PSAN legacy transition). Check AMF/ESMA registers. Unlicensed marketing to FR retail is high risk.",
    banks: "Traditional banks cautious; fintechs and licensed CASP partners for on-off. Corporate accounts need clean perimeter.",
    atm: "Limited urban ATMs.",
    merchants: "Voluntary; euro legal tender.",
    rails: "SEPA + Travel Rule; AMF promotions culture strict.",
    summary: "AMF/MiCA CASPs · SEPA · limited ATMs · voluntary merchants",
  },
  italy: {
    exchanges: "MiCA CASP under CONSOB / Banca d'Italia supervision. Use authorized platforms on national/ESMA registers. Many global apps restricted for IT retail if unlicensed.",
    banks: "Italian banks often refuse pure crypto SOF without clear documentation; EMIs and authorized CASP fiat rails common. OAM/VASP history transitioned toward MiCA.",
    atm: "Some BTC ATMs in cities; not dense; fees high.",
    merchants: "Voluntary; euro legal tender. Occasional tourism experiments.",
    rails: "SEPA; Travel Rule; tax monitoring (RW) intersects with exchange reports.",
    summary: "IT MiCA CASPs · hard bank KYC · some ATMs · voluntary merchants",
  },
  spain: {
    exchanges: "MiCA CASP via CNMV / Banco de España path. Registered platforms only for serious retail access; CNMV warnings on unlicensed entities common.",
    banks: "Mixed; neobanks and EMIs used. Crypto SOF enhanced DD standard.",
    atm: "Some ATMs in tourist cities; sparse overall.",
    merchants: "Voluntary; euro legal tender.",
    rails: "SEPA + Travel Rule; wealth-tax context for large holders.",
    summary: "CNMV/MiCA CASPs · SEPA · tourist ATMs · voluntary merchants",
  },
  portugal: {
    exchanges: "MiCA CASP under CMVM / Banco de Portugal. Authorized EU CASPs may passport. Unlicensed offshore books risk promotion issues.",
    banks: "Doable with residence + clean SOF; crypto founders still enhanced DD. EMI backup common.",
    atm: "Limited; Lisbon/Porto pockets.",
    merchants: "Voluntary; euro legal tender. Tourism niches.",
    rails: "SEPA; Travel Rule; NHR myths do not change service licensing.",
    summary: "PT/EU CASPs · SEPA · limited ATMs · voluntary merchants",
  },
  netherlands: {
    exchanges: "MiCA CASP under AFM/DNB. Strong local fintech + passported EU CASPs. Check registers before funding.",
    banks: "Dutch banks historically strict on crypto; licensed story helps. EMIs widely used.",
    atm: "Sparse.",
    merchants: "Voluntary; euro legal tender.",
    rails: "iDEAL/SEPA via CASPs and banks; Travel Rule.",
    summary: "AFM/MiCA CASPs · strict banks · sparse ATMs · voluntary merchants",
  },
  ireland: {
    exchanges: "MiCA CASP under Central Bank of Ireland; EU passporting possible. English-language platforms popular.",
    banks: "Good once onboarded; crypto SOF still enhanced. EMI multi-rail common for founders.",
    atm: "Very limited.",
    merchants: "Voluntary; euro legal tender.",
    rails: "SEPA; Travel Rule; English support.",
    summary: "CBI/MiCA CASPs · SEPA · few ATMs · voluntary merchants",
  },
  luxembourg: {
    exchanges: "MiCA CASP / CSSF-facing intermediaries; institutional venues more than retail meme books.",
    banks: "Excellent private/corporate banking if accepted; crypto desks selective with high minimums.",
    atm: "Negligible for retail strategy.",
    merchants: "Voluntary; euro legal tender.",
    rails: "SEPA + fund custody rails; Travel Rule.",
    summary: "Institutional CASP/custody · excellent banks (if in) · no ATM reliance",
  },
  estonia: {
    exchanges: "MiCA CASP path (post VASP-licence cleanup era). e-Residency ≠ exchange licence. Prefer ESMA/national CASP register names.",
    banks: "Historically hard for pure crypto cos; EU EMIs common. Local bank onboarding needs real substance.",
    atm: "Sparse.",
    merchants: "Voluntary; euro legal tender.",
    rails: "SEPA via EMIs/CASPs; Travel Rule.",
    summary: "MiCA CASPs · hard local banking · sparse ATMs · voluntary merchants",
  },
  austria: {
    exchanges: "MiCA CASP under FMA; EU passporting. Check FMA/ESMA registers.",
    banks: "Cautious mainstream banks; fintech partners for on-off.",
    atm: "Limited urban machines.",
    merchants: "Voluntary; euro legal tender.",
    rails: "SEPA; Travel Rule.",
    summary: "FMA/MiCA CASPs · SEPA · limited ATMs · voluntary merchants",
  },
  belgium: {
    exchanges: "MiCA CASP under FSMA/NBB path; EU registers.",
    banks: "Conservative; EMI/CASP rails for crypto fiat.",
    atm: "Sparse.",
    merchants: "Voluntary; euro legal tender.",
    rails: "SEPA; Travel Rule.",
    summary: "FSMA/MiCA CASPs · SEPA · sparse ATMs · voluntary merchants",
  },
  "czech-republic": {
    exchanges: "MiCA CASP under national NCA; competitive local exchange culture historically. Verify live CASP list.",
    banks: "Selective; EMIs popular with founders.",
    atm: "Some machines in Prague; not dense.",
    merchants: "Voluntary; CZK/euro contexts.",
    rails: "SEPA (CZK/EUR); Travel Rule.",
    summary: "MiCA CASPs · selective banks · some ATMs · voluntary merchants",
  },
  denmark: {
    exchanges: "MiCA CASP under DFSA path; EU passporting.",
    banks: "Strict KYC culture; licensed CASP partners for ramps.",
    atm: "Very limited.",
    merchants: "Voluntary; DKK/euro.",
    rails: "Domestic + SEPA; Travel Rule.",
    summary: "MiCA CASPs · strict banks · few ATMs · voluntary merchants",
  },
  finland: {
    exchanges: "MiCA CASP under FIN-FSA; EU registers.",
    banks: "Cautious; fintech on-off ramps.",
    atm: "Sparse.",
    merchants: "Voluntary; euro legal tender.",
    rails: "SEPA; Travel Rule.",
    summary: "MiCA CASPs · cautious banks · sparse ATMs · voluntary merchants",
  },
  greece: {
    exchanges: "MiCA CASP under HCMC/Bank of Greece path; EU passporting. Local depth thinner than DE/FR.",
    banks: "Mixed; enhanced crypto SOF; EMI backup wise.",
    atm: "Tourist-city pockets possible; sparse.",
    merchants: "Voluntary; euro legal tender. Tourism niches.",
    rails: "SEPA; Travel Rule.",
    summary: "MiCA CASPs · mixed banks · tourist ATMs · voluntary merchants",
  },
  poland: {
    exchanges: "MiCA CASP under KNF path; historically active local exchange scene. Verify KNF/ESMA lists.",
    banks: "Selective for crypto; fintechs fill gaps.",
    atm: "Some urban ATMs.",
    merchants: "Voluntary; PLN legal tender.",
    rails: "Domestic + SEPA; Travel Rule.",
    summary: "KNF/MiCA CASPs · selective banks · some ATMs · voluntary merchants",
  },
  sweden: {
    exchanges: "MiCA CASP under FI; strong fintech + EU CASPs.",
    banks: "Major banks often restrict crypto; use licensed partners.",
    atm: "Sparse.",
    merchants: "Voluntary; SEK legal tender.",
    rails: "Domestic + SEPA; Travel Rule.",
    summary: "FI/MiCA CASPs · bank friction · sparse ATMs · voluntary merchants",
  },
  // ── MENA / UAE / Israel ──
  "united-arab-emirates": {
    exchanges: "Licensed venues under VARA (Dubai), ADGM FSRA, or SCA/CBUAE interfaces — zone matters. Unlicensed retail books are a compliance fail. Check the relevant free-zone register.",
    banks: "Strong once licensed/substance clear; free-zone banks and international banks with UAE presence. Unlicensed crypto activity struggles.",
    atm: "Some BTC ATMs in Dubai/Abu Dhabi; not primary.",
    merchants: "Growing tourism/tech acceptance experiments; AED legal tender; not universal.",
    rails: "AED/USD rails via licensed VASPs; Travel Rule in licensed perimeter.",
    summary: "Zone-licensed exchanges · strong banks if licensed · some ATMs · growing merchants",
  },
  uae: null,
  israel: {
    exchanges: "Local licensed/supervised platforms under ISA/BoI attention; banking friction historically pushed users to careful multi-rail. Verify current authorized list.",
    banks: "Historically uneven crypto banking access — expect long DD. Some specialized providers.",
    atm: "Limited.",
    merchants: "Voluntary; ILS legal tender. Tech corridors.",
    rails: "ILS rails via local platforms/banks when accepted; Travel Rule themes apply to supervised entities.",
    summary: "Supervised local platforms · hard banking history · limited ATMs · voluntary merchants",
  },
  // ── Asia-Pacific ──
  japan: {
    exchanges: "Only registered crypto-asset exchange service providers (FSA/PSA). Major domestic brands dominate JPY pairs. Unregistered platforms cannot legally serve JP users as exchanges.",
    banks: "Excellent once resident with My Number; non-residents struggle. Banks generally do not sell BTC retail; on-off via registered exchanges.",
    atm: "Rare; not a practical strategy.",
    merchants: "Voluntary; JPY legal tender. Limited but iconic pilots historically.",
    rails: "JPY bank transfer to registered exchanges; Travel Rule between VASPs; strict marketing.",
    summary: "FSA-registered exchanges only · bank after residence · rare ATMs · voluntary merchants",
  },
  singapore: {
    exchanges: "MAS-licensed DPT service providers under Payment Services Act. Check MAS licence list. Many global brands blocked or restricted without licence.",
    banks: "Excellent traditional banks for clean businesses; pure unlicensed crypto faces friction. Licensed entities bank more easily.",
    atm: "Minimal retail ATM culture.",
    merchants: "Voluntary; SGD legal tender.",
    rails: "SGD FAST/MEPS+ via banks and licensed platforms; Travel Rule for licensees.",
    summary: "MAS-licensed DPT providers · excellent banks · few ATMs · voluntary merchants",
  },
  "hong-kong": {
    exchanges: "SFC-licensed virtual asset trading platforms (VATPs) for retail/professional per licence conditions. Unlicensed platforms cannot freely serve HK public.",
    banks: "Strong once onboarded; multi-month DD for crypto wealth. Licensed VATP banking preferred.",
    atm: "Sparse.",
    merchants: "Voluntary; HKD legal tender.",
    rails: "HKD rails via banks/licensed platforms; Travel Rule.",
    summary: "SFC-licensed VATPs · strong banks · sparse ATMs · voluntary merchants",
  },
  "hong-kong-sar": null,
  australia: {
    exchanges: "AUSTRAC-registered digital currency exchanges (DCEs). ASIC perimeter for financial products. Use registered DCEs for AUD pairs.",
    banks: "Major banks mixed after past de-risking cycles; some reopen carefully. SOF critical.",
    atm: "Some BTC ATMs in cities; fees high.",
    merchants: "Voluntary; AUD legal tender.",
    rails: "NPP/PayID to registered DCEs; Travel Rule themes for providers.",
    summary: "AUSTRAC DCEs · mixed banks · some ATMs · voluntary merchants",
  },
  "new-zealand": {
    exchanges: "Local and AU-linked platforms with AML/CFT obligations; verify registered financial service providers.",
    banks: "Cautious; fintech ramps common.",
    atm: "Very limited.",
    merchants: "Voluntary; NZD legal tender.",
    rails: "Domestic bank transfer to platforms; IRD tax reporting culture.",
    summary: "AML-obliged platforms · cautious banks · few ATMs · voluntary merchants",
  },
  "south-korea": {
    exchanges: "Real-name verified domestic exchanges under VASP/Travel Rule regime (FIU/FSC perimeter). Won trading highly concentrated on local giants. Foreign platforms often blocked for KR residents.",
    banks: "Banking tied to real-name exchange accounts; accounts after proper ID. Corporate crypto banking formal.",
    atm: "Not the main on-ramp; exchange KRW deposits dominate.",
    merchants: "Voluntary; KRW legal tender. Limited retail BTC pay.",
    rails: "Real-name bank ↔ exchange only; strict Travel Rule; marketing limits.",
    summary: "Real-name local exchanges · bank-linked KRW · few ATMs · voluntary merchants",
  },
  taiwan: {
    exchanges: "FSC virtual-asset service provider rules; use registered VAS providers. Local TWD platforms active.",
    banks: "Selective; SOF required. Some fintech bridges.",
    atm: "Limited.",
    merchants: "Voluntary; TWD legal tender.",
    rails: "Bank transfer to registered VAS; AML obligations.",
    summary: "FSC VAS providers · selective banks · limited ATMs · voluntary merchants",
  },
  thailand: {
    exchanges: "SEC Thailand-licensed digital asset exchanges/brokers/dealers. Unlicensed apps should not serve TH public. Payments use of crypto restricted vs investment trading.",
    banks: "Hard for non-residents; residents still face crypto SOF scrutiny. Often use licensed exchange THB rails.",
    atm: "Limited; not primary.",
    merchants: "Payments restricted vs many hubs; THB legal tender. Do not assume merchant BTC pay is free-for-all.",
    rails: "THB via licensed digital-asset operators; SEC marketing rules.",
    summary: "SEC-licensed DA venues · hard banks · limited ATMs · restricted payments",
  },
  malaysia: {
    exchanges: "SC-approved digital asset exchanges only for formal trading. Check Securities Commission register.",
    banks: "Mixed; Islamic-finance context adds product filters. SOF standard.",
    atm: "Sparse.",
    merchants: "Voluntary; MYR legal tender. Not mass crypto pay.",
    rails: "MYR via approved exchanges; SC perimeter.",
    summary: "SC-approved exchanges · mixed banks · sparse ATMs · voluntary merchants",
  },
  indonesia: {
    exchanges: "Crypto traded via Bappebti/futures-exchange style infrastructure (framework evolves). Not a payment instrument. Use authorized local venues for IDR pairs.",
    banks: "Hard for foreigners; residents need clear status. Limited bank crypto products.",
    atm: "Sparse/unreliable as strategy.",
    merchants: "Not positioned as payment medium; IDR legal tender.",
    rails: "IDR via regulated commodity/exchange rails; ownership limits on cos separate.",
    summary: "Regulated exchange rails · hard banking · sparse ATMs · not payment-oriented",
  },
  philippines: {
    exchanges: "BSP-licensed Virtual Asset Service Providers. Remittance-linked use cases common. Check BSP VASP list.",
    banks: "Mixed; e-wallets and remittance firms important. SOF for larger flows.",
    atm: "Some machines in metros; fees high.",
    merchants: "Growing e-wallet culture; PHP legal tender. Crypto pay still niche.",
    rails: "PHP via BSP VASPs and e-money issuers; Travel Rule themes.",
    summary: "BSP VASPs · e-wallet rails · some ATMs · niche merchants",
  },
  kazakhstan: {
    exchanges: "National digital-asset frameworks + AIFC participants. Local exchanges and mining-adjacent OTC historically active — verify current licences.",
    banks: "Selective; AIFC banking narrative can help institutional stacks.",
    atm: "Limited outside major cities.",
    merchants: "Voluntary; KZT legal tender.",
    rails: "Local + AIFC rails; mining payout banking needs contracts.",
    summary: "Licensed/AIFC venues · selective banks · limited ATMs · voluntary merchants",
  },
  // ── LatAm ──
  brazil: {
    exchanges: "Virtual-asset service providers under Law 14.478/2022 and BCB authorization track. Large local BRL exchanges dominate retail. Prefer authorized/ in-transition providers per BCB.",
    banks: "Major banks offer limited crypto adjacency; Pix rails used for exchange deposits. Corporate VASP banking needs BCB story.",
    atm: "Some BTC ATMs in large cities; secondary to exchange Pix deposits.",
    merchants: "Voluntary; BRL legal tender. Pix dominates payments, not BTC.",
    rails: "Pix/TED to exchanges; COAF AML; Travel Rule developing with VASP rules.",
    summary: "BCB-track VASPs · Pix on-ramps · some ATMs · voluntary merchants",
  },
  argentina: {
    exchanges: "Active local P2P and exchange culture; providers face evolving CNV/BCRA/tax registration. Global platforms used when available. FX rules shape ramps.",
    banks: "Complex; FX controls history means multi-rail (local + foreign) is normal. Crypto SOF scrutinised.",
    atm: "Present in major cities historically; liquidity/fees vary with macro.",
    merchants: "High practical crypto familiarity; ARS legal tender. Informal merchant use more common than formal banking rails.",
    rails: "ARS/USD dual realities; tax reporting (AFIP/ARCA) intersects with exchange use.",
    summary: "Active local exchanges/P2P · complex banks · ATMs · high informal merchant use",
  },
  chile: {
    exchanges: "Fintech Law brings crypto-asset service providers into CMF licensing transition. Prefer providers aligning with CMF perimeter.",
    banks: "Selective; traditional banks cautious; fintech ramps growing.",
    atm: "Limited.",
    merchants: "Voluntary; CLP legal tender.",
    rails: "CLP bank transfer to platforms; CMF transition.",
    summary: "CMF-transition VASPs · selective banks · limited ATMs · voluntary merchants",
  },
  colombia: {
    exchanges: "Legal private trading; Superintendencia pilots and tax rules shape intermediaries. Local COP platforms active — verify supervisory status.",
    banks: "Mixed; enhanced crypto SOF; fintechs help.",
    atm: "Some urban machines.",
    merchants: "Voluntary; COP legal tender. Growing user base.",
    rails: "COP to local platforms; DIAN reporting culture.",
    summary: "Local platforms · mixed banks · some ATMs · voluntary merchants",
  },
  peru: {
    exchanges: "Legal hold/trade; SBS moving toward supervisory rules for virtual-asset providers. Local PEN platforms — verify live status.",
    banks: "Mixed/conservative; SOF required.",
    atm: "Limited.",
    merchants: "Voluntary; PEN legal tender.",
    rails: "PEN bank transfer; SUNAT tax intersection.",
    summary: "Evolving VASPs · conservative banks · limited ATMs · voluntary merchants",
  },
  uruguay: {
    exchanges: "Legal market with BCU virtual-asset regulatory project. Smaller local depth than BR/AR — often regional platforms.",
    banks: "Selective but approachable with clean SOF vs harder LatAm peers.",
    atm: "Sparse.",
    merchants: "Voluntary; UYU legal tender.",
    rails: "Local bank + regional exchanges; BCU project ongoing.",
    summary: "Smaller VASP market · selective banks · sparse ATMs · voluntary merchants",
  },
  panama: {
    exchanges: "Generally legal trading; full crypto law debated for years. Local and regional platforms + global apps used. No MiCA-style single CASP list — diligence providers.",
    banks: "Hard for pure crypto narratives; multi-bank + EMI essential. USD dollarization helps once onboarded.",
    atm: "Some machines in Panama City; not dense.",
    merchants: "Voluntary; USD legal tender. Tourism niches.",
    rails: "USD wires/ACH-like + regional exchanges; heavy bank KYC.",
    summary: "Open trading culture · hard banks · some ATMs · voluntary merchants",
  },
  "el-salvador": {
    exchanges: "Domestic service rules after Bitcoin Law reforms; Chivo and private wallets/exchanges coexist. Verify current registration after 2025 voluntary-acceptance reform.",
    banks: "Selective; dollarized system. Crypto-branded activity gets extra questions.",
    atm: "BTC ATMs and Chivo points historically more visible than most LatAm peers.",
    merchants: "Acceptance voluntary post-reform (no longer compulsory); USD + BTC culture remains stronger than average.",
    rails: "USD + BTC Lightning niches; policy still evolves — verify live.",
    summary: "Local BTC rails/exchanges · selective banks · more ATMs · voluntary merchants",
  },
  paraguay: {
    exchanges: "Legal market; thinner institutional VASP depth. Regional platforms + P2P; mining OTC common in energy corridors.",
    banks: "Conservative; plan multi-rail early.",
    atm: "Sparse outside Asunción.",
    merchants: "Voluntary; PYG legal tender. Limited formal pay.",
    rails: "Local bank + foreign exchanges; mining payout docs help SOF.",
    summary: "Thin VASP depth · conservative banks · sparse ATMs · voluntary merchants",
  },
  "costa-rica": {
    exchanges: "Permissive holding/trading; limited dedicated statute. Local and regional platforms; global apps when available.",
    banks: "Mixed; SUGEF perimeter banks ask crypto SOF in Spanish often.",
    atm: "Limited tourist-area machines possible.",
    merchants: "Voluntary; CRC legal tender. Tourism/tech niches.",
    rails: "Local bank + foreign EMI/exchanges.",
    summary: "Permissive platforms · mixed banks · limited ATMs · voluntary merchants",
  },
  guatemala: {
    exchanges: "Legal hold; thin formal VASP framework. Regional platforms and P2P dominate.",
    banks: "Conservative; crypto SOF difficult.",
    atm: "Sparse.",
    merchants: "Voluntary; GTQ legal tender.",
    rails: "Local bank + foreign ramps; EMI backup.",
    summary: "Thin formal VASPs · hard banks · sparse ATMs · voluntary merchants",
  },
  belize: {
    exchanges: "IFSC/digital-asset service frameworks in offshore tradition — verify live licences. Not a deep retail exchange market.",
    banks: "Selective offshore banking; substance and SOF required.",
    atm: "Negligible strategy.",
    merchants: "Voluntary; BZD/USD contexts.",
    rails: "Offshore CSP + foreign exchange stacks common.",
    summary: "Licensed service cos · selective banks · no ATM reliance · voluntary merchants",
  },
  jamaica: {
    exchanges: "Legal private holding; BOJ sandbox history. Limited formal exchange depth — regional platforms.",
    banks: "Mixed; remittance culture strong.",
    atm: "Limited.",
    merchants: "Voluntary; JMD legal tender.",
    rails: "Local bank + remittance/e-wallet adjacency.",
    summary: "Thin formal exchanges · mixed banks · limited ATMs · voluntary merchants",
  },
  nicaragua: {
    exchanges: "No comprehensive ban; very thin formal market. P2P and foreign platforms with diligence.",
    banks: "Hard; international scrutiny possible.",
    atm: "Sparse/unreliable.",
    merchants: "Voluntary; NIO legal tender.",
    rails: "Foreign ramps often primary.",
    summary: "Thin market · hard banks · sparse ATMs · voluntary merchants",
  },
  "trinidad-and-tobago": {
    exchanges: "No comprehensive ban; limited formal regulation. Thin local exchange infrastructure.",
    banks: "Selective.",
    atm: "Sparse.",
    merchants: "Voluntary; TTD legal tender.",
    rails: "Local bank + foreign platforms.",
    summary: "Thin formal VASPs · selective banks · sparse ATMs · voluntary merchants",
  },
  // ── Africa ──
  "south-africa": {
    exchanges: "Crypto asset service providers under FSCA/FAIS-style licensing (crypto as financial products). Prefer FSCA-authorized CASPs for ZAR pairs.",
    banks: "Major banks mixed after de-risking cycles; some reopen with strict policies. SOF essential.",
    atm: "Some urban ATMs; exchange EFT deposits dominate.",
    merchants: "Voluntary; ZAR legal tender. Growing user base, limited formal pay.",
    rails: "EFT to licensed platforms; FICA AML; Travel Rule themes.",
    summary: "FSCA CASPs · mixed banks · some ATMs · voluntary merchants",
  },
  mauritius: {
    exchanges: "VAITOS-licensed virtual asset service providers — check FSC Mauritius registers. Hub for regional/institutional flows more than mass retail.",
    banks: "Selective; licence + substance open doors. Private banking DD heavy.",
    atm: "Not a retail ATM market.",
    merchants: "Voluntary; MUR legal tender. Tourism niches.",
    rails: "Licensed VASP fiat corridors; CRS/substance.",
    summary: "FSC VAITOS VASPs · selective banks · no ATM strategy · voluntary merchants",
  },
  seychelles: {
    exchanges: "VASP licensing tradition for offshore operators — verify FSA registers. Many global brands historically incorporated here; serving locals is a different question.",
    banks: "Substance-driven; paper cos struggle.",
    atm: "Negligible.",
    merchants: "Voluntary; SCR legal tender.",
    rails: "Offshore entity + foreign banking stacks.",
    summary: "Licensed offshore VASPs · substance banking · no ATMs · voluntary merchants",
  },
  kenya: {
    exchanges: "Evolving CMA/CBK virtual-asset guidance; local KES platforms and P2P strong (M-Pesa adjacency). Prefer providers aligned with current guidance.",
    banks: "Mixed; mobile-money rails often more important than banks for retail ramps.",
    atm: "Limited crypto ATMs; M-Pesa is the real cash-out culture.",
    merchants: "Mobile money dominates; BTC merchant pay niche. KES legal tender.",
    rails: "M-Pesa/bank to local platforms; guidance still evolving.",
    summary: "Local platforms + M-Pesa · mixed banks · few ATMs · mobile-money merchants",
  },
  ghana: {
    exchanges: "BoG/securities authorities moving toward regulated virtual-asset activity. Local GHS platforms — verify authorization status live.",
    banks: "Mixed; SOF for larger crypto.",
    atm: "Sparse.",
    merchants: "Voluntary; GHS legal tender. Mobile money strong.",
    rails: "Mobile money + bank to platforms.",
    summary: "Evolving authorized platforms · mixed banks · sparse ATMs · mobile-money culture",
  },
  botswana: {
    exchanges: "BoB/NBFIRA virtual-asset perimeter developing. Thin local exchange depth — regional platforms.",
    banks: "Selective; smaller market.",
    atm: "Sparse.",
    merchants: "Voluntary; BWP legal tender.",
    rails: "Local bank + regional exchanges.",
    summary: "Developing VASP rules · selective banks · sparse ATMs · voluntary merchants",
  },
  rwanda: {
    exchanges: "Fintech-friendly policy; capital-market crypto rules evolving. Limited formal exchange depth.",
    banks: "Mixed; fintech experiments.",
    atm: "Sparse.",
    merchants: "Voluntary; RWF legal tender. Mobile money important.",
    rails: "Mobile money + bank; thin VASP list.",
    summary: "Thin formal exchanges · fintech rails · sparse ATMs · mobile money",
  },
  uganda: {
    exchanges: "Holding legal; BoU/CMA rules developing. P2P and regional platforms common.",
    banks: "Mixed/hard for pure crypto.",
    atm: "Sparse.",
    merchants: "Voluntary; UGX legal tender. Mobile money dominant.",
    rails: "Mobile money primary retail rail.",
    summary: "P2P/regional platforms · mixed banks · sparse ATMs · mobile money",
  },
  zambia: {
    exchanges: "Virtual-asset rules developing; thin formal market. Regional platforms/P2P.",
    banks: "Mixed.",
    atm: "Sparse.",
    merchants: "Voluntary; ZMW legal tender.",
    rails: "Local bank + regional ramps.",
    summary: "Thin VASPs · mixed banks · sparse ATMs · voluntary merchants",
  },
  senegal: {
    exchanges: "No comprehensive ban; WAEMU/BCEAO payment perimeter shapes rails more than crypto licences. Very thin formal VASP market.",
    banks: "Mixed; French-language banking.",
    atm: "Sparse.",
    merchants: "Voluntary; XOF legal tender. Mobile money growing.",
    rails: "BCEAO payment rules; foreign platforms common.",
    summary: "Thin formal VASPs · BCEAO rails · sparse ATMs · voluntary merchants",
  },
  "cote-divoire": {
    exchanges: "Holding generally legal; thin formal VASP market in Abidjan hub. Regional/foreign platforms.",
    banks: "Mixed commercial banks; SOF for crypto.",
    atm: "Sparse.",
    merchants: "Voluntary; XOF legal tender.",
    rails: "WAEMU payment system; foreign ramps.",
    summary: "Thin VASPs · mixed banks · sparse ATMs · voluntary merchants",
  },
  benin: {
    exchanges: "Thin formal market; P2P/foreign platforms with diligence.",
    banks: "Hard/limited depth.",
    atm: "Sparse.",
    merchants: "Voluntary; XOF legal tender.",
    rails: "Foreign ramps primary.",
    summary: "Very thin services · hard banks · sparse ATMs · voluntary merchants",
  },
  togo: {
    exchanges: "Thin formal market; foreign/P2P ramps.",
    banks: "Hard.",
    atm: "Sparse.",
    merchants: "Voluntary; XOF legal tender.",
    rails: "Foreign platforms common.",
    summary: "Very thin services · hard banks · sparse ATMs · voluntary merchants",
  },
  "cabo-verde": {
    exchanges: "Tourism/fintech interest; limited formal exchange infrastructure. Foreign platforms for residents.",
    banks: "Selective island banking.",
    atm: "Sparse.",
    merchants: "Tourism voluntary niches; CVE legal tender.",
    rails: "Local bank + foreign exchanges.",
    summary: "Thin local VASPs · selective banks · sparse ATMs · tourism merchants",
  },
};

/** Resolve aliases (browser short ids → law ids) */
const LAW_LOCAL_SERVICES_ALIASES = {
  usa: "united-states",
  uk: "united-kingdom",
  uae: "united-arab-emirates",
  "hong-kong": "hong-kong",
  "el-salvador": "el-salvador",
  "costa-rica": "costa-rica",
  "new-zealand": "new-zealand",
  "south-korea": "south-korea",
  "south-africa": "south-africa",
  "czech-republic": "czech-republic",
  "cote-divoire": "cote-divoire",
  "cabo-verde": "cabo-verde",
  "trinidad-and-tobago": "trinidad-and-tobago",
};

/**
 * Named banks / EMIs often discussed for crypto founders (fiat rails, not always “crypto banks”).
 * type: crypto-bank | private | retail | neo | emi | specialist
 * Educational — not endorsements; policies change; SOF/EDD always apply.
 */
const LAW_CRYPTO_BANKS = {
  "united-states": [
    ["Customers Bank / CB-related rails", "specialist", "US bank that has been more open to crypto-industry clients than big money-center banks — still full BSA/AML."],
    ["Lead Bank / BaaS partners", "specialist", "Banking-as-a-service partners used by fintechs/VASPs; availability depends on program and risk policy."],
    ["Mercury / Brex (fintech, not pure banks)", "neo", "Startup banking UX; crypto-company acceptance is policy-driven and can change — verify live."],
    ["Coinbase / Kraken fiat rails", "specialist", "Primary USD on-off for many founders is the exchange bank partner, not a traditional checking account."],
    ["JPMorgan / BofA / Citi (traditional)", "retail", "Top US banks — generally poor for pure crypto SOF; possible for clean software cos with limited crypto footprint."],
  ],
  canada: [
    ["Wealthsimple Cash / partner banks", "neo", "Fintech rails alongside Wealthsimple Crypto — not a crypto-custody bank."],
    ["EQ Bank / digital banks", "neo", "Digital retail banks; crypto industry acceptance varies."],
    ["RBC / TD / Scotiabank / BMO / CIBC", "retail", "Big-5: historically cautious on crypto-linked accounts; clean employment income easier than VASP treasury."],
    ["Registered exchange CAD rails", "specialist", "Bitbuy, Newton, etc. for CAD on-off more than corporate crypto banking."],
  ],
  "united-kingdom": [
    ["Revolut Business / personal", "neo", "Widely used by founders; crypto features and business policy change — check current terms."],
    ["Starling / Monzo Business", "neo", "UK challengers; crypto-company onboarding is selective and SOF-heavy."],
    ["ClearBank / modular banking", "specialist", "Infrastructure bank used by fintechs; not a retail crypto bank."],
    ["HSBC / Barclays / NatWest / Lloyds", "retail", "High-street majors — often difficult for pure crypto SOF; better for ordinary salary after residence."],
    ["Zodia / custody banking adjacency", "specialist", "Institutional crypto custody stack (Standard Chartered ecosystem) — not SME retail banking."],
  ],
  switzerland: [
    ["SEBA Bank", "crypto-bank", "FINMA-supervised crypto bank: banking + digital asset services for qualifying clients."],
    ["Sygnum Bank", "crypto-bank", "Digital asset bank focused on institutional and affluent crypto clients."],
    ["Bitcoin Suisse (brokerage rails)", "specialist", "Long-standing crypto broker; banking is via partners/relationships, not a universal bank."],
    ["UBS / Credit Suisse successor / Julius Baer", "private", "Private banks may open with high minimums and strict EDD after crypto industry filters."],
    ["PostFinance / cantonal banks", "retail", "Retail Swiss banks — mixed crypto tolerance; often refuse pure crypto income."],
  ],
  germany: [
    ["N26 / Vivid / fintechs", "neo", "Consumer neobanks; crypto-company accounts are limited — personal salary easier."],
    ["Solaris / banking-as-a-service", "specialist", "BaFin-regulated BaaS used by fintech front-ends; program-dependent."],
    ["Deutsche Bank / Commerzbank / Sparkasse / Volksbank", "retail", "Large German banks — typically require clean non-crypto narrative or licensed CASP story."],
    ["Licensed CASP fiat partners", "specialist", "Many founders use Bitpanda/Trade Republic-class ramps for EUR rather than classic company accounts."],
  ],
  france: [
    ["Qonto / Shine", "neo", "Popular French SME neobanks; crypto activity disclosure required; policy varies."],
    ["BNP Paribas / Société Générale / Crédit Agricole", "retail", "Major banks — cautious on crypto founders; corporate accounts need clear perimeter."],
    ["Banque Delubac / specialist names (verify live)", "specialist", "Some specialist/private banks have been more open historically — always re-check."],
    ["CASP EUR rails (Coinhouse, etc.)", "specialist", "On-off via AMF/MiCA-path platforms often easier than classic bank crypto SOF."],
  ],
  italy: [
    ["N26 / Revolut / Hype / Buddybank", "neo", "Common personal rails; business crypto still hard."],
    ["Intesa Sanpaolo / UniCredit / Banco BPM / MPS", "retail", "Large Italian banks frequently refuse pure crypto SOF; salary + clean docs better odds."],
    ["Illimity / Fineco", "neo", "Digital/specialist banks — crypto policy still selective."],
    ["Authorized CASP EUR rails", "specialist", "Young Platform and other authorized venues for EUR on-off when bank accounts fail."],
  ],
  spain: [
    ["Revolut / N26 / Bunq", "neo", "EU neobanks used by expats; business crypto varies."],
    ["BBVA / Santander / CaixaBank / Sabadell", "retail", "Majors — crypto-enhanced DD; fintech law clients may fare better with clean story."],
    ["Bit2Me / local CASP rails", "specialist", "Local exchange rails for EUR when traditional banks stall."],
  ],
  portugal: [
    ["Millennium BCP / CGD / Novo Banco / Santander PT", "retail", "Traditional PT banks — crypto SOF still enhanced; residence + clean income helps."],
    ["Revolut / N26 / Wise", "neo", "Common for newcomers; not a substitute for full corporate banking."],
    ["ActivBank / digital channels", "neo", "Digital arms of local banks — verify crypto policy live."],
  ],
  netherlands: [
    ["bunq", "neo", "NL neo widely used by freelancers; crypto income must be documented."],
    ["ING / ABN AMRO / Rabobank", "retail", "Major Dutch banks historically strict on crypto; licensed CASP story helps corporates."],
    ["Knab / other digitals", "neo", "Selective SME banking."],
    ["Bitvavo EUR rails", "specialist", "Primary retail EUR on-off for many NL users."],
  ],
  ireland: [
    ["AIB / Bank of Ireland / Permanent TSB", "retail", "Domestic banks — crypto-company onboarding limited; multinationals easier than VASPs."],
    ["Revolut / N26 / Wise", "neo", "Expat default stack for personal accounts."],
    ["International banks with IFSC presence", "private", "Institutional presence; high bar for pure crypto startups."],
  ],
  luxembourg: [
    ["BGL BNP / Spuerkeess / Banque de Luxembourg", "private", "Private/corporate banking with high DD; crypto desks rare and selective."],
    ["International private banks", "private", "Fund/custody adjacency more than retail crypto."],
  ],
  estonia: [
    ["LHV / SEB / Swedbank EE", "retail", "Local banks post-cleanup era are strict; e-Residency alone does not open accounts."],
    ["Wise / Revolut / EU EMIs", "emi", "Default multi-rail for e-Residency companies when local banks refuse."],
    ["Modular banking partners", "specialist", "Fintech BaaS — program dependent."],
  ],
  austria: [
    ["Erste / Raiffeisen / Bank Austria", "retail", "Austrian majors — crypto SOF enhanced DD."],
    ["N26 / Revolut", "neo", "Personal rails."],
    ["Bitpanda EUR rails", "specialist", "Major AT/EU retail on-off path."],
  ],
  belgium: [
    ["KBC / BNP Paribas Fortis / Belfius / ING BE", "retail", "Cautious on crypto; clean salary easier."],
    ["Keyrock adjacency (MM, not bank)", "specialist", "Liquidity firm — not a retail bank."],
    ["Revolut / N26", "neo", "Expat personal accounts."],
  ],
  "czech-republic": [
    ["ČSOB / Česká spořitelna / Komerční banka", "retail", "Czech majors — crypto policy mixed/strict."],
    ["Revolut / Wise", "neo", "Common founder multi-rail."],
    ["Local exchange CZK rails", "specialist", "Coinmate/Anycoin-class for CZK on-off."],
  ],
  poland: [
    ["PKO BP / Pekao / mBank / ING PL", "retail", "Polish banks — crypto SOF often difficult."],
    ["Revolut / Wise", "neo", "Widely used personal/business float."],
    ["Zonda and local exchange PLN rails", "specialist", "Primary crypto fiat ramps for many users."],
  ],
  sweden: [
    ["SEB / Handelsbanken / Nordea / Swedbank", "retail", "Nordic majors — cautious crypto industry stance."],
    ["Klarna (not a full bank for crypto cos)", "neo", "Payments giant; not a crypto treasury bank."],
    ["Safello SEK rails", "specialist", "Local exchange on-off."],
  ],
  denmark: [
    ["Danske Bank / Nordea DK / Jyske", "retail", "Strict KYC culture."],
    ["Lunar / neo apps", "neo", "Consumer neobanks; crypto income scrutiny."],
  ],
  finland: [
    ["Nordea / OP / Danske FI", "retail", "Cautious mainstream banking."],
    ["Revolut / Wise", "neo", "Expat stack."],
  ],
  greece: [
    ["Eurobank / NBG / Piraeus / Alpha", "retail", "Greek majors — crypto SOF enhanced."],
    ["Viva Wallet / neobanks", "neo", "Fintech rails where available."],
  ],
  "united-arab-emirates": [
    ["Wio / Liv / digital free-zone banks", "neo", "UAE digital banks used by residents; crypto disclosure and free-zone status matter."],
    ["Emirates NBD / FAB / ADCB / Mashreq", "retail", "Large UAE banks — crypto founders need clean free-zone + licence narrative."],
    ["Ruya / crypto-friendly programmes (verify live)", "specialist", "Occasional specialised offerings — policies change quickly."],
    ["VARA/ADGM-licensed VASP banking corridors", "specialist", "Best odds after licensing and substance in Dubai/Abu Dhabi free zones."],
  ],
  uae: null,
  singapore: [
    ["DBS / OCBC / UOB", "retail", "Major SG banks — excellent once accepted; pure unlicensed crypto is hard."],
    ["Maribank / digital banks", "neo", "Digital banking licences; crypto industry still filtered."],
    ["XM / private banks", "private", "UHNW; high minimums."],
    ["MAS-licensed DPT platform SGD rails", "specialist", "Primary crypto on-off for many residents."],
  ],
  "hong-kong": [
    ["HSBC / Hang Seng / BOCHK / Standard Chartered HK", "retail", "Strong banks after multi-month DD; crypto wealth needs institutional-grade SOF."],
    ["ZA Bank / digital banks", "neo", "Virtual banks — policy varies on crypto links."],
    ["OSL / HashKey fiat corridors", "specialist", "Licensed VATP-adjacent rails for digital assets."],
  ],
  japan: [
    ["MUFG / SMBC / Mizuho", "retail", "Mega-banks — excellent after residence + My Number; crypto SOF still careful."],
    ["Rakuten Bank / Japan Net Bank / digital", "neo", "Online banks popular with residents."],
    ["bitFlyer / bitbank JPY rails", "specialist", "Registered exchanges as main JPY on-off."],
  ],
  australia: [
    ["CBA / Westpac / NAB / ANZ", "retail", "Big-4 historically de-risked crypto then partially reopened — policy fluid."],
    ["Up / ING AU / digital", "neo", "Consumer digitals; crypto income scrutiny."],
    ["Independent Reserve / Swyftx / CoinSpot AUD rails", "specialist", "Main AUD crypto ramps."],
  ],
  "new-zealand": [
    ["ANZ NZ / ASB / BNZ / Westpac NZ", "retail", "Cautious major banks."],
    ["Easy Crypto NZD rails", "specialist", "Local broker on-off."],
  ],
  "south-korea": [
    ["KB / Shinhan / Woori / Hana", "retail", "Real-name bank accounts mandatory for exchange KRW deposits."],
    ["KakaoBank / Toss Bank", "neo", "Digital banks used by retail; exchange linkage rules apply."],
    ["Upbit / Bithumb KRW rails", "specialist", "Dominant local exchange on-off (real-name only)."],
  ],
  taiwan: [
    ["CTBC / Cathay / Fubon / Mega", "retail", "Selective on crypto wealth."],
    ["MAX / MaiCoin / BitoPro TWD rails", "specialist", "Local exchange ramps."],
  ],
  thailand: [
    ["Bangkok Bank / Kasikorn / SCB / Krungthai", "retail", "Hard without proper residence/work status."],
    ["Bitkub THB rails", "specialist", "Major licensed digital-asset exchange on-off."],
  ],
  malaysia: [
    ["Maybank / CIMB / Public Bank / RHB", "retail", "Mixed; Islamic-finance product filters may apply."],
    ["Luno / Tokenize / SC-approved exchange MYR rails", "specialist", "Approved digital-asset venues for MYR."],
  ],
  indonesia: [
    ["BCA / Mandiri / BRI / BNI", "retail", "Hard for foreigners without KITAS; limited crypto products."],
    ["Tokocrypto / Indodax / Pintu IDR rails", "specialist", "Main local exchange ramps."],
  ],
  philippines: [
    ["BDO / BPI / Metrobank", "retail", "Traditional banks; e-wallets often more practical."],
    ["GCash / Maya", "emi", "Dominant e-money rails; crypto adjacency varies."],
    ["Coins.ph / PDAX", "specialist", "BSP VASP rails for crypto + remittance."],
  ],
  kazakhstan: [
    ["Halyk / Kaspi / Forte", "retail", "Selective; mining clients need contracts."],
    ["AIFC banking participants", "specialist", "English-law zone banks/fintechs for institutional stacks."],
  ],
  brazil: [
    ["Nubank / C6 / Inter", "neo", "Major digital banks; crypto policy evolves."],
    ["Itaú / Bradesco / Banco do Brasil / Santander BR", "retail", "Large banks — VASP clients need BCB-path story."],
    ["Mercado Bitcoin / Foxbit BRL + Pix rails", "specialist", "Primary crypto BRL on-off via Pix."],
  ],
  argentina: [
    ["Mercado Pago / Ualá / digital wallets", "emi", "More practical than traditional banks for many users."],
    ["Galicia / Santander AR / BBVA AR", "retail", "FX controls and crypto SOF make classic banking complex."],
    ["Lemon / Ripio / Belo rails", "specialist", "Consumer crypto apps as primary ramps."],
  ],
  chile: [
    ["Banco de Chile / Santander CL / Bci / Estado", "retail", "Selective crypto SOF."],
    ["Buda.com CLP rails", "specialist", "Major local exchange on-off."],
  ],
  colombia: [
    ["Bancolombia / Davivienda / Banco de Bogotá", "retail", "Mixed; fintechs help."],
    ["Nequi / Daviplata", "emi", "Mobile wallets for daily float."],
    ["Buda / P2P COP rails", "specialist", "Exchange and P2P depth."],
  ],
  peru: [
    ["BCP / Interbank / BBVA PE / Scotiabank PE", "retail", "Conservative on crypto."],
    ["Yape / Plin", "emi", "Mobile payments culture."],
    ["Regional exchange PEN rails", "specialist", "Thinner than BR/CL."],
  ],
  uruguay: [
    ["BROU / Itaú UY / Santander UY / Scotiabank UY", "retail", "Selective but often approachable with clean SOF."],
    ["Regional exchange rails", "specialist", "Smaller local CEX density."],
  ],
  panama: [
    ["Banco General / Banistmo / Multibank / BAC", "retail", "KYC-heavy; pure crypto narratives often fail."],
    ["MMG / private banks", "private", "Selective private banking."],
    ["Regional exchange + US EMI multi-rail", "specialist", "Common founder stack when local banks refuse."],
  ],
  "el-salvador": [
    ["Banco Agrícola / Cuscatlán / Davivienda SV", "retail", "Selective; dollarized system helps once onboarded."],
    ["Chivo / Lightning wallets", "specialist", "Policy-era rails; verify live status post-reforms."],
    ["Strike / regional ramps", "specialist", "Cross-border Lightning/fiat tools used by some residents."],
  ],
  paraguay: [
    ["Itaú PY / Continental / Vision / GNB", "retail", "Conservative; plan multi-rail early."],
    ["Regional exchange + Argentine/Brazilian apps", "specialist", "Common cross-border ramps."],
  ],
  "costa-rica": [
    ["BAC / BCR / National Bank / Scotiabank CR", "retail", "Mixed; Spanish docs and SOF required."],
    ["SINPE Móvil rails", "emi", "Domestic instant payments culture."],
    ["Foreign EMI + US exchange multi-rail", "specialist", "Common for crypto founders."],
  ],
  guatemala: [
    ["Industrial / G&T / Banrural / BAM", "retail", "Hard crypto SOF."],
    ["Foreign EMI multi-rail", "emi", "Often primary for crypto founders."],
  ],
  georgia: [
    ["Bank of Georgia / TBC Bank", "retail", "Most practical local banks; crypto SOF still required but more familiar than many EU banks."],
    ["Liberty Bank", "retail", "Retail alternative."],
    ["Wise / Revolut multi-rail", "emi", "Common backup for international founders."],
  ],
  japan_alias: null,
  israel: [
    ["Bank Hapoalim / Leumi / Discount / Mizrahi", "retail", "Historically uneven crypto banking; long DD."],
    ["Pepper / digital channels", "neo", "Digital arms — policy varies."],
    ["Local exchange ILS rails", "specialist", "Supervised platforms for on-off."],
  ],
  "south-africa": [
    ["Standard Bank / FNB / Absa / Nedbank / Capitec", "retail", "Mixed after de-risking cycles; FICA SOF essential."],
    ["TymeBank / digital", "neo", "Consumer digitals."],
    ["Luno / VALR ZAR rails", "specialist", "Main crypto ZAR on-off."],
  ],
  mauritius: [
    ["MCB / SBM / Absa MU", "retail", "Selective; licence + substance open doors."],
    ["AfrAsia / private banks", "private", "Private banking with high DD."],
    ["VAITOS VASP corridors", "specialist", "Licensed virtual-asset service banking narratives."],
  ],
  kenya: [
    ["Equity / KCB / Co-op / NCBA", "retail", "Mixed; mobile money often more important."],
    ["M-Pesa (Safaricom)", "emi", "Dominant cash-in/out culture for retail."],
    ["Local P2P / exchange KES rails", "specialist", "Primary crypto ramps."],
  ],
  mexico: [
    ["BBVA México / Banorte / Santander MX / Citibanamex", "retail", "Large banks — crypto SOF and CNBV/fintech-law narrative matter."],
    ["Nu México / Ualá / digital banks", "neo", "Digital retail; policy on crypto income still selective."],
    ["Bitso / other fintech-law platforms MXN rails", "specialist", "Primary MXN crypto on-off for many users."],
  ],
  norway: [
    ["DNB / Nordea NO / SpareBank 1", "retail", "Nordic majors — cautious on pure crypto SOF."],
    ["Sbanken / digital channels", "neo", "Consumer digitals; crypto income scrutiny."],
    ["Firi / NBX NOK rails", "specialist", "Local exchange on-off for retail."],
  ],
  ukraine: [
    ["PrivatBank / monobank / Oschadbank", "retail", "Wartime ops and SOF scrutiny; practical for residents with clean docs."],
    ["monobank / neo apps", "neo", "Popular digital banking UX."],
    ["WhiteBIT / Kuna UAH rails", "specialist", "Local exchange corridors when available."],
  ],
  ghana: [
    ["GCB / Ecobank / Absa GH / Stanbic", "retail", "Selective; mobile money often more practical day-to-day."],
    ["MTN MoMo / Vodafone Cash", "emi", "Dominant mobile-money rails for retail cash conversion."],
    ["Local P2P / exchange GHS rails", "specialist", "Primary crypto ramps — verify authorization."],
  ],
  nigeria: [
    ["GTBank / Access / Zenith / FirstBank", "retail", "Historically difficult for pure crypto; policies shift with CBN stance."],
    ["OPay / PalmPay / Flutterwave rails", "emi", "Fintech/e-money layer often more usable than classic banks."],
    ["Quidax / Bundle / local exchange NGN rails", "specialist", "Registered/local venues where available — verify live lists."],
  ],
  singapore_alias: null,
};

// Aliases for browser short ids
LAW_CRYPTO_BANKS.usa = LAW_CRYPTO_BANKS["united-states"];
LAW_CRYPTO_BANKS.uk = LAW_CRYPTO_BANKS["united-kingdom"];
LAW_CRYPTO_BANKS.uae = LAW_CRYPTO_BANKS["united-arab-emirates"];
LAW_CRYPTO_BANKS.mx = LAW_CRYPTO_BANKS.mexico;
LAW_CRYPTO_BANKS.no = LAW_CRYPTO_BANKS.norway;
LAW_CRYPTO_BANKS.ua = LAW_CRYPTO_BANKS.ukraine;
LAW_CRYPTO_BANKS.ng = LAW_CRYPTO_BANKS.nigeria;

/**
 * Illustrative local crypto industry startups / scale-ups per jurisdiction.
 * Columns: name · category · focus · description
 * Not complete, not endorsed, not investment advice — ecosystems change; verify HQ and licence status live.
 */
const LAW_CRYPTO_STARTUPS = {
  "united-states": {
    scene: "Deepest crypto startup market: exchanges, custody, infra, on-chain apps, policy shops.",
    rows: [
      ["Coinbase", "Exchange (public)", "Retail/institutional trading", "US-regulated perimeter; major public co"],
      ["Kraken", "Exchange", "Spot & services", "Long-standing US-facing brand"],
      ["Gemini", "Exchange / custody", "NY-focused compliance", "Winklevoss-founded"],
      ["Ripple", "Payments / infra", "Cross-border rails", "Enterprise crypto payments"],
      ["Circle", "Stablecoin / infra", "USDC issuer stack", "Regulated stablecoin narrative"],
      ["Chainalysis", "Analytics / compliance", "On-chain investigation", "Enterprise & government clients"],
      ["Anchorage Digital", "Custody / bank", "Qualified custody", "Crypto-native banking charter themes"],
      ["Strike", "Payments", "Lightning / remittance", "BTC payment app"],
    ],
  },
  canada: {
    scene: "Strong exchange + mining + fintech overlap; provincial securities registration matters.",
    rows: [
      ["Wealthsimple Crypto", "Broker / fintech", "Retail crypto access", "Embedded in major fintech brand"],
      ["Coinsquare / Coinsmart-class", "Exchange", "CAD markets", "Local registered venues evolve — verify"],
      ["Bitbuy", "Exchange", "Retail CAD", "Part of larger fintech groups historically"],
      ["WonderFi ecosystem", "Exchange roll-up", "Multi-brand Canada", "Public-market consolidator themes"],
      ["Newton", "Exchange", "Retail", "CAD on-ramps"],
    ],
  },
  "united-kingdom": {
    scene: "London fintech + FCA-registered crypto firms; promotions regime shapes go-to-market.",
    rows: [
      ["Revolut (crypto feature)", "Fintech / super-app", "In-app crypto", "Not a pure crypto startup; huge distribution"],
      ["Zodia Custody", "Custody", "Institutional", "Standard Chartered-backed narrative"],
      ["Copper", "Custody / clearing", "Prime services", "Institutional infra"],
      ["Blockchain.com", "Wallet / exchange", "Consumer + data", "London roots / global ops"],
      ["Elliptic", "Analytics", "Compliance", "UK crypto intelligence"],
      ["Checkout.com (crypto adjacency)", "Payments", "Merchant rails", "Fintech scale with crypto touchpoints"],
    ],
  },
  switzerland: {
    scene: "Crypto Valley (Zug/Zurich): banks, custody, tokenisation, association self-reg history.",
    rows: [
      ["SEBA Bank", "Crypto bank", "Banking + trading", "FINMA-supervised crypto bank"],
      ["Sygnum", "Crypto bank", "Digital asset banking", "Institutional focus"],
      ["Bitcoin Suisse", "Broker / services", "Brokerage & custody themes", "Long-standing CH brand"],
      ["Taurus", "Infra / tokenisation", "Capital markets infra", "Bank partnerships"],
      ["Alea / Metaco-class", "Custody tech", "Banking infrastructure", "Enterprise custody software"],
      ["Relai", "App / broker", "Retail BTC app", "Swiss consumer brand"],
    ],
  },
  norway: {
    scene: "Smaller Nordic scene; fintech + mining-energy adjacency historically.",
    rows: [
      ["Firi", "Exchange", "Nordic retail", "Local exchange brand"],
      ["K33 (formerly Arcane)", "Research / broker", "Nordic crypto markets", "Public-market Nordic player"],
      ["NBX", "Exchange", "Norwegian exchange", "Local venue narrative"],
    ],
  },
  georgia: {
    scene: "Mining + exchange culture; lean startup costs; rules evolve yearly.",
    rows: [
      ["Cryptal", "Exchange", "GEL/crypto retail & OTC", "Tbilisi-based exchange known to local traders — verify current licence status"],
      ["Adrodex", "Exchange", "Spot trading", "Georgian exchange brand; check live registration"],
      ["Bitcoin.ge / community desks", "OTC / education", "Local BTC market making & meetups", "Community-facing rails more than unicorn apps"],
      ["Bitfury (historic regional footprint)", "Mining / infra", "Mining tech & data centres", "Major mining-tech name historically tied to the region — ops evolve"],
      ["Tbilisi Web3 studios", "Services", "Dev shops & freelancers", "Lean builder base serving EU/remote clients"],
    ],
  },
  ukraine: {
    scene: "World-class talent; many teams remote/global HQ; wartime ops constraints.",
    rows: [
      ["WhiteBIT", "Exchange", "CEX", "Major UA-associated exchange brand"],
      ["Kuna", "Exchange", "Local markets", "Long-running UA brand — verify status"],
      ["Everstake", "Staking / infra", "Validators", "UA-rooted staking provider"],
      ["Distributed Labs / hacker houses", "Infra / education", "Developer ecosystem", "Strong engineering culture"],
    ],
  },
  germany: {
    scene: "BaFin-era crypto banks/custody + MiCA CASP transition; serious engineering.",
    rows: [
      ["Bitpanda", "Broker / exchange", "Retail multi-asset", "Vienna HQ; strong DE distribution"],
      ["Trade Republic (crypto feature)", "Broker", "In-app crypto", "Neobroker scale"],
      ["Nuri / former Bitwala alumni", "Banking / crypto", "Legacy neo-bank crypto", "Market reshuffled — check survivors"],
      ["Tangany", "Custody", "BaFin custody themes", "Institutional custody tech"],
      ["Blockpit", "Tax software", "Crypto tax", "DACH compliance tooling"],
      ["Bottlepay / Lightning startups", "Payments", "Lightning rails", "EU payments experiments"],
    ],
  },
  france: {
    scene: "PSAN → MiCA CASP pipeline; strong Paris fintech + public investment funds.",
    rows: [
      ["Ledger", "Hardware wallet", "Self-custody devices", "Global consumer brand from FR"],
      ["Sorare", "NFT / gaming", "Fantasy sports NFTs", "Consumer crypto app scale"],
      ["Kaiko", "Data", "Market data", "Institutional crypto data"],
      ["Coinhouse", "Broker / services", "FR retail", "PSAN-era brand"],
      ["Flowdesk", "Market making", "Liquidity services", "FR crypto market maker"],
      ["Meria / Deskoin-class", "Broker", "Retail FR", "Local brokers — verify licences"],
    ],
  },
  italy: {
    scene: "Growing fintech; many teams serve EU with IT talent; CASP transition.",
    rows: [
      ["Young Platform", "Exchange", "IT retail", "Italian exchange brand"],
      ["The Rock Trading (legacy)", "Exchange", "Historic IT venue", "Verify current status"],
      ["Conio", "Wallet / services", "Mobile BTC", "Italian consumer app"],
      ["CheckSig", "Custody / services", "IT custody themes", "Local regulated narrative"],
      ["Cryptosmart / local brokers", "Broker", "Retail", "Verify OAM/MiCA status live"],
    ],
  },
  spain: {
    scene: "Barcelona/Madrid fintech; CNMV culture; tourism + remittance experiments.",
    rows: [
      ["Bit2Me", "Exchange / services", "ES retail + cards", "Major Spanish brand"],
      ["Criptan", "App / broker", "Retail ES", "Local consumer app"],
      ["Eurocoinpay", "Payments", "Merchant crypto pay", "ES payments experiments"],
      ["Onyze", "Custody", "Institutional custody", "Spanish custody startup"],
    ],
  },
  portugal: {
    scene: "Lisbon hub era attracted remote founders; product cos + exchanges thinner than FR/DE.",
    rows: [
      ["Utrust (UTK)", "Payments", "Crypto merchant payments", "Portuguese-founded payments protocol; brand/ops evolved — verify live entity"],
      ["RealFevr", "NFT / sports", "Digital collectibles", "Lisbon-area consumer NFT brand"],
      ["Fasthouse / local Web3 studios", "Services", "Product studios", "Remote-first teams using PT as EU lifestyle base"],
      ["Bit2Me / EU CASP access", "Exchange access", "EUR retail via ES/EU platforms", "Many PT users trade on Iberian/EU CASPs — check CMVM/ESMA lists"],
      ["BTCPay / tourism merchant tools", "Merchant tools", "BTC accept in tourism corridors", "Community rails more than large funded startups"],
    ],
  },
  netherlands: {
    scene: "Strong fintech + AFM/DNB perimeter; English-friendly HQ city.",
    rows: [
      ["Bitvavo", "Exchange", "EU retail", "Major NL exchange"],
      ["DERIBIT (historically NL)", "Derivatives", "Options/futures", "Global venue with NL roots — verify HQ"],
      ["Bitonic", "Broker", "BTC broker NL", "Long-standing Dutch brand"],
      ["Mollie (crypto adjacency)", "Payments", "Merchant acquiring", "Fintech scale"],
    ],
  },
  ireland: {
    scene: "English EU HQ for multinationals; fewer pure crypto unicorns, many EU ops offices.",
    rows: [
      ["Coinbase (EU/IE entities)", "Exchange ops", "EU corporate & compliance seats", "Major US exchange uses Ireland for EU packaging — check live registers"],
      ["Kraken (EU presence)", "Exchange ops", "EU services entity themes", "International CEX with IE/EU footprint"],
      ["Circle (EU ops themes)", "Stablecoin / infra", "USDC issuer European entities", "Verify which legal entities are actually Irish-regulated"],
      ["Stripe (crypto adjacency)", "Payments", "Merchant + stablecoin experiments", "Dublin-scale fintech with occasional crypto rails"],
      ["Dublin Web3 / fintech studios", "Services", "Build & compliance shops", "Strong English-speaking talent for EU GTM"],
    ],
  },
  luxembourg: {
    scene: "Fund domicile + tokenisation experiments; institutional more than consumer apps.",
    rows: [
      ["Tokeny", "Tokenisation", "Security tokens", "LU capital-markets infra"],
      ["Fund tokenization platforms", "Funds / infra", "CSSF-adjacent", "Multiple boutique issuers"],
      ["Bank crypto desks", "Banking", "Private bank crypto", "Incumbent banks more than startups"],
    ],
  },
  estonia: {
    scene: "e-Residency + former VASP boom; post-cleanup MiCA era — fewer licence mills.",
    rows: [
      ["Change", "App / broker", "Retail EU", "Estonian-founded consumer app"],
      ["Guardtime (adjacency)", "Infra / security", "KSI blockchain roots", "Enterprise security"],
      ["Local CASP rebuilds", "CASP", "MiCA packaging", "Verify FIU/FSA lists — market reshaped"],
    ],
  },
  austria: {
    scene: "Vienna fintech; Bitpanda as regional champion.",
    rows: [
      ["Bitpanda", "Broker / exchange", "Multi-asset retail", "AT unicorn-scale brand"],
      ["Coinfinity", "Broker / ATM", "BTC broker + ATMs", "Austrian retail rails"],
      ["Morpher / local DeFi tools", "Trading / DeFi", "App experiments", "Smaller AT startups"],
    ],
  },
  belgium: {
    scene: "Smaller market; EU institutions adjacency; fintech more than pure crypto unicorns.",
    rows: [
      ["Keyrock", "Market making", "Liquidity", "BE crypto market maker"],
      ["Hex Trust / regional presence", "Custody", "Asia-EU custody", "Regional firms with BE links"],
      ["Local fintech studios", "Services", "Web3 build", "Brussels/Antwerp talent"],
    ],
  },
  "czech-republic": {
    scene: "Historic mining/exchange culture; competitive CoL for EU builders.",
    rows: [
      ["General Bytes", "ATM manufacturer", "BTC ATM hardware", "Global ATM OEM from CZ"],
      ["SatoshiLabs (Trezor)", "Hardware wallet", "Trezor devices", "Global self-custody brand"],
      ["Braiins (Slush Pool)", "Mining software", "Pool & firmware", "Mining infra pioneer"],
      ["Coinmate / Anycoin-class", "Exchange", "Local CZK markets", "Regional exchanges — verify"],
    ],
  },
  denmark: {
    scene: "Small advanced market; fintech compliance culture.",
    rows: [
      ["Coinify (legacy / ownership changes)", "Payments / broker", "Merchant crypto", "Historic DK brand — verify status"],
      ["Local fintech + Web3 studios", "Services", "Build & compliance", "Copenhagen scene"],
      ["Nordic exchange access", "Exchange", "via SE/NO platforms", "Cross-Nordic retail common"],
    ],
  },
  finland: {
    scene: "Strong engineering; smaller pure-crypto market cap; historic P2P roots.",
    rows: [
      ["Coinmotion", "Exchange / broker", "FI retail crypto", "Finnish registered broker/exchange brand"],
      ["Northcrypto", "Exchange", "Nordic retail", "Finnish venue serving local markets"],
      ["LocalBitcoins (legacy)", "P2P (historic)", "Global P2P BTC", "Helsinki-founded pioneer — marketplace wound down; talent remains"],
      ["Supercell / game cos (adjacency)", "Gaming", "Helsinki game talent → Web3 experiments", "Game industry crossover more than pure crypto unicorns"],
      ["Nordic tax/AML tooling", "Regtech", "Reporting & compliance", "B2B tools for FI/SE users"],
    ],
  },
  greece: {
    scene: "Growing Athens fintech; tourism experiments; thinner institutional stack.",
    rows: [
      ["Viva Wallet (fintech adjacency)", "Payments / EMI", "Merchant acquiring", "Major Greek fintech — not a pure crypto co, but key payments rail"],
      ["Coinbase / Bitpanda users via EU", "Exchange access", "EUR retail", "Many GR users on EU platforms — check HCMC/ESMA CASP lists"],
      ["Local MiCA CASP applicants", "CASP / broker", "GR retail packaging", "Verify Hellenic Capital Market Commission registers for live names"],
      ["Tourism BTCPay merchants", "Merchant tools", "Islands & Athens hospitality", "Seasonal acceptance experiments"],
      ["Shipping-family treasury experiments", "Corporate BTC", "Balance-sheet pilots", "Traditional industry adjacency more than VC startups"],
    ],
  },
  poland: {
    scene: "Large engineering talent; active retail; KNF/MiCA path.",
    rows: [
      ["Zonda (formerly BitBay)", "Exchange", "PL retail", "Major Polish exchange brand"],
      ["Binance PL users via global", "Exchange access", "Retail", "Global platforms popular — licence care"],
      ["Local DeFi / NFT studios", "Web3", "Build teams", "Strong developer supply"],
      ["Tax/accounting SaaS", "Regtech", "Crypto tax PL", "Local compliance tools"],
    ],
  },
  sweden: {
    scene: "Fintech depth (Klarna-era talent); crypto more cautious post-cycles.",
    rows: [
      ["Safello", "Exchange / broker", "SE retail", "Listed Swedish crypto company"],
      ["Bitcoin Group / local brokers", "Broker", "Retail", "Verify FI status"],
      ["Northcrypto / Nordic apps", "App", "Retail Nordic", "Regional consumer apps"],
    ],
  },
  "united-arab-emirates": {
    scene: "Dubai/AD free-zone crypto hub: exchanges, VASP licensees, family offices.",
    rows: [
      ["Bybit (Dubai presence)", "Exchange", "Global CEX ops", "Major venue with UAE footprint"],
      ["Crypto.com (regional hub)", "Exchange / app", "Consumer super-app", "Regional HQ themes"],
      ["Rain", "Exchange", "GCC retail", "Bahrain/UAE-facing licensed narrative"],
      ["BitOasis", "Exchange", "MENA retail", "Regional exchange brand"],
      ["VARA-licensed startups", "VASP", "Dubai licencees", "Check VARA public register"],
      ["ADGM FSRA firms", "VASP / funds", "Abu Dhabi financial free zone", "Institutional stack"],
    ],
  },
  israel: {
    scene: "Cybersecurity + crypto security talent; banking historically hard.",
    rows: [
      ["Fireblocks", "Custody infra", "MPC / transfer security", "Global enterprise standard"],
      ["Simplex (legacy / Nuvei)", "On-ramp", "Card-to-crypto", "IL-founded payments"],
      ["Hexa / local Web3 funds", "VC / builders", "Early stage", "Active angel scene"],
      ["Blockchain security firms", "Security", "Audits & wallets", "Cyber-export culture"],
    ],
  },
  japan: {
    scene: "Registered exchanges dominate; strict marketing; enterprise blockchain pilots.",
    rows: [
      ["bitFlyer", "Exchange", "JP retail", "Major registered exchange"],
      ["bitbank", "Exchange", "JP retail", "Registered venue"],
      ["Coincheck", "Exchange", "JP retail", "Monex Group"],
      ["GMO Coin", "Exchange", "JP retail", "Internet conglomerate"],
      ["Liquid / legacy brands", "Exchange", "Historic", "Market reshuffled — verify"],
      ["Double Jump.Tokyo", "Gaming / NFT", "Blockchain games", "JP game × crypto"],
    ],
  },
  singapore: {
    scene: "APAC HQ city: exchanges, funds, MAS-licensed DPT providers, family offices.",
    rows: [
      ["Crypto.com (ops)", "Exchange / app", "Consumer", "Significant SG presence historically"],
      ["Coinhako", "Exchange", "SG retail", "Local brand"],
      ["Independent Reserve (regional)", "Exchange", "APAC", "Regional venue access"],
      ["Triple-A", "Payments", "Merchant crypto pay", "SG payments startup"],
      ["MAS-licensed DPT startups", "DPT services", "Licensed perimeter", "Check MAS licence list"],
      ["Fund managers / HVFZO", "Funds", "Digital asset funds", "Family office adjacency"],
    ],
  },
  "hong-kong": {
    scene: "Re-opened VA platform regime; China-adjacent capital; expensive talent.",
    rows: [
      ["OSL", "Licensed platform", "SFC VATP", "HashKey/OSL-class licensed venues"],
      ["HashKey Exchange", "Licensed platform", "SFC VATP", "Retail reopening cohort"],
      ["Animoca Brands", "Web3 / gaming", "NFT & games", "Major HK Web3 investor-builder"],
      ["BC Group / platforms", "Exchange group", "Asia digital assets", "Listed digital asset group"],
    ],
  },
  australia: {
    scene: "AUSTRAC DCE culture; strong retail; mining less than CA historically.",
    rows: [
      ["Independent Reserve", "Exchange", "AU retail", "Long-standing AU exchange"],
      ["Swyftx", "Exchange", "Retail AU", "Consumer brand"],
      ["CoinSpot", "Exchange", "Retail AU", "Popular local venue"],
      ["BTC Markets", "Exchange", "AU markets", "Local exchange"],
      ["Digital Surge", "Exchange", "Retail", "AU venue"],
    ],
  },
  "new-zealand": {
    scene: "Small market; AU platforms + local brokers.",
    rows: [
      ["Easy Crypto", "Broker / app", "NZ/AU retail", "Consumer on-ramp brand"],
      ["Independent Reserve access", "Exchange", "Regional", "AU venue used by Kiwis"],
      ["Local Web3 studios", "Services", "Build teams", "Small but active"],
    ],
  },
  "south-korea": {
    scene: "Huge retail; real-name exchanges; gaming/NFT adjacency.",
    rows: [
      ["Upbit", "Exchange", "KR retail", "Dominant local volume"],
      ["Bithumb", "Exchange", "KR retail", "Major venue"],
      ["Coinone", "Exchange", "KR retail", "Local exchange"],
      ["Korbit", "Exchange", "KR retail", "Early KR exchange"],
      ["Dunamu (Upbit parent)", "Fintech group", "Exchange + services", "Conglomerate-scale"],
    ],
  },
  taiwan: {
    scene: "Hardware + exchange culture; FSC VAS rules.",
    rows: [
      ["MAX / MaiCoin", "Exchange", "TW retail", "Local exchange group"],
      ["BitoPro", "Exchange", "TW retail", "Local venue"],
      ["ACE Exchange", "Exchange", "TW retail", "Local brand"],
      ["Hardware / mining suppliers", "Hardware", "Components", "TW electronics adjacency"],
    ],
  },
  thailand: {
    scene: "SEC-licensed digital asset operators; tourism + retail.",
    rows: [
      ["Bitkub", "Exchange", "TH retail", "Major Thai exchange"],
      ["Satang Pro", "Exchange", "TH retail", "Local venue"],
      ["Zipmex (regional / restructuring themes)", "Exchange", "SEA", "Verify live status carefully"],
      ["Local brokers under SEC", "Broker", "Digital assets", "Check SEC Thailand lists"],
    ],
  },
  malaysia: {
    scene: "SC-approved digital asset exchanges only for formal trading.",
    rows: [
      ["Luno Malaysia", "Exchange", "MY retail", "Regional brand with MY presence"],
      ["Tokenize Xchange", "Exchange", "MY", "SC-oriented venue narrative"],
      ["SINEGY", "Exchange", "MY", "Local exchange brand"],
      ["Hata / other SC-registered", "Exchange", "MY", "Verify SC register"],
    ],
  },
  indonesia: {
    scene: "Large retail; commodity/exchange rails; Bali lifestyle builders.",
    rows: [
      ["Tokocrypto", "Exchange", "ID retail", "Major local exchange"],
      ["Indodax", "Exchange", "ID retail", "Long-standing ID venue"],
      ["Pintu", "App / exchange", "Mobile retail", "Consumer brand"],
      ["Rekeningku / others", "Exchange", "ID", "Local venues — verify"],
    ],
  },
  philippines: {
    scene: "BSP VASPs; remittance + play-to-earn history; strong mobile use.",
    rows: [
      ["Coins.ph", "Wallet / VASP", "Remittance + crypto", "Major PH brand"],
      ["PDAX", "Exchange", "PH retail", "Local exchange"],
      ["Maya / GCash (adjacency)", "E-wallet", "Payments rails", "Not pure crypto; distribution"],
      ["Axie-era studios (residual)", "Gaming", "Web3 games", "Market cooled — talent remains"],
    ],
  },
  kazakhstan: {
    scene: "Mining + AIFC experiments; energy-linked operators.",
    rows: [
      ["Intebix", "Exchange", "KZ crypto trading", "Kazakh exchange brand — verify AIFC/national status live"],
      ["XCOEX", "Exchange / broker", "Multi-asset trading", "Platform with regional/KZ footprint themes"],
      ["Ataix", "Exchange", "Digital assets", "AIFC-oriented venue narrative — check live licence list"],
      ["Enegix / large mining hosts", "Mining", "Hosting & power contracts", "Industrial mining operators in energy regions"],
      ["Freedom Broker (adjacency)", "Brokerage", "Securities + digital-asset themes", "Large KZ broker group with product adjacency — not pure crypto"],
    ],
  },
  brazil: {
    scene: "Largest LatAm retail; BCB VASP track; Pix on-ramps.",
    rows: [
      ["Mercado Bitcoin", "Exchange", "BR retail", "Major local exchange"],
      ["Foxbit", "Exchange", "BR retail", "Local venue"],
      ["Bitso (BR presence)", "Exchange", "LatAm multi-country", "Regional scale"],
      ["MB / 2TM group products", "Exchange group", "Retail + services", "Ecosystem builder"],
      ["Local DeFi / NFT studios", "Web3", "Build teams", "SP/RJ talent"],
    ],
  },
  argentina: {
    scene: "Extremely high practical crypto usage; fintech + stablecoin culture.",
    rows: [
      ["Lemon Cash", "App / broker", "Retail AR", "Major consumer brand"],
      ["Belo", "App", "Retail / cards", "Consumer crypto fintech"],
      ["Ripio", "Exchange / services", "LatAm retail", "AR-founded regional player"],
      ["Buenbit", "App / broker", "Retail", "Local brand"],
      ["SatoshiTango", "Broker", "Retail", "Long-running AR brand"],
    ],
  },
  chile: {
    scene: "More institutional LatAm; CMF fintech law transition.",
    rows: [
      ["Buda.com", "Exchange", "CL/LatAm", "Major Chilean exchange"],
      ["CryptoMKT", "Exchange", "LatAm", "Regional venue"],
      ["Local fintech on-ramps", "Fintech", "CLP rails", "CMF transition cohort"],
    ],
  },
  colombia: {
    scene: "Active retail; Medellín/Bogotá tech; tax reporting culture.",
    rows: [
      ["Buda.com (CO)", "Exchange", "Regional", "Cross-Andean venue"],
      ["Local P2P platforms", "P2P", "COP markets", "High P2P usage"],
      ["Rappi / fintech adjacency", "Super-app", "Payments distribution", "Not pure crypto"],
    ],
  },
  peru: {
    scene: "Smaller formal market; regional platforms dominate.",
    rows: [
      ["Buda.com access", "Exchange", "Regional", "Cross-border LatAm venue"],
      ["Local P2P desks", "P2P", "PEN markets", "Informal depth"],
      ["Fintech remittance apps", "Remittance", "USD/PEN", "Crypto-adjacent rails"],
    ],
  },
  uruguay: {
    scene: "Smaller Southern Cone; fintech + residence-programme expats.",
    rows: [
      ["Regional exchange access", "Exchange", "via AR/BR platforms", "Thin pure-UY unicorn list"],
      ["Local fintech studios", "Services", "Build & compliance", "MVD scene"],
      ["BCU project participants", "Regtech / VASP", "Virtual-asset project", "Watch BCU registers"],
    ],
  },
  panama: {
    scene: "USD hub; exchanges + regional OTC; bank KYC is the bottleneck.",
    rows: [
      ["Cryptobuyer", "Payments / card", "Crypto cards & merchant pay", "LatAm brand with strong Central America / Panama corridor usage"],
      ["Xapo (historic PA roots)", "Wallet / bank (evolved)", "Self-custody → banking stack", "Early Panama-associated brand; now Gibraltar-regulated bank — ops moved"],
      ["Bitso / Ripio (serve PA users)", "Exchange access", "USD/LatAm retail", "Regional apps used by Panama residents when local CEX is thin"],
      ["Multibank Group (adjacency)", "Banking / FX", "Multi-asset financial group", "Panama financial group — not a pure crypto startup; KYC still heavy"],
      ["Free-zone fintech CSPs", "Services", "Entity + compliance packaging", "HoldCo/service layer; substance and banking remain the hard parts"],
    ],
  },
  "el-salvador": {
    scene: "BTC-branded startups + tourism; policy still evolves post-reform.",
    rows: [
      ["Chivo", "Wallet / public infra", "Government BTC/USD wallet", "Policy product from the legal-tender era — verify live status post-reforms"],
      ["Blink", "Lightning wallet", "BTC payments & remittances", "El Salvador–rooted Lightning wallet for everyday payments"],
      ["Strike", "Payments", "Lightning / fiat ramps", "Global BTC payments app with strong SV usage narrative"],
      ["Athena Bitcoin", "ATM / rails", "BTC ATMs & cash ramps", "ATM operator active across the region including SV"],
      ["IBEX Mercado", "Lightning / enterprise", "Payment infra for businesses", "Lightning infrastructure company with LatAm focus"],
      ["Surf City merchant tools", "Merchant tools", "Tourism BTC accept", "Hospitality corridor experiments more than large VC startups"],
    ],
  },
  paraguay: {
    scene: "Mining-heavy narrative; thinner consumer app layer.",
    rows: [
      ["Private hydro mining operators", "Mining", "Cheap power → hash", "Industry is mostly private farms, not public consumer apps — contracts matter"],
      ["Ripio / Lemon (regional access)", "Exchange access", "ARS/USD/USDT retail", "Argentine apps commonly used by PY residents for on-off"],
      ["Mercado Bitcoin / Foxbit access", "Exchange access", "BRL corridor", "Brazilian venues used for cross-border ramps"],
      ["OTC mining payout desks", "OTC", "Hash → USDT/USD", "B2B desks settle miner revenue; names change — use referrals + escrow care"],
      ["Asunción fintech freelancers", "Services", "Compliance & ops support", "Service layer for mining cos more than product unicorns"],
    ],
  },
  "costa-rica": {
    scene: "Lifestyle base; builders often serve US/LatAm remotely.",
    rows: [
      ["Bitcoin Jungle / community projects", "Community / payments", "Local BTC circular economy", "Guanacaste-area community experiments — not a VC unicorn"],
      ["Bitso / Ripio (regional apps)", "Exchange access", "MXN/USD/LatAm retail", "Most CR users rely on regional or global apps"],
      ["Cryptobuyer", "Payments / card", "Crypto cards in LatAm", "Used in Central America for spend-out"],
      ["Remote Web3 studios (SJO/beach)", "Services", "Dev shops for US clients", "CR as life base; product companies often US/EU-incorporated"],
      ["BTCPay tourism merchants", "Merchant tools", "Hospitality accept BTC", "Beach-town and digital-nomad corridor niches"],
    ],
  },
  guatemala: {
    scene: "Thin formal startup layer; remittance culture.",
    rows: [
      ["Airtm", "P2P / remittance", "USD balance & cash-out", "Regional P2P platform popular for LatAm dollar rails"],
      ["Bitso / Lemon (access)", "Exchange access", "Cross-border retail", "Few pure-GT CEX brands; users go regional"],
      ["Tigo Money / Banrural adjacency", "Mobile money / bank", "Domestic cash rails", "Not crypto startups — the practical cash layer remittances hit first"],
      ["Local OTC / Telegram desks", "OTC", "GTQ/USDT", "Informal depth; counterparty risk is the product"],
      ["Remittance fintechs (crypto-adjacent)", "Remittance", "US→GT corridors", "Some use stablecoins under the hood — verify licences"],
    ],
  },
  mexico: {
    scene: "Large Spanish LatAm market; fintech law; Bitso as regional champion.",
    rows: [
      ["Bitso", "Exchange", "MX + LatAm retail", "Largest Mexican crypto exchange; fintech-law era brand"],
      ["Volabit", "Exchange / broker", "MX retail", "Long-standing Mexican on-ramp brand"],
      ["GBTC / local brokers (verify)", "Broker", "MXN markets", "Smaller local venues — check CNBV/fintech registers"],
      ["Kollider / Lightning experiments", "Trading / Lightning", "Derivatives & payments experiments", "Builder scene with MX presence themes"],
      ["Mercado Libre / fintech adjacency", "Super-app", "Payments distribution", "Not pure crypto; massive MX distribution layer"],
    ],
  },
  belize: {
    scene: "Offshore services / IFSC tradition more than consumer apps.",
    rows: [
      ["IFSC digital-asset service cos", "VASP / services", "Licence packaging", "Check IFSC registers"],
      ["CSP-enabled exchange entities", "Entity services", "HoldCo + VASP", "Substance required"],
      ["Regional OTC", "OTC", "USD", "Thin local consumer brands"],
    ],
  },
  jamaica: {
    scene: "BOJ sandbox history; remittance; limited unicorn density.",
    rows: [
      ["Local fintech / sandbox alumni", "Fintech", "Payments experiments", "Verify live products"],
      ["Remittance apps", "Remittance", "USD/JMD", "Crypto-adjacent"],
      ["Regional exchange access", "Exchange", "via global", "Thin pure-JM CEX list"],
    ],
  },
  nicaragua: {
    scene: "Very thin formal crypto startup market.",
    rows: [
      ["P2P / OTC individuals", "P2P", "Local OTC", "Informal"],
      ["Regional platforms", "Exchange access", "Cross-border", "Few local brands"],
      ["Remittance tools", "Remittance", "USD", "Crypto-adjacent"],
    ],
  },
  "trinidad-and-tobago": {
    scene: "Energy economy; limited formal crypto startups.",
    rows: [
      ["Local fintech experiments", "Fintech", "Payments", "Early stage"],
      ["Regional exchange access", "Exchange", "via global", "Thin local CEX"],
      ["Energy-sector digital pilots", "Enterprise", "Tokenisation talk", "Mostly exploratory"],
    ],
  },
  "south-africa": {
    scene: "Most mature Africa crypto startup scene; FSCA perimeter.",
    rows: [
      ["Luno", "Exchange / app", "ZA + global", "Major Africa-founded brand"],
      ["VALR", "Exchange", "ZA retail", "Local exchange"],
      ["Ovex", "Exchange / OTC", "ZA", "Local venue / OTC"],
      ["AltCoinTrader", "Exchange", "ZA retail", "Local brand"],
      ["IceCUBE / mining adjacency", "Mining services", "Hosting", "Regional mining services"],
    ],
  },
  mauritius: {
    scene: "Licensed VASP hub; funds more than consumer apps.",
    rows: [
      ["FSC VAITOS licensees", "VASP", "Licensed virtual-asset services", "Use the Financial Services Commission public register for live company names"],
      ["Absa / MCB digital-asset desks (adjacency)", "Banking adjacency", "Selective institutional rails", "Incumbent banks more than consumer startups"],
      ["Fund admins (digital assets)", "Funds", "Admin + custody packaging", "Institutional fund stack for tokenised products"],
      ["CSP licence packages", "Services", "Entity + VASP packaging", "Substance and real directors required — not a product startup list"],
    ],
  },
  seychelles: {
    scene: "Historic incorporation hub for global CEXs; local consumer market tiny.",
    rows: [
      ["Binance / historic CEX HoldCos", "Exchange HoldCo", "Offshore incorporation history", "Many global brands used SC entities — actual ops are elsewhere"],
      ["KuCoin / other CEX entities (historic)", "Exchange HoldCo", "Entity packaging", "Verify FSA registers; do not confuse incorporation with local product market"],
      ["Local FSA VASP licensees", "VASP", "Licensed service cos", "Check Seychelles FSA lists for current names"],
      ["CSP formation houses", "Services", "Company + nominee packages", "Service industry, not consumer crypto apps"],
    ],
  },
  kenya: {
    scene: "Nairobi fintech + M-Pesa adjacency; strong builder culture.",
    rows: [
      ["AZA Finance (ex-BitPesa)", "Payments / FX", "Cross-border B2B payments", "Kenya-rooted crypto-era FX pioneer evolved into licensed payments"],
      ["Binance P2P / local ramps", "P2P / ramp", "KES markets", "High mobile + P2P usage — counterparty and policy risk"],
      ["Chipper Cash (adjacency)", "Fintech", "Pan-African payments", "Not pure crypto; major distribution narrative in the region"],
      ["Nairobi Web3 studios", "Services", "Build teams & education", "Strong engineering/community scene"],
      ["M-Pesa mini-app experiments", "Fintech", "Mobile-money plugins", "Crypto-adjacent rails ride Safaricom distribution"],
    ],
  },
  ghana: {
    scene: "Accra fintech; regulatory progress; thinner pure-crypto unicorns.",
    rows: [
      ["Maviance / mobile-money fintechs", "Fintech", "Payments & bill pay", "Distribution layer more than pure crypto"],
      ["Yellow Card (regional access)", "Exchange / ramp", "Africa on-off ramps", "Pan-African ramp used across West/East Africa — verify GH availability"],
      ["Local P2P desks", "P2P", "GHS/USDT", "Informal depth; verify any BoG authorization claims"],
      ["Accra builder communities", "Community / services", "Education & freelancers", "Early ecosystem, talent-forward"],
    ],
  },
  botswana: {
    scene: "Small market; policy experiments; regional access.",
    rows: [
      ["Regional platform users", "Exchange access", "via ZA/global", "Thin local CEX brands"],
      ["Fintech pilots", "Fintech", "Payments", "Early stage"],
      ["Mining / diamond digital talk", "Enterprise", "Tokenisation concepts", "Mostly exploratory"],
    ],
  },
  rwanda: {
    scene: "Policy innovation narrative; Kigali fintech; thin pure-crypto layer.",
    rows: [
      ["Fintech sandboxes alumni", "Fintech", "Payments", "Government-friendly pilots"],
      ["Regional exchange access", "Exchange", "via global/KE", "Few local CEX brands"],
      ["Blockchain for gov pilots", "Enterprise / govtech", "Land/registry experiments", "Public-sector adjacency"],
    ],
  },
  uganda: {
    scene: "Mobile money first; P2P crypto; thin formal startups.",
    rows: [
      ["P2P trading communities", "P2P", "UGX markets", "Informal depth"],
      ["Local fintech wallets", "Fintech", "Mobile money", "Crypto-adjacent"],
      ["Regional platforms", "Exchange access", "Cross-border", "Few pure-UG CEX brands"],
    ],
  },
  zambia: {
    scene: "Thin formal market; mining economy adjacency.",
    rows: [
      ["P2P / OTC", "P2P", "Local OTC", "Informal"],
      ["Regional exchange access", "Exchange", "via ZA/global", "Thin local brands"],
      ["Mining services talk", "Mining adjacency", "Power & extractives", "Exploratory"],
    ],
  },
  senegal: {
    scene: "Dakar fintech; WAEMU rails; thin pure-crypto startups.",
    rows: [
      ["Mobile-money fintechs", "Fintech", "XOF payments", "Distribution"],
      ["Francophone Web3 communities", "Community", "Builders", "Early"],
      ["Regional platforms", "Exchange access", "via global", "Thin local CEX"],
    ],
  },
  "cote-divoire": {
    scene: "Abidjan commercial hub; thin formal crypto startups.",
    rows: [
      ["Fintech / mobile money", "Fintech", "XOF", "Main digital rails"],
      ["P2P communities", "P2P", "Local OTC", "Informal"],
      ["Regional exchange access", "Exchange", "via global", "Thin local CEX"],
    ],
  },
  benin: {
    scene: "Very early ecosystem.",
    rows: [
      ["P2P traders", "P2P", "Local OTC", "Informal"],
      ["Regional platforms", "Exchange access", "Cross-border", "Few local brands"],
      ["Fintech pilots", "Fintech", "Payments", "Early"],
    ],
  },
  togo: {
    scene: "Very early ecosystem.",
    rows: [
      ["P2P traders", "P2P", "Local OTC", "Informal"],
      ["Regional platforms", "Exchange access", "Cross-border", "Few local brands"],
      ["Fintech pilots", "Fintech", "Payments", "Early"],
    ],
  },
  "cabo-verde": {
    scene: "Tourism + diaspora remittances; thin crypto startups.",
    rows: [
      ["Tourism payment experiments", "Payments", "Merchant BTC", "Seasonal"],
      ["Diaspora remittance apps", "Remittance", "EUR/CVE", "Crypto-adjacent"],
      ["Regional exchange access", "Exchange", "via global", "Thin local CEX"],
    ],
  },
};

/**
 * @returns {{ scene: string, rows: string[][], source: string }}
 */
function lawBuildCryptoStartups(j, seed = {}) {
  const lawId = j?.id || "";
  const alias = LAW_LOCAL_SERVICES_ALIASES[lawId] || lawId;
  const curated = LAW_CRYPTO_STARTUPS[alias] || LAW_CRYPTO_STARTUPS[lawId];
  // Prefer live curated named companies over seed stubs when both exist
  if (curated?.rows?.length) {
    return { scene: curated.scene || "", rows: curated.rows, source: "curated" };
  }
  if (seed.cryptoStartups?.rows?.length) {
    return { ...seed.cryptoStartups, source: "seed" };
  }
  const name = j?.name || "This market";
  const tags = j?.tags || [];
  const isMica = tags.includes("mica") || j?.region === "eu-mica";
  const rows = isMica
    ? [
        ["MiCA CASP applicants / licensees", "CASP / exchange", "EU crypto-asset services", "Check national NCA + ESMA CASP register for live names"],
        ["EU-passported platforms", "Exchange access", "Cross-border CASP", "Foreign CASPs may serve clients under passporting rules"],
        ["Local fintech / Web3 studios", "Services", "Build & compliance", `${name} talent often serves pan-EU clients`],
        ["Tax / accounting crypto tools", "Regtech", "Reporting", "National tax software niche"],
      ]
    : [
        ["Local or regional exchanges / P2P", "Exchange / P2P", "Fiat on-ramps", "Depth varies — verify registration before use"],
        ["Fintech wallets & remittance apps", "Fintech", "Payments distribution", "Often crypto-adjacent rather than pure on-chain"],
        ["Web3 / blockchain studios", "Services", "Dev shops", `Builder community in ${name}`],
        ["OTC / brokerage desks", "OTC", "Block trades", "Common where retail CEX brands are thin"],
      ];
  return {
    scene: `${name}: thinner named-startup coverage in our dataset — use regulator registers and local incubators for a live map.`,
    rows,
    source: "template",
  };
}

function lawNoteField(field) {
  if (!field) return "";
  if (typeof field === "string") return field;
  return field.note || field.status || "";
}

/**
 * Build structured local crypto services for a jurisdiction.
 * @returns {{ exchanges, banks, atm, merchants, rails, summary, regulators, vaspLicensing }}
 */
function lawSimBanksFor(j) {
  const lawId = j?.id || "";
  const alias = LAW_LOCAL_SERVICES_ALIASES[lawId] || lawId;
  let list = LAW_CRYPTO_BANKS[alias] || LAW_CRYPTO_BANKS[lawId];
  if (list === null && LAW_LOCAL_SERVICES_ALIASES[lawId]) {
    list = LAW_CRYPTO_BANKS[LAW_LOCAL_SERVICES_ALIASES[lawId]];
  }
  if (Array.isArray(list) && list.length) return list;
  // Region fallbacks with real institution families
  const region = j?.region || "";
  if (region === "eu-mica") {
    return [
      ["Domestic universal banks (local majors)", "retail", "Usually the first call for salary accounts after residence — pure crypto SOF is often refused."],
      ["Revolut / N26 / Wise", "neo", "Common EU founder multi-rail for personal float; business crypto policies change."],
      ["Licensed CASP EUR rails", "specialist", "Bitpanda, national CASPs, and ESMA-listed platforms for EUR on-off when banks stall."],
      ["Specialist / private banks (case-by-case)", "private", "High minimums; need licensed business narrative and clean UBO file."],
    ];
  }
  if (region === "latin-america") {
    return [
      ["Domestic retail banks (local top 3–5)", "retail", "KYC-heavy; crypto founders should expect multi-week EDD."],
      ["Digital banks / wallets (Nubank-class, Mercado Pago-class where present)", "neo", "Often more practical than legacy banks for day-to-day float."],
      ["Local exchange fiat rails", "specialist", "Primary crypto on-off (Pix, local ACH) when corporate banking fails."],
    ];
  }
  if (region === "asia-pacific") {
    return [
      ["Domestic major banks", "retail", "Excellent after residence in hubs (SG/JP/AU) — unlicensed crypto activity is hard."],
      ["Digital / neobanks", "neo", "Faster UX; still SOF-gated for crypto income."],
      ["Licensed local exchange rails", "specialist", "Main fiat on-off for retail crypto users."],
    ];
  }
  if (region === "middle-east-africa") {
    return [
      ["Domestic retail banks", "retail", "Selective; free-zone or licence story helps where relevant."],
      ["Mobile money / e-wallets (where dominant)", "emi", "Often more important than banks for retail cash conversion."],
      ["Licensed VASP corridors", "specialist", "Use registered platforms for crypto fiat ramps."],
    ];
  }
  return [
    ["Domestic top retail banks", "retail", "First stop for personal accounts after residence; crypto SOF often enhanced."],
    ["EU/global neobanks & EMIs (Wise, Revolut-class)", "emi", "Common multi-rail backup for international founders."],
    ["Licensed exchange / VASP fiat rails", "specialist", "Practical crypto on-off when traditional banks refuse pure crypto income."],
  ];
}

function lawBuildLocalServices(j, seed = {}) {
  if (seed.localServices) {
    const s = { ...seed.localServices };
    if (!s.banksList?.length) s.banksList = lawSimBanksFor(j);
    return s;
  }

  const lawId = j?.id || "";
  const alias = LAW_LOCAL_SERVICES_ALIASES[lawId] || lawId;
  let curated = LAW_LOCAL_SERVICES[alias] || LAW_LOCAL_SERVICES[lawId];
  if (curated === null && LAW_LOCAL_SERVICES_ALIASES[lawId]) {
    curated = LAW_LOCAL_SERVICES[LAW_LOCAL_SERVICES_ALIASES[lawId]];
  }
  // browser id passed as j.id sometimes
  if (!curated && LAW_LOCAL_SERVICES[lawId]) curated = LAW_LOCAL_SERVICES[lawId];

  const regs = Array.isArray(j?.regulators) ? j.regulators.filter(Boolean) : [];
  const regLine = regs.length ? `Regulators: ${regs.join(", ")}.` : "";
  const vasp = j?.vaspLicensing || "";
  const trading = lawNoteField(j?.trading);
  const payments = lawNoteField(j?.payments);
  const tags = j?.tags || [];
  const isMica = tags.includes("mica") || j?.region === "eu-mica";
  const name = j?.name || "this jurisdiction";
  const banksList = lawSimBanksFor(j);

  if (curated && typeof curated === "object") {
    return {
      exchanges: curated.exchanges,
      banks: curated.banks,
      banksList,
      atm: curated.atm,
      merchants: curated.merchants,
      rails: curated.rails || "",
      summary: curated.summary || "",
      regulators: regLine,
      vaspLicensing: vasp,
      source: "curated",
    };
  }

  // Template fallback from law_data fields
  let exchanges;
  if (isMica) {
    exchanges = `Trade via MiCA-authorized CASPs supervised by the national competent authority in ${name} (see ESMA CASP register and national lists). ${vasp || "CASP authorization required for crypto-asset services."} ${trading}`.trim();
  } else if (vasp) {
    exchanges = `Authorized / registered service providers: ${vasp} ${trading} Prefer names on official registers over unlicensed offshore apps.`.trim();
  } else {
    exchanges = `Legal trading environment. ${trading || "Use providers that meet local AML/registration expectations."} Verify any national VASP/exchange register before depositing funds.`;
  }

  const banks = isMica
    ? `Mainstream banks rarely custody retail crypto; fiat on/off usually via authorized CASPs and EMIs. Corporate accounts need a clean MiCA/CASP or software narrative. ${regLine}`
    : `Banking access for crypto users is often the bottleneck even when trading is legal. Expect enhanced SOF/SOW. ${regLine} Multi-rail (local bank + EMI + licensed exchange) is common.`;

  const atm = isMica || j?.region === "asia-pacific"
    ? "Bitcoin ATMs are sparse or high-fee where they exist — not a primary on-ramp compared with licensed exchange bank transfers."
    : j?.region === "middle-east-africa"
      ? "Crypto ATMs are uncommon; mobile money and bank transfer to platforms matter more for cash conversion."
      : "BTC ATM coverage varies by city; fees are high and KYC thresholds apply. Treat as backup, not core rails.";

  const merchants = payments
    ? `Merchant payments: ${payments} Not legal tender unless explicitly stated otherwise.`
    : "Merchant acceptance is voluntary and usually niche; national currency remains legal tender.";

  const rails = isMica
    ? "SEPA fiat legs via banks/EMIs/CASPs; Travel Rule (TFR) between VASPs; unlicensed marketing to EU retail is high risk."
    : `Local fiat rails into registered platforms where they exist. ${vasp ? "Licence perimeter: " + vasp : "Confirm Travel Rule / AML obligations for VASPs."}`;

  const summary = [
    isMica ? "MiCA CASPs" : vasp ? "Licensed/registered VASPs" : "Legal trading",
    "bank KYC varies",
    "ATMs secondary",
    "voluntary merchants",
  ].join(" · ");

  return {
    exchanges,
    banks,
    banksList,
    atm,
    merchants,
    rails,
    summary,
    regulators: regLine,
    vaspLicensing: vasp,
    source: "template",
  };
}

/** Curated founder overrides for major legal markets (merged on top of region templates). */
const LAW_LEGAL_SEED = {
  germany: {
    flag: "🇩🇪",
    accent: "#fbbf24",
    headline: "EU MiCA · BaFin · large market · high personal tax if resident",
    fit: "EU GTM with German substance; not a low-tax personal move for most Italians.",
    col: "high",
    company: "eu-gmbh",
    banking: "good",
    visa: "eu-blue-card",
    colBands: [
      ["Lean solo", "USD 1.8–2.8k", "Secondary cities lower"],
      ["Comfortable couple", "USD 3.2–5.5k", "Berlin/Munich higher"],
      ["Family + school", "USD 5–11k", "Intl school-driven"],
    ],
    pros: ["Largest EU economy", "BaFin clarity paths", "Deep talent", "SEPA + MiCA passport potential"],
    cons: ["High CoL in hubs", "Personal tax can be steep", "Bureaucracy", "Crypto tax rules detailed"],
    companyNote: "GmbH / UG via notary; crypto services need MiCA CASP (BaFin). Real office and managing directors matter for substance.",
    visaNote: "EU Blue Card, freelancer, employment — immigration counsel. EU citizens: free movement + Anmeldung creates tax residence risk.",
    bankingNote: "Strong once identity and SOF clear; crypto founders face enhanced DD. Fintech EMI backup common.",
    taxPersonal:
      "German tax residents face progressive ESt on worldwide income. Crypto private sales can be tax-free after holding periods under §23 EStG themes — confirm live BMF guidance with a Steuerberater. Not a free-for-all for traders.",
    taxCompany: "Corporate tax + trade tax (Gewerbesteuer) on GmbH; MiCA CASP is a regulated business cost centre.",
    wealthOnArrival:
      "No classic annual wealth tax like Spain for most, but worldwide income from residence start. Exit tax rules if leaving later with shareholdings — plan with counsel.",
    cryptoTaxOnResidency:
      "Private vs commercial classification is critical. Long-held private BTC may benefit from holding-period rules; frequent trading and stables can be income. No free step-up solely for arriving — coordinate Italy exit year.",
    next: ["Steuerberater crypto memo before move", "MiCA CASP vs partner", "Anmeldung days calendar vs Italy", "Bank SOF pack"],
  },
  france: {
    flag: "🇫🇷",
    accent: "#60a5fa",
    headline: "EU MiCA · AMF / PSAN legacy → CASP · solid lifestyle hubs",
    fit: "Francophone EU base and regulated crypto services; personal tax can be high.",
    col: "high",
    company: "eu-sas",
    banking: "good",
    visa: "talent-passport",
    colBands: [
      ["Lean solo", "USD 1.7–2.6k", "Lyon/Nantes lower than Paris"],
      ["Comfortable couple", "USD 3–5.5k", "Paris high"],
      ["Family + school", "USD 5–12k", "Paris school-driven"],
    ],
    pros: ["AMF supervisory culture", "Tech talent (Paris)", "EU single market", "Lifestyle cities"],
    cons: ["Personal tax & social charges", "Paris CoL", "Crypto tax flat-rate regimes need modelling"],
    companyNote: "SAS/SARL common; crypto CASP under MiCA via AMF path (PSAN transition history).",
    visaNote: "Passeport Talent, emploi, EU free movement — counsel for non-EU founders.",
    taxPersonal:
      "Residents taxed on worldwide income; crypto often under flat tax (PFU) themes for capital gains — confirm live Bofip/CGI practice. Social charges matter.",
    taxCompany: "IS corporate tax; regulated CASP costs. PE risk if managed from Italy without substance.",
    wealthOnArrival: "IFI wealth tax focuses on French real estate more than pure crypto in many cases — still model with French counsel. Italy exit year critical.",
    cryptoTaxOnResidency:
      "Post-residence disposals of BTC/stables generally taxable under capital-gains style rules (confirm rates). Professional trader characterisation possible. Coordinate Italy exit.",
    next: ["French tax memo crypto + IFI", "CASP perimeter", "Visa path", "Days vs Italy"],
  },
  italy: {
    flag: "🇮🇹",
    accent: "#34d399",
    headline: "Home base for many users · MiCA · CONSOB · worldwide tax default",
    fit: "Default if you stay — optimise MiCA product and exit planning rather than assuming foreign cos fix tax.",
    col: "mid",
    company: "eu-srl",
    banking: "medium",
    visa: "eu-citizen-or-work",
    colBands: [
      ["Lean solo", "USD 1.3–2.2k", "South/secondary lower"],
      ["Comfortable couple", "USD 2.4–4.2k", "Milan/Rome higher"],
      ["Family", "USD 4–9k", ""],
    ],
    pros: ["Home market knowledge", "MiCA CASP via national competent authority", "EU passport for services"],
    cons: ["Worldwide personal tax while resident", "Banking can be slow for crypto", "Not a relocation destination if you already live here"],
    companyNote: "Srl/Spa; CASP authorisation under MiCA. Substitute tax regimes (impats, forfettario) are narrow — commercialista required.",
    visaNote: "If already Italian/EU resident, focus on tax residence facts not visa.",
    taxPersonal: "Residents taxed on worldwide income including crypto under Italian rules (monitor live rates and monitoring regimes). Foreign co alone does not fix this.",
    taxCompany: "IRES/IRAP; CFC and PE rules for foreign entities managed from Italy.",
    wealthOnArrival: "If you never leave, IVIE/IVAFE and monitoring (RW) still apply to foreign assets. Exit year planning if you do leave.",
    cryptoTaxOnResidency: "While Italian tax resident, disposals and sometimes monitoring of crypto wallets matter. See EU MiCA / Founders guide for product law; tax is separate commercialista work.",
    next: ["Commercialista crypto + RW", "CASP vs reverse solicitation", "If relocating: exit-year model first"],
  },
  netherlands: {
    flag: "🇳🇱",
    accent: "#f97316",
    headline: "EU MiCA · DNB/AFM culture · English-friendly HQ city",
    fit: "Northern EU ops base with strong English and logistics — high CoL in Amsterdam.",
    col: "high",
    company: "eu-bv",
    banking: "good",
    visa: "orientatiejaar-or-startup",
    colBands: [
      ["Lean solo", "USD 1.9–2.9k", "Randstad high"],
      ["Comfortable couple", "USD 3.5–6k", ""],
      ["Family", "USD 5–12k", ""],
    ],
    pros: ["English-friendly business", "Strong fintech stack", "EU hub flights", "MiCA packaging"],
    cons: ["High housing costs", "30% ruling reformed — verify", "Personal tax material"],
    companyNote: "BV via notary; CASP under MiCA. Substance and Dutch directors common for credibility.",
    taxPersonal: "Worldwide tax for residents; 30% facility narrowed — model before relying on old expat blogs.",
    taxCompany: "Corporate tax on BV; innovation box only if you qualify.",
    wealthOnArrival: "Box 3 wealth-tax style regime on savings/investments has been litigated/reformed — crypto classification needs current advice.",
    cryptoTaxOnResidency: "Box 3 vs box 1 (business) characterisation for crypto is fact-specific. Confirm with Dutch tax advisor before large post-move holdings.",
    next: ["Box 3 crypto memo", "Housing reality check", "CASP path", "Italy exit calendar"],
  },
  ireland: {
    flag: "🇮🇪",
    accent: "#4ade80",
    headline: "EU English · tech MNCs · MiCA · common-law style",
    fit: "English-language EU base with strong tech employment market — personal tax still bites.",
    col: "high",
    company: "eu-ltd",
    banking: "good",
    visa: "stamp-or-critical-skills",
    colBands: [
      ["Lean solo", "USD 2–3.2k", "Dublin high"],
      ["Comfortable couple", "USD 3.5–6.5k", ""],
      ["Family", "USD 6–13k", ""],
    ],
    pros: ["English", "EU + tech ecosystem", "Common-law familiarity for many founders"],
    cons: ["Dublin housing", "Personal tax", "Not a 0% PIT story"],
    companyNote: "Ltd company formation efficient; CASP under MiCA via CBI/competent authority path.",
    taxPersonal: "Residents taxed on worldwide income (Irish domicile nuances exist — specialist advice). Crypto CGT themes — confirm Revenue practice.",
    taxCompany: "12.5% trading CT headline is famous but substance and transfer pricing matter; not automatic for shell cos.",
    wealthOnArrival: "No classic wealth tax like Spain; worldwide income from residence. Italy exit still critical.",
    cryptoTaxOnResidency: "CGT on disposals for many investors; trading business = income. Stables characterisation needs memo.",
    next: ["Tax residence vs Italy", "CT substance memo", "Visa/employment path", "CASP"],
  },
  luxembourg: {
    flag: "🇱🇺",
    accent: "#a78bfa",
    headline: "EU fund/banking hub · MiCA · high CoL · institutional",
    fit: "Fund/CSSF-adjacent structures more than lean meme startups.",
    col: "very-high",
    company: "eu-sarl",
    banking: "excellent",
    visa: "eu-work",
    colBands: [
      ["Lean solo", "USD 2.5–4k", ""],
      ["Comfortable couple", "USD 4.5–8k", ""],
      ["Family", "USD 8–15k+", ""],
    ],
    pros: ["Fund domicile ecosystem", "Banks", "EU passport optics"],
    cons: ["Very expensive", "Small domestic market", "Institutional bar"],
    companyNote: "SARL/SA; crypto and funds need CSSF-facing analysis + MiCA CASP where applicable.",
    taxPersonal: "Residents face progressive tax; special regimes exist for some impatriates — condition-heavy.",
    taxCompany: "Corporate tax; fund vehicles are specialist counsel territory.",
    wealthOnArrival: "Net wealth tax themes can apply to residents — model crypto inclusion with local counsel.",
    cryptoTaxOnResidency: "Personal crypto gains/wealth treatment is technical — written memo required before moving large bags.",
    next: ["CSSF/MiCA perimeter", "Wealth tax model", "Immigration", "Italy exit"],
  },
  canada: {
    flag: "🇨🇦",
    accent: "#ef4444",
    headline: "Legal regulated · CSA/FINTRAC · high trust · not casual tax move",
    fit: "N. America GTM with clearer provincial securities framing than pure US chaos — immigration and tax still heavy.",
    col: "high",
    company: "easy",
    banking: "good",
    visa: "hard",
    colBands: [
      ["Lean solo", "USD 1.8–2.8k", "Varies by city"],
      ["Comfortable couple", "USD 3.2–5.5k", "Toronto/Vancouver high"],
      ["Family", "USD 5–12k", ""],
    ],
    pros: ["Rule of law", "English/French markets", "Regulated platforms", "Quality of life"],
    cons: ["High CoL in big cities", "Worldwide tax if resident", "Immigration points-based"],
    companyNote: "Federal/provincial corporations; crypto platforms under CSA + FINTRAC MSB-style obligations.",
    visaNote: "Express Entry, start-up visa, work permits — specialist immigration.",
    taxPersonal: "Residents taxed on worldwide income including crypto. Departure tax if leaving later.",
    taxCompany: "Corporate tax federal+provincial; foreign owner issues matter.",
    wealthOnArrival: "No US-style estate tax clone for most, but worldwide income from day-one residency can tax post-move sales. Coordinate Italy exit.",
    cryptoTaxOnResidency: "CRA treats crypto as commodity for many taxpayers — capital gains vs business income. No free step-up on arrival alone.",
    next: ["Immigration path", "Cross-border tax IT→CA", "FINTRAC perimeter if operating", "City CoL model"],
  },
  australia: {
    flag: "🇦🇺",
    accent: "#22d3ee",
    headline: "AUSTRAC DCE · ASIC perimeter · high CoL cities · English",
    fit: "APAC English base with mature AML for digital currency exchanges — far from EU time zones.",
    col: "high",
    company: "easy",
    banking: "good",
    visa: "hard",
    colBands: [
      ["Lean solo", "USD 1.9–3k", "Sydney/Melbourne high"],
      ["Comfortable couple", "USD 3.5–6k", ""],
      ["Family", "USD 6–13k", ""],
    ],
    pros: ["English", "Clear DCE registration culture", "Lifestyle", "Rule of law"],
    cons: ["Distance from EU", "High housing", "Personal tax", "Visa points"],
    companyNote: "Pty Ltd; AUSTRAC DCE if exchanging digital currency; ASIC for financial products.",
    taxPersonal: "Residents taxed on worldwide income; ATO crypto guidance is detailed — capital gains common for investors.",
    taxCompany: "Company tax; franking etc. specialist.",
    wealthOnArrival: "Worldwide tax from residency; no free crypto step-up myth — basis tracking essential.",
    cryptoTaxOnResidency: "Disposals after residency generally CGT events; personal use asset exceptions narrow. Stables still crypto for ATO in most cases.",
    next: ["Visa feasibility", "ATO crypto memo", "AUSTRAC if operating exchange", "Italy exit year"],
  },
  "new-zealand": {
    flag: "🇳🇿",
    accent: "#2dd4bf",
    headline: "Legal crypto · IRD tax guidance · lifestyle · remote from EU",
    fit: "Quality-of-life APAC English base; not a tax haven story.",
    col: "high",
    company: "easy",
    banking: "selective",
    visa: "hard",
    colBands: [
      ["Lean solo", "USD 1.7–2.6k", "Auckland high"],
      ["Comfortable couple", "USD 3–5.5k", ""],
      ["Family", "USD 5–11k", ""],
    ],
    pros: ["Lifestyle", "English", "AML/CFT clarity for providers"],
    cons: ["Distance", "Small market", "Immigration", "Personal tax"],
    companyNote: "Limited company; AML/CFT for virtual asset service providers.",
    taxPersonal: "Residents generally taxed on worldwide income; IRD crypto guidance — confirm.",
    taxCompany: "Company tax; PE risk if managed from abroad poorly.",
    wealthOnArrival: "Worldwide income from residence; document basis before move.",
    cryptoTaxOnResidency: "Post-residence disposals typically taxable; classify investment vs business.",
    next: ["Immigration", "IRD memo", "Italy exit", "Banking SOF"],
  },
  "south-korea": {
    flag: "🇰🇷",
    accent: "#f472b6",
    headline: "Huge retail market · real-name VASP · Travel Rule · high friction promos",
    fit: "Korea GTM with licensed local exchanges — not a casual meme launch pad.",
    col: "high",
    company: "formal",
    banking: "after-residence",
    visa: "hard",
    colBands: [
      ["Lean solo", "USD 1.6–2.5k", "Seoul"],
      ["Comfortable couple", "USD 3–5.5k", ""],
      ["Family", "USD 5–11k", ""],
    ],
    pros: ["Massive retail crypto culture", "Clear VASP real-name system", "Tech talent"],
    cons: ["Language", "Banking after residence", "Strict marketing", "Personal tax"],
    companyNote: "Chusik/Yuhan; serving KR users usually needs local VASP partnership or licence path.",
    taxPersonal: "Residents face income tax; crypto taxation has evolved — confirm live NTS rules.",
    taxCompany: "Corporate tax; transfer pricing for cross-border groups.",
    wealthOnArrival: "Worldwide tax themes for residents; model before large disposals after arrival.",
    cryptoTaxOnResidency: "Confirm current thresholds and rates for virtual asset income/gains with Korean tax counsel.",
    next: ["Local counsel for VASP perimeter", "Tax memo", "Visa", "Italy exit"],
  },
  taiwan: {
    flag: "🇹🇼",
    accent: "#38bdf8",
    headline: "FSC VAS rules · legal market · manufacturing/tech adjacency",
    fit: "Greater China–adjacent ops with FSC virtual-asset service provider rules.",
    col: "mid",
    company: "medium",
    banking: "selective",
    visa: "medium",
    colBands: [
      ["Lean solo", "USD 1.2–2.0k", "Taipei mid"],
      ["Comfortable couple", "USD 2.2–4k", ""],
      ["Family", "USD 3.5–7k", ""],
    ],
    pros: ["Tech hardware ecosystem", "Legal regulated path", "Competitive CoL vs HK/SG"],
    cons: ["Language", "Banking selective", "Geopolitical risk perception for some banks"],
    companyNote: "Company limited by shares; VAS provider registration if in scope.",
    taxPersonal: "Residents taxed under ROC rules; confirm crypto gain treatment with local CPA.",
    taxCompany: "Profit-seeking enterprise tax; substance matters.",
    wealthOnArrival: "Document SOF; map residence start vs Italy exit.",
    cryptoTaxOnResidency: "Post-residence disposals — written local memo; stables characterisation included.",
    next: ["FSC perimeter", "Tax CPA", "Visa", "Bank intro"],
  },
  philippines: {
    flag: "🇵🇭",
    accent: "#a3e635",
    headline: "BSP VASP licences · remittance culture · lower CoL",
    fit: "SE Asia ops with licensed VASP rails and strong retail remittance/crypto overlap.",
    col: "low-mid",
    company: "medium",
    banking: "mixed",
    visa: "medium",
    colBands: [
      ["Lean solo", "USD 0.8–1.5k", "Metro Manila mid / provinces lower"],
      ["Comfortable couple", "USD 1.6–3k", ""],
      ["Family", "USD 2.5–5.5k", ""],
    ],
    pros: ["BSP licensing clarity for VASPs", "English widely used", "Competitive CoL", "Large young market"],
    cons: ["Infrastructure variance", "Typhoon/ops planning", "Banking mixed for pure crypto"],
    companyNote: "Domestic corp / foreign branch; BSP VASP if providing virtual asset services.",
    taxPersonal: "Residents generally taxed on worldwide income for citizens/residents — confirm with PH tax counsel.",
    taxCompany: "Corporate income tax; incentives only if PEZA/etc. qualify.",
    wealthOnArrival: "Worldwide tax risk for residents — model Italy exit carefully.",
    cryptoTaxOnResidency: "Gains may be taxable; confirm BIR practice. Public offers still multi-jurisdiction if targeting EU.",
    next: ["BSP perimeter", "Tax memo", "Visa", "Banking plan"],
  },
  brazil: {
    flag: "🇧🇷",
    accent: "#22c55e",
    headline: "LatAm scale · Law 14.478 / BCB track · Portuguese market",
    fit: "Largest LatAm economy GTM with a dedicated virtual-asset framework — tax and banking still serious.",
    col: "low-mid",
    company: "medium",
    banking: "mixed",
    visa: "medium",
    colBands: [
      ["Lean solo", "USD 1.0–1.8k", "Secondary cities"],
      ["Comfortable couple", "USD 2–3.8k", "SP/RJ higher"],
      ["Family", "USD 3.5–7k", ""],
    ],
    pros: ["Huge market", "Clearer VASP law path", "Deep fintech scene", "Competitive CoL outside luxury SP"],
    cons: ["Tax complexity", "Bureaucracy", "Security variance", "Language for non-PT speakers"],
    companyNote: "Ltda/SA via local counsel; virtual-asset service providers toward BCB licensing track.",
    taxPersonal: "Residents generally worldwide income tax — major planning item vs territorial marketing hubs.",
    taxCompany: "Corporate tax + social contributions; PE rules matter.",
    wealthOnArrival: "Worldwide tax from residency can pull foreign crypto into scope going forward. Italy exit year critical.",
    cryptoTaxOnResidency: "Monthly/capital gains style rules have applied to crypto — confirm live RFB norms. Stables included in planning.",
    next: ["Tax residency model BR vs IT", "BCB/VASP perimeter", "Visa", "Bank/fintech pack"],
  },
  chile: {
    flag: "🇨🇱",
    accent: "#f43f5e",
    headline: "Fintech Law · CMF licensing transition · Southern Cone",
    fit: "More institutional LatAm base with CMF perimeter for crypto-asset service providers.",
    col: "mid",
    company: "medium",
    banking: "selective",
    visa: "medium",
    colBands: [
      ["Lean solo", "USD 1.1–1.9k", "Santiago"],
      ["Comfortable couple", "USD 2.2–4k", ""],
      ["Family", "USD 3.5–7k", ""],
    ],
    pros: ["Fintech Law clarity path", "Institutional optics in LatAm", "Spanish"],
    cons: ["Santiago CoL rising", "Earthquake ops planning", "Banking selective for crypto"],
    companyNote: "SpA/SRL; CMF licensing transition for crypto-asset services — counsel.",
    taxPersonal: "Residents face personal tax on relevant income — confirm worldwide vs source with Chilean counsel.",
    taxCompany: "First category tax on companies; PE risk if managed from Italy.",
    wealthOnArrival: "Document SOF; map residence start. Italy exit coordination.",
    cryptoTaxOnResidency: "Post-residence gains — written memo; public EU offers still MiCA.",
    next: ["CMF perimeter", "Tax memo", "Visa", "Bank intro"],
  },
  colombia: {
    flag: "🇨🇴",
    accent: "#fbbf24",
    headline: "Legal private crypto · tax rules · Superintendencia pilots",
    fit: "Andean market access with evolving intermediary supervision — not unregulated.",
    col: "low-mid",
    company: "medium",
    banking: "mixed",
    visa: "medium",
    colBands: [
      ["Lean solo", "USD 0.9–1.6k", "Medellín/Bogotá variance"],
      ["Comfortable couple", "USD 1.8–3.2k", ""],
      ["Family", "USD 2.8–5.5k", ""],
    ],
    pros: ["Growing tech scenes", "Competitive CoL", "Spanish", "Active crypto users"],
    cons: ["Security variance", "Tax reporting", "Banking mixed"],
    companyNote: "SAS popular; exchange/intermediary rules via financial supervisors — counsel.",
    taxPersonal: "Residents generally taxed with worldwide elements — confirm DIAN crypto reporting.",
    taxCompany: "Corporate tax on local entities.",
    wealthOnArrival: "Tax residence can pull gains into scope; Italy exit year matters.",
    cryptoTaxOnResidency: "DIAN has issued crypto reporting/tax guidance — verify live. Model disposals after day-one.",
    next: ["DIAN crypto memo", "Visa", "Banking", "Security DD"],
  },
  peru: {
    flag: "🇵🇪",
    accent: "#c084fc",
    headline: "Legal hold/trade · SBS supervisory direction · SUNAT tax",
    fit: "Andean Spanish base; intermediaries moving toward SBS rules.",
    col: "low-mid",
    company: "medium",
    banking: "mixed",
    visa: "medium",
    colBands: [
      ["Lean solo", "USD 0.9–1.5k", "Lima mid"],
      ["Comfortable couple", "USD 1.7–3k", ""],
      ["Family", "USD 2.5–5k", ""],
    ],
    pros: ["Competitive CoL", "Spanish", "Legal private activity"],
    cons: ["Formal VASP depth thinner than BR/CL", "Banking", "Bureaucracy"],
    companyNote: "SAC/SRL via counsel; SBS virtual-asset provider rules evolving.",
    taxPersonal: "Confirm resident tax base and SUNAT crypto treatment with local counsel.",
    taxCompany: "Corporate tax on local cos; PE risk from Italy management.",
    wealthOnArrival: "SOF for banks; tax residence start vs Italy exit.",
    cryptoTaxOnResidency: "Post-residence gains — SUNAT memo required. EU marketing still MiCA.",
    next: ["SBS perimeter", "SUNAT memo", "Visa", "Bank pack"],
  },
  israel: {
    flag: "🇮🇱",
    accent: "#38bdf8",
    headline: "Legal regulated · ISA/BoI attention · tech talent · banking friction history",
    fit: "Deep tech/security talent; banking access for crypto has been uneven historically.",
    col: "high",
    company: "formal",
    banking: "hard",
    visa: "medium",
    colBands: [
      ["Lean solo", "USD 2–3.2k", "TLV high"],
      ["Comfortable couple", "USD 3.5–6.5k", ""],
      ["Family", "USD 6–13k", ""],
    ],
    pros: ["World-class tech talent", "Cybersecurity adjacency", "English common in tech"],
    cons: ["High CoL in TLV", "Banking friction stories", "Security situation", "Personal tax"],
    companyNote: "Ltd company; ISA/BoI supervisory attention for crypto activity — counsel.",
    taxPersonal: "Residents taxed on worldwide income; new immigrant regimes exist but condition-heavy — specialist Israeli tax counsel.",
    taxCompany: "Corporate tax; R&D incentives only if you qualify.",
    wealthOnArrival: "New immigrant / returning resident benefits are narrow — do not assume zero tax on foreign crypto forever.",
    cryptoTaxOnResidency: "Confirm classification of crypto gains and any immigrant benefits in writing before moving bags.",
    next: ["Israeli tax counsel (immigrant regimes)", "Bank feasibility", "Visa", "Italy exit"],
  },
  "south-africa": {
    flag: "🇿🇦",
    accent: "#84cc16",
    headline: "FSCA crypto as financial products · FAIS licensing · Africa HQ candidate",
    fit: "Largest regulated Africa market story for many founders — power/ops and emigration rules matter.",
    col: "low-mid",
    company: "medium",
    banking: "selective",
    visa: "medium",
    colBands: [
      ["Lean solo", "USD 1.0–1.8k", "Cape Town/JHB variance"],
      ["Comfortable couple", "USD 2–3.5k", ""],
      ["Family", "USD 3–6.5k", ""],
    ],
    pros: ["FSCA licensing clarity", "English", "Financial services depth", "Regional hub role"],
    cons: ["Load-shedding/ops planning", "Crime variance by area", "Exchange control history", "Emigration tax if leaving later"],
    companyNote: "Pty Ltd; crypto asset service providers under FSCA/FAIS-style perimeter.",
    taxPersonal: "Residents taxed on worldwide income; capital gains inclusion. Expat/emigration rules if later leaving.",
    taxCompany: "Corporate tax; controlled foreign company rules exist.",
    wealthOnArrival: "Worldwide tax from residency; SARS crypto guidance — document basis. Italy exit coordination.",
    cryptoTaxOnResidency: "Crypto generally taxable assets; disposals can trigger CGT. Confirm live SARS interpretation.",
    next: ["FSCA perimeter", "SARS crypto memo", "Visa/work", "Ops (power/security) DD"],
  },
  mauritius: {
    flag: "🇲🇺",
    accent: "#67e8f9",
    headline: "VAITOS Act · licensed VASP hub · Africa/India ocean bridge",
    fit: "Regulated virtual-asset jurisdiction for Africa-facing structures — substance required.",
    col: "mid",
    company: "fast-regulated",
    banking: "selective",
    visa: "medium",
    colBands: [
      ["Lean solo", "USD 1.2–2.0k", ""],
      ["Comfortable couple", "USD 2.2–4k", ""],
      ["Family", "USD 3.5–7k", ""],
    ],
    pros: ["VAITOS licensing path", "English/French", "Time zone bridge", "Fund/services tradition"],
    cons: ["Small island CoL can surprise", "Substance expectations", "Banking selective"],
    companyNote: "GBC / local company via CSP; virtual asset service licence under VAITOS if in scope.",
    taxPersonal: "Personal tax regimes for residents/GBC need current MRA advice — do not assume 0% forever.",
    taxCompany: "GBC tax and substance rules; crypto licence conditions.",
    wealthOnArrival: "SOF/SOW for banks; residence vs GBC status separation.",
    cryptoTaxOnResidency: "Map personal residence tax on crypto disposals separately from licensed entity tax.",
    next: ["FSC licence path quote", "Substance plan", "Tax memo", "Bank intro"],
  },
  seychelles: {
    flag: "🇸🇨",
    accent: "#2dd4bf",
    headline: "Offshore services · VASP licensing tradition · not a lifestyle default",
    fit: "Entity/VASP packaging more than family relocation — verify FSA registers live.",
    col: "mid",
    company: "offshore-style",
    banking: "substance",
    visa: "n/a-or-work",
    colBands: [
      ["On-island living", "Mid–high tourist pricing", ""],
      ["Paper entity only", "Admin/legal fees dominate", ""],
    ],
    pros: ["Familiar offshore CSP market", "VASP licence narratives"],
    cons: ["Substance/CRS", "Reputation scrutiny", "Not EU tax residence fix alone"],
    companyNote: "IBC/CSL via CSP; VASP licence if providing services — verify current FSA rules.",
    taxPersonal: "Your real tax residence (Italy/EU) still taxes you if you live there. Seychelles personal residence is a separate immigration question.",
    taxCompany: "Entity tax depends on regime; economic substance and CRS apply.",
    wealthOnArrival: "If you never move personally, Italian tax continues. Entity banking needs SOF.",
    cryptoTaxOnResidency: "Personal disposals taxed where you are resident; entity holdings are entity accounting.",
    next: ["FSA register check", "Substance memo", "Italy CFC/PE", "Banking"],
  },
  norway: {
    flag: "🇳🇴",
    accent: "#94a3b8",
    headline: "EEA-aligned · high trust · high CoL · wealth tax themes",
    fit: "Nordic life and EEA financial alignment — expensive and tax-heavy for large portfolios.",
    col: "very-high",
    company: "formal",
    banking: "good",
    visa: "hard",
    colBands: [
      ["Lean solo", "USD 2.5–3.8k", "Oslo"],
      ["Comfortable couple", "USD 4.5–7.5k", ""],
      ["Family", "USD 7–14k", ""],
    ],
    pros: ["High trust", "EEA access themes", "Quality of life"],
    cons: ["Very high CoL", "Wealth tax", "Immigration", "Energy policy can hit mining"],
    companyNote: "AS company; crypto services under financial rules aligned with EEA/EU developments.",
    taxPersonal: "Residents face high progressive tax + wealth tax on net assets including crypto in many cases.",
    taxCompany: "Corporate tax; substance required.",
    wealthOnArrival: "Wealth tax on crypto holdings is a major planning item before becoming resident.",
    cryptoTaxOnResidency: "Gains taxed; wealth tax may apply annually without sale. Model before moving bags.",
    next: ["Wealth tax model", "Immigration", "Italy exit", "Bank SOF"],
  },
  ukraine: {
    flag: "🇺🇦",
    accent: "#facc15",
    headline: "Virtual Asset Law framework · wartime controls · high operational risk",
    fit: "Only with specialist counsel and risk acceptance — not a default relocation hub in wartime.",
    col: "low",
    company: "medium",
    banking: "hard",
    visa: "complex",
    colBands: [
      ["Lean solo", "USD 0.7–1.3k", "Highly location-dependent"],
      ["Remote offshore team", "Often better outside UA", ""],
    ],
    pros: ["Strong tech talent diaspora", "Legal framework exists on paper"],
    cons: ["War/security risk", "Capital controls", "Banking disruption", "Implementation timing"],
    companyNote: "Local companies exist; virtual asset framework implementation timing varies — specialist counsel only.",
    taxPersonal: "Confirm current wartime tax measures with Ukrainian counsel.",
    taxCompany: "Corporate tax under wartime rules — verify live.",
    wealthOnArrival: "Operational and banking access dominate over tax theory.",
    cryptoTaxOnResidency: "Map with local counsel; capital controls may dominate disposition ability.",
    next: ["Security assessment", "Specialist counsel", "Banking feasibility", "Prefer remote talent engagement if risk-off"],
  },
  belize: {
    flag: "🇧🇿",
    accent: "#34d399",
    headline: "English LatAm · IFSC/digital-asset service tradition · small market",
    fit: "English-speaking Central America with offshore services history — substance and banking still required.",
    col: "low-mid",
    company: "offshore-style",
    banking: "selective",
    visa: "medium",
    colBands: [
      ["Lean solo", "USD 0.9–1.6k", ""],
      ["Comfortable couple", "USD 1.8–3.2k", ""],
    ],
    pros: ["English", "IFSC-style service frameworks", "Low-mid CoL"],
    cons: ["Tiny market", "Banking/reputation", "Hurricane risk", "Not automatic tax residence fix for Italians living in IT"],
    companyNote: "IBC / local company via CSP; digital-asset service licences if in scope — verify IFSC registers.",
    taxPersonal: "Territorial themes often marketed — confirm residence tests and Italian dual-residence risk.",
    taxCompany: "Entity tax depends on regime; substance/CRS apply.",
    wealthOnArrival: "SOF for banks; Italy exit if truly relocating.",
    cryptoTaxOnResidency: "Document territorial vs local-source characterisation with counsel before large disposals.",
    next: ["Licence path", "Tax memo", "Banking", "Italy exit if moving"],
  },
  kenya: {
    flag: "🇰🇪",
    accent: "#f59e0b",
    headline: "Legal hold/trade · CMA/CBK virtual-asset evolution · E. Africa hub",
    fit: "Nairobi tech hub with evolving virtual-asset guidance — not legal tender.",
    col: "low-mid",
    company: "medium",
    banking: "mixed",
    visa: "medium",
    colBands: [
      ["Lean solo", "USD 0.9–1.6k", "Nairobi mid"],
      ["Comfortable couple", "USD 1.8–3.2k", ""],
    ],
    pros: ["Regional tech hub", "English", "Competitive CoL", "Mobile-money culture"],
    cons: ["Regulatory evolution", "Banking mixed for pure crypto", "Infrastructure variance"],
    companyNote: "Ltd company; CMA/CBK virtual-asset rules evolving — counsel before public offers.",
    taxPersonal: "Residents generally taxed; confirm crypto treatment with KRA-facing advisor.",
    taxCompany: "Corporate tax; incentives only if qualify.",
    wealthOnArrival: "SOF; residence start vs Italy exit.",
    cryptoTaxOnResidency: "Post-residence gains — local memo. EU retail still MiCA.",
    next: ["CMA/CBK perimeter", "Tax memo", "Visa", "Bank pack"],
  },
  ghana: {
    flag: "🇬🇭",
    accent: "#fbbf24",
    headline: "BoG / securities virtual-asset direction · W. Africa English",
    fit: "English West Africa base with regulators moving toward structured virtual-asset activity.",
    col: "low",
    company: "medium",
    banking: "mixed",
    visa: "medium",
    colBands: [
      ["Lean solo", "USD 0.8–1.4k", "Accra mid"],
      ["Comfortable couple", "USD 1.5–2.8k", ""],
    ],
    pros: ["English", "Regulatory progress", "Low CoL vs EU"],
    cons: ["Thinner institutional depth", "Power/ops planning", "Banking"],
    companyNote: "Ltd company; check BoG/securities virtual-asset perimeter before offering services.",
    taxPersonal: "Confirm resident tax on crypto with local counsel.",
    taxCompany: "Corporate tax on local entities.",
    wealthOnArrival: "SOF; Italy dual-residence if ties remain.",
    cryptoTaxOnResidency: "Written memo for post-residence disposals.",
    next: ["Regulator perimeter", "Tax memo", "Visa", "Ops DD"],
  },
  botswana: {
    flag: "🇧🇼",
    accent: "#94a3b8",
    headline: "BoB / NBFIRA virtual-asset perimeter · stable optics in region",
    fit: "Smaller Southern Africa jurisdiction with explicit virtual-asset supervisory interest.",
    col: "low-mid",
    company: "medium",
    banking: "selective",
    visa: "medium",
    colBands: [
      ["Lean solo", "USD 0.9–1.5k", "Gaborone"],
      ["Comfortable couple", "USD 1.7–3k", ""],
    ],
    pros: ["Relatively stable institutional reputation", "Virtual-asset rules developing"],
    cons: ["Small market", "Landlocked logistics", "Talent depth"],
    companyNote: "Company via CIPA; NBFIRA/BoB perimeter for virtual assets — counsel.",
    taxPersonal: "Confirm resident tax base with local advisor.",
    taxCompany: "Corporate tax; substance matters.",
    wealthOnArrival: "SOF; map residence vs Italy.",
    cryptoTaxOnResidency: "Local memo for gains after residency.",
    next: ["NBFIRA path", "Tax memo", "Visa", "Banking"],
  },
  rwanda: {
    flag: "🇷🇼",
    accent: "#4ade80",
    headline: "Fintech-friendly policy · evolving capital-market crypto rules",
    fit: "East Africa policy-innovation narrative; formal crypto still evolving.",
    col: "low",
    company: "medium",
    banking: "mixed",
    visa: "medium",
    colBands: [
      ["Lean solo", "USD 0.8–1.4k", "Kigali"],
      ["Comfortable couple", "USD 1.5–2.8k", ""],
    ],
    pros: ["Business-environment reforms", "Safety narrative in region", "Low CoL"],
    cons: ["Small market", "Crypto rules still maturing", "Landlocked"],
    companyNote: "Ltd company via RDB; check capital-market/payment rules for crypto services.",
    taxPersonal: "Confirm RRA treatment of crypto with counsel.",
    taxCompany: "Corporate tax; incentives case-by-case.",
    wealthOnArrival: "SOF; Italy exit if relocating.",
    cryptoTaxOnResidency: "Memo for post-residence disposals.",
    next: ["Regulator check", "Tax memo", "Visa", "Ops"],
  },
  uganda: {
    flag: "🇺🇬",
    accent: "#86efac",
    headline: "Holding generally legal · BoU/CMA virtual-asset development",
    fit: "E. Africa presence with developing formal virtual-asset rules.",
    col: "low",
    company: "medium",
    banking: "mixed",
    visa: "medium",
    colBands: [
      ["Lean solo", "USD 0.7–1.3k", "Kampala"],
      ["Comfortable couple", "USD 1.4–2.6k", ""],
    ],
    pros: ["Low CoL", "English", "Regional access"],
    cons: ["Thinner formal VASP depth", "Infrastructure", "Banking"],
    companyNote: "Ltd company; BoU/CMA virtual-asset rules developing — counsel before public offers.",
    taxPersonal: "Confirm URA crypto tax with local counsel.",
    taxCompany: "Corporate tax on local entities.",
    wealthOnArrival: "SOF; dual-residence risk if Italy ties remain.",
    cryptoTaxOnResidency: "Written memo essential — thin public guidance.",
    next: ["Regulator path", "Tax memo", "Visa", "Banking"],
  },
  zambia: {
    flag: "🇿🇲",
    accent: "#a3e635",
    headline: "Virtual-asset rules developing · holding generally legal",
    fit: "Southern Africa presence; expect thin formal market infrastructure.",
    col: "low",
    company: "medium",
    banking: "mixed",
    visa: "medium",
    colBands: [
      ["Lean solo", "USD 0.7–1.3k", "Lusaka"],
      ["Comfortable couple", "USD 1.4–2.5k", ""],
    ],
    pros: ["Low CoL", "English", "Mining-economy adjacency"],
    cons: ["Thin VASP market", "Power/ops", "Banking"],
    companyNote: "Company registration; securities/banking virtual-asset rules evolving.",
    taxPersonal: "Confirm ZRA treatment with counsel.",
    taxCompany: "Corporate tax; mining-sector rules separate if relevant.",
    wealthOnArrival: "SOF; Italy exit calendar if moving.",
    cryptoTaxOnResidency: "Local memo for gains.",
    next: ["Regulator check", "Tax memo", "Visa", "Ops DD"],
  },
  senegal: {
    flag: "🇸🇳",
    accent: "#f97316",
    headline: "No comprehensive ban · WAEMU/BCEAO payment perimeter · Francophone W. Africa",
    fit: "Francophone West Africa base; formal crypto market thin.",
    col: "low",
    company: "medium",
    banking: "mixed",
    visa: "medium",
    colBands: [
      ["Lean solo", "USD 0.8–1.4k", "Dakar mid"],
      ["Comfortable couple", "USD 1.5–2.8k", ""],
    ],
    pros: ["Regional access UEMOA", "French", "Low CoL vs EU"],
    cons: ["Thin formal crypto framework", "Banking", "Infrastructure"],
    companyNote: "SARL/SA; BCEAO payment rules shape rails more than crypto-specific codes.",
    taxPersonal: "Confirm resident tax with local counsel.",
    taxCompany: "Corporate tax; OHADA company law familiarity helps.",
    wealthOnArrival: "SOF; dual-residence Italy risk.",
    cryptoTaxOnResidency: "Thin guidance → written memo required.",
    next: ["Local counsel", "Tax memo", "Visa", "Banking"],
  },
  "cote-divoire": {
    flag: "🇨🇮",
    accent: "#fb923c",
    headline: "Holding generally legal · BCEAO perimeter · Abidjan hub",
    fit: "Francophone West Africa commercial hub; formal VASP market thin.",
    col: "low-mid",
    company: "medium",
    banking: "mixed",
    visa: "medium",
    colBands: [
      ["Lean solo", "USD 0.9–1.5k", "Abidjan"],
      ["Comfortable couple", "USD 1.7–3k", ""],
    ],
    pros: ["Abidjan commercial depth", "French", "Regional role"],
    cons: ["Thin crypto statute", "Banking", "CoL higher than inland peers"],
    companyNote: "SARL/SA under OHADA; verify payment/crypto supervisory expectations.",
    taxPersonal: "Local tax counsel for residents.",
    taxCompany: "Corporate tax; PE risk if managed from Italy.",
    wealthOnArrival: "SOF; Italy exit if relocating.",
    cryptoTaxOnResidency: "Memo for post-residence disposals.",
    next: ["Counsel", "Tax memo", "Visa", "Bank pack"],
  },
  benin: {
    flag: "🇧🇯",
    accent: "#86efac",
    headline: "No well-known ban · thin formal market · low CoL",
    fit: "Only with local counsel; not a deep VASP ecosystem today.",
    col: "low",
    company: "medium",
    banking: "hard",
    visa: "medium",
    colBands: [["Lean solo", "USD 0.6–1.2k", "Cotonou"], ["Couple", "USD 1.2–2.2k", ""]],
    pros: ["Low CoL", "Coastal access"],
    cons: ["Very thin crypto market infrastructure", "Banking", "Talent depth"],
    companyNote: "OHADA company forms; crypto services need careful regulatory analysis.",
    taxPersonal: "Confirm with local counsel — thin public crypto guidance.",
    taxCompany: "Corporate tax on local entities.",
    wealthOnArrival: "SOF; dual-residence risk.",
    cryptoTaxOnResidency: "Written memo essential.",
    next: ["Local counsel feasibility", "Tax memo", "Banking reality check"],
  },
  togo: {
    flag: "🇹🇬",
    accent: "#a7f3d0",
    headline: "No comprehensive ban widely cited · thin formal market",
    fit: "Presence play only with counsel — not a default founder hub.",
    col: "low",
    company: "medium",
    banking: "hard",
    visa: "medium",
    colBands: [["Lean solo", "USD 0.6–1.1k", "Lomé"], ["Couple", "USD 1.1–2.0k", ""]],
    pros: ["Low CoL", "Port access"],
    cons: ["Thin formal crypto framework", "Banking", "Small market"],
    companyNote: "OHADA forms; verify any payment/fintech rules before offering services.",
    taxPersonal: "Local counsel required.",
    taxCompany: "Corporate tax; PE risk from Italy management.",
    wealthOnArrival: "SOF; Italy ties analysis.",
    cryptoTaxOnResidency: "Memo required — limited public guidance.",
    next: ["Feasibility with counsel", "Tax memo", "Banking"],
  },
  "cabo-verde": {
    flag: "🇨🇻",
    accent: "#38bdf8",
    headline: "No comprehensive ban · tourism/fintech interest · island CoL",
    fit: "Lifestyle/tourism adjacency; formal crypto market limited.",
    col: "mid",
    company: "medium",
    banking: "selective",
    visa: "medium",
    colBands: [
      ["Lean solo", "USD 1.0–1.8k", "Island variance"],
      ["Comfortable couple", "USD 1.8–3.2k", ""],
    ],
    pros: ["Lifestyle islands", "Portuguese language bridge to BR/PT", "Tourism services"],
    cons: ["Small market", "Import-driven CoL", "Thin VASP depth"],
    companyNote: "Local company via counsel; fintech/tourism overlap possible.",
    taxPersonal: "Confirm resident tax with local advisor.",
    taxCompany: "Corporate tax; incentives case-by-case.",
    wealthOnArrival: "SOF; dual-residence Italy.",
    cryptoTaxOnResidency: "Memo for gains after residency.",
    next: ["Local counsel", "Tax memo", "Visa", "Banking"],
  },
  jamaica: {
    flag: "🇯🇲",
    accent: "#84cc16",
    headline: "Legal private holding · BOJ sandbox history · remittance culture",
    fit: "Caribbean English base; payments still remittance-heavy vs crypto rails.",
    col: "low-mid",
    company: "medium",
    banking: "mixed",
    visa: "medium",
    colBands: [
      ["Lean solo", "USD 1.0–1.7k", "Kingston/Montego variance"],
      ["Comfortable couple", "USD 1.9–3.4k", ""],
    ],
    pros: ["English", "BOJ digital experiments history", "Timezone near US"],
    cons: ["Crime variance", "Small market", "Banking", "Hurricane risk"],
    companyNote: "Local company; sandbox/fintech paths case-by-case with counsel.",
    taxPersonal: "Confirm TAJ treatment of crypto with counsel.",
    taxCompany: "Corporate tax on local entities.",
    wealthOnArrival: "SOF; Italy exit if moving.",
    cryptoTaxOnResidency: "Memo for post-residence disposals.",
    next: ["Counsel", "Tax memo", "Visa", "Security DD"],
  },
  nicaragua: {
    flag: "🇳🇮",
    accent: "#94a3b8",
    headline: "No comprehensive ban known · thin formal guidance · low confidence",
    fit: "Only with specialist local counsel; political/ops risk higher than peers.",
    col: "low",
    company: "medium",
    banking: "hard",
    visa: "medium",
    colBands: [["Lean solo", "USD 0.7–1.2k", ""], ["Couple", "USD 1.3–2.4k", ""]],
    pros: ["Low CoL", "Spanish", "Pacific/Caribbean access"],
    cons: ["Thin formal crypto guidance", "Political risk perception", "Banking hard", "Low confidence score in dataset"],
    companyNote: "SA/SRL via counsel; limited formal crypto statute — high diligence.",
    taxPersonal: "Confirm with Nicaraguan counsel; dual-residence Italy risk.",
    taxCompany: "Corporate tax; PE risk.",
    wealthOnArrival: "Banking access often harder than tax theory.",
    cryptoTaxOnResidency: "Written memo essential — limited public guidance.",
    next: ["Risk assessment", "Specialist counsel", "Banking feasibility"],
  },
  "trinidad-and-tobago": {
    flag: "🇹🇹",
    accent: "#f87171",
    headline: "No comprehensive ban · limited formal crypto regulation · energy economy",
    fit: "English Caribbean; formal crypto framework limited — counsel required.",
    col: "mid",
    company: "medium",
    banking: "selective",
    visa: "medium",
    colBands: [
      ["Lean solo", "USD 1.2–2.0k", "POS mid"],
      ["Comfortable couple", "USD 2.2–3.8k", ""],
    ],
    pros: ["English", "Energy-sector adjacency", "Caribbean base"],
    cons: ["Thin formal crypto rules", "Crime variance", "Small market"],
    companyNote: "Local company; verify any fintech/sandbox programmes live.",
    taxPersonal: "Confirm BIR treatment with counsel.",
    taxCompany: "Corporate tax on local entities.",
    wealthOnArrival: "SOF; dual-residence analysis.",
    cryptoTaxOnResidency: "Memo required.",
    next: ["Local counsel", "Tax memo", "Visa", "Banking"],
  },
  // Remaining EU MiCA states (compact seeds — template fills the rest)
  austria: { flag: "🇦🇹", accent: "#ed1c24", headline: "EU MiCA · FMA · high CoL Vienna", fit: "German-speaking EU base with strong banking culture.", col: "high", company: "eu-gmbh", banking: "good", visa: "eu", taxPersonal: "Residents worldwide income; crypto private-sale rules exist — confirm with Austrian tax advisor." },
  belgium: { flag: "🇧🇪", accent: "#fbbf24", headline: "EU MiCA · FSMA · Brussels EU institutions", fit: "EU institutions adjacency; high tax for residents.", col: "high", company: "eu-bv", banking: "good", visa: "eu" },
  "czech-republic": { flag: "🇨🇿", accent: "#dc2626", headline: "EU MiCA · competitive CoL in EU · Prague hub", fit: "Lower CoL EU capital with MiCA packaging.", col: "mid", company: "eu-sro", banking: "medium", visa: "eu" },
  denmark: { flag: "🇩🇰", accent: "#c8102e", headline: "EU MiCA · high trust · very high CoL", fit: "Nordic EU life — expensive, high tax.", col: "very-high", company: "eu-aps", banking: "good", visa: "eu" },
  finland: { flag: "🇫🇮", accent: "#003580", headline: "EU MiCA · fintech · high CoL", fit: "Nordic EU tech scene; personal tax high.", col: "high", company: "eu-oy", banking: "good", visa: "eu" },
  greece: { flag: "🇬🇷", accent: "#0d5eaf", headline: "EU MiCA · lifestyle · mid CoL EU", fit: "Mediterranean EU base; banking/bureaucracy still matter.", col: "mid", company: "eu-ike", banking: "medium", visa: "eu" },
  poland: { flag: "🇵🇱", accent: "#dc143c", headline: "EU MiCA · large talent pool · competitive CoL", fit: "Central EU scale and developers; MiCA CASP path.", col: "mid", company: "eu-spzoo", banking: "medium", visa: "eu" },
  sweden: { flag: "🇸🇪", accent: "#006aa7", headline: "EU MiCA · fintech depth · high CoL/tax", fit: "Strong fintech culture; expensive personal tax stack.", col: "high", company: "eu-ab", banking: "good", visa: "eu" },
};

function lawLegalBrowserId(j) {
  // Prefer existing relocate ids that already link via lawId
  const hit = LAW_RELOCATE_BROWSER.find((c) => c.lawId === j.id || c.id === j.id);
  if (hit) return hit.id;
  return j.id;
}

function lawDefaultColBands(col) {
  const c = String(col || "mid");
  if (c.includes("very-high") || c === "very-high") {
    return [
      ["Lean solo", "USD 2.5–4k", "Indicative"],
      ["Comfortable couple", "USD 4.5–8k", ""],
      ["Family", "USD 8–15k+", ""],
    ];
  }
  if (c.includes("high")) {
    return [
      ["Lean solo", "USD 1.8–2.8k", "Indicative"],
      ["Comfortable couple", "USD 3.2–5.5k", ""],
      ["Family", "USD 5–11k", ""],
    ];
  }
  if (c.includes("low")) {
    return [
      ["Lean solo", "USD 0.7–1.4k", "Indicative"],
      ["Comfortable couple", "USD 1.4–2.6k", ""],
      ["Family", "USD 2.2–4.5k", ""],
    ];
  }
  return [
    ["Lean solo", "USD 1.2–2.0k", "Indicative"],
    ["Comfortable couple", "USD 2.2–3.8k", ""],
    ["Family", "USD 3.5–7k", ""],
  ];
}

function lawInferMeta(j, seed) {
  const tags = j.tags || [];
  const region = j.region || "";
  let col = seed.col || "mid";
  let company = seed.company || "medium";
  let banking = seed.banking || "selective";
  let visa = seed.visa || "medium";
  if (region === "eu-mica") {
    company = seed.company || "eu";
    banking = seed.banking || "good";
    visa = seed.visa || "eu";
    col = seed.col || "mid";
  }
  if (region === "asia-pacific" && tags.includes("regulated")) {
    banking = seed.banking || "selective";
  }
  if (region === "middle-east-africa") {
    col = seed.col || "low-mid";
    banking = seed.banking || "mixed";
  }
  if (region === "latin-america") {
    col = seed.col || "low-mid";
  }
  return { col, company, banking, visa };
}

function lawBuildLaunchForLegal(j) {
  const tags = j.tags || [];
  const region = j.region || "";
  if (tags.includes("mica") || region === "eu-mica") {
    return {
      meme: {
        local: "Hard",
        region: "Hard",
        world: "Hard",
        eu: "Hard",
        note: "EU MiCA: Title II white paper / offeror duties for public offers; CASP for services. Retail meme promos face high friction.",
      },
      ico: {
        local: "Hard",
        region: "Hard",
        world: "Hard",
        eu: "Hard",
        note: "Public TGE to EU retail is a MiCA packaging exercise — not a national loophole.",
      },
    };
  }
  if (region === "asia-pacific" && tags.includes("regulated")) {
    return {
      meme: {
        local: "Hard",
        region: "Hard",
        world: "Hard",
        eu: "Very hard",
        note: "Licensed-exchange / VAS cultures dominate; influencer meme stacks face marketing and AML limits.",
      },
      ico: {
        local: "Hard",
        region: "Hard",
        world: "Hard",
        eu: "Very hard",
        note: "Public offers usually need licensed venues or prospectus-style paths. EU buyers still under MiCA.",
      },
    };
  }
  if (region === "north-america") {
    return {
      meme: {
        local: "Very hard",
        region: "Very hard",
        world: "Very hard",
        eu: "Very hard",
        note: "Securities / MSA / state rules make coordinated meme launches high risk.",
      },
      ico: {
        local: "Very hard",
        region: "Very hard",
        world: "Very hard",
        eu: "Very hard",
        note: "Registered or exempt offerings only for serious public sales.",
      },
    };
  }
  if (region === "latin-america") {
    return {
      meme: {
        local: "Medium",
        region: "Medium",
        world: "Hard",
        eu: "Very hard",
        note: "Deploy easy; local marketing less MiCA-like but securities/consumer rules still apply. EU is separate.",
      },
      ico: {
        local: "Medium",
        region: "Medium",
        world: "Hard",
        eu: "Very hard",
        note: "Local raise with counsel possible in some markets; world/EU need multi-jurisdiction packaging.",
      },
    };
  }
  // Africa / MENA / default legal
  return {
    meme: {
      local: "Medium",
      region: "Medium",
      world: "Hard",
      eu: "Very hard",
      note: "Legal to hold ≠ free public meme marketing. Thin markets still have AML and consumer risk.",
    },
    ico: {
      local: "Hard",
      region: "Hard",
      world: "Hard",
      eu: "Very hard",
      note: "Public token sales need local licence analysis; EU retail remains MiCA.",
    },
  };
}

function lawBuildHubForLegal(j, seed, meta) {
  const name = j.name;
  const flag = seed.flag || LAW_ISO_FLAG[j.iso2] || "🌐";
  const accent = seed.accent || "#10b981";
  const summary = j.summary || "";
  const tags = j.tags || [];
  const isMica = tags.includes("mica") || j.region === "eu-mica";
  const isAfrica = j.region === "middle-east-africa";
  const isLatam = j.region === "latin-america";
  const isApac = j.region === "asia-pacific";

  const headline =
    seed.headline ||
    (isMica
      ? `${name} · EU MiCA · legal / regulated holding & CASP path`
      : `${name} · legal / regulated on The Law map · founder deep dive`);

  const fit =
    seed.fit ||
    (isMica
      ? `EU-resident founders needing MiCA perimeter and ${name} substance — personal tax still country-specific.`
      : `Founders exploring ${name} as company seat and/or tax residence where BTC is legal/regulated (map green). Educational only.`);

  const pros = seed.pros || [
    isMica ? "EU single market / MiCA packaging" : "Legal / regulated BTC status (map green)",
    summary ? summary.slice(0, 100) + (summary.length > 100 ? "…" : "") : "See Overview legal-status card",
    isAfrica ? "Often competitive CoL vs Western Europe" : isLatam ? "LatAm / Americas timezone options" : isApac ? "APAC market access themes" : "Institutional rails vary — verify banks",
  ];

  const cons = seed.cons || [
    isMica ? "Personal tax can be high if you become tax resident" : "Banking KYC still hard for pure crypto founders",
    "Public meme/ICO marketing is not free just because holding is legal",
    "Italy dual-residence / CFC / PE risk if ties remain in IT",
    isAfrica ? "Formal VASP depth and power/ops vary widely" : "Rules and tax guidance change — re-verify yearly",
  ];

  const kycDefault = isMica
    ? `EU AMLD-style CDD/EDD; UBO registers; Travel Rule for CASPs; CRS. ${name} banks and VASPs will still enhance-review crypto SOF/SOW and Italian-exit narratives.`
    : `Banks and VASPs in ${name} apply CDD/EDD, SOF/SOW, sanctions screening, and typically CRS. Prepare exchange exports, wallet history, and a clear business narrative. Verify local obliged-entity rules.`;

  const taxPersonalDefault = isMica
    ? `As a ${name} tax resident you are generally in a worldwide personal tax system with national rates/social charges. MiCA regulates products/services — not your personal income tax. Confirm with local + Italian counsel before moving.`
    : `Confirm ${name} resident vs non-resident tests and whether the tax base is worldwide or territorial. A map-green legal status does not mean zero tax on crypto. Dual-residence risk with Italy if days/ties remain.`;

  const taxCompanyDefault = isMica
    ? `Corporate tax on ${name} entities plus MiCA CASP capital/governance if you provide crypto-asset services. PE risk if managed from Italy without substance.`
    : `Corporate tax depends on entity type and activity in ${name}. Crypto service licences may be separate from company formation. PE risk if managed from Italy.`;

  const wealthDefault =
    seed.wealthOnArrival ||
    `Map whether becoming resident creates wealth tax, remittance tax, or only future income tax. Banking origin-of-wealth checks for BTC/stables are separate from formal tax. Coordinate Italy exit-year timing.`;

  const cryptoTaxDefault =
    seed.cryptoTaxOnResidency ||
    `After tax residency in ${name}, disposals of BTC/stables may be taxed (capital gains, income, or other). There is usually no free step-up just for arriving — document cost basis. Stablecoin characterisation needs a written local memo. EU public offers still need MiCA packaging for EU retail.`;

  const localServices = lawBuildLocalServices(j, seed);
  const cryptoStartups = lawBuildCryptoStartups(j, seed);

  return {
    flag,
    accent,
    headline,
    fit,
    colBands: seed.colBands || lawDefaultColBands(meta.col),
    pros,
    cons,
    company:
      seed.companyNote ||
      (isMica
        ? `Local EU company forms via counsel/notary as applicable. Crypto-asset services require MiCA CASP authorisation (or a compliant partner) to serve EU clients.`
        : `Local company formation via counsel in ${name}. If you provide exchange/custody/transfer services, map the national VASP/licence perimeter separately from incorporation.`),
    visa:
      seed.visaNote ||
      (isMica
        ? `EU free movement if you are an EU citizen; otherwise national work/residence permits. Days and centre of interests can create tax residence — track calendars vs Italy.`
        : `Tourist stays ≠ work rights or tax residence. Map temporary residence / work / investment visas with immigration counsel for ${name}.`),
    banking:
      seed.bankingNote ||
      `Expect enhanced due diligence for crypto founders. Multi-rail (local bank + EMI) is common. Clean SOF/SOW pack before arrival.`,
    crypto:
      seed.cryptoNote ||
      `${summary || "See Overview card."} Holding legal/regulated does not authorise unlicensed public offerings. EU clients → MiCA.`,
    localServices,
    cryptoStartups,
    kycAml: seed.kycAml || kycDefault,
    taxPersonal: seed.taxPersonal || taxPersonalDefault,
    taxCompany: seed.taxCompany || taxCompanyDefault,
    wealthOnArrival: wealthDefault,
    cryptoTaxOnResidency: cryptoTaxDefault,
    next: seed.next || [
      `Open BTC legal-status card for ${name}`,
      "Verify local exchange / CASP / VASP register before depositing",
      "Local tax + immigration counsel memos",
      "Bank SOF/SOW pack (exchange + wallet history)",
      "Italy exit-year model if relocating personally",
      isMica ? "MiCA CASP vs EU partner path" : "Licence map if offering crypto services",
    ],
    mapStatus: "legal",
  };
}

function lawBuildBrowserEntry(j, id, seed, meta) {
  const tags = ["map-legal", "legal", ...(j.tags || []).filter((t) => t !== "legal")];
  if (j.region === "eu-mica") tags.push("eu", "mica");
  return {
    id,
    lawId: j.id,
    name: j.name.replace(/ SAR$/, "").replace(/ \(MiCA overview\)/, ""),
    region: lawRegionLabel(j.region),
    priority: false,
    tags,
    col: meta.col,
    company: meta.company,
    banking: meta.banking,
    crypto: "legal",
    visa: meta.visa,
    blurb: (j.summary || `${j.name}: legal / regulated on The Law map.`).slice(0, 160),
    mapLegal: true,
    servicesSummary: lawBuildLocalServices(j, seed).summary || "",
  };
}

/**
 * Ensure every jurisdiction with status "legal" has browser + hub + launch ease.
 * Idempotent; preserves curated priority hubs and existing deep dives.
 */
function lawSyncLegalRelocateDestinations() {
  if (!lawData?.jurisdictions?.length) return { added: 0, totalLegal: 0 };
  let added = 0;
  const legal = lawData.jurisdictions.filter(
    (j) => j.status === "legal" && !LAW_LEGAL_SKIP_IDS.has(j.id),
  );

  // Fix lawId on a few EU hubs that were null
  const lawIdFixes = { portugal: "portugal", spain: "spain", estonia: "estonia" };
  for (const [bid, lid] of Object.entries(lawIdFixes)) {
    const row = LAW_RELOCATE_BROWSER.find((c) => c.id === bid);
    if (row && !row.lawId) row.lawId = lid;
  }

  for (const j of legal) {
    const id = lawLegalBrowserId(j);
    const seed = LAW_LEGAL_SEED[j.id] || LAW_LEGAL_SEED[id] || {};
    const meta = lawInferMeta(j, seed);

    let row = LAW_RELOCATE_BROWSER.find((c) => c.id === id || c.lawId === j.id);
    if (!row) {
      row = lawBuildBrowserEntry(j, id, seed, meta);
      LAW_RELOCATE_BROWSER.push(row);
      added += 1;
    } else {
      // Tag existing rows that are map-legal
      if (!row.tags) row.tags = [];
      if (!row.tags.includes("map-legal")) row.tags.push("map-legal");
      if (!row.lawId) row.lawId = j.id;
      row.mapLegal = true;
    }

    const services = lawBuildLocalServices(j, seed);
    const startups = lawBuildCryptoStartups(j, seed);
    row.servicesSummary = services.summary || row.servicesSummary || "";
    row.startupsCount = (startups.rows || []).length;

    if (!LAW_RELOCATE_HUBS[id]) {
      LAW_RELOCATE_HUBS[id] = lawBuildHubForLegal(j, seed, meta);
    } else {
      // Attach / refresh local crypto services + startups on existing curated hubs
      const hub = LAW_RELOCATE_HUBS[id];
      if (!hub.localServices || !hub.localServices.exchanges || hub.localServices.source === "template") {
        hub.localServices = services;
      } else if (services.source === "curated") {
        hub.localServices = services;
      }
      // Always refresh named bank list so curated banks stay current
      if (hub.localServices) {
        hub.localServices.banksList = services.banksList || lawSimBanksFor(j);
      }
      if (!hub.cryptoStartups || !hub.cryptoStartups.rows?.length || hub.cryptoStartups.source === "template") {
        hub.cryptoStartups = startups;
      } else if (startups.source === "curated") {
        hub.cryptoStartups = startups;
      }
    }

    if (!LAW_LAUNCH_EASE[id]) {
      LAW_LAUNCH_EASE[id] = lawBuildLaunchForLegal(j);
    }
  }

  // Sort browser: priority first, then name (stable for UI)
  LAW_RELOCATE_BROWSER.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return { added, totalLegal: legal.length, browserSize: LAW_RELOCATE_BROWSER.length };
}

// Expose for debugging
if (typeof window !== "undefined") {
  window.lawSyncLegalRelocateDestinations = lawSyncLegalRelocateDestinations;
}
