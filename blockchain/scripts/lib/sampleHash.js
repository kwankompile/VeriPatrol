const crypto = require("crypto");

/**
 * Deterministic SHA-256 bytes32 hash from a harmless label (not real evidence).
 * Aligns with the Laravel canonical hashing architecture (sha256).
 */
function sha256Bytes32(label) {
  const digest = crypto.createHash("sha256").update(label, "utf8").digest("hex");
  return `0x${digest}`;
}

/**
 * Default sample hash for deployment verification scripts.
 */
function sampleVerificationHash(label = "m1-verification-sample-v1") {
  return sha256Bytes32(label);
}

module.exports = {
  sha256Bytes32,
  sampleVerificationHash,
};
