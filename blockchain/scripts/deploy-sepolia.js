const { assertSepoliaEnv } = require("./lib/sepoliaConfig");
const { getDeployerSigner } = require("./lib/signer");
const {
  getEvidenceStoreArtifact,
  writeDeploymentRecord,
  sepoliaExplorerTxUrl,
} = require("./lib/deployment");

async function main() {
  assertSepoliaEnv();

  const deployer = await getDeployerSigner(ethers);
  const artifact = getEvidenceStoreArtifact();

  const EvidenceStore = await ethers.getContractFactory("EvidenceStore", deployer);
  const contract = await EvidenceStore.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const deployerAddress = await deployer.getAddress();
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);

  if (chainId !== 11155111) {
    throw new Error(
      `Connected RPC chain ID is ${chainId}, but Sepolia requires 11155111. Check SEPOLIA_RPC_URL.`
    );
  }

  const deploymentTx = contract.deploymentTransaction();
  const deploymentTxHash = deploymentTx ? deploymentTx.hash : null;
  let deploymentBlockNumber = null;

  if (deploymentTx) {
    const receipt = await deploymentTx.wait();
    deploymentBlockNumber = receipt ? Number(receipt.blockNumber) : null;
  }

  const deployedAt = new Date().toISOString();
  const outPath = writeDeploymentRecord({
    network: "sepolia",
    chainId,
    address,
    deployer: deployerAddress,
    deploymentTxHash,
    deployedAt,
    abi: artifact.abi,
    deploymentBlockNumber,
    explorerTxUrl: sepoliaExplorerTxUrl(deploymentTxHash),
  });

  console.log("EvidenceStore deployed to Sepolia");
  console.log(`  Contract address:   ${address}`);
  console.log(`  Deployer:           ${deployerAddress}`);
  console.log(`  Chain ID:           ${chainId}`);
  console.log(`  Deployment tx:      ${deploymentTxHash}`);
  if (deploymentBlockNumber !== null) {
    console.log(`  Deployment block:   ${deploymentBlockNumber}`);
  }
  console.log(`  Deployed at:        ${deployedAt}`);
  console.log(`  Deployment JSON:    ${outPath}`);
  if (deploymentTxHash) {
    console.log(`  Explorer tx:        ${sepoliaExplorerTxUrl(deploymentTxHash)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
