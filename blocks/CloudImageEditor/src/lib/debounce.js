/**
 * @param {function} callback
 * @param {Number} wait
 * @returns {function}
 */
export function debounce(callback, wait) {
  let timer;
  let debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), wait);
  };
  debounced.cancel = () => {
    clearTimeout(timer);
  };
  return debounced;
}
