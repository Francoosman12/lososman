export const normalizeArgentinaMobile = (value) => {
  let digits = String(value || '').replace(/\D/g, '');

  if (digits.startsWith('549')) digits = digits.slice(3);
  else if (digits.startsWith('54')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = digits.slice(1);

  if (digits.length === 12) {
    for (const areaCodeLength of [2, 3, 4]) {
      if (digits.slice(areaCodeLength, areaCodeLength + 2) === '15') {
        return digits.slice(0, areaCodeLength) + digits.slice(areaCodeLength + 2);
      }
    }
  }

  return digits;
};
