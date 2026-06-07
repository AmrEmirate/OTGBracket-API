export const isPowerOfTwo = (n: number): boolean => {
  return (n & (n - 1)) === 0 && n !== 0;
};
