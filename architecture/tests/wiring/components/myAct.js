import { MAct } from '../../../../src/mindComponents/shared/mAct.js'

/** Test-only hands provider. Same loop as `m-act`; the tag is the substitution. */
export class MyAct extends MAct {
    static provides = { hands: true }
}
