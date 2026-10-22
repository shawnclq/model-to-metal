# Spec Delta

## Purpose

Defines how the game is assembled from a small core plus one pack per world, how packs are loaded when needed, and the guarantee that this structure plays and looks the same as the single-file reference.

## ADDED Requirements

### Requirement: The game plays the same as the reference
For every level and lab, the new build SHALL show the same brief, goals, hints, controls, sim panel text and numbers, terminal output, goal results, stars and debrief as `reference/model-to-metal.html` at the time this change starts, given the same commands.

#### Scenario: Same output for every level
- **WHEN** each level is loaded and its chip commands and `answer()` are run in both the reference and the new build
- **THEN** the recorded text of the mission panel, sim panel, controls and terminal is identical in both, step by step

#### Scenario: Same negative paths
- **WHEN** a wrong command, an out-of-memory model, or a missing Ray node is tried in the new build
- **THEN** the terminal shows the same error text as the reference

### Requirement: The game looks the same as the reference
The new build SHALL render the same as the reference in light and dark mode, at 1280 px and 390 px wide, and SHALL have no horizontal scroll at 390 px.

#### Scenario: Screenshots match
- **WHEN** the home screen, one level from each world, the win modal and the Compare GPUs panel are captured from both builds in the same browser
- **THEN** each pair of screenshots matches, apart from differences too small to see

#### Scenario: Phone width
- **WHEN** any of those screens is shown at 390 px wide
- **THEN** the page is no wider than the window

### Requirement: The home screen needs no world pack
The home screen SHALL list every world, level and lab with its title, number and saved stars, the XP and "levels done" counts, and the "Up next" level, without loading any world pack.

#### Scenario: First visit
- **WHEN** a player opens the site
- **THEN** the home screen is complete and no world pack has been downloaded

### Requirement: World packs load on demand
Opening a level or lab SHALL load that world's pack if it isn't loaded yet, then start the level. A pack SHALL be downloaded at most once per visit.

#### Scenario: Opening a level in a new world
- **WHEN** the player opens World 3, Level 1 and World 3's pack isn't loaded
- **THEN** World 3's pack is downloaded and the level starts as it would in the reference

#### Scenario: Second level in the same world
- **WHEN** the player then opens World 3, Level 2
- **THEN** no further download happens

### Requirement: Loading is visible and failures are recoverable
While a pack is loading the game SHALL show a short loading message. If loading fails, it SHALL say so in plain words with a way to try again, and the rest of the game and the player's progress SHALL be unaffected.

#### Scenario: Slow connection
- **WHEN** a pack takes a moment to arrive
- **THEN** the player sees a loading message instead of a blank or half-drawn level

#### Scenario: Pack fails to load
- **WHEN** the download of a pack fails
- **THEN** the player sees a message that the world couldn't be loaded and a "Try again" button, and can still go back to the home screen with their stars intact

### Requirement: A world is added by adding a pack
A new world SHALL be added by writing a new pack and adding one entry for it to the list of worlds, without changing the core. The pack SHALL supply its levels, optional lab, starting sim state, sim panel, controls, terminal commands, help text and command list.

#### Scenario: Test pack
- **WHEN** a small test pack with one level is added to the list of worlds
- **THEN** it appears on the home screen after the existing worlds, and its level can be opened, played and won

### Requirement: Each pack matches its entry in the list of worlds
The list of worlds SHALL hold each level's ID, title, concept and whether it is a checkpoint quiz. Each pack's levels SHALL match its entry exactly, in the same order.

#### Scenario: Mismatch
- **WHEN** a pack's levels differ from its entry (a missing, extra, renamed or reordered level)
- **THEN** the automated test suite fails and names the world and the level

### Requirement: Commands outside their world behave as today
A command that belongs to another world SHALL give the same message as the reference does (for example that it belongs to World N), whether or not that world's pack is loaded.

#### Scenario: World 3 command in World 1
- **WHEN** the player types a World 3 command in a World 1 level
- **THEN** the terminal shows the same message as the reference, and no other pack is downloaded

### Requirement: Pack styles stay inside the pack
Styles that a pack adds SHALL only affect that pack's own sim area. They SHALL NOT change the header, home screen, mission panel, terminal or modals.

#### Scenario: Clashing class name
- **WHEN** a pack's styles define a class with the same name as a core class, such as `.xp`
- **THEN** the header XP pill looks the same as without that pack

### Requirement: Saves carry over unchanged
The new build SHALL read and write progress with the same save key, format and rules as the reference (see the `player-progress` spec), and SHALL keep the "Show the math" setting under the same key.

#### Scenario: Save from the reference
- **WHEN** a save written by the reference build is in the browser for the same site
- **THEN** the new build shows the same stars and XP without converting anything
