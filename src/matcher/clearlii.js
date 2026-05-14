// matcher/clearlii.js
// Matches a Clearlii purchase line item against the hardcoded price list.
// Delegates to the generic contact lens matcher.

const { matchContacts } = require('./contacts');

function matchClearlii(item, entries) {
  return matchContacts(item, entries);
}

module.exports = { matchClearlii };
