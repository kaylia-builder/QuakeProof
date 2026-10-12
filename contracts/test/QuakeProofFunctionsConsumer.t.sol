// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IFunctionsClient} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/interfaces/IFunctionsClient.sol";
import {QuakeProofFunctionsConsumer} from "../src/QuakeProofFunctionsConsumer.sol";

contract MockFunctionsRouter {
    uint256 private s_nonce;

    function sendRequest(
        uint64,
        bytes calldata,
        uint16,
        uint32,
        bytes32
    ) external returns (bytes32) {
        s_nonce += 1;
        return keccak256(abi.encode(msg.sender, s_nonce));
    }

    function fulfill(
        address consumer,
        bytes32 requestId,
        bytes calldata response,
        bytes calldata err
    ) external {
        IFunctionsClient(consumer).handleOracleFulfillment(requestId, response, err);
    }
}

contract QuakeProofFunctionsConsumerTest {
    bytes32 private constant DON_ID = bytes32("fun-base-sepolia-1");
    string private constant SOURCE = "return Functions.encodeString('{}')";

    function testStoresSuccessfulVerification() public {
        MockFunctionsRouter router = new MockFunctionsRouter();
        QuakeProofFunctionsConsumer consumer = new QuakeProofFunctionsConsumer(
            address(router),
            DON_ID,
            keccak256(bytes(SOURCE))
        );
        bytes32 requestId = consumer.sendVerification(
            SOURCE,
            "us7000test",
            1,
            250_000
        );
        bytes memory payload = bytes("{\"v\":1,\"id\":\"us7000test\",\"m\":6.2}");

        router.fulfill(address(consumer), requestId, payload, "");
        (
            bytes32 storedRequestId,
            bytes32 responseHash,
            uint64 verifiedAt,
            string memory storedPayload
        ) = consumer.getLatest("us7000test");

        require(storedRequestId == requestId, "request id mismatch");
        require(responseHash == keccak256(payload), "response hash mismatch");
        require(verifiedAt > 0, "verification time missing");
        require(
            keccak256(bytes(storedPayload)) == keccak256(payload),
            "payload mismatch"
        );
    }

    function testDoesNotStoreFailedVerification() public {
        MockFunctionsRouter router = new MockFunctionsRouter();
        QuakeProofFunctionsConsumer consumer = new QuakeProofFunctionsConsumer(
            address(router),
            DON_ID,
            keccak256(bytes(SOURCE))
        );
        bytes32 requestId = consumer.sendVerification(
            SOURCE,
            "us7000test",
            1,
            250_000
        );

        router.fulfill(address(consumer), requestId, "", bytes("upstream failed"));
        (bytes32 storedRequestId,, uint64 verifiedAt,) = consumer.getLatest("us7000test");

        require(storedRequestId == bytes32(0), "failed result was stored");
        require(verifiedAt == 0, "failed result has a timestamp");
    }

    function testRejectsDifferentSource() public {
        MockFunctionsRouter router = new MockFunctionsRouter();
        QuakeProofFunctionsConsumer consumer = new QuakeProofFunctionsConsumer(
            address(router),
            DON_ID,
            keccak256(bytes(SOURCE))
        );

        (bool success,) = address(consumer).call(
            abi.encodeCall(
                consumer.sendVerification,
                ("return new Uint8Array()", "us7000test", 1, 250_000)
            )
        );
        require(!success, "unexpected source was accepted");
    }
}
