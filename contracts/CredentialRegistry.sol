// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract CredentialRegistry is AccessControl {
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");

    struct Credential {
        bytes32 docHash;
        address issuer;
        address holder;
        string credentialType;
        string metadataURI;
        uint64 issuedAt;
        uint64 expiresAt;
        bool revoked;
    }

    uint256 public credentialCount;

    mapping(uint256 => Credential) private _credentials;
    mapping(bytes32 => uint256) public idByHash;
    mapping(address => uint256[]) private _holderCredentials;
    mapping(address => string) public issuerName;

    event IssuerAdded(address indexed account, string name);
    event IssuerRemoved(address indexed account);
    event CredentialIssued(
        uint256 indexed id,
        address indexed issuer,
        address indexed holder,
        bytes32 docHash,
        string credentialType
    );
    event CredentialRevoked(uint256 indexed id, address indexed revokedBy, string reason);

    error ZeroAddress();
    error EmptyHash();
    error AlreadyIssued(uint256 existingId);
    error InvalidExpiry();
    error CredentialNotFound(uint256 id);
    error AlreadyRevoked(uint256 id);
    error NotAuthorized();

    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function addIssuer(address account, string calldata name) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (account == address(0)) revert ZeroAddress();
        issuerName[account] = name;
        _grantRole(ISSUER_ROLE, account);
        emit IssuerAdded(account, name);
    }

    function removeIssuer(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(ISSUER_ROLE, account);
        emit IssuerRemoved(account);
    }

    function isIssuer(address account) external view returns (bool) {
        return hasRole(ISSUER_ROLE, account);
    }

    function issueCredential(
        address holder,
        bytes32 docHash,
        string calldata credentialType,
        string calldata metadataURI,
        uint64 expiresAt
    ) external onlyRole(ISSUER_ROLE) returns (uint256 id) {
        if (holder == address(0)) revert ZeroAddress();
        if (docHash == bytes32(0)) revert EmptyHash();
        if (idByHash[docHash] != 0) revert AlreadyIssued(idByHash[docHash]);
        if (expiresAt != 0 && expiresAt <= block.timestamp) revert InvalidExpiry();

        id = ++credentialCount;

        _credentials[id] = Credential({
            docHash: docHash,
            issuer: msg.sender,
            holder: holder,
            credentialType: credentialType,
            metadataURI: metadataURI,
            issuedAt: uint64(block.timestamp),
            expiresAt: expiresAt,
            revoked: false
        });

        idByHash[docHash] = id;
        _holderCredentials[holder].push(id);

        emit CredentialIssued(id, msg.sender, holder, docHash, credentialType);
    }

    function revokeCredential(uint256 id, string calldata reason) external {
        Credential storage c = _credentials[id];
        if (c.issuer == address(0)) revert CredentialNotFound(id);
        if (c.revoked) revert AlreadyRevoked(id);
        if (msg.sender != c.issuer && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) revert NotAuthorized();

        c.revoked = true;
        emit CredentialRevoked(id, msg.sender, reason);
    }

    function getCredential(uint256 id) external view returns (Credential memory) {
        if (_credentials[id].issuer == address(0)) revert CredentialNotFound(id);
        return _credentials[id];
    }

    function credentialsOf(address holder) external view returns (uint256[] memory) {
        return _holderCredentials[holder];
    }

    function isValid(uint256 id) public view returns (bool) {
        Credential storage c = _credentials[id];
        if (c.issuer == address(0) || c.revoked) return false;
        if (c.expiresAt != 0 && c.expiresAt <= block.timestamp) return false;
        return true;
    }

    function verifyByHash(bytes32 docHash)
        external
        view
        returns (bool valid, uint256 id, Credential memory credential)
    {
        id = idByHash[docHash];
        if (id == 0) return (false, 0, credential);
        credential = _credentials[id];
        valid = isValid(id);
    }
}
