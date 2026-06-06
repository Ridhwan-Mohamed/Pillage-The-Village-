import { House } from "../buildings/House";
import { pickRandomPowerupCards } from "../Cards/PowerupCards.js";
import { buildCardAddedPayload } from "../Cards/CardInventory";
import { showAlert, UIDEPTH } from "../constants";
import { buildingManager } from "../Manager/buildingManager";
import { Builder } from "../players/Builder";
import { Farmer } from "../players/Farmer";
import { Fireman } from "../players/Fireman";
import { Forager } from "../players/Forager";
import { Gunslinger } from "../players/Gunslinger";
import { Blademaster } from "../players/Blademaster";
import { Brawler } from "../players/Brawler";
import { Teams } from "../Teams";
import { townRoads } from "../town";
import { getCardVisualStyle } from "./CardPreview";
import { DailyNeedsTracker } from "./DailyNeedsTracker";
import { UI_ITEM_TYPES } from "./UIConstants";

// === Character Spawns ===
const playerClasses = {
    farmer: Farmer,
    fireman: Fireman,
    forager: Forager,
    builder: Builder,
    gunslinger: Gunslinger,
    blademaster: Blademaster,
    brawler: Brawler
};

var pendingStoreItem = null;

let selectedStoreCard = null;
let lastStoreClickTime = 0;

function clearStoreSelectionHighlight() {
    if (!selectedStoreCard) return;
    // Reset to default visuals for store card
    selectedStoreCard
        .setStrokeStyle(2, 0xffffff)
        .setFillStyle(0x8B4513, 0.4);
    selectedStoreCard = null;
}

function setStoreSelectionHighlight(cardBg) {
    // Clear previous
    clearStoreSelectionHighlight();

    // New selection visuals
    selectedStoreCard = cardBg;
    selectedStoreCard
        .setStrokeStyle(3, 0xffff00)   // thicker yellow outline
        .setFillStyle(0x8B4513, 0.8);  // stronger fill
}

export function openPowerupScreen(scene) {
    const cam = scene.cameras.main;
    const centerX = cam.centerX;
    const yOffset = 100;
    const uiContainer = scene.add.container(0, 0).setDepth(2000);
    if (typeof scene.setSimulationPause === "function") scene.setSimulationPause("powerup-overlay", true);
    else scene.time.timeScale = 0;

    scene.cameras.main.ignore(uiContainer);  // hide from world camera
    uiContainer.setScrollFactor(0); // lock container to camera

    // === Background ===
    const bg = scene.add.rectangle(0, 0, cam.width, cam.height, 0x000000, 0.6)
        .setOrigin(0)
        .setDepth(0);
    bg.setScrollFactor(0);
    uiContainer.add(bg);

    // === Store Items ===
    const storeYOffset = yOffset + 70;
    const storeSpacing = 120;
    let storeStartX = centerX - (STORE.length - 1) * storeSpacing / 2;

    STORE.forEach((item, i) => {
        const groupX = storeStartX + i * storeSpacing;
        const group = scene.add.container(groupX, storeYOffset).setDepth(UIDEPTH);

        const cardWidth = 100;
        const cardHeight = 120;

        const bg = scene.add.rectangle(0, 0, cardWidth, cardHeight, 0x000000, 0.2)
        bg
            .setStrokeStyle(2, 0xffffff)
            .setInteractive({ useHandCursor: true });

        bg.on('pointerdown', () => {
            const now = scene.time.now;

            // --- Double-click on already-selected building card → cancel selection ---
            if (selectedStoreCard === bg && pendingStoreItem && (now - lastStoreClickTime) < 300) {
                // Cancel placement
                pendingStoreItem = null;
                clearStoreSelectionHighlight();
                showAlert(scene, "Cancelled building placement", "#ffaaaa");
                lastStoreClickTime = 0;
                return;
            }

            // Update last click time for double-click detection
            lastStoreClickTime = now;

            // --- Normal click logic ---
            if (!item.money) {
                // 🔨 Check: do we have at least one builder?
                const builderCount = Teams.teamLists["1"].builderList.length;
                if (builderCount === 0) {
                    showAlert(scene, "You need a Builder first!", "#ff5555");
                    return;
                }
                // Then check materials
                if (buildingManager.hasRequiredMaterials(item.cost, 1)) {
                    item.function(scene);  // sets pendingStoreItem
                    setStoreSelectionHighlight(bg);
                } else {
                    showAlert(scene, "Not enough materials", "#ff0000");
                }
            } else if (scene.checkSufficientFunds(item.cost)) {
                    // Money-based store (Berry) – no selection highlight
                    scene.updateMoney(-item.cost);
                    item.function(scene);
                }
            });

        const icon = item.spritesheet
            ? scene.add.sprite(0, -20, item.image, 0).setScale(1.2)  // frame 0 only
            : scene.add.image(0, -20, item.image).setScale(1.2);
        const name = scene.add.text(0, 30, item.name, {
            fontSize: '14px',
            fill: '#ffffff',
            fontFamily: 'Bungee'
        }).setOrigin(0.5);

        bg.setFillStyle(0x8B4513, 0.4); // Brown tint like character cards (saddle brown)

        group.add([bg, icon, name]);

        // Draw cost icons + values if item.cost is a resource dict
        if (item.cost && typeof item.cost === 'object') {
            let offsetX = -30;
            const iconSpacing = 30;

            Object.entries(item.cost).forEach(([resourceKey, amount]) => {
                const icon = scene.add.image(offsetX, 50, UI_ITEM_TYPES[resourceKey].icon).setScale(0.5);
                const label = scene.add.text(offsetX + 10, 50, `${amount}`, {
                    fontSize: '12px',
                    fill: '#ffffaa',
                    fontFamily: 'Bungee'
                }).setOrigin(0, 0.5);

                group.add([icon, label]);
                [icon, label].forEach(el => el.setScrollFactor(0));

                offsetX += iconSpacing;
            });
        } else {
            // fallback: numeric cost
            const costText = scene.add.text(0, 50, `$${item.cost}`, {
                fontSize: '12px',
                fill: '#ffff00'
            }).setOrigin(0.5);
            group.add(costText);
            costText.setScrollFactor(0);
        }

        // 👇 This is key: interactive area in local coordinates
        group.setSize(cardWidth, cardHeight);

        [bg, icon, name, group].forEach(el => el.setScrollFactor(0));

        uiContainer.add(group);
    });

    // === Powerups ===
    const powerups = getRandomPowerups();
    const cardYOffset = yOffset + 250;
    const cardSpacing = 185;
    let cardStartX = centerX - (powerups.length - 1) * cardSpacing / 2;

    powerups.forEach((pu, i) => {
        const cardX = cardStartX + i * cardSpacing;
        const visualStyle = getCardVisualStyle(pu);

        const halo = scene.add.ellipse(cardX, cardYOffset, 192, 202, visualStyle.haloTint, visualStyle.isGold ? 0.16 : 0.05)
            .setDepth(UIDEPTH - 1);
        if (visualStyle.isGold) {
            scene.tweens.add({
                targets: halo,
                alpha: { from: 0.12, to: 0.2 },
                scaleX: 1.04,
                scaleY: 1.04,
                duration: 900,
                yoyo: true,
                repeat: -1,
                ease: "Sine.easeInOut",
            });
        }

        const card = scene.add.rectangle(cardX, cardYOffset, 170, 180, 0x222222)
            .setStrokeStyle(3, Phaser.Display.Color.HexStringToColor(pu.OUTLINE).color)
            .setDepth(UIDEPTH)
            .setInteractive({ useHandCursor: true });

        const icon = scene.add.image(cardX, cardYOffset - 40, pu.image).setScale(1).setDepth(1);
        const name = scene.add.text(cardX, cardYOffset, pu.name, {
            fontSize: '12px',
            fill: '#ffffff',
            fontFamily: 'Bungee'
        }).setOrigin(0.5).setDepth(1);
        const desc = scene.add.text(cardX, cardYOffset + 45, pu.text, {
            fontSize: '12px',
            fill: '#cccccc',
            wordWrap: { width: 120 }
        }).setOrigin(0.5).setDepth(1);

        [halo, card, icon, name, desc].forEach(el => el.setScrollFactor(0));

        card.on("pointerdown", () => {
            const teamId = "1";
            addCardToHand(pu, teamId);
            scene.events.emit("cards:updated", buildCardAddedPayload(pu, {
                teamNumber: teamId,
                source: "reward",
            }));
            closePowerupScreen(scene, uiContainer);
        });

        uiContainer.add([halo, card, icon, name, desc]);
    });

    const spawnCardYOffset = storeYOffset + 360;
    const playerTypes = Object.keys(playerClasses);
    let spawnStartX = centerX - (playerTypes.length - 1) * storeSpacing / 2;

    playerTypes.forEach((type, i) => {
        const groupX = spawnStartX + i * storeSpacing;
        const group = scene.add.container(groupX, spawnCardYOffset).setDepth(UIDEPTH);

        const cardWidth = 100;
        const cardHeight = 120;

        const bg = scene.add.rectangle(0, 0, cardWidth, cardHeight, 0x6600cc, 0.4)

        bg
            .setStrokeStyle(2, 0xffffff)
            .setInteractive({ useHandCursor: true });

        bg.on('pointerdown', () => {
            const cost = PLAYER_COSTS[type];
            if (scene.checkSufficientFunds(cost)) {
                const team = '1';
                if (!Teams.canRecruitPlayer?.(team)) {
                    console.log("Not enough housing!");
                    showAlert(scene, "Not enough Housing!", "#ff0000");
                    return;
                }
                scene.updateMoney(-cost);
                const spawnTile = Teams.getTownSpawnTile?.("1");
                if (!spawnTile) return;
                const player = new playerClasses[type](spawnTile.x, spawnTile.y, 1);
                House.assignPlayerToHouse(player, team);
            }
        });

        // Create a temp sprite using the class' default texture
        const preview = scene.add.sprite(0, -20, 'player')
            .setScale(1.2)
            .setOrigin(0.5);

        // Tint by type
        let tint;
        switch (type) {
            case 'farmer':     tint = 0x8B5A2B; break;
            case 'forager':    tint = 0x228B22; break;
            case 'fireman':    tint = 0xff9933; break;
            case 'gunslinger': tint = 0x9999ff; break;
            case 'builder':    tint = 0x4433ff; break;
            case 'blademaster': tint = 0xAA33EE; break;
            case 'brawler':     tint = 0xFFD712; break;
            default:           tint = 0x64ff32; break;
        }
        preview.setTint(tint);

        const name = scene.add.text(0, 30, type.charAt(0).toUpperCase() + type.slice(1), {
            fontSize: '14px',
            fill: '#ffffff',
            fontFamily: 'Bungee'
        }).setOrigin(0.5);
        const cost = scene.add.text(0, 50, `$${PLAYER_COSTS[type]}`, {
            fontSize: '12px',
            fill: '#ffff00'
        }).setOrigin(0.5);

        group.add([bg, preview, name, cost]);

        group.setSize(cardWidth, cardHeight);

        group.on('pointerdown', () => {
            const cost = PLAYER_COSTS[type];
            if (scene.checkSufficientFunds(cost)) {
                const team = Teams.teamLists['1'];
                if (!Teams.canRecruitPlayer?.("1")) {
                    console.log("Not enough housing!");
                    return;
                }
                scene.updateMoney(-cost);
                // Get a random road from team 1
                const spawnTile = Teams.getTownSpawnTile?.("1");
                if (!spawnTile) return;
                const player = new playerClasses[type](spawnTile.x, spawnTile.y, 1);
                House.assignPlayerToHouse(player, "1");
            }
        });
        [bg, preview, name, cost, group].forEach(el => el.setScrollFactor(0));
        uiContainer.add(group);
    });
    scene.powerupUI = uiContainer;
}

function closePowerupScreen(scene, container) {
    if (container) container.destroy();
    clearStoreSelectionHighlight();
    lastStoreClickTime = 0;
    scene.clock.powerupScreenShown = false;
    if (typeof scene.setSimulationPause === "function") scene.setSimulationPause("powerup-overlay", false);
    else scene.time.timeScale = 1;

    if (pendingStoreItem) {
        const item = pendingStoreItem;
        pendingStoreItem = null;
        buildingManager.consumeRequiredMaterials(item.cost, 1);
        // Start building placement
        // Defer the placement to the *next* pointerup
        const handler = () => {
            scene.registry.set('image', item.type); // Trigger placement logic
            scene.input.off('pointerup', handler);
        };
        scene.input.once('pointerup', handler);
    }
    scene.events.emit('powerupScreenClosed');
}

function getRandomPowerups(count = 3) {
    return pickRandomPowerupCards(count, { teamNumber: "1" });
    const candidates = POWERUPS.slice();

    if (candidates.length === 0) return [];
    if (candidates.length <= count) {
        // Not enough to fill all slots – just shuffle and return what we have
        const copy = candidates.slice();
        Phaser.Utils.Array.Shuffle(copy);
        return copy;
    }

    // Build a weighted pool from remaining candidates
    const pool = [];
    for (let p of candidates) {
        const weight = Math.max(1, p.probability || 1);
        for (let i = 0; i < weight; i++) {
            pool.push(p);
        }
    }

    Phaser.Utils.Array.Shuffle(pool);

    // Take unique cards by id from the weighted pool
    const result = [];
    const used = new Set();

    for (const card of pool) {
        if (used.has(card.id)) continue;
        used.add(card.id);
        result.push(card);
        if (result.length >= count) break;
    }

    // Fallback in case weighting somehow didn't give us enough unique cards
    if (result.length < count) {
        const remaining = candidates.filter(c => !used.has(c.id));
        Phaser.Utils.Array.Shuffle(remaining);
        for (const c of remaining) {
            result.push(c);
            if (result.length >= count) break;
        }
    }

    return result;
}

function openSwapOverlay(scene, uiContainer, incomingCard, teamNumber = "1", onDone = null) {
    const cam = scene.cameras.main;
    const hand = getCardHand(teamNumber);

    const overlay = scene.add.container(0, 0).setDepth(UIDEPTH + 500);
    overlay.setScrollFactor(0);

    // darken + swallow clicks
    const shade = scene.add.rectangle(0, 0, cam.width, cam.height, 0x000000, 0.75)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true });
    shade.setScrollFactor(0);

    const title = scene.add.text(cam.centerX, 70, "Hand Full — Choose a Card to Replace", {
        fontSize: "18px",
        fill: "#ffffff",
        fontFamily: "Bungee"
    }).setOrigin(0.5).setScrollFactor(0);

    const subtitle = scene.add.text(cam.centerX, 95, `New: ${incomingCard.name}`, {
        fontSize: "12px",
        fill: "#cccccc",
        fontFamily: "Bungee"
    }).setOrigin(0.5).setScrollFactor(0);

    overlay.add([shade, title, subtitle]);

    // layout 5 cards
    const y = 200;
    const slotW = 160;
    const slotH = 190;
    const spacing = 175;
    const startX = cam.centerX - 2 * spacing;

    for (let i = 0; i < 5; i++) {
        const x = startX + i * spacing;
        const existing = hand[i];

        const bg = scene.add.rectangle(x, y, slotW, slotH, 0x222222, 0.9)
            .setStrokeStyle(2, 0xffffff)
            .setInteractive({ useHandCursor: true })
            .setScrollFactor(0);

        const iconBg = scene.add.rectangle(x, y - 35, 50, 50, 0x111111, 1)
            .setStrokeStyle(1, 0xffffff, 0.4)
            .setScrollFactor(0);

        const name = scene.add.text(x, y - 70, existing?.name || "(empty?)", {
            fontSize: "12px",
            fill: "#ffffff",
            fontFamily: "Bungee"
        }).setOrigin(0.5).setScrollFactor(0);

        const desc = scene.add.text(x, y + 25, existing?.text || "", {
            fontSize: "12px",
            fill: "#cccccc",
            wordWrap: { width: slotW - 20 }
        }).setOrigin(0.5).setScrollFactor(0);

        const icon = existing?.image
            ? scene.add.image(x, y - 35, existing.image).setScale(1).setScrollFactor(0)
            : scene.add.text(x, y - 35, "?", { fontSize: "18px", fill: "#ffffff" }).setOrigin(0.5).setScrollFactor(0);

        bg.on("pointerdown", () => {
            const old = hand[i];

            // 1) remove old effect
            if (old && typeof old.remove === "function") old.remove(scene);

            // 2) replace in-hand
            hand[i] = incomingCard;

            // 3) apply new effect
            if (incomingCard && typeof incomingCard.apply === "function") incomingCard.apply(scene);

            scene.events.emit("cards:updated");

            overlay.destroy(true);
            if (typeof onDone === "function") onDone();
        });

        overlay.add([bg, iconBg, icon, name, desc]);
    }

    // Cancel button
    const cancelBg = scene.add.rectangle(cam.centerX, cam.height - 80, 220, 44, 0x550000, 0.85)
        .setStrokeStyle(2, 0xffffff)
        .setInteractive({ useHandCursor: true })
        .setScrollFactor(0);

    const cancelTx = scene.add.text(cam.centerX, cam.height - 80, "Cancel", {
        fontSize: "16px",
        fill: "#ffffff",
        fontFamily: "Bungee"
    }).setOrigin(0.5).setScrollFactor(0);

    cancelBg.on("pointerdown", () => overlay.destroy(true));

    overlay.add([cancelBg, cancelTx]);

    uiContainer.add(overlay);
}

// Team-based card hand, defaulting to team "1" for now
export function getCardHand(teamNumber = "1") {
    const team = Teams.teamLists[teamNumber];
    if (!team) return [];

    if (!team.cardHand) {
        team.cardHand = [];
    }
    return team.cardHand;
}

export function addCardToHand(card, teamNumber = "1") {
    const team = Teams.teamLists[teamNumber];
    if (!team) return false;

    if (!team.cardHand) team.cardHand = [];
    const hand = team.cardHand;

    // Normal pickup: apply immediately + add to hand
    if (card.apply) card.apply();

    hand.push(card);
    return true;
}



export const TYPES = {
    PLAYERTYPE: 'player',
    WEAPONTYPE: 'weapon',
    BUFF: 'buff'
};

const PLAYER_COSTS = {
    farmer: 100,
    fireman: 100,
    forager: 100,
    builder: 100,
    gunslinger: 500,
    blademaster: 250, 
    brawler: 75
};

const POWERUPS = [];

const STORE = [
    {
        image: 'berry',
        name: 'Berry',
        text: 'Restores 1 berry to your stockpile.',
        cost: 25,
        money: true,
        function: (scene) => {
            scene.updateBerry(1);
        }
    },
    {
        image: 'house2',
        name: 'House',
        text: 'Spawns 2 players and a house with connected roads.',
        cost : { wood: 4, stone: 4 },
        money: false,
        function: () => {
            pendingStoreItem = {
                type: 'house2',
                cost : { wood: 4, stone: 4 },
            };
        }
    },
    {
        image: 'clayOven',
        spritesheet: true,
        name: 'Clay Oven',
        text: 'For cooking and purifying',
        cost: { stone: 4 },
        money: false,
        function: () => {
            pendingStoreItem = {
                type: 'clayOven',
                cost: { stone: 4 }
            };
        }
    },
    {
        image: 'storage',
        name: 'Storage',
        text: 'For storing goods',
        cost : { wood: 4 },
        money: false,
        function: () => {
            pendingStoreItem = {
                type: 'storage',
                cost: { wood: 4 },
            };
        }
    }
];


