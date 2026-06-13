# V1 TEST PHASE (2 OF 3)

### Test
- [x] test difficulty
- [x] test bombers

### art and audio
- [x] Permit approved big art 
- [x] Permit approved small art
- [x] add spining circle reload animation above gunslingers/hunters when he is reloading
- [x] sizzle sound for bomber
- [x] explosion audio for bomber

### bugs to fix
- why is the shocker/raiders not breaching wall, i had an auto wall and it didnt breach it at all, it landed on shore beside the wall and did nothing. I think this might be because of the nature of the uniquetiles code in breach tiles planbreach()? 
- enemies post fight with troops are not continuing the wall breach if they need to breach to reach their task idk why, think it might be because of the previous hint with unique tiles. how exactly do walls breach work, how is it delegated?
- [x] some achievements are auto completing on start, seems meaningless, feel free to make them easy first achievments but dont make them complete freebies. they also pop in before mini logo leaves causing them to be covered up by the mini logo.
- [x] can turrets shoot through player walls? should be able to
- [x] double clicking z mid zoom seems to cause lag and bug out. when in zoom tween/process/ neglect any new z clicks
- [x] some players dont have light bubbles? not sure why? is it cause how they were bought? like some were bought and others were spawned in?
- [x] your not editing the top text 0/x done part in water button when i decrease or increase jobs with the counter in the middle
- [x] decrease zoom out in overview mode by like 20%
- [x] projectile-type characters reload animation should be just black and white (white should be spinny part) and i notice it shooting during a reload animation being active looks weird. also make it 30% smaller
- [x] when continuing old save, barren crop spots were reseeded back again why?
- [x] auto wall caused weird edits to my map (like remove blocked tiles that should be blocked cause a building blocked it) and didint complete wall creation when it couldve. why is this investigate and tell me
- [x] double check achievements like "defeat 30 raiders" or any others that may not be possible during the 7 days of game demo
- [x] cant see enemy or troop health on shooting with projectile, make sure enemy or troop healthbar come up when shot like when hit with a melee
- [x] lower the wall alpha when in queue mode in map, almost looks already placed

## Pre release must do
- re-add completed tutorial save to save manager again on tutorial completion once fully
- stop 'p' drawing player paths
- stop region and navmesh keyboard debug draws
