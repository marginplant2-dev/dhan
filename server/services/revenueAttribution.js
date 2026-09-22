/**
 * Ownership-aware revenue attribution.
 *
 * One helper, one rule: a live report, a statement and a payout must never
 * decide "whose money is this" differently, or they drift and somebody is paid
 * twice — or not at all.
 *
 * The rule: an owner earns only on activity from the moment the user joined
 * them. A user who traded for ten days under the platform and moved to an
 * admin today earns that admin nothing for those ten days.
 */

/**
 * @param {Date|string|null} eventAt  — when the money moved.
 * @param {Date|string|null} joinedAt — User.parentAdminAssignedAt.
 * @returns {boolean} whether the CURRENT owner earns on this event.
 *
 * `null` joinedAt means the user never moved, so the whole history counts —
 * the safe default for rows that pre-date the field.
 */
function earnsFrom(eventAt, joinedAt) {
  if (!joinedAt || !eventAt) return true;
  return new Date(eventAt).getTime() >= new Date(joinedAt).getTime();
}

/**
 * Mongo filter selecting only the events the current owner earns on.
 *
 * @param {Array} users — docs carrying { oderId, parentAdminAssignedAt }.
 * @param {Object=} opts — { key: user field on the event doc, dateField }.
 */
function ownedEventsFilter(users, { key = 'oderId', dateField = 'createdAt' } = {}) {
  const rows = users || [];
  // No users in scope ⇒ match nothing. Never degrade into "no filter".
  if (!rows.length) return { [key]: { $in: [] } };
  return {
    $or: rows.map(u => (
      u.parentAdminAssignedAt
        ? { [key]: u.oderId, [dateField]: { $gte: u.parentAdminAssignedAt } }
        : { [key]: u.oderId }
    )),
  };
}

module.exports = { earnsFrom, ownedEventsFilter };
