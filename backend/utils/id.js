const crypto = require('crypto');

/**
 * Generate a new entity id with prefix: `<prefix>_<uuid>`.
 * Length is at most 40 characters (e.g. msg_ + 36 uuid = 40).
 * Valid prefixes: u, p, m, f, v, r, t, n, a, msg (or u_, p_, etc.)
 */
function newId(prefix) {
  const p = prefix.endsWith('_') ? prefix.slice(0, -1) : prefix;
  return `${p}_${crypto.randomUUID()}`;
}

module.exports = {
  newId
};
