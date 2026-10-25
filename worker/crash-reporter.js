/**
 * Cloudflare Worker: Privacy-Preserving Crash & Telemetry Reporter
 * Persistent Storage: Cloudflare KV (CRASH_REPORTS_KV)
 *
 * Endpoints:
 * - POST /report: Ingests technical error report, enforces allow-list, persists into KV
 * - GET /reports: Lists stored crash reports (authenticated if TELEMETRY_AUTH_TOKEN is set)
 * - GET /report?id=: Retrieves a specific stored crash report by ID
 * - DELETE /report?id=: Deletes a specific stored report
 *
 * PRIVACY GUARANTEE:
 * Accepts ONLY allow-listed technical metadata.
 * ZERO financial data, transaction balances, account names, or API keys are ever stored or processed.
 */

export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-App-Version, Authorization, X-Telemetry-Auth',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const pathname = url.pathname;

    // Helper: Verify Authentication if TELEMETRY_AUTH_TOKEN environment variable is set
    const isAuthorized = () => {
      if (!env.TELEMETRY_AUTH_TOKEN) return true; // Open access if no secret token configured
      const authHeader = request.headers.get('Authorization') || '';
      const secretHeader = request.headers.get('X-Telemetry-Auth') || '';
      const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
      return bearerToken === env.TELEMETRY_AUTH_TOKEN || secretHeader === env.TELEMETRY_AUTH_TOKEN;
    };

    // 1. Ingestion Endpoint: POST /report
    if (request.method === 'POST' && (pathname === '/report' || pathname.endsWith('/report'))) {
      try {
        const body = await request.json();

        // STRICT ALLOW-LIST ENFORCEMENT:
        // Only extract technical fields. Drop anything else.
        const sanitizedReport = {
          errorMessage: String(body.errorMessage || 'Unknown client error').slice(0, 500),
          stackTrace: String(body.stackTrace || '').slice(0, 2000),
          appVersion: String(body.appVersion || '0.1.0').slice(0, 50),
          deviceType: ['desktop', 'mobile', 'tablet'].includes(body.deviceType) ? body.deviceType : 'unknown',
          os: String(body.os || 'unknown').slice(0, 50),
          browser: String(body.browser || 'unknown').slice(0, 50),
          timestamp: typeof body.timestamp === 'number' ? body.timestamp : Date.now(),
        };

        const randomSuffix = crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
        const reportId = `crash_${sanitizedReport.timestamp}_${randomSuffix}`;

        const reportRecord = {
          id: reportId,
          ...sanitizedReport,
          storedAt: Date.now(),
        };

        // Durable persistence into Cloudflare KV
        if (env.CRASH_REPORTS_KV) {
          await env.CRASH_REPORTS_KV.put(reportId, JSON.stringify(reportRecord), {
            expirationTtl: 86400 * 30, // Retain for 30 days
          });
        }

        console.log('[CRASH_REPORT_SAVED]', reportId, sanitizedReport.errorMessage);

        return new Response(
          JSON.stringify({
            success: true,
            id: reportId,
            receivedAt: sanitizedReport.timestamp,
            persisted: !!env.CRASH_REPORTS_KV,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ error: 'Malformed telemetry payload', details: err?.message }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    // 2. Retrieval Endpoints: GET /reports or GET /report?id=...
    if (request.method === 'GET') {
      if (!isAuthorized()) {
        return new Response(JSON.stringify({ error: 'Unauthorized: Invalid or missing telemetry auth token' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // A. Query single report: GET /report?id=... or /reports/:id
      const queryId = url.searchParams.get('id');
      const pathParts = pathname.split('/').filter(Boolean);
      const targetId = queryId || (pathParts.length === 2 && pathParts[0] === 'reports' ? pathParts[1] : null);

      if (targetId) {
        if (!env.CRASH_REPORTS_KV) {
          return new Response(JSON.stringify({ error: 'KV storage binding not available' }), {
            status: 503,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const rawData = await env.CRASH_REPORTS_KV.get(targetId);
        if (!rawData) {
          return new Response(JSON.stringify({ error: 'Report not found', id: targetId }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ success: true, report: JSON.parse(rawData) }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // B. List reports: GET /reports
      if (pathname === '/reports' || pathname.endsWith('/reports') || pathname === '/report' || pathname.endsWith('/report')) {
        if (!env.CRASH_REPORTS_KV) {
          return new Response(
            JSON.stringify({
              success: true,
              count: 0,
              reports: [],
              notice: 'KV storage binding not attached. Deploy with CRASH_REPORTS_KV binding for persistence.',
            }),
            {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        const limit = Math.min(100, parseInt(url.searchParams.get('limit') || '50', 10));
        const listRes = await env.CRASH_REPORTS_KV.list({ prefix: 'crash_', limit });
        const reports = [];

        for (const key of listRes.keys) {
          const val = await env.CRASH_REPORTS_KV.get(key.name);
          if (val) {
            try {
              reports.push(JSON.parse(val));
            } catch {}
          }
        }

        // Sort latest first
        reports.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        return new Response(
          JSON.stringify({
            success: true,
            count: reports.length,
            reports,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // Root landing info
      return new Response(
        'FinanceFlow Telemetry Endpoint Active. POST technical errors to /report. GET /reports to review.',
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
        }
      );
    }

    // 3. Deletion Endpoint: DELETE /report?id=... or DELETE /reports (purge)
    if (request.method === 'DELETE') {
      if (!isAuthorized()) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!env.CRASH_REPORTS_KV) {
        return new Response(JSON.stringify({ error: 'KV storage binding not available' }), {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const queryId = url.searchParams.get('id');
      if (queryId) {
        await env.CRASH_REPORTS_KV.delete(queryId);
        return new Response(JSON.stringify({ success: true, deletedId: queryId }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Purge all if all=true
      if (url.searchParams.get('all') === 'true') {
        const listRes = await env.CRASH_REPORTS_KV.list({ prefix: 'crash_' });
        for (const key of listRes.keys) {
          await env.CRASH_REPORTS_KV.delete(key.name);
        }
        return new Response(JSON.stringify({ success: true, purgedCount: listRes.keys.length }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ error: 'Specify ?id=<id> or ?all=true to delete' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  },
};
