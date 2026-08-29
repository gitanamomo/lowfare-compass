import worker from "../../worker.js";

export default async (request) => {
  const requestOrigin = new URL(request.url).origin;
  const allowedOrigins = [
    process.env.ALLOWED_ORIGINS,
    process.env.URL,
    process.env.DEPLOY_PRIME_URL,
    requestOrigin
  ].filter(Boolean).join(",");

  const env = {
    ALLOWED_ORIGINS: allowedOrigins,
    ALLOW_DEMO: process.env.ALLOW_DEMO || "true",
    TRAVELPAYOUTS_TOKEN: process.env.TRAVELPAYOUTS_TOKEN,
    AMADEUS_CLIENT_ID: process.env.AMADEUS_CLIENT_ID,
    AMADEUS_CLIENT_SECRET: process.env.AMADEUS_CLIENT_SECRET,
    AMADEUS_BASE_URL: process.env.AMADEUS_BASE_URL,
    BOOKING_API_KEY: process.env.BOOKING_API_KEY,
    BOOKING_AFFILIATE_ID: process.env.BOOKING_AFFILIATE_ID,
    BOOKING_BASE_URL: process.env.BOOKING_BASE_URL
  };

  return worker.fetch(request, env);
};

export const config = {
  path: "/api/*",
  rateLimit: {
    windowLimit: 30,
    windowSize: 60,
    aggregateBy: ["ip", "domain"]
  }
};
