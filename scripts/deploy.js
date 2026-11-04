const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const Registry = await hre.ethers.getContractFactory("CredentialRegistry");
  const registry = await Registry.deploy(deployer.address);
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  console.log("CredentialRegistry deployed to:", address);

  const tx = await registry.addIssuer(deployer.address, "Demo University");
  await tx.wait();
  console.log("Deployer registered as issuer: Demo University");

  const { chainId } = await hre.ethers.provider.getNetwork();
  const artifact = await hre.artifacts.readArtifact("CredentialRegistry");

  const out = {
    address,
    chainId: Number(chainId),
    abi: artifact.abi
  };

  const target = path.join(__dirname, "..", "frontend", "contract.json");
  fs.writeFileSync(target, JSON.stringify(out, null, 2));
  console.log("Wrote", target);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
