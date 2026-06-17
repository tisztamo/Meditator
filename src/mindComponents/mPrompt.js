// Intentionally empty — m-prompt is not a component.
//
// This file exists solely as a marker so the directory scanner in
// loadMindComponents.js discovers it and registers the tag name.  The class
// extends HTMLElement but defines no behaviour, because <m-prompt> is meant
// to be a plain HTML content slot, not an autonomous component.
//
// How it works:
//   mBaseComponent.getPrompt() queries for a child <m-prompt> via
//   querySelector("m-prompt") and returns its textContent.  No behaviour of
//   its own is needed.
//
// Why keep it:
//   Provides a clean way to embed multiline prompt text inside a component's
//   markup, avoiding the quoting headaches of prompt="...":
//
//     <m-something>
//       <m-prompt>
//         This is a multiline prompt that would be awkward in a
//         prompt="..." attribute.
//       </m-prompt>
//     </m-something>
//
// See src/mindComponents/mBaseComponent.js → getPrompt().

export class MPrompt extends HTMLElement {}
