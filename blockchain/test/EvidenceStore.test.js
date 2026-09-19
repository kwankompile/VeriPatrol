const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { sha256Bytes32 } = require("../scripts/lib/sampleHash");

describe("EvidenceStore", function () {
  let evidenceStore;
  let owner;
  let other;

  beforeEach(async function () {
    [owner, other] = await ethers.getSigners();
    const EvidenceStore = await ethers.getContractFactory("EvidenceStore");
    evidenceStore = await EvidenceStore.deploy();
    await evidenceStore.waitForDeployment();
  });

  it("deploys with the deployer as owner", async function () {
    expect(await evidenceStore.owner()).to.equal(await owner.getAddress());
  });

  it("owner can store a valid hash", async function () {
    const hash = sha256Bytes32("test-hash-owner-store");
    await expect(evidenceStore.storeHash(hash)).to.not.be.reverted;
    expect(await evidenceStore.verifyHash(hash)).to.equal(true);
  });

  it("emits HashStored with expected hash and sender", async function () {
    const hash = sha256Bytes32("test-hash-event");
    const ownerAddress = await owner.getAddress();
    await expect(evidenceStore.storeHash(hash))
      .to.emit(evidenceStore, "HashStored")
      .withArgs(hash, ownerAddress, anyValue);
  });

  it("verifyHash(storedHash) returns true", async function () {
    const hash = sha256Bytes32("test-hash-verify-true");
    await evidenceStore.storeHash(hash);
    expect(await evidenceStore.verifyHash(hash)).to.equal(true);
  });

  it("verifyHash(unknownHash) returns false", async function () {
    const unknown = sha256Bytes32("test-hash-unknown");
    expect(await evidenceStore.verifyHash(unknown)).to.equal(false);
  });

  it("rejects bytes32(0)", async function () {
    await expect(evidenceStore.storeHash(ethers.ZeroHash)).to.be.revertedWith("Invalid hash");
  });

  it("rejects duplicate hash storage", async function () {
    const hash = sha256Bytes32("test-hash-duplicate");
    await evidenceStore.storeHash(hash);
    await expect(evidenceStore.storeHash(hash)).to.be.revertedWith("Hash already stored");
  });

  it("non-owner cannot store a hash", async function () {
    const hash = sha256Bytes32("test-hash-non-owner");
    await expect(evidenceStore.connect(other).storeHash(hash)).to.be.revertedWith("Not authorized");
  });

  it("owner can transfer ownership", async function () {
    await evidenceStore.transferOwnership(await other.getAddress());
    expect(await evidenceStore.owner()).to.equal(await other.getAddress());
  });

  it("ownership transfer emits OwnershipTransferred", async function () {
    const newOwner = await other.getAddress();
    await expect(evidenceStore.transferOwnership(newOwner))
      .to.emit(evidenceStore, "OwnershipTransferred")
      .withArgs(await owner.getAddress(), newOwner);
  });

  it("old owner cannot store after transfer", async function () {
    const hash = sha256Bytes32("test-hash-transfer-old-owner");
    await evidenceStore.transferOwnership(await other.getAddress());
    await expect(evidenceStore.storeHash(hash)).to.be.revertedWith("Not authorized");
  });

  it("new owner can store after transfer", async function () {
    const hash = sha256Bytes32("test-hash-transfer-owner");
    await evidenceStore.transferOwnership(await other.getAddress());
    await expect(evidenceStore.connect(other).storeHash(hash)).to.not.be.reverted;
    expect(await evidenceStore.verifyHash(hash)).to.equal(true);
  });

  it("rejects transfer to zero address", async function () {
    await expect(evidenceStore.transferOwnership(ethers.ZeroAddress)).to.be.revertedWith("Invalid owner");
  });
});
