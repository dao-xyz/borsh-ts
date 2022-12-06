use std::os::raw::c_void;
use wasm_bindgen::prelude::*;
use std::str;

use web_sys::console;


#[wasm_bindgen]
pub fn encode_utf8(input: &str, data_ptr: &mut [u8], data_len: usize, offset: usize) {
    // Encode the input string as a UTF-8 byte sequence and make sure it fits in the given memory region
    let encoded = input.as_bytes();
    assert!(encoded.len() <= data_len - offset);

    // Write the encoded byte sequence to the memory region starting at the specified offset
    for (i, byte) in encoded.iter().enumerate() {
        data_ptr[offset + i] = *byte;
    }
}

#[wasm_bindgen]
pub fn decode_utf8(data_ptr: &[u8], data_len: usize, offset: usize) -> String {
    // Read the UTF-8 byte sequence from the memory region starting at the specified offset
    let slice = &data_ptr[offset..offset + data_len];

    // Decode the byte sequence as a string and return the result
    match str::from_utf8(slice) {
        Ok(s) => s.to_string(),
        Err(e) => e.to_string(),
    }
}

#[wasm_bindgen]
pub fn serialize_u64(value: u64, data_ptr: &mut [u8], data_len: usize, offset: usize) {

    console_log!("{} {} {}",data_ptr.len(), data_len, offset);

    // Make sure that the memory region is large enough to hold the serialized data
    assert!(offset + 8 <= data_len);

    // Serialize the `u64` value in little-endian byte order by writing its individual bytes to the memory region
    for i in 0..8 {
        data_ptr[offset + i] = (value >> (i * 8)) as u8;
    }
}

#[wasm_bindgen]
pub fn deserialize_u64(data_ptr: &[u8], data_len: usize, offset: usize) -> u64 {

    console_log!("{} {} {}",data_ptr.len(), data_len, offset);

    // Make sure that the memory region is large enough to hold the serialized data
    assert!(offset + 8 <= data_len);

    // Deserialize the `u64` value in little-endian byte order by reading its individual bytes from the memory region
    let mut value = 0u64;
    for i in 0..8 {
        value |= (data_ptr[offset + i] as u64) << (i * 8);
    }

    value
}

#[wasm_bindgen]
pub fn serialize_u32(value: u32, data_ptr: &mut [u8], data_len: usize, offset: usize) {
    // Make sure that the memory region is large enough to hold the serialized data
    assert!(offset + 4 <= data_len);

    // Serialize the `u32` value in little-endian byte order by writing its individual bytes to the memory region
    for i in 0..4 {
        data_ptr[offset + i] = (value >> (i * 8)) as u8;
    }
}

#[wasm_bindgen]
pub fn deserialize_u32(data_ptr: &[u8], data_len: usize, offset: usize) -> u32 {
    // Make sure that the memory region is large enough to hold the serialized data
    assert!(offset + 4 <= data_len);

    // Deserialize the `u32` value in little-endian byte order by reading its individual bytes from the memory region
    let mut value = 0u32;
    for i in 0..4 {
        value |= (data_ptr[offset + i] as u32) << (i * 8);
    }

    value
}

/*
#[wasm_bindgen]
pub fn serialize_u64(value: u64, data_ptr: *mut c_void, data_len: usize, offset: usize) {
  let data = unsafe {
    std::slice::from_raw_parts_mut(data_ptr as *mut u8, data_len)
  };

  assert!(offset + 8 <= data_len);

  let mut value = value;
  for byte in data[offset..offset + 8].iter_mut() {
    *byte = value as u8;
    value >>= 8;
  }
}

#[wasm_bindgen]
pub fn deserialize_u64(data_ptr: *const c_void, data_len: usize, offset: usize) -> u64 {
  let data = unsafe {
    std::slice::from_raw_parts(data_ptr as *const u8, data_len)
  };

  assert!(offset + 8 <= data_len);

  let mut value = 0;
  for &byte in data[offset..offset + 8].iter() {
    value = (value << 8) | u64::from(byte);
  }

  value
} */
/*
#[no_mangle]
pub extern "C" fn serialize_u32(value: u32, data_ptr: *mut c_void, data_len: usize, offset: usize) {
    let data = unsafe { std::slice::from_raw_parts_mut(data_ptr as *mut u8, data_len) };

    assert!(offset + 4 <= data_len);

    let mut value = value;
    for byte in data[offset..offset + 4].iter_mut() {
        *byte = value as u8;
        value >>= 8;
    }
}

#[no_mangle]
pub extern "C" fn deserialize_u32(data_ptr: *const c_void, data_len: usize, offset: usize) -> u32 {
    let data = unsafe { std::slice::from_raw_parts(data_ptr as *const u8, data_len) };

    assert!(offset + 4 <= data_len);

    let mut value = 0;
    for &byte in data[offset..offset + 4].iter() {
        value = (value << 8) | u32::from(byte);
    }

    value
}
 */
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deserialize_u64() {
        let data = [0x7B, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
        let expected = 123_u64;
        assert_eq!(deserialize_u64(&data, 8, 0), expected);
    }

    #[test]
    fn test_serialize_u64() {
        let mut data = [0; 8];
        let value = 123_u64;
        serialize_u64(value, &mut data, 8, 0);
        let expected = [0x7B, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
        assert_eq!(data, expected);
    }
}
