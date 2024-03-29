import { getUserAgent } from '@uploadcare/upload-client';
import { PACKAGE_VERSION, PACKAGE_NAME } from '../../env.js';

/**
 * @param {import('@uploadcare/upload-client').CustomUserAgentOptions} options
 * @returns {ReturnType<import('@uploadcare/upload-client').CustomUserAgentFn>}
 */
export function customUserAgent(options) {
  return getUserAgent({
    ...options,
    libraryName: PACKAGE_NAME,
    libraryVersion: PACKAGE_VERSION,
  });
}
