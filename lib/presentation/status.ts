import type { ActionStatus } from "@prisma/client";

function titleCaseWords(value: string) {
  return value
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((segment) => `${segment.slice(0, 1).toUpperCase()}${segment.slice(1)}`)
    .join(" ");
}

function normalizeWords(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return value.trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

export function formatSpaceStageLabel(stage: string | null | undefined) {
  const normalized = normalizeWords(stage);
  return normalized ? titleCaseWords(normalized) : "Unknown";
}

export function getSpaceStageTone(stage: string | null | undefined) {
  const normalizedStage = normalizeWords(stage).toUpperCase();

  if (normalizedStage.includes("NO APP FILE")) {
    return "status-pill status-muted";
  }

  if (normalizedStage === "RUNNING") {
    return "status-pill status-success";
  }

  if (
    normalizedStage.includes("BUILD") ||
    normalizedStage.includes("START") ||
    normalizedStage.includes("LOAD")
  ) {
    return "status-pill status-progress";
  }

  if (
    normalizedStage.includes("PAUSED") ||
    normalizedStage.includes("STOP")
  ) {
    return "status-pill status-warning";
  }

  if (normalizedStage.includes("SLEEP")) {
    return "status-pill status-danger";
  }

  if (
    normalizedStage.includes("ERROR") ||
    normalizedStage.includes("FAIL")
  ) {
    return "status-pill status-danger";
  }

  return "status-pill";
}

export function formatActionStatusLabel(status: ActionStatus) {
  return titleCaseWords(normalizeWords(status));
}

export function getActionStatusTone(status: ActionStatus) {
  if (status === "SUCCEEDED") {
    return "status-pill status-success";
  }

  if (status === "RUNNING") {
    return "status-pill status-progress";
  }

  if (status === "PENDING") {
    return "status-pill status-warning";
  }

  if (status === "FAILED") {
    return "status-pill status-danger";
  }

  return "status-pill";
}

export function formatActionTypeLabel(type: string) {
  return titleCaseWords(normalizeWords(type));
}