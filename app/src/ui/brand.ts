/**
 * Brand strings, in one place.
 *
 * These were duplicated across the splash and the sign-in screen, which is how
 * "DRIVE BETTER" survived long after it stopped being true: it was a car
 * owner's line on a wholesaler's app. Changing a tagline should be one edit.
 *
 * Two taglines, because they are aimed at different people:
 *
 *   · TAGLINE is the business line — what AutoLoom sells and to whom. It goes
 *     wherever the brand is presented: splash, sign-in, the badge, the shop
 *     board, the top of a bill. The audience is a customer, and most of them
 *     are other shops, so it is in the language the trade actually uses.
 *   · PROMISE is the product line — what the app does for the person holding
 *     the phone. It goes under the sign-in form and nowhere else.
 *
 * Kept as ASCII Hinglish rather than Devanagari on purpose: it matches how the
 * rest of the app is written and how the shop types on a phone keyboard.
 */

export const NAME = 'AutoLoom';

/** Business line. Shown under the wordmark, letterspaced, uppercase. */
export const TAGLINE = 'HAR GAADI KA MAAL';

/** What the shop gets, in one breath. Under the sign-in form. */
export const PROMISE = 'Har bill, khata aur stock is phone par — signal ho ya na ho.';

/** For the badge and anywhere the trade needs spelling out. */
export const DESCRIPTOR = 'PREMIUM CAR ACCESSORIES';
export const TRADE = 'WHOLESALER';
