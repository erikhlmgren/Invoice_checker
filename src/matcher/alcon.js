// matcher/alcon.js
// Matches an Alcon purchase line item against the parsed price list.
// Delegates to the generic contact lens matcher.

const { matchContacts } = require('./contacts');

function matchAlcon(item, entries) {
  return matchContacts(item, entries);
}

module.exports = { matchAlcon };
