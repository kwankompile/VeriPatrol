const fs = require("fs");
const path = require("path");
const { getOwnerSigner } = require("./lib/signer");
const { sampleVerificationHash } = require("./lib/sampleHash");
const { getDeploymentPath, sepoliaExplorerTxUrl } = require("./lib/deployment");
const { assertSepoliaEnv } = require("./lib/sepoliaConfig");

function rerunDeployHint(network) {
  return `Rerun "npm run deploy:${network}" to regenerate deployments/${network}/EvidenceStore.json.`;
}

function assertDeploymentFields(deployment, network) {
  const missing = [];
  const hint = rerunDeployHint(network);

  if (deployment.address === undefined || deployment.address === null || deployment.address === "") {
    missing.push("address");
  }
  if (deployment.chainId === undefined || deployment.chainId === null || deployment.chainId === "") {
    missing.push("chainId");
  }
  if (deployment.abi === undefined || deployment.abi === null) {
    missing.push("abi");
  }

  if (missing.length > 0) {
    throw new Error(
      `Deployment JSON is missing required field(s): ${missing.join(", ")}. ${hint}`
    );
  }

  if (!ethers.isAddress(deployment.address)) {
    throw new Error(
      `Deployment JSON has an invalid address: ${JSON.stringify(deployment.address)}. ${hint}`
    );
  }

  const chainId = Number(deployment.chainId);
  if (!Number.isFinite(chainId) || !Number.isInteger(chainId) || chainId <= 0) {
    throw new Error(
      `Deployment JSON has an invalid chainId: ${JSON.stringify(deployment.chainId)}. ` +
        `Expected a positive integer. ${hint}`
    );
  }

  if (!Array.isArray(deployment.abi) || deployment.abi.length === 0) {
    throw new Error(`Deployment JSON has an invalid abi: expected a non-empty array. ${hint}`);
  }
}

function assertChainIdMatches(deployment, liveChainId, network) {
  const expectedChainId = Number(deployment.chainId);

  if (expectedChainId !== liveChainId) {
    const networkHint =
      network === "sepolia"
        ? "Check SEPOLIA_RPC_URL and rerun \"npm run deploy:sepolia\" if the deployment JSON is stale."
        : "Check GANACHE_RPC_URL and rerun \"npm run deploy:ganache\" if Ganache was restarted.";

    throw new Error(
      `Chain ID mismatch: deployment JSON expects chain ID ${expectedChainId}, ` +
        `but the connected RPC network reports chain ID ${liveChainId}. ` +
        `Likely cause: wrong RPC URL, wrong network, or stale deployment metadata. ${networkHint}`
    );
  }
}

async function assertBytecodeExists(address, network) {
  const bytecode = await ethers.provider.getCode(address);

  if (bytecode === "0x" || bytecode === "0x0") {
    const hint =
      network === "sepolia"
        ? `Rerun "npm run deploy:sepolia" against the current Sepolia RPC endpoint.`
        : `Rerun "npm run deploy:ganache" against the current Ganache workspace.`;

    throw new Error(
      `No contract bytecode exists at deployment address ${address}. ` +
        `Likely cause: stale deployment metadata or contract not deployed on this network. ${hint}`
    );
  }
}

function networkLabel(network) {
  return network === "sepolia" ? "Sepolia" : "Ganache";
}

async function main() {
  const network = hre.network.name;

  if (network === "sepolia") {
    assertSepoliaEnv();
  }

  const deploymentPath = getDeploymentPath(network);
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(
      `Deployment file not found at ${deploymentPath}. Run "npm run deploy:${network}" first.`
    );
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  assertDeploymentFields(deployment, network);

  const liveNetwork = await ethers.provider.getNetwork();
  const liveChainId = Number(liveNetwork.chainId);
  assertChainIdMatches(deployment, liveChainId, network);
  await assertBytecodeExists(deployment.address, network);

  const contract = await ethers.getContractAt("EvidenceStore", deployment.address);
  const sampleHash = sampleVerificationHash();

  let storeTxHash = null;
  const alreadyStored = await contract.verifyHash(sampleHash);

  if (!alreadyStored) {
    const ownerAddress = await contract.owner();
    const ownerSigner = await getOwnerSigner(ethers, ownerAddress);
    const connected = contract.connect(ownerSigner);
    const tx = await connected.storeHash(sampleHash);
    const receipt = await tx.wait();
    storeTxHash = receipt.hash;
  }

  const verified = await contract.verifyHash(sampleHash);
  if (!verified) {
    throw new Error("Verification failed: sample hash is not stored on-chain.");
  }

  console.log(`${networkLabel(network)} deployment verification succeeded`);
  console.log(`  Network:            ${network}`);
  console.log(`  Contract address:   ${deployment.address}`);
  console.log(`  Chain ID:           ${liveChainId}`);
  console.log(`  Sample hash:        ${sampleHash}`);
  console.log(`  Store tx hash:      ${storeTxHash ?? "(already stored — no new transaction)"}`);
  console.log(`  verifyHash result:  ${verified}`);

  if (network === "sepolia" && storeTxHash) {
    console.log(`  Explorer tx:        ${sepoliaExplorerTxUrl(storeTxHash)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
