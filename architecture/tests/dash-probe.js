// Probes a running Meditator's websocket for the dashboard protocol:
// structure, per-process events, the thinking stream, and the speaking voice.
//   (start a mind with m-ws on :7627, ideally dash-smoke.chml under DRY_RUN, then)
//   bun architecture/tests/dash-probe.js
// Exits 0 if the essentials were observed, 1 otherwise.
import WebSocket from "ws";

const DURATION = Number(process.argv[2] || 14000);
const got = { types: {}, events: {}, tags: [], speech: "", thoughtFragments: 0 };

const ws = new WebSocket("ws://localhost:7627");

ws.on("open", () => {
    // After a few seconds, address the mind — this should raise the urge to speak.
    setTimeout(() => {
        try { ws.send(JSON.stringify({ type: "input", data: { message: "Hello little mind — say something out loud?" } })); } catch {}
    }, 3500);
});

ws.on("message", raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    got.types[m.type] = (got.types[m.type] || 0) + 1;
    if (m.type === "structure") {
        const walk = n => { got.tags.push(n.tag); (n.children || []).forEach(walk); };
        walk(m.data.tree);
    } else if (m.type === "thought_fragment") {
        got.thoughtFragments += 1;
    } else if (m.type === "speech_fragment") {
        got.speech += m.data.content;
    } else if (m.type === "event") {
        const k = `${m.data.process}/${m.data.kind}`;
        got.events[k] = (got.events[k] || 0) + 1;
    }
});

ws.on("error", error => { console.error("WS_ERROR:", error.message); process.exit(2); });

setTimeout(() => {
    try { ws.close(); } catch {}
    const report = {
        types: got.types,
        events: got.events,
        structureTags: got.tags,
        thoughtFragments: got.thoughtFragments,
        speechSample: got.speech.slice(0, 160),
    };
    console.log("REPORT " + JSON.stringify(report, null, 2));

    const checks = {
        "got structure": (got.types.structure || 0) > 0,
        "structure has m-speech": got.tags.includes("m-speech"),
        "structure has m-stream": got.tags.includes("m-stream"),
        "thought streamed": got.thoughtFragments > 0,
        "frame events": (got.events["mind/frame"] || 0) > 0,
        "boundary events": (got.events["stream/boundary"] || 0) > 0,
        "attention bids": (got.events["attention/bid"] || 0) > 0,
        "economy energy": (got.events["economy/energy"] || 0) > 0,
        "spoke aloud": got.speech.length > 0,
    };
    let ok = true;
    for (const [name, pass] of Object.entries(checks)) {
        console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
        if (!pass) ok = false;
    }
    console.log(ok ? "SMOKE_OK" : "SMOKE_FAIL");
    process.exit(ok ? 0 : 1);
}, DURATION);
