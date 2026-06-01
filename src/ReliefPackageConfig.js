export const RELIEF_PACKAGE_PRICE = 700;
export const RELIEF_PACKAGE_MAX_COUNT = 1;

// The emergency stipend is intentionally enough to stabilize the town after
// the free storage drop, but nowhere near enough to bypass the normal economy.
export const RELIEF_PACKAGE_MONEY_GRANT = 250;

export const RELIEF_PACKAGE_ECONOMY_ROLE_COSTS = Object.freeze({
  builder: 100,
  forager: 100,
});

export const RELIEF_PACKAGE_CRITICAL_ROLES = Object.freeze([
  "builder",
  "forager",
]);
