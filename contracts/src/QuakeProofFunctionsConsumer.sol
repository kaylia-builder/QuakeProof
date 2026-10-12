// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {FunctionsClient} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/FunctionsClient.sol";
import {FunctionsRequest} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/libraries/FunctionsRequest.sol";
import {ConfirmedOwner} from "@chainlink/contracts/src/v0.8/shared/access/ConfirmedOwner.sol";

/// @title QuakeProof Chainlink Functions consumer
/// @notice Requests one USGS event and stores the DON-agreed canonical payload.
contract QuakeProofFunctionsConsumer is FunctionsClient, ConfirmedOwner {
    using FunctionsRequest for FunctionsRequest.Request;

    struct VerifiedEvent {
        bytes32 requestId;
        bytes32 responseHash;
        uint64 verifiedAt;
        string payload;
    }

    error InvalidEventId();
    error UnexpectedSource();
    error UnknownRequest(bytes32 requestId);

    bytes32 public donId;
    bytes32 public immutable sourceHash;
    bytes32 public lastRequestId;
    bytes public lastError;

    mapping(bytes32 requestId => bytes32 eventKey) public requestEventKey;
    mapping(bytes32 eventKey => VerifiedEvent record) private s_verifiedEvents;

    event VerificationRequested(bytes32 indexed requestId, bytes32 indexed eventKey, string eventId);
    event VerificationStored(
        bytes32 indexed requestId,
        bytes32 indexed eventKey,
        bytes32 responseHash,
        uint64 verifiedAt
    );
    event VerificationFailed(bytes32 indexed requestId, bytes32 indexed eventKey, bytes errorData);

    constructor(address router, bytes32 initialDonId, bytes32 expectedSourceHash)
        FunctionsClient(router)
        ConfirmedOwner(msg.sender)
    {
        donId = initialDonId;
        sourceHash = expectedSourceHash;
    }

    function setDonId(bytes32 newDonId) external onlyOwner {
        donId = newDonId;
    }

    /// @notice Ask the Functions DON to fetch and canonicalize one USGS event.
    /// @dev The source is supplied by the owner and committed in the request transaction.
    function sendVerification(
        string calldata source,
        string calldata eventId,
        uint64 subscriptionId,
        uint32 callbackGasLimit
    ) external onlyOwner returns (bytes32 requestId) {
        uint256 eventIdLength = bytes(eventId).length;
        if (eventIdLength < 3 || eventIdLength > 40) revert InvalidEventId();
        if (keccak256(bytes(source)) != sourceHash) revert UnexpectedSource();

        FunctionsRequest.Request memory request;
        request.initializeRequestForInlineJavaScript(source);
        string[] memory args = new string[](1);
        args[0] = eventId;
        request.setArgs(args);

        requestId = _sendRequest(
            request.encodeCBOR(),
            subscriptionId,
            callbackGasLimit,
            donId
        );
        bytes32 eventKey = keccak256(bytes(eventId));
        requestEventKey[requestId] = eventKey;
        lastRequestId = requestId;
        emit VerificationRequested(requestId, eventKey, eventId);
    }

    function getLatest(string calldata eventId)
        external
        view
        returns (
            bytes32 requestId,
            bytes32 responseHash,
            uint64 verifiedAt,
            string memory payload
        )
    {
        VerifiedEvent storage record = s_verifiedEvents[keccak256(bytes(eventId))];
        return (record.requestId, record.responseHash, record.verifiedAt, record.payload);
    }

    function fulfillRequest(
        bytes32 requestId,
        bytes memory response,
        bytes memory err
    ) internal override {
        bytes32 eventKey = requestEventKey[requestId];
        if (eventKey == bytes32(0)) revert UnknownRequest(requestId);

        lastError = err;
        if (err.length > 0 || response.length == 0) {
            emit VerificationFailed(requestId, eventKey, err);
            return;
        }

        bytes32 responseHash = keccak256(response);
        uint64 verifiedAt = uint64(block.timestamp);
        s_verifiedEvents[eventKey] = VerifiedEvent({
            requestId: requestId,
            responseHash: responseHash,
            verifiedAt: verifiedAt,
            payload: string(response)
        });
        emit VerificationStored(requestId, eventKey, responseHash, verifiedAt);
    }
}
