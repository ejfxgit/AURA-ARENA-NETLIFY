// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AuraArena
/// @notice Minimal on-chain finalizer for AURA Arena Human-vs-AI battles.
///         The platform is NOT a gambling contract — it holds no funds and
///         settles no money. It records a tamper-evident proof of a completed
///         battle: the headline result numbers plus a keccak256 hash of the
///         off-chain data (thesis, challenges, recalculations). Conversations
///         and large JSON never go on-chain — only the hash does.
/// @dev    Optimized for cost: state is intentionally minimal. The canonical
///         record is the `BattleFinalized` event; storage keeps only a small
///         guard mapping so a battle cannot be finalized twice.
contract AuraArena {
    /// @notice Emitted once per battle when it is finalized. This event IS the
    ///         on-chain record — indexers/frontends read it for verification.
    event BattleFinalized(
        uint256 indexed battleId,
        uint8 indexed agentId,
        address indexed human,
        int256 aiPnl,
        int256 humanPnl,
        uint8 winner,
        uint16 confidenceBefore,
        uint16 confidenceAfter,
        bytes32 dataHash,
        uint256 timestamp
    );

    /// @notice The address allowed to finalize battles (the platform relayer).
    address public owner;

    /// @notice Guard against double-finalization of the same battle id.
    mapping(uint256 => bool) public finalized;

    error NotOwner();
    error AlreadyFinalized(uint256 battleId);
    error ZeroAddress();
    error InvalidResult();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /// @notice Transfer the relayer/owner role.
    function setOwner(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        owner = newOwner;
    }

    /// @notice Finalize a completed battle. All values are computed off-chain
    ///         by the platform's server-authoritative settlement; this function
    ///         only anchors them immutably.
    /// @param battleId          Numeric id derived from the off-chain battle id.
    /// @param agentId           1 = BULL, 2 = BEAR, 3 = QUANT.
    /// @param human             Address bound to the human challenger, or zero if unbound.
    /// @param aiPnl             AI P&L, scaled by 1e6.
    /// @param humanPnl          Human P&L, scaled by 1e6.
    /// @param winner            0 = draw, 1 = human, 2 = AI.
    /// @param confidenceBefore  AI confidence (0-100) before challenges.
    /// @param confidenceAfter   AI confidence (0-100) after challenges.
    /// @param dataHash          keccak256 of the off-chain battle data.
    function finalizeBattle(
        uint256 battleId,
        uint8 agentId,
        address human,
        int256 aiPnl,
        int256 humanPnl,
        uint8 winner,
        uint16 confidenceBefore,
        uint16 confidenceAfter,
        bytes32 dataHash
    ) external onlyOwner {
        if (finalized[battleId]) revert AlreadyFinalized(battleId);
        if (agentId < 1 || agentId > 3 || winner > 2 || confidenceBefore > 100 || confidenceAfter > 100) {
            revert InvalidResult();
        }
        finalized[battleId] = true;

        emit BattleFinalized(
            battleId,
            agentId,
            human,
            aiPnl,
            humanPnl,
            winner,
            confidenceBefore,
            confidenceAfter,
            dataHash,
            block.timestamp
        );
    }

    /// @notice Convenience view for frontends to check verification state.
    function isFinalized(uint256 battleId) external view returns (bool) {
        return finalized[battleId];
    }
}
