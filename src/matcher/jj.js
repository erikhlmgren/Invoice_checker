// matcher/jj.js
// Matches a Johnson & Johnson (ACUVUE) purchase line item against the parsed price list.
// Delegates to the generic contact lens matcher.

const { matchContacts } = require('./contacts');

function matchJJ(item, entries) {
  return matchContacts(item, entries);
}

module.exports = { matchJJ };
