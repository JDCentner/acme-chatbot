FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV COREPACK_HOME=/opt/corepack
ENV COREPACK_DEFAULT_TO_LATEST=0
RUN corepack enable && corepack prepare pnpm@12.10.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY server ./server
COPY client ./client
COPY evals ./evals
COPY scripts ./scripts
COPY tests ./tests
COPY *.html *.ts eslint.config.mjs tsconfig.json ./
RUN pnpm lint && pnpm test && pnpm build

FROM build AS runtime
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/app/data/acme.sqlite
RUN mkdir -p /app/data /app/eval-data && chown node:node /app/data /app/eval-data
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["pnpm", "start"]
