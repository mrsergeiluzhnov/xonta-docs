// MCP-эндпоинт /mcp (Streamable HTTP, без сессий): все инструменты из реестра.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { logCall, ipHash } from "./log.js";

// JSON Schema → zod (с вложенными объектами и массивами) для registerTool
function toZod(p) {
  let t;
  if (p.enum) t = z.enum(p.enum);
  else if (p.type === "integer") t = z.coerce.number().int();
  else if (p.type === "number") t = z.union([z.number(), z.string()]); // «2,5» тоже допустимо — разберёт обработчик
  else if (p.type === "boolean") t = z.preprocess((v) => (v === "false" ? false : v === "true" ? true : v), z.boolean());
  else if (p.type === "object") t = z.object(toZodShape(p)).passthrough();
  else if (p.type === "array") t = z.array(toZod(p.items || {})).max(200);
  // числа часто приходят от моделей как number — принимаем и строку, и число
  else t = z.union([z.string(), z.number()]).transform(String);
  return p.description ? t.describe(p.description) : t;
}
function toZodShape(schema) {
  const shape = {};
  const required = new Set(schema.required || []);
  for (const [k, p] of Object.entries(schema.properties || {})) {
    const t = toZod(p);
    shape[k] = required.has(k) ? t : t.optional();
  }
  return shape;
}

export function mountMcp(app, { name, version, instructions, tools, runTool }) {
  function buildServer(req) {
    const mcp = new McpServer({ name, version }, { instructions });
    for (const tool of tools) {
      mcp.registerTool(
        tool.name,
        {
          title: tool.title,
          description: tool.description,
          inputSchema: toZodShape(tool.input),
          annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
        },
        async (args) => {
          try {
            const out = await runTool(tool, args, req, "mcp");
            return { content: [{ type: "text", text: JSON.stringify(out, null, 1) }] };
          } catch (e) {
            return { content: [{ type: "text", text: `Ошибка: ${e.message}` }], isError: true };
          }
        },
      );
    }
    return mcp;
  }

  app.post("/mcp", async (req, res) => {
    // журнал «нас нашли»: подключение клиента и запрос списка инструментов (вызовы инструментов пишутся отдельно)
    const msgs = Array.isArray(req.body) ? req.body : [req.body];
    for (const m of msgs) {
      if (m?.method === "initialize" || m?.method === "tools/list") {
        const ci = m.params?.clientInfo || {};
        logCall({
          event: m.method === "initialize" ? "connect" : "list",
          client: m.method === "initialize" ? `${String(ci.name || "unknown").slice(0, 60)}${ci.version ? " " + String(ci.version).slice(0, 20) : ""}` : undefined,
          protocol: m.params?.protocolVersion,
          ip: ipHash(req.ip),
          ua: String(req.get("user-agent") || "").slice(0, 80),
        });
      }
    }
    const server = buildServer(req);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => { transport.close(); server.close(); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      console.error("mcp error", e);
      if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null });
    }
  });
  const notAllowed = (_req, res) => res.status(405).set("Allow", "POST").json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null });
  // человек открыл адрес в браузере — показываем главную страницу; MCP-клиенты (text/event-stream) получают 405 по стандарту
  app.get("/mcp", (req, res) => (req.accepts(["text/event-stream", "html"]) === "html" && !String(req.get("accept") || "").includes("text/event-stream") ? res.redirect(302, "/?from=mcp") : notAllowed(req, res)));
  app.delete("/mcp", notAllowed);
}
