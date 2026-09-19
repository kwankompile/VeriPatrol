// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract EvidenceStore {
    address public owner;

    mapping(bytes32 => bool) private stored;

    event HashStored(bytes32 indexed hash, address indexed sender, uint256 timestamp);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized");
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    function storeHash(bytes32 hash) external onlyOwner {
        require(hash != bytes32(0), "Invalid hash");
        require(!stored[hash], "Hash already stored");

        stored[hash] = true;
        emit HashStored(hash, msg.sender, block.timestamp);
    }

    function verifyHash(bytes32 hash) external view returns (bool) {
        return stored[hash];
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid owner");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
