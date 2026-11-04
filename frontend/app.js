let provider, signer, contract, account, config;

const $ = (id) => document.getElementById(id);

function setMsg(el, text, kind = "") {
  el.innerHTML = `<p class="msg ${kind}">${text}</p>`;
}

function short(addr) {
  return addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "";
}

function errText(err) {
  return err?.shortMessage || err?.reason || err?.info?.error?.message || err?.message || String(err);
}

async function hashFile(file) {
  const buf = await file.arrayBuffer();
  return ethers.keccak256(new Uint8Array(buf));
}

async function loadConfig() {
  const res = await fetch("contract.json");
  if (!res.ok) throw new Error("contract.json not found. Run the deploy script first.");
  config = await res.json();
}

async function connect() {
  if (!window.ethereum) {
    $("status").textContent = "MetaMask not detected. Install it from metamask.io.";
    return;
  }
  try {
    if (!config) await loadConfig();
    provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);

    const net = await provider.getNetwork();
    if (Number(net.chainId) !== config.chainId) {
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x" + config.chainId.toString(16) }]
        });
        provider = new ethers.BrowserProvider(window.ethereum);
      } catch {
        $("status").textContent = `Switch MetaMask to chain ${config.chainId}.`;
        return;
      }
    }

    signer = await provider.getSigner();
    account = await signer.getAddress();
    contract = new ethers.Contract(config.address, config.abi, signer);

    const [issuer, admin] = await Promise.all([
      contract.isIssuer(account),
      contract.hasRole(ethers.ZeroHash, account)
    ]);
    const roles = [admin && "admin", issuer && "issuer"].filter(Boolean).join(", ") || "viewer";

    $("connectBtn").textContent = short(account);
    $("status").textContent = `Connected ${short(account)} | role: ${roles} | contract ${short(config.address)}`;
  } catch (err) {
    $("status").textContent = errText(err);
  }
}

function requireContract(out) {
  if (!contract) {
    setMsg(out, "Connect MetaMask first.", "err");
    return false;
  }
  return true;
}

function credentialCard(id, c, valid, issuerName) {
  const issued = new Date(Number(c.issuedAt) * 1000).toLocaleString();
  const expires = Number(c.expiresAt) ? new Date(Number(c.expiresAt) * 1000).toLocaleDateString() : "Never";
  let state = "VALID";
  if (c.revoked) state = "REVOKED";
  else if (!valid) state = "EXPIRED";

  return `
    <div class="card ${valid ? "valid" : "invalid"}">
      <span class="badge ${valid ? "ok" : "bad"}">${state}</span>
      <dl>
        <dt>ID</dt><dd>#${id}</dd>
        <dt>Type</dt><dd>${c.credentialType}</dd>
        <dt>Issuer</dt><dd>${issuerName || ""} ${c.issuer}</dd>
        <dt>Holder</dt><dd>${c.holder}</dd>
        <dt>Issued</dt><dd>${issued}</dd>
        <dt>Expires</dt><dd>${expires}</dd>
        <dt>Doc hash</dt><dd>${c.docHash}</dd>
        ${c.metadataURI ? `<dt>Metadata</dt><dd>${c.metadataURI}</dd>` : ""}
      </dl>
    </div>`;
}

async function verify() {
  const out = $("verifyResult");
  if (!requireContract(out)) return;
  try {
    let h = $("verifyHash").value.trim();
    const file = $("verifyFile").files[0];
    if (file) h = await hashFile(file);
    if (!ethers.isHexString(h, 32)) return setMsg(out, "Provide a file or a 32-byte hash.", "err");

    const [valid, id, c] = await contract.verifyByHash(h);
    if (id === 0n) {
      out.innerHTML = `<div class="card invalid"><span class="badge bad">NOT FOUND</span>
        <p>No credential matches this document. It may have been altered or was never issued.</p>
        <p class="mono">${h}</p></div>`;
      return;
    }
    const name = await contract.issuerName(c.issuer);
    out.innerHTML = credentialCard(id, c, valid, name);
  } catch (err) {
    setMsg(out, errText(err), "err");
  }
}

async function issue() {
  const out = $("issueResult");
  if (!requireContract(out)) return;
  try {
    const holder = $("holder").value.trim();
    const type = $("credType").value.trim();
    const file = $("issueFile").files[0];
    const uri = $("metaUri").value.trim();
    const expiryVal = $("expiry").value;

    if (!ethers.isAddress(holder)) return setMsg(out, "Invalid holder address.", "err");
    if (!type) return setMsg(out, "Credential type is required.", "err");
    if (!file) return setMsg(out, "Attach the certificate file.", "err");

    const h = await hashFile(file);
    const expiry = expiryVal ? Math.floor(new Date(expiryVal + "T23:59:59").getTime() / 1000) : 0;

    setMsg(out, "Confirm the transaction in MetaMask...");
    const tx = await contract.issueCredential(holder, h, type, uri, expiry);
    setMsg(out, `Pending: <span class="mono">${tx.hash}</span>`);
    const receipt = await tx.wait();

    const log = receipt.logs
      .map((l) => { try { return contract.interface.parseLog(l); } catch { return null; } })
      .find((p) => p && p.name === "CredentialIssued");

    setMsg(out, `Issued credential #${log ? log.args.id : "?"} in block ${receipt.blockNumber}.`, "ok");
  } catch (err) {
    setMsg(out, errText(err), "err");
  }
}

async function revoke() {
  const out = $("revokeResult");
  if (!requireContract(out)) return;
  try {
    const id = $("revokeId").value;
    const reason = $("revokeReason").value.trim() || "Revoked";
    if (!id) return setMsg(out, "Enter a credential ID.", "err");
    setMsg(out, "Confirm the transaction in MetaMask...");
    const tx = await contract.revokeCredential(id, reason);
    await tx.wait();
    setMsg(out, `Credential #${id} revoked.`, "ok");
  } catch (err) {
    setMsg(out, errText(err), "err");
  }
}

async function loadMine() {
  const out = $("mine");
  if (!requireContract(out)) return;
  try {
    const ids = await contract.credentialsOf(account);
    if (!ids.length) return setMsg(out, "No credentials found for this wallet.");
    const cards = await Promise.all(ids.map(async (id) => {
      const [c, valid] = await Promise.all([contract.getCredential(id), contract.isValid(id)]);
      const name = await contract.issuerName(c.issuer);
      return credentialCard(id, c, valid, name);
    }));
    out.innerHTML = cards.join("");
  } catch (err) {
    setMsg(out, errText(err), "err");
  }
}

async function addIssuer() {
  const out = $("adminResult");
  if (!requireContract(out)) return;
  try {
    const addr = $("issuerAddr").value.trim();
    const name = $("issuerName").value.trim();
    if (!ethers.isAddress(addr)) return setMsg(out, "Invalid address.", "err");
    const tx = await contract.addIssuer(addr, name);
    await tx.wait();
    setMsg(out, `${short(addr)} can now issue credentials.`, "ok");
  } catch (err) {
    setMsg(out, errText(err), "err");
  }
}

async function removeIssuer() {
  const out = $("adminResult");
  if (!requireContract(out)) return;
  try {
    const addr = $("issuerAddr").value.trim();
    if (!ethers.isAddress(addr)) return setMsg(out, "Invalid address.", "err");
    const tx = await contract.removeIssuer(addr);
    await tx.wait();
    setMsg(out, `${short(addr)} removed as issuer.`, "ok");
  } catch (err) {
    setMsg(out, errText(err), "err");
  }
}

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab, .panel").forEach((el) => el.classList.remove("active"));
    btn.classList.add("active");
    $(btn.dataset.tab).classList.add("active");
  });
});

$("verifyFile").addEventListener("change", (e) => {
  $("verifyFileName").textContent = e.target.files[0]?.name || "Choose a file";
});

$("issueFile").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  $("issueHash").textContent = f ? `keccak256: ${await hashFile(f)}` : "";
});

$("connectBtn").addEventListener("click", connect);
$("verifyBtn").addEventListener("click", verify);
$("issueBtn").addEventListener("click", issue);
$("revokeBtn").addEventListener("click", revoke);
$("loadMine").addEventListener("click", loadMine);
$("addIssuerBtn").addEventListener("click", addIssuer);
$("removeIssuerBtn").addEventListener("click", removeIssuer);

if (window.ethereum) {
  window.ethereum.on("accountsChanged", () => window.location.reload());
  window.ethereum.on("chainChanged", () => window.location.reload());
}
