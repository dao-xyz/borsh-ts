function arrayToHex(arr: Uint8Array): string {
    return [...new Uint8Array(arr)]
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}

export function toBigIntLE(buf: Uint8Array): bigint {
    const reversed = buf.reverse();
    const hex = arrayToHex(reversed);
    if (hex.length === 0) {
        return BigInt(0);
    }
    return BigInt(`0x${hex}`);
}

export function toBufferLE(num: bigint, width: number): Uint8Array {
    const hex = num.toString(16);
    const buffer =
        Buffer.from(hex.padStart(width * 2, '0').slice(0, width * 2), 'hex');
    buffer.reverse();
    return buffer;
}