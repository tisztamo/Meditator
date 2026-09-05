// Offline sketch of the real source → region → arbiter → frame path.
// The mind's frame assembler runs, but its thinking loop never starts. No model calls.
import '../../src/startup/jsdom.js';
import { MMind } from '../../src/mindComponents/mind/mMind.js';
import { MBaseComponent } from '../../src/mindComponents/shared/mBaseComponent.js';
import { loadMindComponents } from '../../src/startup/loadMindComponents.js';

customElements.define('m-mind', class extends MBaseComponent {
    assembleFrame = MMind.prototype.assembleFrame;
    _identity() { return this.getPrompt(); }
    _landingOpener() { return 'I turn toward it.'; }
});
document.body.innerHTML = `
  <m-mind name="membrane-demo" space="off">
    I encounter a small simulated outside through descriptions, not sight.
    I begin with it receded; after a while my attention opens toward it again.
    <m-interrupts name="attention" threshold="0.3" rateLimit="0s"></m-interrupts>
    <m-region name="outside" modality="text" aperture="closed" dwell="1s" contactHorizon="10s">
      <m-interrupts name="local" threshold="0.3" rateLimit="0s"></m-interrupts>
      <span name="garden" provenance="simulated"></span>
    </m-region>
  </m-mind>`;
await loadMindComponents(document);

try {
    const mind = document.querySelector('m-mind');
    const region = mind.querySelector('m-region');
    const attention = mind.querySelector('[name="attention"]');
    const source = region.querySelector('span');
    let present = 'A simulated leaf falls.', renders = 0;
    const offer = region.registerSource(source, () => observe('fresh'));
    function observe(changeKey) {
        return offer({ changeKey, changeMagnitude: 0.9 }, () => { renders++; return present; });
    }
    await observe('movement');
    console.log(`Closed: ${renders} renderings, ${attention.pending.length} attention bids.`);

    present = 'The simulated garden is still now; the leaf rests on the path.';
    region.onBoundary(Date.now() + 7000); // advance the regulator clock without waiting
    await new Promise(resolve => setTimeout(resolve, 0));
    console.log(`Reflex: ${region.aperture.state}; ${renders} fresh rendering; debt ${region.contactPressure.toFixed(2)} before attention.`);
    const percepts = attention.takePending();
    const frame = await mind.assembleFrame(percepts);
    console.log(frame.prefill);
    console.log(`After the frame: debt ${region.contactPressure.toFixed(2)}.`);
    console.log(JSON.stringify(percepts[0].toIndexEntry(), null, 2));
} finally {
    document.body.replaceChildren();
}
