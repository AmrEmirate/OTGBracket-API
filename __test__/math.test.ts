import { isPowerOfTwo } from '../src/utils/math';

describe('Math Utils', () => {
  it('should return true for powers of two', () => {
    expect(isPowerOfTwo(2)).toBe(true);
    expect(isPowerOfTwo(4)).toBe(true);
    expect(isPowerOfTwo(8)).toBe(true);
    expect(isPowerOfTwo(16)).toBe(true);
  });

  it('should return false for non-powers of two', () => {
    expect(isPowerOfTwo(0)).toBe(false);
    expect(isPowerOfTwo(3)).toBe(false);
    expect(isPowerOfTwo(10)).toBe(false);
    expect(isPowerOfTwo(15)).toBe(false);
  });
});
