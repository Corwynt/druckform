# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:22-slim AS builder

WORKDIR /build

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.14.0 --activate

# Copy workspace manifest files first for layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/druckform/package.json     ./packages/druckform/
COPY packages/druckform-mcp/package.json ./packages/druckform-mcp/
COPY tsconfig.base.json ./

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY packages/ ./packages/
COPY turbo.json biome.json ./

RUN pnpm turbo build

# Download PlantUML jar (version pinned for reproducibility)
RUN apt-get update && apt-get install -y --no-install-recommends wget ca-certificates \
    && wget -q -O /build/plantuml.jar \
       "https://github.com/plantuml/plantuml/releases/download/v1.2024.7/plantuml-1.2024.7.jar" \
    && apt-get purge -y wget && rm -rf /var/lib/apt/lists/*

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:22-slim AS runtime

# Layer 1: System packages (rarely change — thick layer but cached long-term)
RUN apt-get update && apt-get install -y --no-install-recommends \
    # JRE for PlantUML
    default-jre-headless \
    # Graphviz for PlantUML
    graphviz \
    # SVG → PDF conversion
    librsvg2-bin \
    # Chromium for mermaid-cli (headless)
    chromium \
    chromium-sandbox \
    # Fonts
    fonts-liberation \
    fonts-noto \
    # curl + zip for developer convenience (agent sandbox may need these)
    curl \
    zip \
    unzip \
    # ca-certs for Tectonic download at build time
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Layer 2: Tectonic binary + pre-warm TeX package cache
# Tectonic downloads packages on first use; we pre-warm by compiling a minimal doc.
RUN curl -fsSL \
    "https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%400.15.0/tectonic-0.15.0-x86_64-unknown-linux-musl.tar.gz" \
    | tar -xz -C /usr/local/bin/ \
    && chmod +x /usr/local/bin/tectonic

COPY docker/tectonic-prewarm.tex /tmp/prewarm.tex
# Pre-warm: compile once so the package bundle is cached in the image.
# --untrusted disables shell-escape (tectonic 0.15.0 flag name).
RUN tectonic --untrusted --keep-logs /tmp/prewarm.tex \
    && rm -f /tmp/prewarm.tex /tmp/prewarm.pdf

# Layer 3: PlantUML jar
COPY --from=builder /build/plantuml.jar /usr/local/lib/plantuml.jar

# Layer 4: Bundled templates, styles, and schemas (change occasionally)
COPY packages/druckform/templates/ /app/templates/
COPY packages/druckform/styles/    /app/styles/
COPY packages/druckform/schemas/   /app/schemas/

# Layer 5: Built npm packages (change on every release)
COPY --from=builder /build/packages/druckform/dist/     /app/packages/druckform/dist/
COPY --from=builder /build/packages/druckform/package.json /app/packages/druckform/
COPY --from=builder /build/packages/druckform-mcp/dist/     /app/packages/druckform-mcp/dist/
COPY --from=builder /build/packages/druckform-mcp/package.json /app/packages/druckform-mcp/

# Install production node_modules for both packages inside the image
WORKDIR /app
COPY --from=builder /build/node_modules/ ./node_modules/
COPY --from=builder /build/packages/druckform/node_modules/     ./packages/druckform/node_modules/
COPY --from=builder /build/packages/druckform-mcp/node_modules/ ./packages/druckform-mcp/node_modules/

# Symlink binaries into PATH
RUN ln -s /app/packages/druckform/dist/cli.js /usr/local/bin/druck \
    && chmod +x /usr/local/bin/druck \
    && ln -s /app/packages/druckform/dist/cli.js /usr/local/bin/druckform \
    && chmod +x /usr/local/bin/druckform \
    && ln -s /app/packages/druckform-mcp/dist/index.js /usr/local/bin/druckform-mcp \
    && chmod +x /usr/local/bin/druckform-mcp

# Runtime environment
ENV PLANTUML_JAR=/usr/local/lib/plantuml.jar
ENV DRUCKFORM_TEMPLATES_DIR=/work/templates
ENV DRUCKFORM_JOBS_DIR=/work/jobs
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Working directory for user mounts and job files
WORKDIR /work
RUN mkdir -p /work/templates /work/components /work/styles /work/jobs

ENTRYPOINT ["druck"]
CMD ["--help"]
