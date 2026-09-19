const fs = require("fs");
const path = require("path");
const { getEvidenceStoreArtifact, getDeploymentPath } = require("./lib/deployment");

const DEPLOYMENT_NETWORKS = ["ganache", "sepolia"];

async function main() {
  const artifact = getEvidenceStoreArtifact();

  for (const network of DEPLOYMENT_NETWORKS) {
    const abiExportPath = path.join(
      __dirname,
      "..",
      "deployments",
      network,
      "EvidenceStore.abi.json"
    );
    const deploymentPath = getDeploymentPath(network);

    if (!fs.existsSync(deploymentPath)) {
      continue;
    }

    fs.mkdirSync(path.dirname(abiExportPath), { recursive: true });
    fs.writeFileSync(abiExportPath, `${JSON.stringify(artifact.abi, null, 2)}\n`);
    console.log(`Exported ABI to ${abiExportPath}`);

    const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    deployment.abi = artifact.abi;
    fs.writeFileSync(deploymentPath, `${JSON.stringify(deployment, null, 2)}\n`);
    console.log(`Updated ABI in ${deploymentPath}`);
  }

  const ganacheAbiExportPath = path.join(__dirname, "..", "deployments", "ganache", "EvidenceStore.abi.json");
  if (!fs.existsSync(ganacheAbiExportPath)) {
    fs.mkdirSync(path.dirname(ganacheAbiExportPath), { recursive: true });
    fs.writeFileSync(ganacheAbiExportPath, `${JSON.stringify(artifact.abi, null, 2)}\n`);
    console.log(`Exported ABI to ${ganacheAbiExportPath}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
