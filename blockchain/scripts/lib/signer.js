/**
 * Resolve a deployer/owner signer for Ganache.
 * Uses Hardhat-configured accounts when present; otherwise Ganache unlocked eth_accounts.
 */
async function getDeployerSigner(ethers) {
  const signers = await ethers.getSigners();
  if (signers.length > 0) {
    return signers[0];
  }

  const accounts = await ethers.provider.send("eth_accounts", []);
  if (!accounts.length) {
    throw new Error(
      "No deployer account available. Set DEPLOYER_PRIVATE_KEY in .env or start Ganache with unlocked accounts."
    );
  }

  return ethers.getSigner(accounts[0]);
}

/**
 * Resolve a signer for the current contract owner address.
 */
async function getOwnerSigner(ethers, ownerAddress) {
  const signers = await ethers.getSigners();
  const normalizedOwner = ownerAddress.toLowerCase();

  for (const signer of signers) {
    const address = (await signer.getAddress()).toLowerCase();
    if (address === normalizedOwner) {
      return signer;
    }
  }

  return ethers.getSigner(ownerAddress);
}

module.exports = {
  getDeployerSigner,
  getOwnerSigner,
};
