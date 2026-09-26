// Bun test preload — jsdom globals required by mind-component module graphs.
import "../../src/startup/jsdom.js";
import { afterAll } from "bun:test";
import { writeDeliveryReport } from "../../src/infrastructure/deliveryChaos.js";

// A delivery-chaos run (MEDITATOR_DELIVERY*, tools/delivery-chaos.mjs) collects
// message-rule violations across every file; bun test skips process exit hooks.
afterAll(() => writeDeliveryReport());
