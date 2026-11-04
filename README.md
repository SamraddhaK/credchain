# CredChain

Tamper-proof academic and identity credentials on Ethereum. Approved institutions issue certificates on-chain; anyone can verify a certificate by dropping the original file into the web app.

## How it works

1. An institution (issuer) hashes the certificate file (PDF, image, anything) with keccak256.
2. Only the hash, the holder's wallet, the credential type and dates are written to the blockchain. The file itself stays private.
3. A verifier hashes the file they were given and looks it up. If even one byte was changed, the hash will not match and the certificate shows as **NOT FOUND**.
4. Issuers can revoke credentials, and credentials can carry an optional expiry date.

### Roles

| Role   | Can do                                          |
|--------|-------------------------------------------------|
| Admin  | Add or remove issuers, revoke any credential    |
| Issuer | Issue credentials, revoke the ones it issued    |
| Anyone | Verify credentials, view a wallet's credentials |

## Project layout

```
contracts/CredentialRegistry.sol   smart contract
test/CredentialRegistry.test.js    unit tests
scripts/deploy.js                  deploys and writes frontend/contract.json
frontend/                          MetaMask web app (plain HTML/JS + ethers v6)
```

## Requirements

- Node.js 18 or newer
- MetaMask browser extension

## Run locally

```bash
npm install
npx hardhat test          # run the tests
npx hardhat node          # terminal 1: local blockchain
npm run deploy:local      # terminal 2: deploy the contract
npm run frontend          # terminal 2: serve the app at http://localhost:5173
```

### Connect MetaMask to the local chain

1. In MetaMask, add a network manually:
   - Network name: Hardhat Local
   - RPC URL: `http://127.0.0.1:8545`
   - Chain ID: `31337`
   - Currency symbol: ETH
2. Import Account #0 using the private key printed by `npx hardhat node`. That account deployed the contract, so it is both admin and an issuer ("Demo University").
3. Open http://localhost:5173 and click **Connect MetaMask**.

If you restart `hardhat node`, redeploy and use MetaMask's *Settings > Advanced > Clear activity tab data* to reset the nonce.

### Try it

1. **Issue tab**: paste any wallet address as holder, type "BSc Computer Science", attach a PDF, click Issue.
2. **Verify tab**: drop the same PDF. It shows VALID with the issuer and dates.
3. Edit the PDF (or pick a different file) and verify again. It shows NOT FOUND.
4. Revoke the credential by its ID and verify again. It shows REVOKED.

## Deploy to Sepolia testnet

1. Get free Sepolia ETH from a faucet (Alchemy, Infura or Google Cloud faucets).
2. Copy `.env.example` to `.env` and fill in your RPC URL and deployer private key. Use a test wallet only and never commit `.env`.
3. Run:

```bash
npm run deploy:sepolia
npx hardhat verify --network sepolia <CONTRACT_ADDRESS> <YOUR_WALLET_ADDRESS>
```

The deploy script updates `frontend/contract.json`, and the app will ask MetaMask to switch to Sepolia.

To host the frontend, upload the `frontend/` folder to GitHub Pages, Netlify or Vercel.

## Design notes

- **Privacy**: personal data never touches the chain, only a hash. For extra privacy, add a random salt to each document before hashing so a hash cannot be guessed from known data.
- **Metadata URI**: optionally point to an IPFS JSON file (e.g. via Pinata) with public details such as degree name and graduation year.
- **Duplicates**: the same document hash can only be issued once.
- **Access control**: uses OpenZeppelin `AccessControl`.

## Ideas for extending it

- Batch issuance for an entire graduating class (or a Merkle root per batch to save gas)
- Soulbound (non-transferable) ERC-721 tokens so credentials appear in wallets
- QR codes on printed certificates that link to the verify page with the hash pre-filled
- W3C Verifiable Credentials / DID integration
