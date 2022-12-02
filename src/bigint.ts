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

export function writeBufferLEBigInt(num: bigint | number, width: number, buffer: Uint8Array, offset: number) {
    const hex = num.toString(16);
    const padded = hex.padStart(width * 2, '0').slice(0, width * 2);
    for (const [ix, value] of padded.match(/.{1,2}/g).map((byte) => parseInt(byte, 16)).entries()) {
        buffer[offset + width - 1 - ix] = value;
    }
}

export function writeBufferLE(num: number, buffer: Uint8Array, width: number, offset: number) {
    buffer[offset] = num & 255
    for (let i = 1; i < width; i++) {
        buffer[offset + i] = num >> (i * 8) & 255
    }
}

export function readBufferLE(buffer: Uint8Array, width: number, offset: number) {
    let n = 0;
    for (let i = offset + width; i >= offset; i--) {
        n = (n << 8) | buffer[i];
    }
    return n;
}


export function readBigUIntLE(buffer: Uint8Array, halfWidth: number, offset: number) {
    const first = buffer[offset];
    const last = buffer[offset + 7];
    if (first === undefined || last === undefined) {
        throw new Error('Out of bounds');
    }

    const offsetHalfWidth = offset + halfWidth;
    let a = buffer[offsetHalfWidth] + (last << 24);
    for (let i = 1; i < halfWidth; i++) {
        a = buffer[offsetHalfWidth + i] * 256 * 2 ** i
    }
    let b = 0;
    for (let i = 1; i < halfWidth; i++) {
        b = buffer[offset + i] * 256 * 2 ** i
    }

    return (BigInt(a) << 32n) +
        BigInt(first + b);
}
