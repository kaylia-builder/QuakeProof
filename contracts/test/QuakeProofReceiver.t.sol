// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IReceiver} from "../src/interfaces/IReceiver.sol";
import {QuakeProofReceiver} from "../src/QuakeProofReceiver.sol";

contract ReportForwarder {
    function deliver(address receiver, bytes calldata metadata, bytes calldata report) external {
        IReceiver(receiver).onReport(metadata, report);
    }
}

contract UnauthorizedForwarder {
    function deliver(address receiver, bytes calldata metadata, bytes calldata report) external {
        IReceiver(receiver).onReport(metadata, report);
    }
}

contract QuakeProofReceiverTest {
    uint64 private constant BASE_SEPOLIA_SELECTOR = 10_344_971_235_874_465_080;
    bytes32 private constant WORKFLOW_ID = keccak256("quakeproof-workflow");
    bytes10 private constant WORKFLOW_NAME = bytes10("quakeproof");
    address private constant WORKFLOW_AUTHOR = address(0xA11CE);
    string private constant EVENT_ID = "us7000test";
    string private constant PAYLOAD = '{"v":1,"id":"us7000test","m":6.2}';

    ReportForwarder private s_forwarder;
    QuakeProofReceiver private s_receiver;

    function setUp() public {
        s_forwarder = new ReportForwarder();
        s_receiver = new QuakeProofReceiver(address(s_forwarder), WORKFLOW_AUTHOR, BASE_SEPOLIA_SELECTOR);
    }

    function testStoresAuthorizedFreshReport() public {
        uint64 verifiedAt = uint64(block.timestamp);
        bytes memory report = _report(verifiedAt, EVENT_ID, PAYLOAD);
        s_forwarder.deliver(address(s_receiver), _metadata(WORKFLOW_AUTHOR), report);

        (bytes32 reportHash, bytes32 responseHash, uint64 storedAt, string memory storedPayload) =
            s_receiver.getLatest(EVENT_ID);

        require(reportHash == keccak256(report), "report hash mismatch");
        require(responseHash == keccak256(bytes(PAYLOAD)), "response hash mismatch");
        require(storedAt == verifiedAt, "verification time mismatch");
        require(keccak256(bytes(storedPayload)) == keccak256(bytes(PAYLOAD)), "payload mismatch");
    }

    function testRejectsUnauthorizedForwarder() public {
        UnauthorizedForwarder attacker = new UnauthorizedForwarder();
        (bool success,) = address(attacker)
            .call(
                abi.encodeCall(
                    attacker.deliver,
                    (
                        address(s_receiver),
                        _metadata(WORKFLOW_AUTHOR),
                        _report(uint64(block.timestamp), EVENT_ID, PAYLOAD)
                    )
                )
            );
        require(!success, "unauthorized forwarder accepted");
    }

    function testRejectsWrongWorkflowAuthor() public {
        (bool success,) = address(s_forwarder)
            .call(
                abi.encodeCall(
                    s_forwarder.deliver,
                    (
                        address(s_receiver),
                        _metadata(address(0xBAD)),
                        _report(uint64(block.timestamp), EVENT_ID, PAYLOAD)
                    )
                )
            );
        require(!success, "wrong author accepted");
    }

    function testLocksToConfiguredWorkflowId() public {
        s_receiver.setExpectedWorkflowId(WORKFLOW_ID);
        s_forwarder.deliver(
            address(s_receiver), _metadata(WORKFLOW_AUTHOR), _report(uint64(block.timestamp), EVENT_ID, PAYLOAD)
        );

        (bool success,) = address(s_forwarder)
            .call(
                abi.encodeCall(
                    s_forwarder.deliver,
                    (
                        address(s_receiver),
                        abi.encodePacked(bytes32(uint256(7)), WORKFLOW_NAME, WORKFLOW_AUTHOR, bytes2(0)),
                        _report(uint64(block.timestamp + 1), "us7000next", PAYLOAD)
                    )
                )
            );
        require(!success, "wrong workflow id accepted");
    }

    function testRejectsReplayForSameEvent() public {
        bytes memory metadata = _metadata(WORKFLOW_AUTHOR);
        bytes memory report = _report(uint64(block.timestamp), EVENT_ID, PAYLOAD);
        s_forwarder.deliver(address(s_receiver), metadata, report);

        (bool success,) =
            address(s_forwarder).call(abi.encodeCall(s_forwarder.deliver, (address(s_receiver), metadata, report)));
        require(!success, "replayed report accepted");
    }

    function testRejectsWrongTargetChain() public {
        bytes memory report = abi.encode(uint64(16_015_286_601_757_825_753), uint64(block.timestamp), EVENT_ID, PAYLOAD);
        (bool success,) = address(s_forwarder)
            .call(abi.encodeCall(s_forwarder.deliver, (address(s_receiver), _metadata(WORKFLOW_AUTHOR), report)));
        require(!success, "wrong target chain accepted");
    }

    function _metadata(address author) private pure returns (bytes memory) {
        return abi.encodePacked(WORKFLOW_ID, WORKFLOW_NAME, author, bytes2(0));
    }

    function _report(uint64 verifiedAt, string memory eventId, string memory payload)
        private
        pure
        returns (bytes memory)
    {
        return abi.encode(BASE_SEPOLIA_SELECTOR, verifiedAt, eventId, payload);
    }
}
