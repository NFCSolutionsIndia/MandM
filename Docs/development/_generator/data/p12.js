module.exports = {
  id: 'PHASE-12', name: 'Release 3 — "Gifting & Legacy" (Commerce, Group Gifting & Legacy Vault)', release: 'Release 3',
  objective: 'Add the gift business and the inheritance promise — the two largest additions, and the two that are gated on things engineering cannot decide.',
  business: 'Gifting is a second business with its own economics. Legacy transfer is the product\'s boldest promise and its highest legal exposure.',
  technical: 'Catalog, cart, checkout, orders, logistics, returns, promotions, group gifting — plus the Legacy Vault with a KYC-gated unlock protocol.',
  priority: 'medium', deps: ['PHASE-11'], effort: '~16–20 weeks, and a business decision as much as an engineering one',
  outcome: 'Users can send physical gifts from within the product, and can name heirs who will inherit their vault through a verified, auditable process.',
  purpose: `**Task decomposition for this phase is deferred, and two of its modules are blocked on decisions outside engineering.**

The reasoning, from [00_PROJECT_PLAN.md](../00_PROJECT_PLAN.md) §6 and blueprint §27.3:

**Commerce should be validated before it is built.** Blueprint §27.3 is explicit: "before building inventory, fulfilment, and returns, launch gifting as **curated affiliate or dropship links** from the wishlist and occasion surfaces. It validates whether users will buy gifts *through this product* at a fraction of the cost, and the same PDP and shelf designs are reused later. Owning inventory is a decision to become a retailer — it should follow evidence, not precede it." Decomposing a catalog-and-logistics system now would produce a plan discarded if that validation fails.

**Legacy Vault is blocked on legal counsel.** Open question A-4 — how death is verified, who adjudicates a dispute, what waiting period applies, which KYC vendor — cannot be answered by engineering. Blueprint §23.3 is unambiguous about the consequence of getting it wrong: "shipping it half-built means either failing to transfer a vault or transferring one wrongly — both catastrophic."

**Scale matters too.** §34.13 notes this release adds roughly nineteen entities, "roughly a third of the entire data model, serving a business the product has not yet validated".

The module set and constraints below are decided. Decomposition is an explicit gate after Release 2, and for the legacy modules, after legal sign-off.`,
  goals: [
    'Validate gift intent with affiliate or dropship links before owning inventory.',
    'If validated, ship a full gift commerce experience with honest delivery-date guarantees.',
    'Ship group gifting with an auto-refund guarantee stated before money is collected.',
    'Ship the Legacy Vault with an unlock protocol that is verifiable, cancellable by the owner, and fully audited.',
  ],
  features: [
    'Gift catalog, PDP, cart, wishlist, checkout, orders, tracking, returns.',
    'Serviceability and delivery-date filtering ("arrives before the birthday").',
    'Promotions and group gifting with auto-refund.',
    'Admin catalog, orders and logistics, payments and refunds.',
    'Nominees with scoped permissions.',
    'Legacy Vault with date, inactivity, and nominee-initiated triggers.',
    'Unlock protocol: KYC, owner notification at every step, waiting period, second-nominee confirmation, immutable audit trail.',
    'Template and sticker marketplace with licensed music.',
    'Public memorial pages (opt-in).',
  ],
  arch: [
    'Commerce is the likeliest first candidate for extraction into a real service (ADR-004): different scaling, different compliance, possibly a different team.',
    'Adds a KYC provider integration and a human-operations workflow, neither of which exists in Releases 1 or 2.',
    'Introduces the first genuinely public content surface (memorial pages), which changes the privacy model\'s assumptions and needs its own moderation thinking.',
  ],
  depDetail: [
    '**PHASE-11** must have shipped.',
    '**Open question A-4 (heir verification)** blocks the legacy modules entirely. Legal counsel per jurisdiction is required before decomposition.',
    '**Open question A-6 (fulfilment partner)** blocks owned-inventory commerce.',
    '**Open question A-5 (music licensing)** blocks the template and sticker marketplace.',
    '**Commerce validation:** affiliate/dropship evidence should precede the owned-inventory decision (§27.3).',
  ],
  deliverables: [
    'An affiliate/dropship validation experiment and its result.',
    'Legal sign-off on the heir verification model, or a decision not to build it.',
    'A decomposed task plan for whichever modules survive those two gates.',
  ],
  ac: [
    'Commerce validation completed with a recorded decision on owned inventory.',
    'A-4 resolved with legal sign-off, or the legacy modules formally cut.',
    'A-6 resolved before any fulfilment work begins.',
    'A-5 resolved before the marketplace is decomposed.',
    'Task decomposition completed only for modules whose gates have cleared.',
  ],
  risks: [
    ['Building a retail business the product does not need', 'high', 'Validate with affiliate/dropship first (§27.3). The PDP and shelf designs are reused either way, so the design work is not wasted.'],
    ['Shipping legacy transfer without legal grounding', 'critical', 'Blocked on A-4. §23.3: failing to transfer a vault, or transferring one wrongly, are both catastrophic. Marketing the vision while not shipping the feature is the correct interim position.'],
    ['Handing a vault to the wrong person', 'critical', 'KYC, a mandatory unshortenable waiting period, owner notification at every step, owner cancellation, and second-nominee confirmation — the same shape as the PHASE-02 account-recovery protocol, deliberately.'],
    ['Commerce compliance (GST, returns, consumer law) underestimated', 'high', 'Treated as a business decision with its own diligence, not an engineering task.'],
    ['Public memorial pages introducing a moderation surface the product has never had', 'high', 'Requires its own abuse thinking; the private-by-default model does not transfer.'],
  ],
  gate: 'A-4 resolved with legal sign-off, commerce validated, and a decomposed plan produced for the modules that survive',
  trace: ['§27.3 Release 3', '§7.3', '§23.3', '§29.19', '§29.25', '§34.9', '§34.10', 'A-4', 'A-5', 'A-6'],

  modules: [
    {
      id: 'MOD-12-01', name: 'Gift Commerce — Validation, Catalog & Checkout',
      purpose: 'Sell gifts, but only after proving anyone wants to buy them here.',
      priority: 'medium',
      objective: 'Validate gift intent cheaply, then build the full commerce experience if the evidence supports it.',
      business: [
        'Blueprint §27.3 recommends validating with affiliate or dropship links before owning inventory, because "owning inventory is a decision to become a retailer — it should follow evidence, not precede it".',
        '§34.13 notes commerce adds roughly nineteen entities, a third of the whole data model.',
      ],
      functional: [
        '**Stage 1 (validation):** curated affiliate or dropship links surfaced from wishlists and occasion screens, with click-through and conversion measured.',
        '**Stage 2 (if validated):** catalog, PDP, cart, checkout, orders, tracking, returns, promotions.',
        'Serviceability and delivery-date filtering, including the critical "arrives before the birthday" filter.',
        'Gift wrap, card message with live preview, and hide-price option.',
        'Group gifting with a progress ring and auto-refund if the goal is missed.',
      ],
      ui: ['Per §29.19–29.24', 'The occasion detail screen\'s "Shop gift" CTA, hidden until this release'],
      backend: ['Catalog and inventory', 'Cart and checkout with 3DS and UPI redirect resumption', 'Order lifecycle and courier integration', 'Returns and refunds'],
      db: ['~16 commerce entities per §34.9'],
      integrations: ['Courier APIs', 'Razorpay and Stripe for order payments', 'Print or dropship partners'],
      security: [
        'Checkout state persisted server-side and resumed by order id, because a PWA must survive a full navigation away for 3DS and UPI (§29.22).',
        'Gift notes and addresses are personal data belonging to third parties.',
      ],
      testing: ['Serviceability, delivery-date promises, payment redirect resumption, refund correctness'],
      ac: [
        'Validation stage completed with a recorded decision before any inventory is owned.',
        'The delivery-date promise on a PDP is honoured or the order is not accepted.',
        'A payment redirect that leaves and returns to the app resumes correctly.',
      ],
      trace: ['§27.3', '§29.19', '§29.22', '§29.24', '§34.9', 'A-6'],
    },
    {
      id: 'MOD-12-02', name: 'Legacy Vault, Nominees & The Unlock Protocol',
      purpose: 'The inheritance promise — built properly or not at all.',
      priority: 'medium',
      objective: 'Let a user name heirs and store messages that reach them after death, through a process that cannot hand a vault to the wrong person.',
      business: [
        'Blueprint §2.3 calls this the product\'s boldest promise: it "solves digital-estate loss — the most emotionally expensive failure in personal media today".',
        '§23.3 calls it "the boldest promise and the biggest trap".',
      ],
      functional: [
        'Nominees with scoped permissions (vault only, or full archive), invited and accepted explicitly.',
        'Legacy Vault items bound to triggers: a specific date, account inactivity, or nominee-initiated release.',
        'The unlock protocol: nominee request → identity verification → owner notified at every step → mandatory waiting period with owner cancellation → second-nominee confirmation → release with a full immutable audit trail shown to all parties.',
        'Posthumous scheduled delivery.',
      ],
      ui: ['Per §29.25 — a sensitive, unhurried explainer and one screen per protocol step'],
      backend: ['KYC provider integration', 'The unlock state machine', 'Human-operations workflow'],
      db: ['`Nominee`, `LegacyVaultItem`, `UnlockRequest` (§34.10)'],
      integrations: ['A KYC provider (undecided — A-4)'],
      security: [
        '**The waiting period cannot be shortened by anyone, for any reason** — the same rule as PHASE-02 account recovery. If it can be waived, it provides no protection.',
        'Owner notified at every step and able to cancel at any point during the waiting period.',
        'Second-nominee confirmation where multiple nominees exist.',
        'Every transition audited and shown to all parties.',
      ],
      testing: ['Protocol state machine', 'Waiting-period floor enforcement', 'Owner cancellation immediacy', 'Second-approver requirement', 'Audit completeness'],
      ac: [
        '**A-4 resolved with legal sign-off before any implementation begins.**',
        'The waiting period cannot be shortened, including by an administrator, proven by test.',
        'Owner cancellation is immediate and final for that request.',
        'No single party can release a vault alone.',
      ],
      trace: ['§29.25', '§34.10', '§23.3', '§7.3 F1', '§7.3 F2', 'A-4'],
    },
    {
      id: 'MOD-12-03', name: 'Marketplace, Generative Creations & Memorial Pages',
      purpose: 'The outward-facing, creative surface — smallest scope, most optional.',
      priority: 'low',
      objective: 'Add templates, licensed music, generative cards, and opt-in memorial pages, each gated on its own open question.',
      business: [
        'Blueprint §15 A8 notes generative cards are "a *different product* from a memory vault — it competes with Canva rather than with Google Photos".',
        '§7.3 F12 sees memorial pages as reach and organic search, but they introduce the product\'s first public surface.',
      ],
      functional: [
        'Template and sticker marketplace: occasion frames, animated text presets.',
        'Licensed music library — **blocked on A-5**.',
        'AI generative cards and posters: ship three templates well rather than fifteen badly (§7.3 F5).',
        'Physical card fulfilment — blocked on A-6.',
        'Opt-in public memorial pages.',
      ],
      ui: ['Marketplace browse and apply', 'Card composer', 'Memorial page template'],
      backend: ['Template engine', 'Generative image pipeline', 'Public page rendering with its own caching'],
      db: ['`Template` extensions, `PrintOrder`'],
      security: [
        '**Memorial pages are the first genuinely public content surface**, which the private-by-default model does not cover. They need their own moderation, abuse, and takedown thinking before launch.',
        'Generative images of real family members are an area where quality failures are unusually upsetting — prefer template composition over generative re-rendering of faces (§15 A8).',
      ],
      testing: ['Template rendering', 'Generative output quality gates', 'Public page moderation path'],
      ac: [
        'A-5 resolved before the music library ships.',
        'Memorial pages have a moderation and takedown path before the first page is published.',
        'Generative features avoid re-rendering real faces.',
      ],
      trace: ['§7.3 F5', '§7.3 F6', '§7.3 F12', '§15 A8', 'A-5', 'A-6'],
    },
  ],
};
