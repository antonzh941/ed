import { timingSafeEqual } from "node:crypto";

import { getServerEnv, isYooKassaWebhookIpAllowlistDisabled } from "@/lib/env";

const YOOKASSA_WEBHOOK_IP_RANGES = [
  "185.71.76.0/27",
  "185.71.77.0/27",
  "77.75.153.0/25",
  "77.75.154.128/25",
  "77.75.156.11",
  "77.75.156.35",
  "2a02:5180::/32",
] as const;

type YooKassaWebhookVerificationResult =
  | { ok: true; clientIp: string | null }
  | { ok: false; reason: "token" | "ip" | "basic" | "config"; clientIp: string | null };

function safeEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a, "utf8");
  const bBuffer = Buffer.from(b, "utf8");

  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
}

function verifyWebhookBasicAuth(
  request: Request,
  basicUser: string,
  basicPassword: string,
) {
  const user = basicUser.trim();
  const password = basicPassword.trim();
  if (!user || !password) {
    return true;
  }

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) {
    return false;
  }

  let decoded: string;
  try {
    decoded = Buffer.from(header.slice(6).trim(), "base64").toString("utf8");
  } catch {
    return false;
  }

  const colon = decoded.indexOf(":");
  if (colon < 0) {
    return false;
  }

  const givenUser = decoded.slice(0, colon);
  const givenPassword = decoded.slice(colon + 1);

  return safeEqual(givenUser, user) && safeEqual(givenPassword, password);
}

function normalizeIp(raw: string) {
  const value = raw.trim();
  if (!value) {
    return null;
  }

  if (value.startsWith("[") && value.includes("]")) {
    return value.slice(1, value.indexOf("]"));
  }

  const ipv4WithPort = value.match(/^(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/);
  if (ipv4WithPort) {
    return ipv4WithPort[1];
  }

  const ipv4Mapped = value.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (ipv4Mapped) {
    return ipv4Mapped[1];
  }

  return value;
}

function getClientIp(headers: Headers) {
  const realIp = headers.get("x-real-ip");
  if (realIp) {
    return normalizeIp(realIp);
  }

  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    return normalizeIp(forwardedFor.split(",")[0] ?? "");
  }

  return null;
}

function ipv4ToNumber(ip: string) {
  const parts = ip.split(".");
  if (parts.length !== 4) {
    return null;
  }

  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      return null;
    }
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) {
      return null;
    }
    value = (value << 8) + octet;
  }

  return value >>> 0;
}

function isIpv4InCidr(ip: string, cidr: string) {
  const [rangeIp, prefixRaw] = cidr.split("/");
  const prefix = Number(prefixRaw);
  const ipValue = ipv4ToNumber(ip);
  const rangeValue = ipv4ToNumber(rangeIp ?? "");

  if (ipValue === null || rangeValue === null || !Number.isInteger(prefix)) {
    return false;
  }
  if (prefix < 0 || prefix > 32) {
    return false;
  }

  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipValue & mask) === (rangeValue & mask);
}

function expandIpv6(ip: string) {
  const normalized = ip.toLowerCase();
  if (!normalized.includes(":")) {
    return null;
  }

  const [leftRaw, rightRaw] = normalized.split("::");
  if (normalized.split("::").length > 2) {
    return null;
  }

  const left = leftRaw ? leftRaw.split(":").filter(Boolean) : [];
  const right = rightRaw ? rightRaw.split(":").filter(Boolean) : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0) {
    return null;
  }

  const groups = [...left, ...Array<string>(missing).fill("0"), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) {
    return null;
  }

  return groups.map((group) => group.padStart(4, "0"));
}

function isIpv6InCidr(ip: string, cidr: string) {
  const [rangeIp, prefixRaw] = cidr.split("/");
  const prefix = Number(prefixRaw);
  const ipGroups = expandIpv6(ip);
  const rangeGroups = expandIpv6(rangeIp ?? "");

  if (!ipGroups || !rangeGroups || !Number.isInteger(prefix) || prefix < 0 || prefix > 128) {
    return false;
  }

  const fullGroups = Math.floor(prefix / 16);
  const remainingBits = prefix % 16;

  for (let i = 0; i < fullGroups; i += 1) {
    if (ipGroups[i] !== rangeGroups[i]) {
      return false;
    }
  }

  if (remainingBits === 0) {
    return true;
  }

  const mask = (0xffff << (16 - remainingBits)) & 0xffff;
  const ipPart = Number.parseInt(ipGroups[fullGroups] ?? "0", 16);
  const rangePart = Number.parseInt(rangeGroups[fullGroups] ?? "0", 16);

  return (ipPart & mask) === (rangePart & mask);
}

function isIpAllowedByYooKassa(ip: string) {
  const normalized = normalizeIp(ip);
  if (!normalized) {
    return false;
  }

  return YOOKASSA_WEBHOOK_IP_RANGES.some((range) => {
    if (!range.includes("/")) {
      return normalized === range;
    }

    return normalized.includes(":")
      ? isIpv6InCidr(normalized, range)
      : isIpv4InCidr(normalized, range);
  });
}

const MIN_WEBHOOK_TOKEN_LENGTH = 16;

export function verifyYooKassaWebhookRequest(
  request: Request,
): YooKassaWebhookVerificationResult {
  const env = getServerEnv();
  const configuredToken = env.yooKassaWebhookToken.trim();
  const requestToken = new URL(request.url).searchParams.get("token") ?? "";

  if (process.env.NODE_ENV === "production") {
    if (configuredToken.length < MIN_WEBHOOK_TOKEN_LENGTH) {
      return { ok: false, reason: "config", clientIp: null };
    }
    if (!safeEqual(requestToken, configuredToken)) {
      return { ok: false, reason: "token", clientIp: null };
    }
  } else if (configuredToken && !safeEqual(requestToken, configuredToken)) {
    return { ok: false, reason: "token", clientIp: null };
  }

  if (!verifyWebhookBasicAuth(request, env.yooKassaWebhookBasicUser, env.yooKassaWebhookBasicPassword)) {
    return { ok: false, reason: "basic", clientIp: null };
  }

  const clientIp = getClientIp(request.headers);
  if (!isYooKassaWebhookIpAllowlistDisabled() && (!clientIp || !isIpAllowedByYooKassa(clientIp))) {
    return { ok: false, reason: "ip", clientIp };
  }

  return { ok: true, clientIp };
}
