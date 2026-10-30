/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  // NEXT_DIST lets a second test server run without clobbering the main one's build folder.
  distDir: process.env.NEXT_DIST || '.next',
};
