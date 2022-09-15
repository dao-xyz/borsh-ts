function arrayToHex(arr: Uint8Array): string {
    return [...new Uint8Array(arr)]
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}

/**
 * Convert a little - endian buffer into a BigInt.
 * This function will modify the buf (dont use it afterwards)
 * @param buf The little - endian buffer to convert
    * @returns A BigInt with the little - endian representation of buf.
 */
export function toBigIntLE(buf: Uint8Array): bigint {
    const reversed = buf.reverse();
    const hex = arrayToHex(reversed);
    if (hex.length === 0) {
        return BigInt(0);
    }
    return BigInt(`0x${hex}`);
}
/**
 * Convert a BigInt to a little-endian buffer.
 * @param num   The BigInt to convert.
 * @param width The number of bytes that the resulting buffer should be.
 * @returns A little-endian buffer representation of num.
 */
export function toBufferLE(num: bigint, width: number): Uint8Array {
    const hex = num.toString(16);
    const buffer =
        Buffer.from(hex.padStart(width * 2, '0').slice(0, width * 2), 'hex');
    buffer.reverse();
    return buffer;
}