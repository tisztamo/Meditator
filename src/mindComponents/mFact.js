import { MBaseComponent } from "./mBaseComponent.js"

/**
 * Declarative seeded fact for <m-facts>. It intentionally has no behavior of its
 * own; m-facts reads these children at birth and writes them into the fact store.
 */
export class MFact extends MBaseComponent {
    onConnect() {}
}
