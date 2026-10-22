import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const localEmailApi = {
  name: 'motolink-local-email-api',
  configureServer(server: any) {
    const localApiRoutes: Record<string, string> = {
      '/api/send-email': '/api/send-email.ts',
      '/api/send-login-otp': '/api/send-login-otp.ts',
      '/api/verify-login-otp': '/api/verify-login-otp.ts',
    };

    server.middlewares.use(async (req: any, res: any, next: (error?: unknown) => void) => {
      const pathname = (req.url || '').split('?')[0];
      const modulePath = localApiRoutes[pathname];
      if (!modulePath) {
        next();
        return;
      }

      try {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
        req.body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');

        const { default: handler } = await server.ssrLoadModule(modulePath);
        let statusCode = 200;
        const response = {
          status(code: number) {
            statusCode = code;
            return {
              json(body: unknown) {
                res.statusCode = statusCode;
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.end(JSON.stringify(body));
                return response;
              },
            };
          },
        };

        await handler(req, response);
      } catch (error) {
        server.ssrFixStacktrace(error as Error);
        console.error(`[local-api] ${pathname} request failed:`, error);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ success: false, error: 'Local API failed. Check the Vite terminal for details.' }));
        }
      }
    });
  },
};

export default defineConfig(({ mode }) => {
  // Vercel functions read process.env. Load local .env files into the Node
  // process for this development-only API middleware; never expose them to the
  // browser bundle.
  const env = loadEnv(mode, process.cwd(), '');
  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }

  return {
    plugins: [react(), localEmailApi],
    server: {
      port: 3000,
      open: true,
      hmr: {
        host: 'localhost',
        protocol: 'ws'
      },
      proxy: {
        '/api/sendgrid': {
          target: 'https://api.sendgrid.com',
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/api\/sendgrid/, '')
        }
      }
    },
  };
})
