// Smoke test for docs/index.html: loads it in jsdom with scripts enabled,
// polyfills the browser APIs jsdom lacks, and checks the replay engine runs.
//   bun architecture/tests/test-site.js
import { JSDOM } from 'jsdom';
import fs from 'node:fs/promises';

const html = await fs.readFile('docs/index.html', 'utf8');
const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'http://localhost/',
    beforeParse(window) {
        window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
        window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
        window.WebSocket = class {
            constructor() { setTimeout(() => this.onerror && this.onerror(new Error('no server')), 10); }
            close() {}
        };
        window.navigator.clipboard = { writeText: async () => {} };
        window.requestAnimationFrame = cb => setTimeout(cb, 16);
    },
});

const errors = [];
dom.window.addEventListener('error', e => errors.push(e.message));

await new Promise(resolve => setTimeout(resolve, 4000));

const streamText = dom.window.document.getElementById('stream').textContent;
const stimCount = dom.window.document.querySelectorAll('#stream .stim').length;

let failures = 0;
function check(name, ok) {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
    if (!ok) failures += 1;
}
check('no JS errors', errors.length === 0);
check(`stream is typing (${streamText.length} chars so far)`, streamText.length > 40);
check(`wake stimulus rendered (${stimCount} stim lines)`, stimCount >= 1);
check('caret exists', !!dom.window.document.querySelector('#stream .caret'));

const doc = dom.window.document;
const awakeCode = doc.querySelector('#view-awake pre').textContent;
check('awake.archml rendered in code tab', awakeCode.includes('<m-mind') && awakeCode.includes('m-loop-guard'));
check('owl.archml source present', doc.querySelector('#view-owl pre').textContent.includes('night-owl'));
const card = doc.querySelector('.flipcard');
const cardCode = card.querySelector('.card-back pre').textContent;
check('card back carries code', cardCode.includes('<m-'));
card.click();
check('card flips on click', card.classList.contains('flipped'));
card.click();
check('card flips back', !card.classList.contains('flipped'));
doc.querySelectorAll('.tab')[1].click();
check('tab switch shows owl', doc.getElementById('view-owl').style.display === 'block'
    && doc.getElementById('view-awake').style.display === 'none');
if (errors.length) console.log('errors:', errors);
console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
