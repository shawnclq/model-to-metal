# Spec Delta

## Purpose

Defines what a player's saved progress contains, how XP is worked out from it, and how saves from older versions of the game are carried forward so no player loses progress.

## ADDED Requirements

### Requirement: Progress is saved as best stars per level ID
The save SHALL hold, for each level the player has won, the best star count (1 to 3) keyed by the level's permanent ID. It SHALL also hold a format version number. It SHALL NOT hold a stored XP total. It SHALL be kept in the browser under a new save key, separate from `gf-progress-v4`.

#### Scenario: Winning a level for the first time
- **WHEN** the player wins the `moe-experts` level with 2 stars and has no earlier stars on it
- **THEN** the save records 2 stars against `moe-experts`

#### Scenario: Save survives a reload
- **WHEN** the player wins a level and then reloads the page
- **THEN** the home screen shows the same stars on that level

### Requirement: Stars never go down
Replaying a level SHALL only raise its saved stars. A worse result SHALL leave the saved stars as they were.

#### Scenario: Worse replay
- **WHEN** a level has 3 saved stars and the player replays it and earns 1 star
- **THEN** the save still shows 3 stars for that level

#### Scenario: Better replay
- **WHEN** a level has 1 saved star and the player replays it and earns 3 stars
- **THEN** the save shows 3 stars for that level

### Requirement: XP is worked out from stars
The XP shown SHALL be the sum, over every current level with saved stars, of stars × 50 for a normal level and stars × 75 for a checkpoint quiz. The same stars SHALL always give the same XP, however and in whatever order they were earned.

#### Scenario: XP for a mix of levels
- **WHEN** the save has 3 stars on one normal level, 1 star on another normal level, and 2 stars on one checkpoint quiz
- **THEN** the header shows 150 + 50 + 150 = 350 XP

#### Scenario: Improving stars in steps
- **WHEN** the player earns 1 star on a normal level, then 2, then 3 on replays
- **THEN** the header shows 150 XP for that level, the same as earning 3 stars at once

### Requirement: Progress counts only current levels
The "levels done" count and XP SHALL count only IDs that are in the current level list. Entries for IDs not in the list SHALL be kept in the save, unchanged, but not shown or counted.

#### Scenario: Save mentions a level that was removed
- **WHEN** the save has stars for an ID that is no longer in the level list
- **THEN** that entry does not add to XP or to the "levels done" count, and it is still in the save afterwards

#### Scenario: Adding a level keeps everyone's stars
- **WHEN** a new level is inserted anywhere in the list and the player reloads
- **THEN** every other level shows the same stars as before, and the new level shows no stars

### Requirement: Old saves are converted once
When there is no save under the new key but there is a `gf-progress-v4` save, the game SHALL convert it once on load. It SHALL map each old level number to its permanent ID using a fixed table of the 36 levels as they were numbered in v4, keep the stars, and write the result under the new key. It SHALL NOT change or delete the `gf-progress-v4` save.

#### Scenario: Converting a v4 save
- **WHEN** a player whose v4 save has `{"3": 2, "14": 3}` opens the new version
- **THEN** the new save has 2 stars on `moe-experts` and 3 stars on `prefill-decode`, and the home screen shows those stars on those levels

#### Scenario: XP after conversion
- **WHEN** a v4 save is converted
- **THEN** the XP shown is worked out from the converted stars with the new values, and the old stored XP total is ignored

#### Scenario: Conversion runs only once
- **WHEN** a new save already exists and the `gf-progress-v4` save is still present
- **THEN** the game uses the new save and ignores the v4 save

#### Scenario: Unknown entries in a v4 save
- **WHEN** a v4 save has a level number outside 1 to 36, or a star count that is not 1, 2 or 3
- **THEN** that entry is skipped and the rest of the save converts normally

#### Scenario: Old save is left in place
- **WHEN** a v4 save has been converted
- **THEN** the `gf-progress-v4` save is still in the browser, unchanged, so an older copy of the game can still read it

### Requirement: Damaged or missing saves start fresh
If the save is missing, unreadable, or not in the expected shape, and there is no v4 save to convert, the game SHALL start with no stars and SHALL NOT crash. Browser storage being blocked SHALL NOT stop the game from being played.

#### Scenario: Corrupt save
- **WHEN** the new save key holds text that is not valid JSON
- **THEN** the game starts with no stars and 0 XP

#### Scenario: Storage blocked
- **WHEN** the browser refuses access to local storage
- **THEN** the game still loads and levels can be played and won, without saving

### Requirement: Reset clears progress for good
"Reset progress" SHALL clear all stars in the new save. Old progress SHALL NOT come back from the `gf-progress-v4` save after a reset.

#### Scenario: Reset then reload
- **WHEN** a player who converted from v4 resets progress and reloads the page
- **THEN** the game shows no stars and 0 XP
