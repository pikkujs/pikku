/** @type {import('next').NextConfig} */
const nextConfig = {
    webpack: (config) => {
        config.resolve.extensionAlias = {
          '.js': ['.js', '.ts', '.tsx', '.jsx'], // Resolves .js imports to both .js and .ts files
        };
        return config;
      }
}

export default nextConfig
