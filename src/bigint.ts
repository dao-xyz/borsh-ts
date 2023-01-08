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

export function writeUInt32LE(value: number, buf: Uint8Array, offset: number) {
    checkInt(value, 0, 0xffffffff, 1);
    buf[offset] = value;
    value = value >>> 8;
    buf[offset + 1] = value;
    value = value >>> 8;
    buf[offset + 2] = value;
    value = value >>> 8;
    buf[offset + 3] = value;
}


export function writeUInt16LE(value: number, buf: Uint8Array, offset: number) {
    checkInt(value, 0, 0xffff, 1);
    buf[offset] = value;
    buf[offset + 1] = (value >>> 8);
}

export const readBigUInt64LE = (buf: Uint8Array, offset: number) => {
    const first = buf[offset];
    const last = buf[offset + 7];
    if (first === undefined || last === undefined)
        throw new Error('Out of bounds');

    const lo = first +
        buf[offset + 1] * 2 ** 8 +
        buf[offset + 2] * 2 ** 16 +
        buf[offset + 3] * 2 ** 24;

    const hi = buf[offset + 4] +
        buf[offset + 5] * 2 ** 8 +
        buf[offset + 6] * 2 ** 16 +
        last * 2 ** 24;

    return BigInt(lo) + (BigInt(hi) << 32n);
}

export function readUIntLE(buf: Uint8Array, offset: number, width: number): bigint {
    const reversed = buf.slice(offset, offset + width).reverse();
    const hex = arrayToHex(reversed);
    if (hex.length === 0) {
        return BigInt(0);
    }
    return BigInt(`0x${hex}`);
}




export const readUInt32LE = (buffer: Uint8Array, offset: number) => {
    const first = buffer[offset];
    const last = buffer[offset + 3];
    if (first === undefined || last === undefined)
        throw new Error('Out of bounds');

    return first +
        buffer[offset + 1] * 2 ** 8 +
        buffer[offset + 2] * 2 ** 16 +
        last * 2 ** 24;
}


export const readUInt16LE = (buffer: Uint8Array, offset: number) => {
    const first = buffer[offset];
    const last = buffer[offset + 1];
    if (first === undefined || last === undefined)
        throw new Error('Out of bounds');

    return first + last * 2 ** 8;
}



export const checkInt = (value: number, min: number | bigint, max: number | bigint, byteLength: number) => {
    if (value > max || value < min) {
        const n = typeof min === 'bigint' ? 'n' : '';
        let range;
        if (byteLength > 3) {
            if (min === 0 || min === 0n) {
                range = `>= 0${n} and < 2${n} ** ${(byteLength + 1) * 8}${n}`;
            } else {
                range = `>= -(2${n} ** ${(byteLength + 1) * 8 - 1}${n}) and < 2 ** ` +
                    `${(byteLength + 1) * 8 - 1}${n}`;
            }
        } else {
            range = `>= ${min}${n} and <= ${max}${n}`;
        }
        throw new Error("Out of range value: " + range + ", " + value);
    }
}