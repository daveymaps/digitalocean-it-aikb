import axios from "axios";
import { adfToText, redact } from "./sanitize.js";

function getJiraAuthHeader() {
  const email = process.env.ATLASSIAN_EMAIL;
  const token = process.env.ATLASSIAN_API_TOKEN;

  if (!email || !token) {
    throw new Error("Missing Atlassian credentials");
  }

  const encoded = Buffer.from(`${email}:${token}`).toString("base64");
  return `Basic ${encoded}`;
}

function getSiteUrl() {
  const siteUrl = process.env.ATLASSIAN_SITE_URL;

  if (!siteUrl) {
    throw new Error("Missing ATLASSIAN_SITE_URL");
  }

  return siteUrl.replace(/\/$/, "");
}

export async function getJiraTicket(ticketKey) {
  const normalizedKey = String(ticketKey || "").trim().toUpperCase();

  if (!/^[A-Z][A-Z0-9]+-\d+$/.test(normalizedKey)) {
    const error = new Error("Invalid Jira ticket key format");
    error.statusCode = 400;
    throw error;
  }

  const siteUrl = getSiteUrl();

  const response = await axios.get(
    `${siteUrl}/rest/api/3/issue/${encodeURIComponent(normalizedKey)}`,
    {
      headers: {
        Accept: "application/json",
        Authorization: getJiraAuthHeader()
      },
      params: {
        fields: "summary,status,priority,assignee,reporter,created,updated,description,resolution,comment"
      },
      timeout: 15000
    }
  );

  const issue = response.data;
  const fields = issue.fields || {};

  const comments = fields.comment?.comments || [];
  const safeComments = comments.slice(-5).map((comment) => ({
    author: comment.author?.displayName || "Unknown",
    created: comment.created || "",
    body: redact(adfToText(comment.body)).slice(0, 1500)
  }));

  return {
    key: issue.key,
    summary: fields.summary || "",
    status: fields.status?.name || "",
    priority: fields.priority?.name || "",
    assignee: fields.assignee?.displayName || "Unassigned",
    reporter: fields.reporter?.displayName || "",
    created: fields.created || "",
    updated: fields.updated || "",
    url: `${siteUrl}/browse/${issue.key}`,
    sanitized_description: redact(adfToText(fields.description)).slice(0, 3000),
    resolution: fields.resolution?.name || "",
    safe_comments: safeComments,
    source: "jira-live"
  };
}

export async function searchJiraTickets({ query, status = "open", maxResults = 10 }) {
  const safeQuery = String(query || "").trim();

  if (!safeQuery || safeQuery.length < 3) {
    const error = new Error("Query must be at least 3 characters");
    error.statusCode = 400;
    throw error;
  }

  const allowedMax = Math.min(Number(maxResults) || 10, 25);
  const siteUrl = getSiteUrl();

  const projectFilter = process.env.JIRA_PROJECT_FILTER || "project is not EMPTY";

  const statusFilter =
    status === "done"
      ? "statusCategory = Done"
      : status === "all"
        ? ""
        : "statusCategory != Done";

  const jql = [
    projectFilter,
    statusFilter,
    `(summary ~ "${safeQuery}" OR description ~ "${safeQuery}")`,
    "ORDER BY updated DESC"
  ]
    .filter(Boolean)
    .join(" AND ");

  const response = await axios.get(`${siteUrl}/rest/api/3/search/jql`, {
    headers: {
      Accept: "application/json",
      Authorization: getJiraAuthHeader()
    },
    params: {
      jql,
      maxResults: allowedMax,
      fields: "summary,status,priority,assignee,updated"
    },
    timeout: 15000
  });

  return {
    query: safeQuery,
    status,
    count: response.data.issues?.length || 0,
    results: (response.data.issues || []).map((issue) => ({
      key: issue.key,
      summary: issue.fields?.summary || "",
      status: issue.fields?.status?.name || "",
      priority: issue.fields?.priority?.name || "",
      assignee: issue.fields?.assignee?.displayName || "Unassigned",
      updated: issue.fields?.updated || "",
      url: `${siteUrl}/browse/${issue.key}`
    })),
    source: "jira-live"
  };
}
