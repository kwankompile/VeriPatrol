/**
 * Validate Sepolia environment variables when the Sepolia network is in use.
 * Never logs or returns private key values.
 */
function assertSepoliaEnv() {
  const rpcUrl = process.env.SEPOLIA_RPC_URL?.trim();
  const privateKey = process.env.SEPOLIA_PRIVATE_KEY?.trim();
  const missing = [];

  if (!rpcUrl) {
    missing.push("SEPOLIA_RPC_URL");
  }

  if (!privateKey) {
    missing.push("SEPOLIA_PRIVATE_KEY");
  }

  if (missing.length > 0) {
    throw new Error(
      `${missing.join(" and ")} required for Sepolia. Set them in blockchain/.env ` +
        "(never commit private keys). The wallet also needs Sepolia ETH for deployment and verification transactions."
    );
  }
}

/**
 * Build Hardhat Sepolia network settings after validating env vars.
 */
function buildSepoliaNetworkConfig() {
  assertSepoliaEnv();

  const rpcUrl = process.env.SEPOLIA_RPC_URL.trim();
  const privateKey = process.env.SEPOLIA_PRIVATE_KEY.trim();
  const normalizedKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;

  return {
    url: rpcUrl,
    accounts: [normalizedKey],
    chainId: 11155111,
  };
}

function isSepoliaNetworkTask() {
  const networkFlagIndex = process.argv.indexOf("--network");
  return networkFlagIndex !== -1 && process.argv[networkFlagIndex + 1] === "sepolia";
}

module.exports = {
  assertSepoliaEnv,
  buildSepoliaNetworkConfig,
  isSepoliaNetworkTask,
};
