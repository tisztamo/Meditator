// jsdom-setup.ts
import { JSDOM } from 'jsdom';

const { window } = new JSDOM('<!doctype html><html><body></body></html>');

globalThis.window = window;
globalThis.document = window.document;
globalThis.Document = window.Document;
globalThis.navigator = window.navigator;
globalThis.HTMLElement = window.HTMLElement
globalThis.customElements = window.customElements
