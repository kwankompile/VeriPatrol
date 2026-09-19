const fs = require("fs");
const path = require("path");
const { getDeployerSigner } = require("./lib/signer");

async function main() {
  const deployer = await getDeployerSigner(ethers);

  const EvidenceStore = await ethers.getContractFactory("EvidenceStore", deployer);
  const contract = await EvidenceStore.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const deployerAddress = await deployer.getAddress();
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);

  const deploymentTx = contract.deploymentTransaction();
  const deploymentTxHash = deploymentTx ? deploymentTx.hash : null;

  const artifactPath = path.join(
    __dirname,
    "..",
    "artifacts",
    "contracts",
    "EvidenceStore.sol",
    "EvidenceStore.json"
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const deployedAt = new Date().toISOString();

  const deploymentRecord = {
    contractName: "EvidenceStore",
    network: "ganache",
    chainId,
    address,
    deployer: deployerAddress,
    deploymentTxHash,
    deployedAt,
    abi: artifact.abi,
  };

  const outDir = path.join(__dirname, "..", "deployments", "ganache");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "EvidenceStore.json");
  fs.writeFileSync(outPath, `${JSON.stringify(deploymentRecord, null, 2)}\n`);

  console.log("EvidenceStore deployed to Ganache");
  console.log(`  Contract address:   ${address}`);
  console.log(`  Deployer:           ${deployerAddress}`);
  console.log(`  Chain ID:           ${chainId}`);
  console.log(`  Deployment tx:      ${deploymentTxHash}`);
  console.log(`  Deployed at:        ${deployedAt}`);
  console.log(`  Deployment JSON:    ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
