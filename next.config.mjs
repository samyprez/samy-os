/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: process.env.NODE_ENV === "production" ? "/samy-os" : "",
  assetPrefix: process.env.NODE_ENV === "production" ? "/samy-os/" : "",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
