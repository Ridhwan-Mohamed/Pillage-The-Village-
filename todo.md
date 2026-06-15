# V1 TEST PHASE (3 OF 3) 

### Test
- walls work properly

### bugs to fix
- [x] why is the shocker/raiders not breaching wall, i had an auto wall and it didnt breach it at all, it landed on shore beside the wall and did nothing. I think this might be because of the nature of the uniquetiles code in breach tiles planbreach()? 
- [x] enemies post fight with troops are not continuing the wall breach if they need to breach to reach their task idk why, think it might be because of the previous hint with unique tiles. how exactly do walls breach work, how is it delegated?
- [x] increase description text size in town achievements, also increase the height of the boxes (the bottom edge is where text is bleeding out) by like 10px each
- [x] the text bubbles in on run recap explaining buildings made, enemies defeated, parcels bought, for example the towers built text box and its sub text "lost x", the subtext of these are normally cut off by the bubbles especially if two lines are used, the easiest solution is just to increase them all in length from the bottom by 10-15 pixels
- [x] farmers sometimes pulling crop and getting more than one food out at a time (crop not leaving after a harvest)
- [x] on demo complete, we shouldnt be seeing unlock popups cause everything unlocked on demo complete
- [x] sometimes there are cook jobs left and fireman(s) ignore it, i believe it is caused when i incremented job post first start

## Debug
- set to true
