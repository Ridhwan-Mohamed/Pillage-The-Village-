# Remaining V1 Work

## Tutorial
- [x] one last go through, explain game ends on day 7 boss fight
- re-add completed tutorial save to save manager again

### game over
- [x] after beating the shocker, play game over animation/page
- [x] thank the player for playing the demo
- [x] give them perma unlocks on all store items (troops and buildings)
- [x] delete save at that point

## Text fix
- [x] fix text issues

### art
- [x] fix art issues with chest

### qol
- [x] make esc text on wall palcement and farm placement helper ui text in the top middle red (and any other esc text i cant think of idk) so its clear to players the importance of the info
- [x] make the chekc mark button for wall placement more evident and clear, make it start build with chekc mark emoji
- [x] speed multis (1x,1.5x,2x) reset auto on night/day start, dawn and dusk keep whatever preset speed up option
- [x] shock sounds for chain zapper (scale sound per number of enemy hits) and the mine when it explodes when a enemy steps on it 
- [x] remove decoy beacon
- [x] add sounds for the meteor drop and impact, i have meteor flyby audio and impact for it, flyby is a bit longer than in game metoer animation in the sky so extend it to match (or just delay start of flybly meteor and start audio before its on screen)
- [x] add some shake on land of meteor

### turrets and catapults
- [x] shorten time, should last a day but lasts really long, can you calulate how long a day is in the game in minutes/seconds so the time it lasts it accurate to that value
- [x] have each have a max of a few shots then leave (try to not let em go for same guy in that case, i.e. value uniqueness like fighters do)
- [x] on hover, show ammo above the item (health bar is below the item)
- [x] catapults should be able to hit any enemy on the main island
- [x] turrets same range but LOS should be the limiter
- [x] each catatpult has 3 bullets, turrets have 5
- [x] nerf their bullet damages each
- [x] dont show fix sign on it when it loses health

### contract pages
- [x] overview mode militia contract price text (so permit emoji) is hard to read, even harder to read what each miltia contract level offers, use the full space to explain to users better whats going on 
- [x] militia detialed page is bugged, there is some weird text before miltia word in title, and the type of contract (what it contains) is blocked by title, cna you use the space better and fix this
- [x] overview mode pressure parcel can also use the similar size upgrades for price and info text as well. use full grid for better spacing design and readability

### achievements 
- [x] should reflect that game ends on day 7

## Bugs
- [x] player tab buttons still mucked, can you study the hp and stamina bars, cause those are visible. matter of fact everything on player tab is visible except the sell, berry and sleep buttons. rex ui is finnicky, follow the rules/framework we do when using it
- [x] player tab row card hover still mucked, on hover it pulses a bunch, should grow on hover, and not grow on leave, but grows and shrinks when hovered constantly
- [x] give on hovers to right side top bar items
- [x] on restart game, buildings that are damaged arent set for repair, builders ignore them, no hammer on them as well, fix this and increase hammer icon a bit
- [x] no more endless run in game over recap or "endless" anywhere in game, we dont support it anymore.
- [x] water wagon counts toward current water job if succesfully deposited
- [x] dont storage filled if only one storage. only if all of them are
- [x] id entered player sell items to buy player but gain money to buy, dont sell
- [x] militia contract reward ui popup not showing up on level 3 unlock
- [x] extend bottom edge of opening summary bar a bit more
- [x] remove the starts day 2 from town centre on hover text, its useless
- [x] overview mode night mask not there, it seems like in detailed mode the night mask pass the 100x100 exists as a simple base light amount mask that covers the extended regions works but for overview mode it only covers the 100x100, extended is just full brightness. also seems to be some weird fade out happening at edges of the 100x100 bound  in detialed and overview mode, not sure why. remember, outer regions should just match day time darkness, no lighting calc
- [x] possible reward ready issue on game continue. i noticed on continue game after reaching level 2 during the day, it never triggered till i reach level 3 the next dawn, not sure why. i did continue the game so perhaps some weird save issue idk? investiagte reward ready logic and let me know of any issues.
- [x] clouds are gray in detailed mode but are white in overview mode, should be white in both
- [x] lower helper text height for farming, design it like the wall placement text, good height and design