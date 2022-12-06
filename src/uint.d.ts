/* tslint:disable */
/* eslint-disable */
/**
* @param {string} input
* @param {Uint8Array} data_ptr
* @param {number} data_len
* @param {number} offset
*/
export function encode_utf8(input: string, data_ptr: Uint8Array, data_len: number, offset: number): void;
/**
* @param {Uint8Array} data_ptr
* @param {number} data_len
* @param {number} offset
* @returns {string}
*/
export function decode_utf8(data_ptr: Uint8Array, data_len: number, offset: number): string;
/**
* @param {bigint} value
* @param {Uint8Array} data_ptr
* @param {number} data_len
* @param {number} offset
*/
export function serialize_u64(value: bigint, data_ptr: Uint8Array, data_len: number, offset: number): void;
/**
* @param {Uint8Array} data_ptr
* @param {number} data_len
* @param {number} offset
* @returns {bigint}
*/
export function deserialize_u64(data_ptr: Uint8Array, data_len: number, offset: number): bigint;
/**
* @param {number} value
* @param {Uint8Array} data_ptr
* @param {number} data_len
* @param {number} offset
*/
export function serialize_u32(value: number, data_ptr: Uint8Array, data_len: number, offset: number): void;
/**
* @param {Uint8Array} data_ptr
* @param {number} data_len
* @param {number} offset
* @returns {number}
*/
export function deserialize_u32(data_ptr: Uint8Array, data_len: number, offset: number): number;
