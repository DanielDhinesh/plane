# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Built-in, industry-grade project templates.

A template definition is plain data:

- ``states``: ordered list of {name, group, color, default?}; groups are Plane's
  backlog / unstarted / started / completed / cancelled.
- ``labels``: [{name, color}]
- ``modules``: [{name, description}]
- ``work_items``: [{name, state, priority, labels?, module?, description?}]
- ``workflow``: "linear" (each state may move one step forward/back, anything can be
  cancelled), "open" (no enforcement) or an explicit list of [from, to] state names.
- ``features``: project feature toggles (cycle_view, module_view, page_view, intake_view, is_time_tracking_enabled)
"""

from copy import deepcopy

GRAY, BLUE, AMBER, PURPLE, GREEN, RED, TEAL, PINK, INDIGO, ORANGE = (
    "#94A3B8",
    "#3B82F6",
    "#F59E0B",
    "#8B5CF6",
    "#22C55E",
    "#EF4444",
    "#14B8A6",
    "#EC4899",
    "#6366F1",
    "#F97316",
)


def _s(name, group, color, default=False):
    return {"name": name, "group": group, "color": color, "default": default}


def _w(name, state, priority="medium", labels=None, module=None, description=""):
    return {
        "name": name,
        "state": state,
        "priority": priority,
        "labels": labels or [],
        "module": module,
        "description": description,
    }


BUILTIN_TEMPLATES = [
    {
        "key": "agile-scrum",
        "name": "Agile Scrum",
        "industry": "Software",
        "icon": "rocket",
        "description": "Sprint-based delivery with backlog refinement, code review and QA gates.",
        "features": {"cycle_view": True, "module_view": True, "page_view": True, "intake_view": True},
        "states": [
            _s("Backlog", "backlog", GRAY),
            _s("Ready for Sprint", "unstarted", BLUE, True),
            _s("In Progress", "started", AMBER),
            _s("Code Review", "started", PURPLE),
            _s("QA", "started", TEAL),
            _s("Done", "completed", GREEN),
            _s("Won't Do", "cancelled", RED),
        ],
        "labels": [
            {"name": "Story", "color": BLUE},
            {"name": "Bug", "color": RED},
            {"name": "Tech Debt", "color": ORANGE},
            {"name": "Spike", "color": PURPLE},
            {"name": "Frontend", "color": TEAL},
            {"name": "Backend", "color": INDIGO},
        ],
        "modules": [
            {"name": "Authentication", "description": "Login, SSO and session management"},
            {"name": "Payments", "description": "Checkout and invoicing"},
        ],
        "work_items": [
            _w("Define the Definition of Done", "Ready for Sprint", "high", ["Story"]),
            _w("Set up CI pipeline with test gates", "In Progress", "high", ["Tech Debt", "Backend"]),
            _w("Social sign-in with Google", "Backlog", "medium", ["Story", "Frontend"], "Authentication"),
            _w("Password reset email is not delivered", "Code Review", "urgent", ["Bug", "Backend"], "Authentication"),
            _w("Research payment provider options", "Backlog", "low", ["Spike"], "Payments"),
            _w("Sprint retrospective action items", "Ready for Sprint", "medium", []),
        ],
        "workflow": "linear",
    },
    {
        "key": "kanban-delivery",
        "name": "Kanban Delivery",
        "industry": "Operations",
        "icon": "kanban",
        "description": "Continuous flow with WIP-friendly columns for any team.",
        "features": {"cycle_view": False, "module_view": True, "page_view": True, "intake_view": True},
        "states": [
            _s("Requested", "backlog", GRAY),
            _s("To Do", "unstarted", BLUE, True),
            _s("Doing", "started", AMBER),
            _s("Blocked", "started", RED),
            _s("Review", "started", PURPLE),
            _s("Done", "completed", GREEN),
            _s("Dropped", "cancelled", GRAY),
        ],
        "labels": [
            {"name": "Expedite", "color": RED},
            {"name": "Standard", "color": BLUE},
            {"name": "Fixed Date", "color": AMBER},
            {"name": "Intangible", "color": GRAY},
        ],
        "modules": [],
        "work_items": [
            _w("Agree WIP limits per column", "To Do", "high", ["Standard"]),
            _w("Weekly replenishment meeting", "Doing", "medium", ["Standard"]),
            _w("Vendor contract renewal", "Requested", "medium", ["Fixed Date"]),
            _w("Production incident follow-up", "Blocked", "urgent", ["Expedite"]),
        ],
        "workflow": "open",
    },
    {
        "key": "bug-tracking",
        "name": "Bug Tracking",
        "industry": "Software",
        "icon": "bug",
        "description": "Triage, reproduce, fix and verify defects with severity labels.",
        "features": {"cycle_view": True, "module_view": True, "page_view": False, "intake_view": True},
        "states": [
            _s("New", "backlog", GRAY),
            _s("Triaged", "unstarted", BLUE, True),
            _s("Fixing", "started", AMBER),
            _s("Ready to Verify", "started", PURPLE),
            _s("Verified", "completed", GREEN),
            _s("Duplicate", "cancelled", GRAY),
            _s("Cannot Reproduce", "cancelled", RED),
        ],
        "labels": [
            {"name": "Sev 1", "color": RED},
            {"name": "Sev 2", "color": ORANGE},
            {"name": "Sev 3", "color": AMBER},
            {"name": "Regression", "color": PURPLE},
            {"name": "Customer Reported", "color": PINK},
        ],
        "modules": [],
        "work_items": [
            _w("Checkout fails on Safari 17", "Fixing", "urgent", ["Sev 1", "Customer Reported"]),
            _w("Dark mode text contrast on settings page", "Triaged", "low", ["Sev 3"]),
            _w("Export to CSV drops unicode characters", "New", "medium", ["Sev 2", "Regression"]),
        ],
        "workflow": [
            ["New", "Triaged"],
            ["New", "Duplicate"],
            ["New", "Cannot Reproduce"],
            ["Triaged", "Fixing"],
            ["Triaged", "Duplicate"],
            ["Fixing", "Ready to Verify"],
            ["Ready to Verify", "Verified"],
            ["Ready to Verify", "Fixing"],
            ["Verified", "Fixing"],
        ],
    },
    {
        "key": "it-service-desk",
        "name": "IT Service Desk",
        "industry": "IT & Support",
        "icon": "headset",
        "description": "ITIL-style incidents, service requests and changes with SLA priorities.",
        "features": {"cycle_view": False, "module_view": True, "page_view": True, "intake_view": True},
        "states": [
            _s("Open", "backlog", GRAY),
            _s("Assigned", "unstarted", BLUE, True),
            _s("In Progress", "started", AMBER),
            _s("Waiting on Customer", "started", PINK),
            _s("Resolved", "completed", GREEN),
            _s("Closed", "completed", TEAL),
            _s("Rejected", "cancelled", RED),
        ],
        "labels": [
            {"name": "Incident", "color": RED},
            {"name": "Service Request", "color": BLUE},
            {"name": "Change", "color": PURPLE},
            {"name": "Problem", "color": ORANGE},
            {"name": "Hardware", "color": GRAY},
            {"name": "Access", "color": TEAL},
        ],
        "modules": [
            {"name": "Onboarding Requests", "description": "Laptops, accounts and access for new hires"},
            {"name": "Network", "description": "Wi-Fi, VPN and connectivity"},
        ],
        "work_items": [
            _w("VPN disconnects every 10 minutes", "In Progress", "high", ["Incident"], "Network"),
            _w(
                "New laptop for incoming designer",
                "Assigned",
                "medium",
                ["Service Request", "Hardware"],
                "Onboarding Requests",
            ),
            _w("Grant finance team access to ERP", "Waiting on Customer", "medium", ["Access"]),
            _w("Upgrade core switch firmware", "Open", "low", ["Change"], "Network"),
        ],
        "workflow": "linear",
    },
    {
        "key": "marketing-campaign",
        "name": "Marketing Campaign",
        "industry": "Marketing",
        "icon": "megaphone",
        "description": "Plan, produce, approve and launch multi-channel campaigns.",
        "features": {"cycle_view": True, "module_view": True, "page_view": True, "intake_view": True},
        "states": [
            _s("Ideas", "backlog", GRAY),
            _s("Planned", "unstarted", BLUE, True),
            _s("In Production", "started", AMBER),
            _s("Awaiting Approval", "started", PURPLE),
            _s("Scheduled", "started", TEAL),
            _s("Live", "completed", GREEN),
            _s("Cancelled", "cancelled", RED),
        ],
        "labels": [
            {"name": "Email", "color": BLUE},
            {"name": "Social", "color": PINK},
            {"name": "Paid Ads", "color": ORANGE},
            {"name": "SEO", "color": GREEN},
            {"name": "Event", "color": PURPLE},
            {"name": "Design", "color": TEAL},
        ],
        "modules": [
            {"name": "Q-Launch Campaign", "description": "Flagship campaign for the quarter"},
            {"name": "Always-on", "description": "Evergreen content and nurture"},
        ],
        "work_items": [
            _w("Campaign brief and KPIs", "Planned", "high", [], "Q-Launch Campaign"),
            _w("Landing page copy", "In Production", "high", ["SEO"], "Q-Launch Campaign"),
            _w(
                "Hero banner and ad creatives",
                "Awaiting Approval",
                "medium",
                ["Design", "Paid Ads"],
                "Q-Launch Campaign",
            ),
            _w("Launch email to customer list", "Scheduled", "medium", ["Email"], "Q-Launch Campaign"),
            _w("Monthly newsletter", "Ideas", "low", ["Email"], "Always-on"),
        ],
        "workflow": "linear",
    },
    {
        "key": "product-launch",
        "name": "Product Launch",
        "industry": "Product",
        "icon": "flag",
        "description": "Cross-functional go-to-market checklist from beta to general availability.",
        "features": {"cycle_view": True, "module_view": True, "page_view": True, "intake_view": False},
        "states": [
            _s("Not Started", "backlog", GRAY),
            _s("Planned", "unstarted", BLUE, True),
            _s("In Progress", "started", AMBER),
            _s("At Risk", "started", RED),
            _s("Complete", "completed", GREEN),
            _s("Descoped", "cancelled", GRAY),
        ],
        "labels": [
            {"name": "Engineering", "color": INDIGO},
            {"name": "Marketing", "color": PINK},
            {"name": "Sales", "color": GREEN},
            {"name": "Support", "color": TEAL},
            {"name": "Legal", "color": PURPLE},
        ],
        "modules": [
            {"name": "Beta", "description": "Private beta with design partners"},
            {"name": "General Availability", "description": "Public launch"},
        ],
        "work_items": [
            _w("Recruit 10 beta customers", "In Progress", "high", ["Sales"], "Beta"),
            _w("Pricing and packaging sign-off", "Planned", "urgent", ["Sales", "Marketing"], "General Availability"),
            _w("Help center articles", "Not Started", "medium", ["Support"], "General Availability"),
            _w("Terms of service update", "At Risk", "high", ["Legal"], "General Availability"),
            _w("Feature-flag rollout plan", "Planned", "medium", ["Engineering"], "Beta"),
        ],
        "workflow": "open",
    },
    {
        "key": "sales-pipeline",
        "name": "Sales Pipeline (CRM)",
        "industry": "Sales",
        "icon": "dollar",
        "description": "Track deals from lead to closed-won with stage gates.",
        "features": {"cycle_view": False, "module_view": True, "page_view": True, "intake_view": True},
        "states": [
            _s("Lead", "backlog", GRAY),
            _s("Qualified", "unstarted", BLUE, True),
            _s("Discovery", "started", INDIGO),
            _s("Proposal", "started", AMBER),
            _s("Negotiation", "started", PURPLE),
            _s("Closed Won", "completed", GREEN),
            _s("Closed Lost", "cancelled", RED),
        ],
        "labels": [
            {"name": "Enterprise", "color": PURPLE},
            {"name": "Mid-Market", "color": BLUE},
            {"name": "SMB", "color": TEAL},
            {"name": "Inbound", "color": GREEN},
            {"name": "Outbound", "color": ORANGE},
        ],
        "modules": [],
        "work_items": [
            _w("Acme Corp - 200 seats", "Negotiation", "urgent", ["Enterprise", "Outbound"]),
            _w("Globex - pilot expansion", "Proposal", "high", ["Mid-Market"]),
            _w("Initech - demo request", "Qualified", "medium", ["SMB", "Inbound"]),
            _w("Umbrella Health - RFP", "Discovery", "high", ["Enterprise", "Inbound"]),
        ],
        "workflow": "linear",
    },
    {
        "key": "recruiting",
        "name": "Recruiting Pipeline",
        "industry": "HR",
        "icon": "users",
        "description": "Hiring funnel from application through offer, with interview loops.",
        "features": {"cycle_view": False, "module_view": True, "page_view": True, "intake_view": True},
        "states": [
            _s("Applied", "backlog", GRAY),
            _s("Screening", "unstarted", BLUE, True),
            _s("Interviewing", "started", AMBER),
            _s("Offer", "started", PURPLE),
            _s("Hired", "completed", GREEN),
            _s("Rejected", "cancelled", RED),
            _s("Withdrawn", "cancelled", GRAY),
        ],
        "labels": [
            {"name": "Engineering", "color": INDIGO},
            {"name": "Design", "color": PINK},
            {"name": "Sales", "color": GREEN},
            {"name": "Referral", "color": TEAL},
            {"name": "Senior", "color": PURPLE},
        ],
        "modules": [
            {"name": "Senior Backend Engineer", "description": "Open requisition"},
            {"name": "Product Designer", "description": "Open requisition"},
        ],
        "work_items": [
            _w("Candidate: J. Rivera", "Interviewing", "high", ["Engineering", "Senior"], "Senior Backend Engineer"),
            _w("Candidate: A. Chen", "Screening", "medium", ["Design", "Referral"], "Product Designer"),
            _w("Write interview scorecard", "Screening", "medium", [], "Senior Backend Engineer"),
        ],
        "workflow": "linear",
    },
    {
        "key": "employee-onboarding",
        "name": "Employee Onboarding",
        "industry": "HR",
        "icon": "badge",
        "description": "30-60-90 day onboarding checklist across HR, IT and the hiring manager.",
        "features": {"cycle_view": False, "module_view": True, "page_view": True, "intake_view": False},
        "states": [
            _s("To Do", "unstarted", BLUE, True),
            _s("In Progress", "started", AMBER),
            _s("Done", "completed", GREEN),
            _s("Not Applicable", "cancelled", GRAY),
        ],
        "labels": [
            {"name": "HR", "color": PINK},
            {"name": "IT", "color": INDIGO},
            {"name": "Manager", "color": TEAL},
            {"name": "Compliance", "color": RED},
        ],
        "modules": [
            {"name": "Before Day 1", "description": "Pre-boarding"},
            {"name": "First 30 Days", "description": "Learn"},
            {"name": "First 90 Days", "description": "Own"},
        ],
        "work_items": [
            _w("Send welcome pack and contract", "To Do", "high", ["HR"], "Before Day 1"),
            _w("Provision laptop and accounts", "To Do", "high", ["IT"], "Before Day 1"),
            _w("Security and compliance training", "To Do", "medium", ["Compliance"], "First 30 Days"),
            _w("Set 90-day goals with manager", "To Do", "medium", ["Manager"], "First 90 Days"),
        ],
        "workflow": "open",
    },
    {
        "key": "construction-project",
        "name": "Construction Project",
        "industry": "Construction",
        "icon": "building",
        "description": "Phased build with permits, inspections, procurement and punch lists.",
        "features": {"cycle_view": False, "module_view": True, "page_view": True, "intake_view": True},
        "states": [
            _s("Planned", "backlog", GRAY),
            _s("Scheduled", "unstarted", BLUE, True),
            _s("In Progress", "started", AMBER),
            _s("Inspection", "started", PURPLE),
            _s("On Hold", "started", RED),
            _s("Completed", "completed", GREEN),
            _s("Cancelled", "cancelled", GRAY),
        ],
        "labels": [
            {"name": "Permit", "color": PURPLE},
            {"name": "Procurement", "color": ORANGE},
            {"name": "Safety", "color": RED},
            {"name": "Electrical", "color": AMBER},
            {"name": "Plumbing", "color": BLUE},
            {"name": "Punch List", "color": TEAL},
        ],
        "modules": [
            {"name": "Pre-construction", "description": "Design, permits and procurement"},
            {"name": "Foundation & Structure", "description": "Site work through framing"},
            {"name": "MEP & Finishes", "description": "Mechanical, electrical, plumbing and finishes"},
        ],
        "work_items": [
            _w("Submit building permit application", "In Progress", "urgent", ["Permit"], "Pre-construction"),
            _w("Order structural steel", "Scheduled", "high", ["Procurement"], "Pre-construction"),
            _w("Site safety induction", "Scheduled", "high", ["Safety"], "Foundation & Structure"),
            _w("Rough-in electrical inspection", "Planned", "medium", ["Electrical"], "MEP & Finishes"),
        ],
        "workflow": "linear",
    },
    {
        "key": "event-planning",
        "name": "Event Planning",
        "industry": "Events",
        "icon": "calendar",
        "description": "Conferences and offsites: venue, speakers, sponsors and logistics.",
        "features": {"cycle_view": False, "module_view": True, "page_view": True, "intake_view": False},
        "states": [
            _s("Ideas", "backlog", GRAY),
            _s("To Do", "unstarted", BLUE, True),
            _s("In Progress", "started", AMBER),
            _s("Confirmed", "completed", GREEN),
            _s("Cancelled", "cancelled", RED),
        ],
        "labels": [
            {"name": "Venue", "color": PURPLE},
            {"name": "Speakers", "color": BLUE},
            {"name": "Sponsors", "color": GREEN},
            {"name": "Travel", "color": ORANGE},
            {"name": "Budget", "color": RED},
        ],
        "modules": [
            {"name": "Annual Summit", "description": "Main event"},
        ],
        "work_items": [
            _w("Shortlist and book venue", "In Progress", "urgent", ["Venue", "Budget"], "Annual Summit"),
            _w("Confirm keynote speaker", "To Do", "high", ["Speakers"], "Annual Summit"),
            _w("Sponsor prospectus", "To Do", "medium", ["Sponsors"], "Annual Summit"),
            _w("Group travel booking", "Ideas", "low", ["Travel"], "Annual Summit"),
        ],
        "workflow": "open",
    },
    {
        "key": "content-calendar",
        "name": "Editorial Calendar",
        "industry": "Media",
        "icon": "pen",
        "description": "Pitch, draft, edit and publish content on a predictable cadence.",
        "features": {"cycle_view": True, "module_view": True, "page_view": True, "intake_view": True},
        "states": [
            _s("Pitched", "backlog", GRAY),
            _s("Assigned", "unstarted", BLUE, True),
            _s("Drafting", "started", AMBER),
            _s("Editing", "started", PURPLE),
            _s("Published", "completed", GREEN),
            _s("Killed", "cancelled", RED),
        ],
        "labels": [
            {"name": "Blog", "color": BLUE},
            {"name": "Video", "color": RED},
            {"name": "Podcast", "color": PURPLE},
            {"name": "Case Study", "color": GREEN},
        ],
        "modules": [],
        "work_items": [
            _w("How we cut onboarding time in half", "Drafting", "medium", ["Blog", "Case Study"]),
            _w("Customer interview: Q3 podcast", "Assigned", "medium", ["Podcast"]),
            _w("Product walkthrough video", "Pitched", "low", ["Video"]),
        ],
        "workflow": "linear",
    },
    {
        "key": "okr-strategy",
        "name": "OKRs & Strategy",
        "industry": "Business",
        "icon": "target",
        "description": "Company objectives, key results and the initiatives that move them.",
        "features": {"cycle_view": True, "module_view": True, "page_view": True, "intake_view": False},
        "states": [
            _s("Draft", "backlog", GRAY),
            _s("On Track", "started", GREEN, True),
            _s("At Risk", "started", AMBER),
            _s("Off Track", "started", RED),
            _s("Achieved", "completed", TEAL),
            _s("Abandoned", "cancelled", GRAY),
        ],
        "labels": [
            {"name": "Objective", "color": INDIGO},
            {"name": "Key Result", "color": BLUE},
            {"name": "Initiative", "color": PURPLE},
            {"name": "Growth", "color": GREEN},
            {"name": "Efficiency", "color": ORANGE},
        ],
        "modules": [
            {"name": "Grow revenue", "description": "Objective 1"},
            {"name": "Delight customers", "description": "Objective 2"},
        ],
        "work_items": [
            _w("KR: Increase ARR by 30%", "On Track", "high", ["Key Result", "Growth"], "Grow revenue"),
            _w("KR: NPS above 50", "At Risk", "high", ["Key Result"], "Delight customers"),
            _w("Initiative: launch annual plans", "On Track", "medium", ["Initiative", "Growth"], "Grow revenue"),
            _w("Initiative: 24h support SLA", "Draft", "medium", ["Initiative", "Efficiency"], "Delight customers"),
        ],
        "workflow": "open",
    },
    {
        "key": "finance-close",
        "name": "Month-end Close",
        "industry": "Finance",
        "icon": "calculator",
        "description": "Repeatable finance close with preparer/reviewer sign-off.",
        "features": {"cycle_view": True, "module_view": True, "page_view": True, "intake_view": False},
        "states": [
            _s("Not Started", "unstarted", GRAY, True),
            _s("Preparing", "started", AMBER),
            _s("In Review", "started", PURPLE),
            _s("Approved", "completed", GREEN),
            _s("N/A", "cancelled", GRAY),
        ],
        "labels": [
            {"name": "Reconciliation", "color": BLUE},
            {"name": "Accruals", "color": ORANGE},
            {"name": "Payroll", "color": PINK},
            {"name": "Reporting", "color": GREEN},
            {"name": "Audit", "color": RED},
        ],
        "modules": [],
        "work_items": [
            _w("Bank reconciliation", "Preparing", "high", ["Reconciliation"]),
            _w("Accrue unbilled revenue", "Not Started", "high", ["Accruals"]),
            _w("Payroll journal entries", "In Review", "medium", ["Payroll"]),
            _w("Management reporting pack", "Not Started", "medium", ["Reporting"]),
        ],
        "workflow": [
            ["Not Started", "Preparing"],
            ["Preparing", "In Review"],
            ["In Review", "Approved"],
            ["In Review", "Preparing"],
            ["Not Started", "N/A"],
        ],
    },
]

TEMPLATE_INDEX = {t["key"]: t for t in BUILTIN_TEMPLATES}


def list_builtin_templates():
    """Lightweight listing (no sample work item bodies) for the gallery."""
    return [
        {
            "key": t["key"],
            "name": t["name"],
            "industry": t["industry"],
            "icon": t["icon"],
            "description": t["description"],
            "is_builtin": True,
            "states": [{"name": s["name"], "group": s["group"], "color": s["color"]} for s in t["states"]],
            "labels": t["labels"],
            "modules": [m["name"] for m in t["modules"]],
            "work_item_count": len(t["work_items"]),
            "workflow": t["workflow"] if isinstance(t["workflow"], str) else "custom",
        }
        for t in BUILTIN_TEMPLATES
    ]


def get_builtin_template(key):
    template = TEMPLATE_INDEX.get(key)
    return deepcopy(template) if template else None


def resolve_transitions(definition):
    """Expand a template's workflow spec into (from_name, to_name) pairs."""
    spec = definition.get("workflow", "open")
    states = definition.get("states", [])
    names = [s["name"] for s in states]
    if spec == "open" or not states:
        return []
    if spec == "linear":
        flow = [s["name"] for s in states if s["group"] != "cancelled"]
        cancelled = [s["name"] for s in states if s["group"] == "cancelled"]
        pairs = []
        for i, name in enumerate(flow):
            if i + 1 < len(flow):
                pairs.append((name, flow[i + 1]))
                pairs.append((flow[i + 1], name))
            for c in cancelled:
                pairs.append((name, c))
        for c in cancelled:
            if flow:
                pairs.append((c, flow[0]))
        return pairs
    return [(a, b) for a, b in spec if a in names and b in names]
