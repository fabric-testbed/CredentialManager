import { NextRequest, NextResponse } from "next/server";

const CEPH_API_URL =
  process.env.CEPH_API_URL || "https://ceph-mgr.fabric-testbed.net";

async function proxyRequest(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const targetPath = path.join("/");
  const searchParams = req.nextUrl.searchParams.toString();
  const url = `${CEPH_API_URL}/${targetPath}${searchParams ? "?" + searchParams : ""}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const authHeader = req.headers.get("Authorization");
  if (authHeader) {
    headers["Authorization"] = authHeader;
  }

  const fetchInit: RequestInit = {
    method: req.method,
    headers,
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    try {
      const body = await req.text();
      if (body) {
        fetchInit.body = body;
      }
    } catch {
      // no body
    }
  }

  try {
    const response = await fetch(url, fetchInit);
    const data = await response.text();

    return new NextResponse(data, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "application/json",
      },
    });
  } catch (error) {
    console.error("Ceph API proxy error:", error);
    return NextResponse.json(
      { detail: "Failed to connect to Ceph API" },
      { status: 502 }
    );
  }
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const DELETE = proxyRequest;
export const PATCH = proxyRequest;
