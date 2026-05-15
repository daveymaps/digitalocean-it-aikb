import express from "express";
import cors from "cors";
import helmet from "helmet";
import { getJiraTicket, searchJiraTickets } from "./jira.js";

const app = express();
const port = process.env.PORT || 8080;

app.use(helmet());
app.use(express.json({ limit: "1mb" }));

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("CORS origin not allowed"));
    }
  })
);

function requireProxyKey(req, res, next) {
  const configuredKey = process.env.PROXY_API_KEY;

  if (!configuredKey) {
    return next();
  }

  const providedKey = req.header("x-api-key");

  if (providedKey !== configuredKey) {
    return res.status(401).json({
      error: true,
      message: "Unauthorized"
    });
  }

  return next();
}

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "digitalocean-it-aikb-proxy",
    timestamp: new Date().toISOString()
  });
});

app.get("/api/jira/ticket/:ticketKey", requireProxyKey, async (req, res) => {
  try {
    const ticket = await getJiraTicket(req.params.ticketKey);
    res.json(ticket);
  } catch (error) {
    res.status(error.statusCode || error.response?.status || 500).json({
      error: true,
      message: error.message || "Unable to retrieve Jira ticket"
    });
  }
});

app.get("/api/jira/search", requireProxyKey, async (req, res) => {
  try {
    const result = await searchJiraTickets({
      query: req.query.q,
      status: req.query.status || "open",
      maxResults: req.query.maxResults || 10
    });

    res.json(result);
  } catch (error) {
    res.status(error.statusCode || error.response?.status || 500).json({
      error: true,
      message: error.message || "Unable to search Jira tickets"
    });
  }
});

app.use((req, res) => {
  res.status(404).json({
    error: true,
    message: "Route not found"
  });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`digitalocean-it-aikb-proxy listening on port ${port}`);
});
