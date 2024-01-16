// @ts-check

/** @param {Record<string, unknown>} blockExports */
export function registerBlocks(blockExports) {
  for (let blockName of Object.keys(blockExports)) {
    const value = blockExports[blockName];
    if (typeof value !== 'function' || !('reg' in value) || typeof value.reg !== 'function') {
      continue;
    }
    let tagName = [...blockName].reduce((name, char) => {
      if (char.toUpperCase() === char) {
        char = '-' + char.toLowerCase();
      }
      return (name += char);
    }, '');
    if (tagName.startsWith('-')) {
      tagName = tagName.replace('-', '');
    }
    if (!tagName.startsWith('lr-')) {
      tagName = 'lr-' + tagName;
    }
    value.reg(tagName);
  }
}
