const fs = require("fs");
const path = require("path");

function getEvidenceStoreArtifact() {
  const artifactPath = path.join(
    __dirname,
    "..",
    "..",
    "artifacts",
    "contracts",
    "EvidenceStore.sol",
    "EvidenceStore.json"
  );

  if (!fs.existsSync(artifactPath)) {
    throw new Error(
      `Compiled artifact not found at ${artifactPath}. Run "npm run compile" first.`
    );
  }

  return JSON.parse(fs.readFileSync(artifactPath, "utf8"));
}

function getDeploymentPath(network) {
  return path.join(__dirname, "..", "..", "deployments", network, "EvidenceStore.json");
}

function writeDeploymentRecord({
  network,
  chainId,
  address,
  deployer,
  deploymentTxHash,
  deployedAt,
  abi,
  deploymentBlockNumber = null,
  explorerTxUrl = null,
}) {
  const deploymentRecord = {
    contractName: "EvidenceStore",
    network,
    chainId,
    address,
    deployer,
    deploymentTxHash,
    deployedAt,
    abi,
  };

  if (deploymentBlockNumber !== null && deploymentBlockNumber !== undefined) {
    deploymentRecord.deploymentBlockNumber = deploymentBlockNumber;
  }

  if (explorerTxUrl) {
    deploymentRecord.explorerTxUrl = explorerTxUrl;
  }

  const outDir = path.dirname(getDeploymentPath(network));
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = getDeploymentPath(network);
  fs.writeFileSync(outPath, `${JSON.stringify(deploymentRecord, null, 2)}\n`);

  return outPath;
}

function sepoliaExplorerTxUrl(txHash) {
  if (!txHash) {
    return null;
  }

  return `https://sepolia.etherscan.io/tx/${txHash}`;
}

module.exports = {
  getEvidenceStoreArtifact,
  getDeploymentPath,
  writeDeploymentRecord,
  sepoliaExplorerTxUrl,
};
