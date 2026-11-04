const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("CredentialRegistry", function () {
  let registry, admin, issuer, student, stranger;
  const hashOf = (s) => ethers.keccak256(ethers.toUtf8Bytes(s));

  beforeEach(async function () {
    [admin, issuer, student, stranger] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory("CredentialRegistry");
    registry = await Registry.deploy(admin.address);
    await registry.addIssuer(issuer.address, "State University");
  });

  it("registers issuers with a name", async function () {
    expect(await registry.isIssuer(issuer.address)).to.equal(true);
    expect(await registry.issuerName(issuer.address)).to.equal("State University");
  });

  it("blocks non-admins from adding issuers", async function () {
    await expect(
      registry.connect(stranger).addIssuer(stranger.address, "Fake U")
    ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
  });

  it("issues and verifies a credential", async function () {
    const h = hashOf("BSc Computer Science - Jane Doe - 2026");
    await expect(
      registry.connect(issuer).issueCredential(student.address, h, "BSc Computer Science", "ipfs://cid", 0)
    ).to.emit(registry, "CredentialIssued");

    const [valid, id, cred] = await registry.verifyByHash(h);
    expect(valid).to.equal(true);
    expect(id).to.equal(1n);
    expect(cred.holder).to.equal(student.address);
    expect(cred.issuer).to.equal(issuer.address);
    expect(await registry.credentialsOf(student.address)).to.deep.equal([1n]);
  });

  it("rejects issuance from non-issuers", async function () {
    await expect(
      registry.connect(stranger).issueCredential(student.address, hashOf("x"), "Fake", "", 0)
    ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
  });

  it("rejects duplicate document hashes", async function () {
    const h = hashOf("dup");
    await registry.connect(issuer).issueCredential(student.address, h, "Cert", "", 0);
    await expect(
      registry.connect(issuer).issueCredential(student.address, h, "Cert", "", 0)
    ).to.be.revertedWithCustomError(registry, "AlreadyIssued");
  });

  it("returns invalid for unknown hashes", async function () {
    const [valid, id] = await registry.verifyByHash(hashOf("never issued"));
    expect(valid).to.equal(false);
    expect(id).to.equal(0n);
  });

  it("lets the issuer revoke", async function () {
    const h = hashOf("revoke me");
    await registry.connect(issuer).issueCredential(student.address, h, "Cert", "", 0);
    await expect(registry.connect(issuer).revokeCredential(1, "Issued in error"))
      .to.emit(registry, "CredentialRevoked");
    expect(await registry.isValid(1)).to.equal(false);
  });

  it("blocks strangers from revoking", async function () {
    await registry.connect(issuer).issueCredential(student.address, hashOf("a"), "Cert", "", 0);
    await expect(
      registry.connect(stranger).revokeCredential(1, "nope")
    ).to.be.revertedWithCustomError(registry, "NotAuthorized");
  });

  it("treats expired credentials as invalid", async function () {
    const expiry = (await time.latest()) + 3600;
    await registry.connect(issuer).issueCredential(student.address, hashOf("temp"), "License", "", expiry);
    expect(await registry.isValid(1)).to.equal(true);
    await time.increaseTo(expiry + 1);
    expect(await registry.isValid(1)).to.equal(false);
  });

  it("rejects an expiry in the past", async function () {
    const past = (await time.latest()) - 10;
    await expect(
      registry.connect(issuer).issueCredential(student.address, hashOf("old"), "License", "", past)
    ).to.be.revertedWithCustomError(registry, "InvalidExpiry");
  });
});
