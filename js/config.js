// ============================================================
//  SITE SETTINGS — edit these to make the site yours
// ============================================================
export const SITE = {
  // Your business name (shown in the logo, tab title and footer)
  brand: "RedLine Webs",

  // ---- OWNER ACCESS ----
  // Typing this username (instead of an email) on the sign-in page signs in as
  // <username>@<adminLoginDomain>. The password is NOT stored here.
  adminUsers: ["admin1100"],
  adminLoginDomain: "redline.admin",

  // Optional: Google emails that are also admins (lowercase). Leave [] if none.
  // ⚠️ Keep the same list in firestore.rules
  adminEmails: [],

  // Currency for prices ("MXN", "USD", ...)
  currency: "MXN",

  // Packages (names/descriptions are in js/i18n.js under pkg.<id>.*)
  packages: [
    { id: "landing",  price: 4999 },
    { id: "business", price: 9999, popular: true },
    { id: "store",    price: 19999 }
  ],

  // Times customers can book (24h format)
  timeSlots: ["09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00"],

  // Days you are closed: 0 = Sunday, 6 = Saturday
  closedWeekdays: [0],

  // Categories for ready-made website listings (names are in js/i18n.js under type.*)
  listingCategories: ["landing", "business", "store", "webapp", "portfolio", "other"]
};
