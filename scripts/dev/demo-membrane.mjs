// Offline sketch of the real source → nested apertures → arbiter → frame path.
// The mind's frame assembler runs, but its thinking loop never starts. No model calls.
import '../../src/startup/jsdom.js';
import { MMind } from '../../src/mindComponents/mind/mMind.js';
import { MBaseComponent } from '../../src/mindComponents/shared/mBaseComponent.js';
import { loadMindComponents } from '../../src/startup/loadMindComponents.js';
import { AttentionBid } from '../../src/infrastructure/attentionBid.js';

customElements.define('m-mind', class extends MBaseComponent {
    assembleFrame = MMind.prototype.assembleFrame;
    _identity() { return this.getPrompt(); }
    _landingOpener() { return 'I turn toward it.'; }
});
document.body.innerHTML = `
  <m-mind name="membrane-demo" space="off">
    I encounter a small simulated outside through descriptions, not sight.
    An outer closed boundary withholds an inner open one; opening the outer admits the same scene.
    <m-interrupts name="attention" threshold="0.3" rateLimit="0s"></m-interrupts>
    <m-region name="shell" modality="text" aperture="closed" dwell="1s" contactHorizon="10s">
      <m-region name="outside" modality="text" aperture="open" dwell="1s" contactHorizon="10s">
        <m-interrupts name="local" threshold="0.3" rateLimit="0s"></m-interrupts>
        <span name="garden" provenance="simulated"></span>
      </m-region>
    </m-region>
  </m-mind>`;
await loadMindComponents(document);

try {
    const mind = document.querySelector('m-mind');
    const shell = mind.querySelector('m-region[name="shell"]');
    const inner = mind.querySelector('m-region[name="outside"]');
    const attention = mind.querySelector('[name="attention"]');
    const source = inner.querySelector('span');
    const receipts = [];
    mind.addEventListener('percepts-attended', e => {
        if (Array.isArray(e.detail)) receipts.push(...e.detail);
    });
    let present = 'A simulated leaf falls.', renders = 0, sampleRequest = null;
    const offer = inner.registerSource(source, request => {
        sampleRequest = request;
        return observe('fresh');
    });
    function observe(changeKey) {
        return offer({ changeKey, changeMagnitude: 0.9 }, () => { renders++; return present; });
    }

    const refused = await observe('movement');
    console.log(`Composed refusal (outer closed, inner open): ${renders} materializer calls, ${attention.pending.length} bids, offered=${refused}.`);

    present = 'The simulated garden is still now; the leaf rests on the path.';
    shell.aperture.changedAt = Date.now() - 2000;
    shell.orient('open');
    await new Promise(resolve => setTimeout(resolve, 0));
    console.log(`Outer opened: ${renders} materializer call, ${attention.pending.length} bid.`);

    const pending = attention.takePending();
    const bid = pending[0];
    const evidence = AttentionBid.evidenceOf(bid);
    console.log(`Bid gain trail: ${JSON.stringify(bid.gainTrail)}; evidence salience ${evidence.salience}; bid salience ${bid.salience}.`);
    console.log(`Issued at inner only: inner=${inner._issued.has(bid.evidenceId)} outer=${shell._issued.has(bid.evidenceId)}.`);
    console.log(`Sample lineage: ${sampleRequest?.id}`);

    const innerOwn = inner.aperture.deficit;
    const outerOwn = shell.aperture.deficit;
    const frame = await mind.assembleFrame(pending);
    console.log(frame.prefill);
    console.log(`After the frame: inner own deficit ${inner.aperture.deficit.toFixed(2)} (was ${innerOwn.toFixed(2)}); outer own ${shell.aperture.deficit.toFixed(2)} (was ${outerOwn.toFixed(2)}).`);
    console.log(`Receipt credits exactly one provider (inner, by id ${receipts[0]?.perceptId}): inner still issued=${inner._issued.has(bid.evidenceId)} outer issued=${shell._issued.size}.`);
    console.log(JSON.stringify(receipts[0], null, 2));
} finally {
    document.body.replaceChildren();
}
