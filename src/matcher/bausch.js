// matcher/bausch.js
// Matches a Bausch+Lomb purchase line item against the parsed price list.
// Delegates to the generic contact lens matcher.

const { matchContacts } = require('./contacts');

function matchBausch(item, entries) {
  return matchContacts(item, entries);
}

module.exports = { matchBausch };
