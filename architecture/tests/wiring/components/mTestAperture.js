import { MRegion } from '../../../../src/mindComponents/mind/mRegion.js'

/** Test-only aperture provider for C1/S1. Always an aperture; no `modality`
 * required. Reuses MRegion's offer path — only the bind predicate is overridden. */
export class MTestAperture extends MRegion {
    static provides = { faculty: true, aperture: true }

    _bindsAsAperture() { return true }
}
