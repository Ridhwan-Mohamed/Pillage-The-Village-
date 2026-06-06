import ClayOvenTab from "./clayOvenTab";
import FunctionTab from "./FunctionTab";
import PlayerTab from "./PlayerTab";
import StorageTab from "./storageTab";
import CardsTab from "./CardsTab";   
import HousesTab from "./HousesTab"
import BuildTab from "./BuildTab";
import {
  BOTTOM_BAR_THEME,
  getBottomBarWidth,
  makeGlassRoundRect,
  mixColor,
  setHoverLiftState,
} from "./BottomBarTheme";
import { AudioManager } from "../../Manager/AudioManager.js";
import { UIDEPTH } from "../../constants.js";

const COLOR_DARK = 0x0f3144;
const COLOR_FUNCTIONS = 0x8f7cff;
const COLOR_PLAYERS   = 0x57d68d;
const COLOR_OVENS     = 0xff8a65;
const COLOR_STORAGE   = 0xffc97a;
const COLOR_CARDS     = 0xffdd73;
const COLOR_BROWNISH  = 0xa78bfa;
const COLOR_BUILD     = 0xff97c2;
const BOTTOM_BAR_DEPTH = UIDEPTH + 40;

// after EXPANDED/COLLAPSED:
const COLLAPSED = 100;     // how much of the bar stays visible when hidden
const EXPANDED  = 160;    // full bar height (tall enough for your tabs/pages)
const START_OPEN  = false; // start expanded?

function destroyBottomBarRoot(root) {
  if (!root) return;
  try {
    root.setVisible?.(false);
    root.removeAll?.(true);
    root.destroy?.(true);
  } catch {}
}

export function CreateBottomBar(scene) {
  const staleRoots = Array.isArray(scene._bottomBarRoots)
    ? [...scene._bottomBarRoots]
    : [];
  scene.uiBottomBar?.destroy?.();
  staleRoots.forEach((root) => destroyBottomBarRoot(root));
  scene._bottomBarRoots = [];
  const tabPage = CreateTabPage(scene);
  const collapsedOffset = EXPANDED - COLLAPSED + 155;
  const barWidth = getBottomBarWidth(scene);

  const ui = tabPage.sizer
    .setOrigin(0.5, 1)
    .setDepth(BOTTOM_BAR_DEPTH)
    .setScrollFactor(0)
    // ✅ start in collapsed position (no mystery +95/+155)
    .setPosition(scene.scale.width / 2, scene.scale.height + collapsedOffset)
    .setMinSize(barWidth, EXPANDED)
    .layout();

  const tabs = tabPage.tabs;
  const pages = tabPage.pages;
  const toggleBtn = tabPage.toggleBtn;
  syncTabButtonAnchors(tabs, toggleBtn);

  let expanded = START_OPEN;
  let tween = null;
  let cardsNoticeHideTimer = null;

  const EXPANDED_Y = scene.scale.height;
  const COLLAPSED_Y = scene.scale.height + (EXPANDED - COLLAPSED + 155); // ✅ no extra offset

  // after you have `tabs` and `pages`
  scene.uiBottomBar = {
    ui,
    tabs,
    pages,
    currentPage: 'functions',
    expanded: START_OPEN,
    expandedY: EXPANDED_Y,
    collapsedY: COLLAPSED_Y,
    openProgress: START_OPEN ? 1 : 0,
  };

  function getCardsButton() {
    return (tabs?.buttons || []).find((button) => button?.name === "cards") || null;
  }

  function placeCardsNotice(root = scene.uiBottomBar?._cardsNoticeRoot) {
    if (!root) return;

    const cardsButton = getCardsButton();
    const bounds = cardsButton?.getBounds?.();
    const halfW = Math.max(80, Number(root._noticeW || 170) / 2);
    let x = scene.scale.width - halfW - 12;
    let y = scene.scale.height - 54;

    if (bounds && Number.isFinite(bounds.x) && Number.isFinite(bounds.width)) {
      x = bounds.x + (bounds.width / 2);
      y = Number.isFinite(bounds.top) ? bounds.top - 18 : bounds.y - 18;
    }

    x = Phaser.Math.Clamp(x, halfW + 8, scene.scale.width - halfW - 8);
    y = Phaser.Math.Clamp(y, 30, scene.scale.height - 42);
    root.setPosition(x, y);
  }

  function destroyCardsNotice() {
    cardsNoticeHideTimer?.remove?.(false);
    cardsNoticeHideTimer = null;
    scene.uiBottomBar?._cardsNoticeRoot?.destroy?.(true);
    if (scene.uiBottomBar) scene.uiBottomBar._cardsNoticeRoot = null;
  }

  function pulseCardsButton() {
    const cardsButton = getCardsButton();
    const text = cardsButton?.getElement?.("text") || cardsButton?.text;
    if (!text) return;

    scene.tweens.killTweensOf(text);
    text.setScale?.(1);
    scene.tweens.add({
      targets: text,
      scaleX: 1.24,
      scaleY: 1.24,
      duration: 130,
      yoyo: true,
      repeat: 3,
      ease: "Sine.easeInOut",
      onComplete: () => text.setScale?.(1),
    });
  }

  function showCardsAcquisitionNotice(payload = {}) {
    const bucket = payload?.bucket === "consumables" ? "consumables" : "deck";
    const accent = bucket === "consumables" ? 0x7cffb2 : COLOR_CARDS;
    const mainLabel = String(payload?.message || (bucket === "consumables" ? "Consumable added" : "Card added"));
    const detailLabel = bucket === "consumables" ? "Cards > Consumables" : "Cards > Deck Cards";
    const noticeW = bucket === "consumables" ? 188 : 170;
    const noticeH = 38;

    pulseCardsButton();
    destroyCardsNotice();

    const root = scene.add.container(0, 0)
      .setDepth(BOTTOM_BAR_DEPTH + 12)
      .setScrollFactor(0);
    root._noticeW = noticeW;

    const bg = makeGlassRoundRect(scene, noticeW, noticeH, 12, {
      fill: mixColor(accent, BOTTOM_BAR_THEME.panelFill, 0.36),
      alpha: 0.96,
      stroke: accent,
      strokeAlpha: 0.62,
      strokeWidth: 2,
    });
    const main = scene.add.text(0, -7, mainLabel, {
      fontFamily: "Bungee",
      fontSize: "10px",
      color: "#fff9ef",
      stroke: "#07131d",
      strokeThickness: 3,
      align: "center",
    }).setOrigin(0.5);
    const detail = scene.add.text(0, 8, detailLabel, {
      fontFamily: "Bungee",
      fontSize: "7px",
      color: "#d9f3ff",
      stroke: "#07131d",
      strokeThickness: 2,
      align: "center",
    }).setOrigin(0.5);

    root.add([bg, main, detail]);
    scene.uiBottomBar._cardsNoticeRoot = root;
    placeCardsNotice(root);

    const targetY = root.y;
    root.setAlpha(0).setScale(0.9).setY(targetY + 8);
    scene.tweens.add({
      targets: root,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      y: targetY,
      duration: 180,
      ease: "Back.Out",
    });

    cardsNoticeHideTimer = scene.time?.delayedCall?.(2200, () => {
      if (scene.uiBottomBar?._cardsNoticeRoot !== root) return;
      scene.tweens.add({
        targets: root,
        alpha: 0,
        y: root.y - 8,
        duration: 220,
        ease: "Cubic.easeIn",
        onComplete: () => {
          if (scene.uiBottomBar?._cardsNoticeRoot === root) {
            scene.uiBottomBar._cardsNoticeRoot = null;
          }
          root.destroy(true);
        },
      });
      cardsNoticeHideTimer = null;
    }) || null;
  }

  function onCardsUpdatedForNotice(payload = null) {
    if (!payload || typeof payload !== "object") return;
    if (String(payload.action || "").toLowerCase() !== "added") return;
    showCardsAcquisitionNotice(payload);
  }

  scene.uiBottomBar.notifyCardsAdded = showCardsAcquisitionNotice;

  const syncBottomBarLayout = () => {
    const width = scene.scale.width;
    const barWidth = getBottomBarWidth(scene);
    const expandedY = scene.scale.height;
    const collapsedY = scene.scale.height + collapsedOffset;
    const progress = scene.uiBottomBar?.openProgress ?? (expanded ? 1 : 0);
    ui.setMinSize(barWidth, EXPANDED);
    ui.setPosition(width / 2, Phaser.Math.Linear(collapsedY, expandedY, progress));
    ui.layout();
    syncTabButtonAnchors(tabs, toggleBtn);
    scene.uiBottomBar.expandedY = expandedY;
    scene.uiBottomBar.collapsedY = collapsedY;
    placeCardsNotice();
  };
  syncBottomBarLayout();
  scene._bottomBarRoots.push(ui);

  // ensure setBottomBar updates scene.uiBottomBar.expanded too
  function setBottomBar(open, { immediate = false, playAudio = !immediate } = {}) {
    const nextOpen = !!open;
    if (nextOpen === expanded && !tween && !immediate) return;
    if (tween) tween.stop();
    if (playAudio) AudioManager.playSwipe({ volume: 0.28 });

    if (immediate) {
      expanded = nextOpen;
      scene.uiBottomBar.expanded = nextOpen;
      scene.uiBottomBar.openProgress = nextOpen ? 1 : 0;
      ui.y = nextOpen ? scene.uiBottomBar.expandedY : scene.uiBottomBar.collapsedY;
      tween = null;

      if (scene.uiBottomBar.currentPage === 'players') {
        if (nextOpen) scene.playerTab?.onShow?.();
        else scene.playerTab?.onHide?.();
      }

      const t = toggleBtn.getElement?.('text') || toggleBtn.text;
      if (t) t.setText(expanded ? '▼' : '▲');
      return;
    }

    tween = scene.tweens.add({
      targets: ui,
      y: nextOpen ? scene.uiBottomBar.expandedY : scene.uiBottomBar.collapsedY,
      duration: 200,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        const expandedY = scene.uiBottomBar.expandedY;
        const collapsedY = scene.uiBottomBar.collapsedY;
        const travel = collapsedY - expandedY;
        const progress = travel <= 0 ? (nextOpen ? 1 : 0) : Phaser.Math.Clamp((collapsedY - ui.y) / travel, 0, 1);
        scene.uiBottomBar.openProgress = progress;
      },
      onComplete: () => {
        expanded = nextOpen;
        scene.uiBottomBar.expanded = open;   // ✅ keep in sync
        scene.uiBottomBar.openProgress = open ? 1 : 0;
        tween = null;

        if (scene.uiBottomBar.currentPage === 'players') {
          if (open) scene.playerTab?.onShow?.();
          else scene.playerTab?.onHide?.();
        }

        const t = toggleBtn.getElement?.('text') || toggleBtn.text;
        if (t) t.setText(expanded ? '▼' : '▲');
      }
    });
  }

  function toggleBottomBar() {
    setBottomBar(!expanded);
  }

  const getTutorialManager = () => scene.worldScene?.tutorialManager || scene.tutorialManager || null;
  const canUseDuringTutorial = (action, payload = {}) => {
    const tutorial = getTutorialManager();
    if (!tutorial?.isActive?.()) return true;
    return tutorial.canPerformAction?.(action, payload) !== false;
  };

  const onTogglePointerUp = () => {
    if (!canUseDuringTutorial("bottomBar.toggle", { open: !expanded })) {
      return;
    }
    toggleBottomBar();
  };
  const getTabInstance = (key) =>
    (key === 'functions') ? scene.functionTab :
    (key === 'ovens') ? scene.clayTab :
    (key === 'storage') ? scene.storageTab :
    (key === 'players') ? scene.playerTab :
    (key === 'houses') ? scene.housesTab :
    (key === 'build') ? scene.buildTab :
    (key === 'cards') ? scene.cardsTab :
    null;
  const hideInactiveTabs = (key) => {
    if (key !== 'players') {
      scene.playerTab?.hidePortrait?.();
      scene.playerTab?.onHide?.();
    }
    if (key !== 'functions') scene.functionTab?.hide?.();
    if (key !== 'ovens') scene.clayTab?.hide?.();
    if (key !== 'storage') scene.storageTab?.hide?.();
    if (key !== 'houses') scene.housesTab?.hide?.();
    if (key !== 'build') scene.buildTab?.hide?.();
    if (key !== 'cards') scene.cardsTab?.hide?.();
  };
  const showActiveTab = (key) => {
    const tab = getTabInstance(key);
    tab?.onShow?.();
    return tab;
  };
  const activatePage = (key, { playAudio = false, expandBar = true } = {}) => {
    if (!key) return null;
    if (playAudio) AudioManager.playBottomBarClick();
    scene.cameras.main?.setScroll?.(0, 0);

    pages.swapPage(key);
    scene.uiBottomBar.currentPage = key;
    tabs.setValue?.(key);
    updateTabButtonStyles(tabs, key);

    if (expandBar && !expanded) setBottomBar(true);

    hideInactiveTabs(key);
    return showActiveTab(key);
  };
  const rebuildBottomBarForResize = () => {
    const liveBar = scene.uiBottomBar;
    if (!liveBar || liveBar._destroying || liveBar.ui !== ui) return;

    const restoreState = {
      currentPage: liveBar.currentPage || 'functions',
      expanded: Number(liveBar.openProgress ?? (liveBar.expanded ? 1 : 0)) >= 0.5,
    };

    scene._bottomBarResizeRebuildTimer?.remove?.(false);
    scene._bottomBarResizeRebuildTimer = null;

    CreateBottomBar(scene);

    const rebuiltBar = scene.uiBottomBar;
    if (!rebuiltBar) return;

    if (restoreState.currentPage && restoreState.currentPage !== 'functions') {
      rebuiltBar.activatePage?.(restoreState.currentPage, {
        playAudio: false,
        expandBar: false,
      });
    }
    rebuiltBar.setOpenState?.(restoreState.expanded, {
      immediate: true,
      playAudio: false,
    });
  };
  const onScaleResize = () => {
    syncBottomBarLayout();
    scene._bottomBarResizeRebuildTimer?.remove?.(false);
    scene._bottomBarResizeRebuildTimer = scene.time?.delayedCall?.(50, () => {
      scene._bottomBarResizeRebuildTimer = null;
      rebuildBottomBarForResize();
    }) || null;
  };
  const onTabButtonClick = (btn) => {
    const key = btn?.name;
    if (!key) return;
    if (!canUseDuringTutorial("bottomBar.tab", { key })) {
      tabs.setValue?.(scene.uiBottomBar.currentPage);
      updateTabButtonStyles(tabs, scene.uiBottomBar.currentPage);
      return;
    }
    activatePage(key, { playAudio: true, expandBar: true });
  };
  const onSpaceToggle = () => {
    if (getTutorialManager()?.isActive?.()) return;
    toggleBottomBar();
  };

  scene.setBottomBar = setBottomBar;
  scene.uiBottomBar.setOpenState = setBottomBar;
  scene.uiBottomBar.activatePage = activatePage;
  scene.uiBottomBar.syncLayout = syncBottomBarLayout;

  scene.openDetailPage = function(pageKey, callback) {
    const bar = scene.uiBottomBar;
    if (!bar) return;
    const tab = activatePage(pageKey, { playAudio: false, expandBar: true });
    if (callback && tab) callback(tab);
  };

  // ✅ toggle button
  toggleBtn
    .setInteractive({ useHandCursor: true })
    .on('pointerup', onTogglePointerUp);

  // ✅ click tabs
  tabs.on('button.click', onTabButtonClick);

  // default page
  pages.swapPage('functions');
  tabs.setValue?.('functions');
  scene.functionTab?.onShow?.();
  updateTabButtonStyles(tabs, 'functions');

  // (optional) spacebar toggle
  scene.input.keyboard.on('keydown-SPACE', onSpaceToggle);
  scene.scale.on('resize', onScaleResize);
  scene.events.on("cards:updated", onCardsUpdatedForNotice);

  scene.uiBottomBar.destroy = () => {
    const bar = scene.uiBottomBar;
    if (!bar || bar._destroying) return;
    bar._destroying = true;

    if (tween) {
      tween.stop();
      tween = null;
    }

    toggleBtn?.off?.('pointerup', onTogglePointerUp);
    tabs?.off?.('button.click', onTabButtonClick);
    scene.input?.keyboard?.off?.('keydown-SPACE', onSpaceToggle);
    scene.scale?.off?.('resize', onScaleResize);
    scene.events?.off?.("cards:updated", onCardsUpdatedForNotice);
    scene._bottomBarResizeRebuildTimer?.remove?.(false);
    scene._bottomBarResizeRebuildTimer = null;
    destroyCardsNotice();

    scene.functionTab?.destroy?.();
    scene.playerTab?.destroy?.();
    scene.clayTab?.destroy?.();
    scene.storageTab?.destroy?.();
    scene.housesTab?.destroy?.();
    scene.buildTab?.destroy?.();
    scene.cardsTab?.destroy?.();

    scene.functionTab = null;
    scene.playerTab = null;
    scene.clayTab = null;
    scene.storageTab = null;
    scene.housesTab = null;
    scene.buildTab = null;
    scene.cardsTab = null;
    scene.setBottomBar = null;
    scene.openDetailPage = null;

    scene._bottomBarRoots = (scene._bottomBarRoots || []).filter((root) => root !== bar.ui);
    destroyBottomBarRoot(bar.tabs);
    destroyBottomBarRoot(bar.pages);
    destroyBottomBarRoot(toggleBtn);
    destroyBottomBarRoot(bar.ui);
    if (scene.uiBottomBar === bar) {
      scene.uiBottomBar = null;
    }
  };

  scene.housesTab?.hide?.();
}


var CreateTabPage = function (scene) {
  const sizer = scene.rexUI.add.sizer({
    width: getBottomBarWidth(scene),
    orientation: 'y',
    space: { left: 0, right: 0, top: 0, bottom: 0, item: 0 }
  });
  sizer.addBackground(
    makeGlassRoundRect(scene, 0, 0, 0, {
      fill: BOTTOM_BAR_THEME.shellFill,
      alpha: BOTTOM_BAR_THEME.shellAlpha,
      stroke: BOTTOM_BAR_THEME.shellStroke,
      strokeAlpha: BOTTOM_BAR_THEME.shellStrokeAlpha,
    })
  );

  const topRow = scene.rexUI.add.sizer({ orientation: 'x', space: { item: 6 } });
  topRow.addBackground(
    makeGlassRoundRect(scene, 0, 0, 0, {
      fill: mixColor(BOTTOM_BAR_THEME.shellFill, 0xffffff, 0.08),
      alpha: 0.78,
      stroke: BOTTOM_BAR_THEME.shellStroke,
      strokeAlpha: 0.12,
    })
  );

  const tabs = CreateButtons(scene);
  const toggleBtn = CreateToggleLabel(scene, '▲', 44);
  const pages = CreatePages(scene);

  // ✅ IMPORTANT: give keys so ui.getElement('tabs') works
  topRow.add(tabs,      { key: 'tabs',      proportion: 1, expand: true,  align: 'left' });
  topRow.add(toggleBtn, { key: 'toggleBtn', proportion: 0, expand: false, align: 'right' });

  sizer.add(topRow, { expand: true });
  sizer.add(pages, { key: 'pages', proportion: 1, expand: true });

  // ✅ Return real references so we don't depend on getElement()
  return { sizer, tabs, pages, toggleBtn };
};

var CreateButtons = function (scene) {
  const TAB_W = 50;
  const tabs = scene.rexUI.add.buttons({
    orientation: 'x',
    space: { left : 4, item: 6 },
    buttons: [
      CreateLabel(scene, 'Functions', COLOR_FUNCTIONS, TAB_W).setName('functions'),
      CreateLabel(scene, 'Store', COLOR_BUILD, TAB_W).setName('build'),
      CreateLabel(scene, 'Players',   COLOR_PLAYERS,   TAB_W).setName('players'),
      CreateLabel(scene, 'Clay Ovens',COLOR_OVENS,     TAB_W).setName('ovens'),
      CreateLabel(scene, 'Storage',   COLOR_STORAGE,   TAB_W).setName('storage'),
      CreateLabel(scene, 'Houses',    COLOR_BROWNISH, TAB_W).setName('houses'),
      CreateLabel(scene, 'Cards',      COLOR_CARDS,     TAB_W).setName('cards'),   
    ],
    buttonsType: 'radio'
  });
  (tabs.buttons || []).forEach((button) => {
    button.hovered = false;
    button.baseY = button.y;
    button.on('pointerover', () => {
      button.hovered = true;
      applyTabLabelVisual(button, button.__selected === true);
    });
    button.on('pointerout', () => {
      button.hovered = false;
      applyTabLabelVisual(button, button.__selected === true);
    });
    applyTabLabelVisual(button, false);
  });
  return tabs;
};

var CreateLabel = function (scene, text, color, width) {
  const label = scene.rexUI.add.label({
    width,
    height: 34,
    background: makeGlassRoundRect(
      scene,
      0,
      0,
      14,
      {
        fill: BOTTOM_BAR_THEME.tabIdleFill,
        alpha: BOTTOM_BAR_THEME.tabIdleAlpha,
        stroke: color,
        strokeAlpha: 0.14,
        strokeWidth: 1.5,
      }
    ),

    text: scene.add.text(0, 0, text, {
      fontSize: 14,
      fontFamily: "Bungee",
      color: BOTTOM_BAR_THEME.text,
      fontStyle: 'bold',
      stroke: '#08202d',
      strokeThickness: 3,
    }),

    space: { left: 12, right: 12, top: 6, bottom: 6 }
  });
  label.accentColor = color;
  label.__selected = false;
  return label;
};

var CreateToggleLabel = function (scene, text, width = 44) {
  const label = scene.rexUI.add.label({
    width,
    height: 34,
    background: makeGlassRoundRect(scene, 0, 0, 14, {
      fill: mixColor(BOTTOM_BAR_THEME.shellFill, 0xffffff, 0.08),
      alpha: 0.84,
      stroke: BOTTOM_BAR_THEME.shellStroke,
      strokeAlpha: 0.18,
      strokeWidth: 1.5,
    }),

    text: scene.add.text(0, 0, text, {
      fontSize: 15,
      fontFamily: "Bungee",
      color: BOTTOM_BAR_THEME.text,
      fontStyle: 'bold',
      stroke: '#08202d',
      strokeThickness: 2,
    }),

    space: { left: 14, right: 14, top: 6, bottom: 6 }
  });
  label.baseY = label.y;
  label.on('pointerover', () => {
    label.baseY ??= label.y;
    setHoverLiftState(scene, label, true, { baseY: label.baseY, hoverLift: 0, hoverScale: 1.04, moveY: false });
  });
  label.on('pointerout', () => {
    label.baseY ??= label.y;
    setHoverLiftState(scene, label, false, { baseY: label.baseY, hoverLift: 0, hoverScale: 1.04, moveY: false });
  });
  return label;
};

var CreatePages = function (scene) {
    const pageWidth = getBottomBarWidth(scene);
    const pages = scene.rexUI.add.pages({ fadeDuration: 500 })
        .addBackground(makeGlassRoundRect(scene, 0, 0, 0, {
          fill: COLOR_DARK,
          alpha: 0.72,
          stroke: BOTTOM_BAR_THEME.shellStroke,
          strokeAlpha: 0.10,
        }))
        .add(new FunctionTab(scene, 0, 0, pageWidth, EXPANDED - 34).getContainer(), { key: 'functions', expand: true });

    const playerTab = new PlayerTab(scene);
    pages.add(playerTab.view, { key: 'players', expand: true });
    scene.playerTab = playerTab;

    const clayTab = new ClayOvenTab(scene);
    ClayOvenTab.ensureBlankTexture(scene);
    pages.add(clayTab.view, { key: 'ovens', expand: true });
    scene.clayTab = clayTab;

    // inside CreatePages(scene) where other tabs are created
    scene.buildTab = new BuildTab(scene, 0, 0, pageWidth, EXPANDED - 40); // pass dimensions to BuildTab
    pages.add(scene.buildTab.view, { key: 'build', expand: true });

    const storageTab = new StorageTab(scene);
    pages.add(storageTab.view, { key: 'storage', expand: true });
    pages.storageTab = storageTab;
    scene.storageTab = storageTab;
    storageTab.refresh(1);

    const housesTab = new HousesTab(scene);
    pages.add(housesTab.view, { key: 'houses', expand: true });
    pages.housesTab = housesTab;
    scene.housesTab = housesTab;
    housesTab.refresh(1);

    const cardsTab = new CardsTab(scene);                        
    pages.add(cardsTab.view, { key: 'cards', expand: true });    
    scene.cardsTab = cardsTab;                                   

    pages.clayTab   = clayTab;
    pages.playerTab = playerTab;

    return pages;
};

function applyTabLabelVisual(label, selected) {
  if (!label) return;
  const bg = label.getElement?.('background') || label.background;
  const text = label.getElement?.('text') || label.text;
  const accent = label.accentColor ?? 0xffffff;
  const hovered = !!label.hovered;

  label.__selected = selected;
  bg?.setFillStyle(
    selected ? mixColor(accent, 0xffffff, 0.18) : (hovered ? BOTTOM_BAR_THEME.tabHoverFill : BOTTOM_BAR_THEME.tabIdleFill),
    selected ? BOTTOM_BAR_THEME.tabSelectedAlpha : (hovered ? BOTTOM_BAR_THEME.tabHoverAlpha : BOTTOM_BAR_THEME.tabIdleAlpha)
  );
  bg?.setStrokeStyle(
    selected ? 2 : 1.5,
    selected ? accent : mixColor(accent, BOTTOM_BAR_THEME.shellStroke, 0.35),
    selected ? 0.56 : (hovered ? 0.26 : 0.14)
  );
  if (text?.setColor) {
    text.setColor(selected ? BOTTOM_BAR_THEME.text : Phaser.Display.Color.IntegerToColor(accent).rgba);
  }
  setHoverLiftState(label.scene, label, selected || hovered, {
    baseY: label.baseY ?? label.y ?? 0,
    hoverLift: 0,
    hoverScale: selected ? 1.04 : 1.02,
    moveY: false,
  });
}

function updateTabButtonStyles(tabs, activeKey) {
  (tabs?.buttons || []).forEach((button) => {
    applyTabLabelVisual(button, button?.name === activeKey);
  });
}

function syncTabButtonAnchors(tabs, toggleBtn) {
  (tabs?.buttons || []).forEach((button) => {
    button.baseY = button.y;
  });
  if (toggleBtn) toggleBtn.baseY = toggleBtn.y;
}

var CreatePage = function (scene, title, color) {
    return scene.rexUI.add.textArea({
        text: scene.rexUI.add.BBCodeText(0, 0, `[color=${Phaser.Display.Color.IntegerToColor(color).rgba}]${title}[/color]`, { fontSize: 22 }),
        slider: {
            track: scene.rexUI.add.roundRectangle(0, 0, 20, 0, 10, color),
            thumb: scene.rexUI.add.roundRectangle(0, 0, 0, 0, 13, 0xffffff)
        },
        content: `${title} content goes here...`
    })
}
