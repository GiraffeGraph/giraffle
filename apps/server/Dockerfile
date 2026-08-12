# Build context is the repository root, because @giraffle/protocol resolves
# through a relative file: dependency:
#   docker build -f apps/server/Dockerfile -t giraffle-sync .
FROM node:22-slim AS deps

WORKDIR /srv
COPY packages/protocol ./packages/protocol
COPY apps/server/package.json apps/server/package-lock.json ./apps/server/

WORKDIR /srv/apps/server
RUN npm ci --omit=dev


FROM node:22-slim AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    DATABASE_PATH=/data/giraffle-sync.db

WORKDIR /srv/apps/server

COPY --from=deps /srv/packages/protocol /srv/packages/protocol
COPY --from=deps /srv/apps/server/node_modules ./node_modules
COPY apps/server/package.json ./
COPY apps/server/src ./src

# The file: dependency resolves to /srv/packages/protocol. Dependencies imported
# from that package must be discoverable from its own directory as well.
RUN ln -s /srv/apps/server/node_modules /srv/packages/protocol/node_modules \
    && mkdir -p /data \
    && chown -R node:node /data
VOLUME ["/data"]
USER node
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "start"]
