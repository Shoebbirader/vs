# FleetOps Design Direction

## Three directions

### Theme Name: Signal Ledger
Very Brief Intro: A disciplined operations console that makes fleet health feel like a living financial instrument: dark ink, warm paper, and precise orange signals. It is calm under pressure and designed for dispatchers who need the next decision immediately.
Probability: 0.07

### Theme Name: Monsoon Control Room
Very Brief Intro: A weathered, high-contrast command center inspired by bus depots during monsoon season, with deep teal panels, reflective highlights, and route-map geometry. It would feel tactile and cinematic, but more atmospheric than necessary for daily operations.
Probability: 0.03

### Theme Name: Workshop Index
Very Brief Intro: A bright editorial workspace that treats maintenance records like a well-organized field notebook, pairing cream surfaces with rust-orange rules and practical, compact data tables. It is approachable and useful, but less distinctive for a fleet-wide command center.
Probability: 0.05

## Selected approach: Signal Ledger

### Design Movement
Contemporary Swiss editorial systems design, adapted for Indian fleet operations: strong typographic hierarchy, asymmetric information blocks, and a restrained industrial palette.

### Core Principles
1. Put operational urgency before decoration: every screen should answer what needs attention, why, and who owns the next action.
2. Pair dark command surfaces with warm paper-like work surfaces so dense data feels legible rather than clinical.
3. Use orange only as a signal for action, risk, or active route state; never as ambient decoration.
4. Treat metadata as designed content: labels, timestamps, roles, and INR values should be quiet but intentional.

### Color Philosophy
FleetOps uses deep ink (#111827) as the command-center anchor, warm ivory (#F7F4EE) as the working surface, and signal orange (#F26B38) as the ownable action color. Muted sage and pale blue-gray separate health states without creating a rainbow dashboard. The intent is confidence in a noisy environment: dark surfaces hold focus, paper surfaces support analysis, and orange tells the operator where to move.

### Layout Paradigm
A persistent left rail anchors navigation while the workspace flows in an asymmetric two-column composition: a wide operational canvas and a narrower decision rail. The dashboard should feel like a briefing sheet laid out on a workbench, not a centered card grid. Hero metrics can break the grid and align to a shared vertical rhythm.

### Signature Elements
1. Route-line dividers: hairline orange rules and small waypoints connect sections and imply movement through the fleet.
2. Ledger labels: uppercase micro-labels with generous tracking sit above values, echoing maintenance tags and accounting records.
3. Signal chips: compact, high-contrast status markers that pair a dot, state name, and count.

### Interaction Philosophy
Interactions should reduce uncertainty. Hover states reveal ownership and context; clicking a work order should expose the next action without losing the overview. Filters should feel immediate and reversible. Destructive or irreversible actions should use explicit confirmation and plain-language consequences.

### Animation
Use short 160–220ms ease-out transitions for navigation, hover, and status changes. Animate only transform and opacity. Dashboard sections enter with a quiet 30–50ms stagger, while alerts pulse once on arrival and then settle. Respect prefers-reduced-motion and keep command-like interactions instant.

### Typography System
Use `DM Sans` for interface text and `Space Grotesk` for display values and section titles. Headings use 600–700 weights with tight tracking; metadata uses 10–11px uppercase labels with 0.14em letter spacing; body copy stays 13–15px with a 1.5 line height. Currency values are large, compact, and tabular where possible.

### Brand Essence
FleetOps is the operating ledger for fleet teams who need to keep vehicles moving, parts stocked, and costs visible without switching tools. Personality: vigilant, grounded, decisive.

### Brand Voice
Headlines are concise and operational. CTAs name the action and its consequence. Microcopy is direct, calm, and never theatrical.
Example lines: “Keep the next 10 vehicles moving.” and “Two actions are blocking tomorrow’s dispatch.”

### Wordmark & Logo
The mark is a circular signal crossed by an orange route line and a small waypoint, suggesting telemetry, movement, and a dispatch decision without relying on a literal bus icon. The wordmark should be set in Space Grotesk with a slightly tightened tracking, paired with the symbol at a confident, visible size.

### Signature Brand Color
Signal Orange `#F26B38` — a warm, unmistakable action color that reads like a maintenance tag or route marker against both ink and ivory.

## Implementation reminder
This direction governs every component in the FleetOps app. When in doubt, ask: “Does this choice reinforce or dilute Signal Ledger?”

## Style Decisions

- The FleetOps mark must read as a circular signal crossed by an orange route line with a waypoint, not a generic heartbeat icon.
- Operational states use compact signal chips with a dot, state label, and supporting context across vehicle rows and work orders.
- Ledger rules, tabular rhythm, asymmetric grouping, and typography carry hierarchy before shadows or decorative card softness.
- Orange is reserved for movement, risk, active-route state, and explicit operator actions.
