// jsdom-setup.ts
import { JSDOM } from 'jsdom';

const { window } = new JSDOM('<!doctype html><html><body></body></html>');

globalThis.window = window;
globalThis.document = window.document;
globalThis.navigator = window.navigator;
globalThis.HTMLElement = window.HTMLElement
globalThis.Event = window.Event
globalThis.CustomEvent = window.CustomEvent
globalThis.Document = window.Document;
globalThis.Node = window.Node;
globalThis.customElements = window.customElements
