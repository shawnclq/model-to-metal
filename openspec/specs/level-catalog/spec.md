# level-catalog Specification

## Purpose

Defines how levels and labs are identified, numbered for display, and referred to from other text, so that adding, removing or moving a level never changes what any other level is called.

## Requirements

### Requirement: Every level has a permanent ID
Every level SHALL have an ID that names the topic it teaches. The ID SHALL be lowercase kebab-case (letters, digits and hyphens), SHALL NOT contain a world number or position, and SHALL be unique across all levels and labs.

#### Scenario: ID names the topic
- **WHEN** the mixture-of-experts level in World 0 is loaded
- **THEN** its ID is a topic name such as `moe-experts`, not `3`, `w0-3` or `w0-moe`

#### Scenario: Duplicate ID is rejected
- **WHEN** two levels or labs are given the same ID
- **THEN** the automated test suite fails and names the duplicate ID

#### Scenario: Badly formed ID is rejected
- **WHEN** a level is given an ID with capitals, spaces or a missing value
- **THEN** the automated test suite fails and names the level

### Requirement: Level IDs never change
Once a level ID has been released, it SHALL keep that ID for good, including when the level is moved to another position or another world, or its title changes. A removed level's ID SHALL NOT be reused for a different level.

#### Scenario: Level moves to another world
- **WHEN** a level is moved from World 1 to World 3
- **THEN** its ID stays the same and its saved stars still show on it

#### Scenario: Level is renamed
- **WHEN** a level's title changes
- **THEN** its ID stays the same

### Requirement: Labs have permanent IDs
Every lab (free-play sandbox) SHALL have a permanent topic ID that follows the same format and uniqueness rules as levels. A lab SHALL NOT earn stars or XP.

#### Scenario: Opening a lab
- **WHEN** the player opens the GPU lab from the World 1 section of the home screen
- **THEN** the lab is found by its permanent ID and loads as it does today

### Requirement: Display numbers come from position
"World X, Level N" numbers SHALL be worked out when the game loads, from each level's world and its order within that world. They SHALL be shown to the player but SHALL NOT be used to save progress or to look up a level.

#### Scenario: Inserting a level renumbers the display only
- **WHEN** a new level is inserted as the second level of World 1
- **THEN** the levels after it in World 1 show numbers one higher, and each still keeps its own ID and saved stars

#### Scenario: Numbering restarts per world
- **WHEN** the home screen lists World 2
- **THEN** its first level shows as Level 1

### Requirement: Level order and "next level" follow the list
The order of levels on the home screen, the "Up next" badge, and the "Next" button after a win SHALL follow the order of the level list, not ID values.

#### Scenario: Next after the last level of a world
- **WHEN** the player wins the last level of World 0
- **THEN** the "Next" button offers the first level of World 1

#### Scenario: Up next skips finished levels
- **WHEN** the player has stars on every level of World 0 and none on World 1
- **THEN** the "Up next" badge is on the first level of World 1

#### Scenario: Last level of the game
- **WHEN** the player wins the last level in the list
- **THEN** no "Next" button is shown

### Requirement: Text refers to other levels by ID
Any in-game text that points to another level (briefs, debriefs, quiz explanations, hints, terminal messages, the Compare panel) SHALL refer to it by ID. The game SHALL show each reference as "World X, Level N" using the current display numbers.

#### Scenario: Reference follows a moved level
- **WHEN** the KV-cache level is moved and a debrief refers to it by ID
- **THEN** the debrief shows that level's new "World X, Level N" without anyone editing the debrief

#### Scenario: Compare panel links
- **WHEN** the Compare GPUs panel shows a link to the level that teaches a spec row
- **THEN** the link is found by level ID, shows that level's current world and number, and opens that level when tapped

### Requirement: Broken references are caught before release
A reference to a level ID that does not exist SHALL make the automated test suite fail, naming the text and the unknown ID. If one reaches the player anyway, the game SHALL show plain text without a level number and SHALL NOT crash.

#### Scenario: Typo in a reference
- **WHEN** a debrief refers to `kv-cahce`
- **THEN** the test suite fails and reports `kv-cahce` and the level whose debrief contains it

#### Scenario: Unknown reference at runtime
- **WHEN** the game renders text with a reference to an unknown ID
- **THEN** it shows "another level" in its place and the rest of the text renders normally
