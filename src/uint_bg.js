import * as wasm from './uint_bg.wasm';

let WASM_VECTOR_LEN = 0;

let cachedUint8Memory0 = new Uint8Array();

function getUint8Memory0() {
    if (cachedUint8Memory0.byteLength === 0) {
        cachedUint8Memory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8Memory0;
}

const lTextEncoder = typeof TextEncoder === 'undefined' ? (0, module.require)('util').TextEncoder : TextEncoder;

let cachedTextEncoder = new lTextEncoder('utf-8');

const encodeString = (typeof cachedTextEncoder.encodeInto === 'function'
    ? function (arg, view) {
    return cachedTextEncoder.encodeInto(arg, view);
}
    : function (arg, view) {
    const buf = cachedTextEncoder.encode(arg);
    view.set(buf);
    return {
        read: arg.length,
        written: buf.length
    };
});

function passStringToWasm0(arg, malloc, realloc) {

    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length);
        getUint8Memory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len);

    const mem = getUint8Memory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }

    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3);
        const view = getUint8Memory0().subarray(ptr + offset, ptr + len);
        const ret = encodeString(arg, view);

        offset += ret.written;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1);
    getUint8Memory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}
/**
* @param {string} input
* @param {Uint8Array} data_ptr
* @param {number} data_len
* @param {number} offset
*/
export function encode_utf8(input, data_ptr, data_len, offset) {
    try {
        const ptr0 = passStringToWasm0(input, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        var ptr1 = passArray8ToWasm0(data_ptr, wasm.__wbindgen_malloc);
        var len1 = WASM_VECTOR_LEN;
        wasm.encode_utf8(ptr0, len0, ptr1, len1, data_len, offset);
    } finally {
        data_ptr.set(getUint8Memory0().subarray(ptr1 / 1, ptr1 / 1 + len1));
        wasm.__wbindgen_free(ptr1, len1 * 1);
    }
}

let cachedInt32Memory0 = new Int32Array();

function getInt32Memory0() {
    if (cachedInt32Memory0.byteLength === 0) {
        cachedInt32Memory0 = new Int32Array(wasm.memory.buffer);
    }
    return cachedInt32Memory0;
}

const lTextDecoder = typeof TextDecoder === 'undefined' ? (0, module.require)('util').TextDecoder : TextDecoder;

let cachedTextDecoder = new lTextDecoder('utf-8', { ignoreBOM: true, fatal: true });

cachedTextDecoder.decode();

function getStringFromWasm0(ptr, len) {
    return cachedTextDecoder.decode(getUint8Memory0().subarray(ptr, ptr + len));
}
/**
* @param {Uint8Array} data_ptr
* @param {number} data_len
* @param {number} offset
* @returns {string}
*/
export function decode_utf8(data_ptr, data_len, offset) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArray8ToWasm0(data_ptr, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        wasm.decode_utf8(retptr, ptr0, len0, data_len, offset);
        var r0 = getInt32Memory0()[retptr / 4 + 0];
        var r1 = getInt32Memory0()[retptr / 4 + 1];
        return getStringFromWasm0(r0, r1);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_free(r0, r1);
    }
}

/**
* @param {bigint} value
* @param {Uint8Array} data_ptr
* @param {number} data_len
* @param {number} offset
*/
export function serialize_u64(value, data_ptr, data_len, offset) {
    try {
        var ptr0 = passArray8ToWasm0(data_ptr, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.serialize_u64(value, ptr0, len0, data_len, offset);
    } finally {
        data_ptr.set(getUint8Memory0().subarray(ptr0 / 1, ptr0 / 1 + len0));
        wasm.__wbindgen_free(ptr0, len0 * 1);
    }
}

/**
* @param {Uint8Array} data_ptr
* @param {number} data_len
* @param {number} offset
* @returns {bigint}
*/
export function deserialize_u64(data_ptr, data_len, offset) {
    const ptr0 = passArray8ToWasm0(data_ptr, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.deserialize_u64(ptr0, len0, data_len, offset);
    return BigInt.asUintN(64, ret);
}

/**
* @param {number} value
* @param {Uint8Array} data_ptr
* @param {number} data_len
* @param {number} offset
*/
export function serialize_u32(value, data_ptr, data_len, offset) {
    try {
        var ptr0 = passArray8ToWasm0(data_ptr, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.serialize_u32(value, ptr0, len0, data_len, offset);
    } finally {
        data_ptr.set(getUint8Memory0().subarray(ptr0 / 1, ptr0 / 1 + len0));
        wasm.__wbindgen_free(ptr0, len0 * 1);
    }
}

/**
* @param {Uint8Array} data_ptr
* @param {number} data_len
* @param {number} offset
* @returns {number}
*/
export function deserialize_u32(data_ptr, data_len, offset) {
    const ptr0 = passArray8ToWasm0(data_ptr, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.deserialize_u32(ptr0, len0, data_len, offset);
    return ret >>> 0;
}

