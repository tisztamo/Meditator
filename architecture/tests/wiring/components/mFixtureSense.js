import { MSense } from '../../../../src/mindComponents/mind/mSense.js'

/** Test source: onSense materializes a fixed first-person line via perceive(). */
export class MFixtureSense extends MSense {
    line = 'hello item'

    ready() { return true }

    async onSense() {
        const line = this.line || 'hello item'
        return this.perceive(line, { salience: 0.55, changeKey: line })
    }
}
