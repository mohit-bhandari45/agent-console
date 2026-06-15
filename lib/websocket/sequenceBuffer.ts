import { ServerMessage } from "./types";

export class SequenceBuffer {
    private buffer: Map<number, ServerMessage> = new Map();
    private processedSeqs: Set<number> = new Set();
    private nextExpected: number = 1;
    private lastProcessedSeq: number = 0;

    add(message: ServerMessage): ServerMessage[] {
        const seq = message.seq;

        if (this.processedSeqs.has(seq)) {
            console.log("Duplicate seq ignored:", seq)
            return [];
        }

        this.buffer.set(seq, message);
        return this.finalResult();
    }

    finalResult(): ServerMessage[] {
        const currentStream: ServerMessage[] = [];
        
        while (this.buffer.has(this.nextExpected)) {
            const msg = this.buffer.get(this.nextExpected)!
            this.buffer.delete(this.nextExpected);
            this.processedSeqs.add(this.nextExpected);
            this.nextExpected++;
            currentStream.push(msg);
        }

        if (currentStream.length > 0) {
            this.lastProcessedSeq = currentStream[currentStream.length - 1].seq;
        }

        return currentStream;
    }

    reset(): void {
        this.buffer.clear();
        this.processedSeqs.clear();
        this.nextExpected = 1;
        this.lastProcessedSeq = 0;
    }

    getLastProcessed(): number {
        return this.lastProcessedSeq;
    }
}