// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ConfirmedOwner} from "@chainlink/contracts/src/v0.8/shared/access/ConfirmedOwner.sol";
import {IERC165, IReceiver} from "./interfaces/IReceiver.sol";

/// @title QuakeProof CRE report receiver
/// @notice Stores USGS event payloads delivered by an authorized CRE workflow.
contract QuakeProofReceiver is IReceiver, ConfirmedOwner {
    struct VerifiedEvent {
        bytes32 reportHash;
        bytes32 responseHash;
        uint64 verifiedAt;
        string payload;
    }

    uint256 public constant MAX_REPORT_AGE = 1 hours;
    uint256 public constant MAX_FUTURE_SKEW = 5 minutes;

    address public immutable FORWARDER;
    address public immutable EXPECTED_AUTHOR;
    uint64 public immutable EXPECTED_CHAIN_SELECTOR;

    bytes32 public expectedWorkflowId;
    mapping(bytes32 eventKey => VerifiedEvent record) private s_verifiedEvents;

    error InvalidAddress();
    error InvalidChainSelector(uint64 received, uint64 expected);
    error InvalidEventId();
    error InvalidMetadataLength(uint256 received);
    error InvalidReportTime(uint64 received, uint64 previous);
    error InvalidSender(address received, address expected);
    error InvalidWorkflowAuthor(address received, address expected);
    error InvalidWorkflowId(bytes32 received, bytes32 expected);
    error EmptyPayload();

    event ExpectedWorkflowIdUpdated(bytes32 indexed previousId, bytes32 indexed newId);
    event VerificationStored(
        bytes32 indexed reportHash, bytes32 indexed eventKey, bytes32 responseHash, uint64 verifiedAt, string eventId
    );

    constructor(address forwarder, address expectedAuthor, uint64 expectedChainSelector) ConfirmedOwner(msg.sender) {
        if (forwarder == address(0) || expectedAuthor == address(0)) revert InvalidAddress();
        FORWARDER = forwarder;
        EXPECTED_AUTHOR = expectedAuthor;
        EXPECTED_CHAIN_SELECTOR = expectedChainSelector;
    }

    /// @notice Locks report delivery to one deployed workflow once its ID is known.
    function setExpectedWorkflowId(bytes32 workflowId) external onlyOwner {
        bytes32 previousId = expectedWorkflowId;
        expectedWorkflowId = workflowId;
        emit ExpectedWorkflowIdUpdated(previousId, workflowId);
    }

    /// @inheritdoc IReceiver
    function onReport(bytes calldata metadata, bytes calldata report) external override {
        if (msg.sender != FORWARDER) revert InvalidSender(msg.sender, FORWARDER);
        if (metadata.length < 62) revert InvalidMetadataLength(metadata.length);

        (bytes32 workflowId, address workflowAuthor) = _decodeMetadata(metadata);
        if (workflowAuthor != EXPECTED_AUTHOR) {
            revert InvalidWorkflowAuthor(workflowAuthor, EXPECTED_AUTHOR);
        }
        bytes32 requiredWorkflowId = expectedWorkflowId;
        if (requiredWorkflowId != bytes32(0) && workflowId != requiredWorkflowId) {
            revert InvalidWorkflowId(workflowId, requiredWorkflowId);
        }

        (uint64 chainSelector, uint64 verifiedAt, string memory eventId, string memory payload) =
            abi.decode(report, (uint64, uint64, string, string));

        if (chainSelector != EXPECTED_CHAIN_SELECTOR) {
            revert InvalidChainSelector(chainSelector, EXPECTED_CHAIN_SELECTOR);
        }
        uint256 eventIdLength = bytes(eventId).length;
        if (eventIdLength < 3 || eventIdLength > 40) revert InvalidEventId();
        if (bytes(payload).length == 0) revert EmptyPayload();
        if (verifiedAt > block.timestamp + MAX_FUTURE_SKEW || block.timestamp > uint256(verifiedAt) + MAX_REPORT_AGE) {
            revert InvalidReportTime(verifiedAt, 0);
        }

        bytes32 eventKey = keccak256(bytes(eventId));
        uint64 previousVerifiedAt = s_verifiedEvents[eventKey].verifiedAt;
        if (verifiedAt <= previousVerifiedAt) {
            revert InvalidReportTime(verifiedAt, previousVerifiedAt);
        }

        bytes32 reportHash = keccak256(report);
        bytes32 responseHash = keccak256(bytes(payload));
        s_verifiedEvents[eventKey] = VerifiedEvent({
            reportHash: reportHash, responseHash: responseHash, verifiedAt: verifiedAt, payload: payload
        });
        emit VerificationStored(reportHash, eventKey, responseHash, verifiedAt, eventId);
    }

    function getLatest(string calldata eventId)
        external
        view
        returns (bytes32 reportHash, bytes32 responseHash, uint64 verifiedAt, string memory payload)
    {
        VerifiedEvent storage record = s_verifiedEvents[keccak256(bytes(eventId))];
        return (record.reportHash, record.responseHash, record.verifiedAt, record.payload);
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IReceiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }

    function _decodeMetadata(bytes calldata metadata)
        private
        pure
        returns (bytes32 workflowId, address workflowAuthor)
    {
        assembly {
            workflowId := calldataload(metadata.offset)
            workflowAuthor := shr(96, calldataload(add(metadata.offset, 42)))
        }
    }
}
