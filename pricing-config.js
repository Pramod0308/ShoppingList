/* Where the price comparison API lives.
 *
 * The browser cannot call ALDI or LIDL directly (no CORS headers), so this
 * points at the Worker in pricing/worker.mjs. Deploy it with:
 *   npx wrangler deploy --config pricing/wrangler.toml
 * then paste the URL it prints below.
 *
 * Left empty, the Prices button explains what is missing instead of failing.
 */
export const PRICE_API = '';

/** Used for matching crowd-sourced prices to shops near you. */
export const TOWN = 'Milton Keynes';
