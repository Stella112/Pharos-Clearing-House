// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ClearingHouseEscrow
/// @notice Conditional ERC20 escrow for AI-agent settlement on Pharos.
///         A payer locks tokens against a condition hash; the escrow releases
///         to the payee when a matching proof is presented, or refunds the
///         payer after the deadline. The contract never holds keys, performs no
///         delegatecall, and has no admin or upgrade path — funds can only move
///         along the two documented paths below.
contract ClearingHouseEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status { None, Open, Released, Refunded }

    struct Escrow {
        address payer;
        address payee;
        address token;
        uint256 amount;
        bytes32 conditionHash; // keccak256 of the agreed proof
        uint64 deadline;       // unix seconds
        Status status;
    }

    mapping(uint256 => Escrow) public escrows;
    uint256 public nextId;

    event EscrowFunded(uint256 indexed id, address indexed payer, address indexed payee, address token, uint256 amount, bytes32 conditionHash, uint64 deadline);
    event EscrowReleased(uint256 indexed id, address indexed payee, uint256 amount);
    event EscrowRefunded(uint256 indexed id, address indexed payer, uint256 amount);

    /// @notice Lock `amount` of `token` for `payee`, releasable by a proof whose
    ///         keccak256 equals `conditionHash`, until `deadline`.
    function fund(
        address payee,
        address token,
        uint256 amount,
        bytes32 conditionHash,
        uint64 deadline
    ) external nonReentrant returns (uint256 id) {
        require(payee != address(0), "payee=0");
        require(token != address(0), "token=0");
        require(amount > 0, "amount=0");
        require(deadline > block.timestamp, "deadline in past");

        id = ++nextId;
        escrows[id] = Escrow({
            payer: msg.sender,
            payee: payee,
            token: token,
            amount: amount,
            conditionHash: conditionHash,
            deadline: deadline,
            status: Status.Open
        });

        // Pull funds last; reverts if allowance/balance is insufficient.
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        emit EscrowFunded(id, msg.sender, payee, token, amount, conditionHash, deadline);
    }

    /// @notice Release escrow `id` to the payee by revealing `proof`.
    ///         Callable by payer or payee before the deadline.
    function release(uint256 id, bytes calldata proof) external nonReentrant {
        Escrow storage e = escrows[id];
        require(e.status == Status.Open, "not open");
        require(msg.sender == e.payer || msg.sender == e.payee, "not party");
        require(block.timestamp <= e.deadline, "expired");
        require(keccak256(proof) == e.conditionHash, "bad proof");

        e.status = Status.Released;
        IERC20(e.token).safeTransfer(e.payee, e.amount);
        emit EscrowReleased(id, e.payee, e.amount);
    }

    /// @notice Refund escrow `id` to the payer after the deadline.
    function refund(uint256 id) external nonReentrant {
        Escrow storage e = escrows[id];
        require(e.status == Status.Open, "not open");
        require(block.timestamp > e.deadline, "not expired");

        e.status = Status.Refunded;
        IERC20(e.token).safeTransfer(e.payer, e.amount);
        emit EscrowRefunded(id, e.payer, e.amount);
    }

    function getEscrow(uint256 id) external view returns (Escrow memory) {
        return escrows[id];
    }
}
